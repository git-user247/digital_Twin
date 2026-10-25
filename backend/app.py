from __future__ import annotations

import base64
import hashlib
import io
import json
import logging
import os
import re
import tempfile
import uuid
import warnings
from datetime import date, datetime, timezone
from pathlib import Path
from xml.sax.saxutils import escape

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field, field_validator
from PIL import Image, UnidentifiedImageError
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image as PDFImage
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from backend.model_service import MODEL_METADATA, ModelService
from backend.audit import write_audit_event
from backend.auth import TOKEN_TTL_SECONDS, require_doctor_auth, verify_doctor_credentials

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PATIENT_HISTORY_PATH = PROJECT_ROOT / "data" / "patient_history.json"
PATIENTS_ROOT = PROJECT_ROOT / "data" / "patients"
MAX_IMAGE_BYTES = 20 * 1024 * 1024
UPLOAD_CHUNK_BYTES = 64 * 1024
SUPPORTED_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png"}
SUPPORTED_IMAGE_FORMATS = {"JPEG": ("jpg", "image/jpeg"), "PNG": ("png", "image/png")}
PATIENT_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
MAX_NOTES_LENGTH = 2000
logger = logging.getLogger(__name__)

app = FastAPI(title="AMD Digital Twin API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model_service = ModelService()


class PatientCreate(BaseModel):
    patient_id: str
    name: str = Field(min_length=1, max_length=120)
    age: int = Field(ge=0, le=120, strict=True)
    sex: str | None = Field(default=None, max_length=32)
    contact: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=MAX_NOTES_LENGTH)

    @field_validator("patient_id", "name", mode="before")
    @classmethod
    def trim_required_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("sex", "contact", "notes", mode="before")
    @classmethod
    def trim_optional_text(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value


class DoctorLogin(BaseModel):
    doctor_id: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=1024)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _validate_patient_id(patient_id: str) -> str:
    normalized = patient_id.strip()
    if not PATIENT_ID_PATTERN.fullmatch(normalized):
        raise HTTPException(
            status_code=400,
            detail="Patient ID must be 1-64 characters: letters, numbers, hyphens, or underscores.",
        )
    return normalized


def _patient_directory(patient_id: str) -> Path:
    return PATIENTS_ROOT / _validate_patient_id(patient_id)


def _write_json_atomic(path: Path, payload: dict) -> None:
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=".tmp-",
            suffix=".json",
            delete=False,
        ) as handle:
            temporary_path = Path(handle.name)
            json.dump(payload, handle, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, path)
    except OSError as exc:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
        logger.exception("Unable to persist patient record.")
        raise HTTPException(status_code=500, detail="Unable to persist the patient record.") from exc


def _load_scan_metadata(patient_id: str, scan_directory: Path) -> dict:
    metadata_path = scan_directory / "metadata.json"
    try:
        with metadata_path.open("r", encoding="utf-8") as handle:
            metadata = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        logger.exception("Unable to read stored scan metadata.")
        raise HTTPException(status_code=500, detail="Stored scan history is unavailable.") from exc

    if not isinstance(metadata, dict):
        raise HTTPException(status_code=500, detail="Stored scan history is unavailable.")
    if metadata.get("patient_id") != patient_id or metadata.get("scan_id") != scan_directory.name:
        raise HTTPException(status_code=500, detail="Stored scan history is unavailable.")
    if _report_timestamp(metadata.get("uploaded_at")) is None:
        raise HTTPException(status_code=500, detail="Stored scan history is unavailable.")
    recorded_date = metadata.get("scan_date")
    if recorded_date is not None:
        try:
            if not isinstance(recorded_date, str) or date.fromisoformat(recorded_date).isoformat() != recorded_date:
                raise ValueError
        except ValueError as exc:
            raise HTTPException(status_code=500, detail="Stored scan history is unavailable.") from exc
    try:
        scan_id = str(uuid.UUID(scan_directory.name))
    except ValueError as exc:
        raise HTTPException(status_code=500, detail="Stored scan history is unavailable.") from exc

    image_extension = metadata.get("image_extension")
    if image_extension not in {"jpg", "png"}:
        raise HTTPException(status_code=500, detail="Stored scan history is unavailable.")
    image_path = scan_directory / f"original.{image_extension}"
    metadata["image_available"] = image_path.is_file()
    metadata["image_path"] = (
        Path("data") / "patients" / patient_id / "scans" / scan_id / image_path.name
    ).as_posix()
    metadata["image_url"] = f"/patients/{patient_id}/scans/{scan_id}/image"
    metadata.pop("idempotency_key", None)
    metadata.pop("request_fingerprint", None)
    return metadata


def _scan_request_fingerprint(
    image_bytes: bytes,
    *,
    eye_side: str,
    scan_date: str | None,
    notes: str | None,
) -> str:
    digest = hashlib.sha256()
    digest.update(image_bytes)
    digest.update(b"\0")
    digest.update(json.dumps(
        {"eye_side": eye_side, "scan_date": scan_date, "notes": notes},
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8"))
    return digest.hexdigest()


def _existing_idempotent_scan(
    patient_id: str,
    scan_id: str,
    idempotency_key: str,
    request_fingerprint: str,
) -> dict | None:
    scan_directory = PATIENTS_ROOT / patient_id / "scans" / scan_id
    if not scan_directory.exists():
        return None
    try:
        with (scan_directory / "metadata.json").open("r", encoding="utf-8") as handle:
            stored_record = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        logger.exception("Unable to read a scan record during upload retry.")
        raise HTTPException(status_code=500, detail="Stored scan history is unavailable.") from exc
    if (
        not isinstance(stored_record, dict)
        or stored_record.get("patient_id") != patient_id
        or stored_record.get("scan_id") != scan_id
        or stored_record.get("idempotency_key") != idempotency_key
    ):
        raise HTTPException(
            status_code=409,
            detail="A conflicting scan identifier already exists. Retry the upload.",
        )
    if stored_record.get("request_fingerprint") != request_fingerprint:
        raise HTTPException(
            status_code=409,
            detail="This upload retry key was already used for different scan data.",
        )
    return _load_scan_metadata(patient_id, scan_directory)


def _load_history() -> dict:
    if not PATIENT_HISTORY_PATH.exists():
        return {}
    try:
        with PATIENT_HISTORY_PATH.open("r", encoding="utf-8") as handle:
            history = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        logger.exception("Unable to read legacy patient history.")
        raise HTTPException(status_code=500, detail="Legacy patient history is unavailable.") from exc
    if not isinstance(history, dict):
        raise HTTPException(status_code=500, detail="Legacy patient history is unavailable.")
    return history


def _save_history(history: dict) -> None:
    PATIENT_HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    _write_json_atomic(PATIENT_HISTORY_PATH, history)


def _require_model_ready() -> None:
    if not model_service.model_ready:
        raise HTTPException(
            status_code=503,
            detail=model_service.load_error or "The model is unavailable. Check the backend logs.",
        )


def _store_patient_observation(patient_code: str | None, payload: dict) -> None:
    if not patient_code:
        return
    history = _load_history()
    normalized = (patient_code or "").strip()
    if not normalized:
        return
    history.setdefault(normalized, [])
    history[normalized].append(payload)
    _save_history(history)


async def _read_validated_image(file: UploadFile) -> tuple[Image.Image, bytes, str]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="No image file was provided.")

    content_type = (file.content_type or "").split(";", 1)[0].strip().lower()
    if content_type not in SUPPORTED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail="Unsupported image type. Upload a JPEG or PNG image.",
        )

    contents = bytearray()
    while True:
        remaining = MAX_IMAGE_BYTES + 1 - len(contents)
        chunk = await file.read(min(UPLOAD_CHUNK_BYTES, remaining))
        if not chunk:
            break
        contents.extend(chunk)
        if len(contents) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="Image size exceeds the 20 MB limit.")

    if not contents:
        raise HTTPException(status_code=400, detail="The uploaded image is empty.")

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(contents)) as image:
                image_format = image.format
                if image_format not in SUPPORTED_IMAGE_FORMATS:
                    raise HTTPException(
                        status_code=415,
                        detail="Unsupported image type. Upload a JPEG or PNG image.",
                    )
                image.verify()
            with Image.open(io.BytesIO(contents)) as image:
                image.load()
                return image.copy(), bytes(contents), image_format
    except HTTPException:
        raise
    except (
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        UnidentifiedImageError,
        OSError,
        ValueError,
    ):
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid JPEG or PNG image.")


@app.get("/health")
def health_check() -> dict:
    return {
        "status": "ok" if model_service.model_ready else "degraded",
        "model_ready": model_service.model_ready,
        "device": str(model_service.device),
        "timestamp": _utc_now(),
    }


@app.get("/model-info")
def model_info() -> dict:
    return {
        "status": "ok",
        "model": {
            **MODEL_METADATA,
            "checkpoint": Path(MODEL_METADATA["checkpoint"]).name,
        },
        "ready": model_service.model_ready,
        "checkpoint_exists": model_service.model_path.exists(),
        "error": model_service.load_error,
    }


@app.post("/auth/login")
def doctor_login(credentials: DoctorLogin) -> dict:
    try:
        access_token = verify_doctor_credentials(credentials.doctor_id, credentials.password)
    except HTTPException:
        write_audit_event("doctor_login", "failure")
        raise
    write_audit_event("doctor_login", "success")
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": TOKEN_TTL_SECONDS,
    }


@app.get("/auth/me")
def current_doctor(doctor_id: str = Depends(require_doctor_auth)) -> dict:
    return {"doctor_id": doctor_id}


@app.get("/patient-history")
def patient_history(patient_code: str | None = None, _: str = Depends(require_doctor_auth)) -> dict:
    if not patient_code:
        return {"patient_code": None, "observations": []}
    history = _load_history().get(patient_code.strip(), [])
    return {"patient_code": patient_code.strip(), "observations": history}


@app.post("/patients", status_code=201)
def create_patient(patient: PatientCreate, _: str = Depends(require_doctor_auth)) -> dict:
    patient_id = _validate_patient_id(patient.patient_id)
    patient_directory = PATIENTS_ROOT / patient_id
    try:
        patient_directory.mkdir(parents=True, exist_ok=False)
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail="A patient with this ID already exists.") from exc
    except OSError as exc:
        logger.exception("Unable to create patient storage.")
        raise HTTPException(status_code=500, detail="Unable to create the patient record.") from exc

    profile = {
        "patient_id": patient_id,
        "created_at": _utc_now(),
        "name": patient.name,
        "age": patient.age,
        "sex": patient.sex,
        "contact": patient.contact,
        "notes": patient.notes,
    }
    try:
        _write_json_atomic(patient_directory / "profile.json", profile)
    except HTTPException:
        try:
            (patient_directory / "profile.json").unlink(missing_ok=True)
            patient_directory.rmdir()
        except OSError:
            logger.exception("Unable to clean up incomplete patient storage.")
        raise
    write_audit_event("patient_created", "success", patient_id=patient_id)
    return {"status": "ok", "patient": profile}


@app.get("/patients")
def list_patients(_: str = Depends(require_doctor_auth)) -> dict:
    patients = []
    if not PATIENTS_ROOT.is_dir():
        return {"patients": patients}

    for patient_directory in PATIENTS_ROOT.iterdir():
        if not patient_directory.is_dir():
            continue
        profile_path = patient_directory / "profile.json"
        if not profile_path.is_file():
            continue

        patient_id = _validate_patient_id(patient_directory.name)
        try:
            with profile_path.open("r", encoding="utf-8") as handle:
                profile = json.load(handle)
        except (OSError, json.JSONDecodeError) as exc:
            logger.exception("Unable to read patient profile for directory listing.")
            raise HTTPException(status_code=500, detail="Patient directory is unavailable.") from exc
        if not isinstance(profile, dict) or profile.get("patient_id") != patient_id:
            raise HTTPException(status_code=500, detail="Patient directory is unavailable.")

        scans_directory = patient_directory / "scans"
        scan_records = []
        if scans_directory.is_dir():
            for scan_directory in scans_directory.iterdir():
                if scan_directory.is_dir():
                    scan_records.append(_load_scan_metadata(patient_id, scan_directory))

        latest_scan = max(scan_records, key=lambda record: record["uploaded_at"], default=None)
        if latest_scan is not None:
            latest_scan = {
                field: latest_scan.get(field)
                for field in (
                    "scan_id",
                    "uploaded_at",
                    "scan_date",
                    "eye_side",
                    "prediction",
                    "amd_probability",
                    "class_probabilities",
                    "model_version",
                )
            }

        patients.append(
            {
                "patient_id": patient_id,
                "created_at": profile.get("created_at"),
                "name": profile.get("name"),
                "age": profile.get("age"),
                "sex": profile.get("sex"),
                "scan_count": len(scan_records),
                "latest_scan": latest_scan,
            }
        )

    patients.sort(key=lambda patient: patient["patient_id"].casefold())
    return {"patients": patients}


@app.get("/patients/{patient_id}")
def get_patient(patient_id: str, _: str = Depends(require_doctor_auth)) -> dict:
    patient_id = _validate_patient_id(patient_id)
    profile_path = PATIENTS_ROOT / patient_id / "profile.json"
    if not profile_path.is_file():
        raise HTTPException(status_code=404, detail="Patient profile not found.")
    try:
        with profile_path.open("r", encoding="utf-8") as handle:
            profile = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        logger.exception("Unable to read patient profile.")
        raise HTTPException(status_code=500, detail="Patient profile is unavailable.") from exc
    return {"status": "ok", "patient": profile}


@app.post("/patients/{patient_id}/scans", status_code=201)
async def save_patient_scan(
    patient_id: str,
    file: UploadFile = File(...),
    eye_side: str = Form(...),
    scan_date: str | None = Form(default=None),
    notes: str | None = Form(default=None),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    _: str = Depends(require_doctor_auth),
) -> dict:
    patient_id = _validate_patient_id(patient_id)
    patient_directory = PATIENTS_ROOT / patient_id
    if not (patient_directory / "profile.json").is_file():
        raise HTTPException(status_code=404, detail="Patient profile not found.")

    normalized_eye_side = eye_side.strip().lower()
    if normalized_eye_side not in {"left", "right"}:
        raise HTTPException(status_code=422, detail="Eye side must be 'left' or 'right'.")

    normalized_scan_date: str | None = None
    if scan_date is not None and scan_date.strip():
        try:
            parsed_scan_date = date.fromisoformat(scan_date.strip())
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Scan date must use YYYY-MM-DD format.") from exc
        if parsed_scan_date.isoformat() != scan_date.strip():
            raise HTTPException(status_code=422, detail="Scan date must use YYYY-MM-DD format.")
        normalized_scan_date = parsed_scan_date.isoformat()

    if notes is not None and len(notes) > MAX_NOTES_LENGTH:
        raise HTTPException(status_code=422, detail="Notes must be 2000 characters or fewer.")

    normalized_idempotency_key: str | None = None
    if idempotency_key is not None:
        try:
            normalized_idempotency_key = str(uuid.UUID(idempotency_key))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Idempotency-Key must be a valid UUID.") from exc

    image, original_bytes, image_format = await _read_validated_image(file)
    request_fingerprint = _scan_request_fingerprint(
        original_bytes,
        eye_side=normalized_eye_side,
        scan_date=normalized_scan_date,
        notes=notes,
    )
    scan_id = (
        str(uuid.uuid5(uuid.NAMESPACE_URL, f"ocutwin:{patient_id}:{normalized_idempotency_key}"))
        if normalized_idempotency_key
        else str(uuid.uuid4())
    )
    if normalized_idempotency_key:
        existing_scan = _existing_idempotent_scan(
            patient_id,
            scan_id,
            normalized_idempotency_key,
            request_fingerprint,
        )
        if existing_scan is not None:
            return {"status": "ok", "scan": existing_scan}

    _require_model_ready()
    try:
        result = model_service.predict_pil_image(image)
    except Exception as exc:
        write_audit_event("scan_prediction", "failure", patient_id=patient_id)
        logger.exception("Prediction failed while saving patient scan.")
        raise HTTPException(status_code=500, detail="Prediction failed. Check the server logs.") from exc

    scan_directory = patient_directory / "scans" / scan_id
    extension, _ = SUPPORTED_IMAGE_FORMATS[image_format]
    image_path = scan_directory / f"original.{extension}"
    relative_image_path = Path("data") / "patients" / patient_id / "scans" / scan_id / image_path.name
    record = {
        "scan_id": scan_id,
        "patient_id": patient_id,
        "uploaded_at": _utc_now(),
        "scan_date": normalized_scan_date,
        "eye_side": normalized_eye_side,
        "prediction": result["prediction"],
        "amd_probability": result["probability"],
        "class_probabilities": result["class_probabilities"],
        "model_version": model_service.model_version,
        "notes": notes,
        "image_extension": extension,
        "image_path": relative_image_path.as_posix(),
    }
    if normalized_idempotency_key:
        record["idempotency_key"] = normalized_idempotency_key
        record["request_fingerprint"] = request_fingerprint

    scan_directory_created = False
    try:
        scan_directory.mkdir(parents=True, exist_ok=False)
        scan_directory_created = True
        with image_path.open("xb") as handle:
            handle.write(original_bytes)
            handle.flush()
            os.fsync(handle.fileno())
        _write_json_atomic(scan_directory / "metadata.json", record)
    except FileExistsError as exc:
        if normalized_idempotency_key:
            existing_scan = _existing_idempotent_scan(
                patient_id,
                scan_id,
                normalized_idempotency_key,
                request_fingerprint,
            )
            if existing_scan is not None:
                return {"status": "ok", "scan": existing_scan}
        raise HTTPException(
            status_code=409,
            detail="A conflicting scan identifier already exists. Retry the upload.",
        ) from exc
    except HTTPException:
        if scan_directory_created:
            try:
                image_path.unlink(missing_ok=True)
                scan_directory.rmdir()
            except OSError:
                logger.exception("Unable to clean up incomplete scan storage.")
        raise
    except OSError as exc:
        if scan_directory_created:
            try:
                image_path.unlink(missing_ok=True)
                (scan_directory / "metadata.json").unlink(missing_ok=True)
                scan_directory.rmdir()
            except OSError:
                logger.exception("Unable to clean up incomplete scan storage.")
        logger.exception("Unable to persist uploaded scan.")
        raise HTTPException(status_code=500, detail="Unable to persist the uploaded scan.") from exc

    write_audit_event("scan_uploaded", "success", patient_id=patient_id, scan_id=scan_id)
    response_record = dict(record)
    response_record["image_available"] = True
    response_record["image_url"] = f"/patients/{patient_id}/scans/{scan_id}/image"
    return {"status": "ok", "scan": response_record}


@app.get("/patients/{patient_id}/scans")
def get_patient_scans(patient_id: str, _: str = Depends(require_doctor_auth)) -> dict:
    patient_id = _validate_patient_id(patient_id)
    patient_directory = PATIENTS_ROOT / patient_id
    if not (patient_directory / "profile.json").is_file():
        raise HTTPException(status_code=404, detail="Patient profile not found.")

    scans_directory = patient_directory / "scans"
    records = []
    if scans_directory.exists():
        for scan_directory in scans_directory.iterdir():
            if scan_directory.is_dir():
                records.append(_load_scan_metadata(patient_id, scan_directory))
    records.sort(key=lambda item: (item["scan_date"] or item["uploaded_at"][:10], item["uploaded_at"], item["scan_id"]))
    return {"patient_id": patient_id, "scans": records}


@app.get("/patients/{patient_id}/scans/{scan_id}/image")
def get_patient_scan_image(
    patient_id: str,
    scan_id: str,
    _: str = Depends(require_doctor_auth),
) -> FileResponse:
    patient_id = _validate_patient_id(patient_id)
    try:
        normalized_scan_id = str(uuid.UUID(scan_id))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid scan ID.") from exc

    scan_directory = PATIENTS_ROOT / patient_id / "scans" / normalized_scan_id
    if not (PATIENTS_ROOT / patient_id / "profile.json").is_file():
        raise HTTPException(status_code=404, detail="Patient profile not found.")
    if not scan_directory.is_dir():
        raise HTTPException(status_code=404, detail="Scan not found.")
    metadata = _load_scan_metadata(patient_id, scan_directory)
    extension = metadata["image_extension"]
    image_path = scan_directory / f"original.{extension}"
    if not image_path.is_file():
        raise HTTPException(status_code=404, detail="Stored scan image is unavailable.")
    media_type = "image/jpeg" if extension == "jpg" else "image/png"
    return FileResponse(image_path, media_type=media_type)


def _report_timestamp(value: object) -> float | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.timestamp()


def _report_history_key(scan: dict) -> tuple[float, float, str]:
    recorded_time = _report_timestamp(scan.get("scan_date"))
    uploaded_time = _report_timestamp(scan.get("uploaded_at"))
    return (
        recorded_time if recorded_time is not None else float("-inf"),
        uploaded_time if uploaded_time is not None else float("-inf"),
        str(scan.get("scan_id", "")),
    )


def _report_latest_key(scan: dict) -> tuple[float, float, str]:
    uploaded_time = _report_timestamp(scan.get("uploaded_at"))
    recorded_time = _report_timestamp(scan.get("scan_date"))
    return (
        uploaded_time if uploaded_time is not None else float("-inf"),
        recorded_time if recorded_time is not None else float("-inf"),
        str(scan.get("scan_id", "")),
    )


def _report_scan_image(patient_id: str, scan: dict) -> bytes | None:
    if scan.get("patient_id") != patient_id:
        raise HTTPException(status_code=500, detail="Stored scan history is unavailable.")
    scan_id = scan.get("scan_id")
    try:
        normalized_scan_id = str(uuid.UUID(str(scan_id)))
    except ValueError as exc:
        raise HTTPException(status_code=500, detail="Stored scan history is unavailable.") from exc

    extension = scan.get("image_extension")
    if extension not in {"jpg", "png"}:
        raise HTTPException(status_code=500, detail="Stored scan history is unavailable.")
    image_path = PATIENTS_ROOT / patient_id / "scans" / normalized_scan_id / f"original.{extension}"
    try:
        image_bytes = image_path.read_bytes()
    except FileNotFoundError:
        return None
    except OSError as exc:
        logger.warning("Unable to read a stored scan image for report generation: %s", type(exc).__name__)
        return None
    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            image.verify()
    except (Image.DecompressionBombError, Image.DecompressionBombWarning, UnidentifiedImageError, OSError, ValueError):
        return None
    return image_bytes


def _report_paragraph(value: object, style: ParagraphStyle) -> Paragraph:
    text = "Not available" if value is None or value == "" else str(value)
    safe_text = escape(text).replace("\n", "<br/>")
    return Paragraph(safe_text, style)


def _report_probability(scan: dict, class_name: str) -> object:
    probabilities = scan.get("class_probabilities")
    if isinstance(probabilities, dict) and probabilities.get(class_name) is not None:
        return probabilities[class_name]
    if class_name == "AMD":
        return scan.get("amd_probability")
    return None


def _report_probability_text(scan: dict, class_name: str) -> str | None:
    value = _report_probability(scan, class_name)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 1:
        return None
    return f"{value * 100:.2f}%"


def _report_image(image_bytes: bytes, width: float, height: float) -> PDFImage:
    image = PDFImage(io.BytesIO(image_bytes), width=width, height=height, kind="proportional")
    image.hAlign = "CENTER"
    return image


def _build_patient_report(
    patient: dict,
    scans: list[dict],
    comparison_scans: list[tuple[dict, bytes | None]],
) -> bytes:
    generated_at = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S %Z")
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="OcuTwinTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=23,
        textColor=colors.HexColor("#263a71"),
        alignment=TA_CENTER,
        spaceAfter=5 * mm,
    ))
    styles.add(ParagraphStyle(
        name="OcuTwinSection",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=15,
        textColor=colors.HexColor("#263a71"),
        spaceBefore=4 * mm,
        spaceAfter=2 * mm,
        keepWithNext=True,
    ))
    styles.add(ParagraphStyle(
        name="OcuTwinBody",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#26364b"),
    ))
    styles.add(ParagraphStyle(
        name="OcuTwinSmall",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor("#52657d"),
    ))
    styles.add(ParagraphStyle(
        name="OcuTwinTableHeader",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=7.5,
        leading=9,
        textColor=colors.white,
    ))
    story: list[object] = [
        Paragraph("OcuTwin — Retinal Twin Observation Report", styles["OcuTwinTitle"]),
        _report_paragraph(
            f"Generated {generated_at} · Experimental retinal digital-twin research prototype",
            styles["OcuTwinSmall"],
        ),
        Spacer(1, 4 * mm),
        Paragraph("Patient profile", styles["OcuTwinSection"]),
    ]

    profile_fields = [
        ("Patient identifier", patient.get("patient_id")),
        ("Name / demo alias", patient.get("name")),
        ("Age", patient.get("age")),
        ("Sex", patient.get("sex")),
        ("Contact / reference", patient.get("contact")),
        ("Profile created", patient.get("created_at")),
        ("Relevant notes", patient.get("notes")),
    ]
    story.append(_report_detail_table(profile_fields, styles))

    latest_scan = max(scans, key=_report_latest_key, default=None)
    summary_fields = [
        ("Total saved OCT scans", len(scans)),
        ("Latest saved scan date", latest_scan.get("scan_date") if latest_scan else None),
        ("Latest recorded eye side", latest_scan.get("eye_side") if latest_scan else None),
        ("Latest saved prediction", latest_scan.get("prediction") if latest_scan else None),
        ("AMD probability", _report_probability_text(latest_scan, "AMD") if latest_scan else None),
        ("Non-AMD probability", _report_probability_text(latest_scan, "Non-AMD") if latest_scan else None),
        ("Model version", latest_scan.get("model_version") if latest_scan else None),
    ]
    story.extend((Paragraph("Patient observation summary", styles["OcuTwinSection"]), _report_detail_table(summary_fields, styles)))

    if latest_scan is None:
        story.extend((
            Paragraph("Latest OCT observation", styles["OcuTwinSection"]),
            _report_paragraph("No OCT scans recorded.", styles["OcuTwinBody"]),
        ))
    else:
        story.append(Paragraph("Latest OCT observation", styles["OcuTwinSection"]))
        story.append(_report_detail_table([
            ("Scan identifier", latest_scan.get("scan_id")),
            ("Recorded date", latest_scan.get("scan_date")),
            ("Eye side", latest_scan.get("eye_side")),
            ("Saved prediction", latest_scan.get("prediction")),
            ("AMD probability", _report_probability_text(latest_scan, "AMD")),
            ("Non-AMD probability", _report_probability_text(latest_scan, "Non-AMD")),
            ("Model version", latest_scan.get("model_version")),
        ], styles))
        latest_image = _report_scan_image(patient["patient_id"], latest_scan)
        if latest_image is None:
            story.append(_report_paragraph("Original saved OCT image is unavailable.", styles["OcuTwinBody"]))
        else:
            story.append(_report_image(latest_image, 165 * mm, 85 * mm))
            try:
                with Image.open(io.BytesIO(latest_image)) as stored_image:
                    explanation = model_service.generate_gradcam(stored_image.convert("RGB"))
                explanation_bytes = base64.b64decode(explanation, validate=True)
                with Image.open(io.BytesIO(explanation_bytes)) as explanation_image:
                    explanation_image.verify()
                story.append(Paragraph("Grad-CAM model-explanation visualization", styles["OcuTwinSection"]))
                story.append(_report_image(explanation_bytes, 145 * mm, 75 * mm))
                story.append(_report_paragraph(
                    "Grad-CAM is a model-explanation visualization, not a verified lesion or clinical finding.",
                    styles["OcuTwinSmall"],
                ))
            except Exception:
                logger.warning("Grad-CAM unavailable while generating patient report.")
                story.append(Paragraph("Grad-CAM model-explanation visualization", styles["OcuTwinSection"]))
                story.append(_report_paragraph("Grad-CAM is unavailable for this saved scan.", styles["OcuTwinBody"]))

    story.append(Paragraph("Chronological scan history", styles["OcuTwinSection"]))
    if not scans:
        story.append(_report_paragraph("No OCT scans recorded.", styles["OcuTwinBody"]))
    else:
        history_rows: list[list[Paragraph]] = [[
            _report_paragraph(label, styles["OcuTwinTableHeader"])
            for label in ("Scan ID", "Recorded date", "Eye side", "Prediction", "AMD probability", "Non-AMD probability", "Model version")
        ]]
        for scan in scans:
            history_rows.append([
                _report_paragraph(scan.get("scan_id"), styles["OcuTwinSmall"]),
                _report_paragraph(scan.get("scan_date"), styles["OcuTwinSmall"]),
                _report_paragraph(scan.get("eye_side"), styles["OcuTwinSmall"]),
                _report_paragraph(scan.get("prediction"), styles["OcuTwinSmall"]),
                _report_paragraph(_report_probability_text(scan, "AMD"), styles["OcuTwinSmall"]),
                _report_paragraph(_report_probability_text(scan, "Non-AMD"), styles["OcuTwinSmall"]),
                _report_paragraph(scan.get("model_version"), styles["OcuTwinSmall"]),
            ])
        history_table = Table(
            history_rows,
            colWidths=[24 * mm, 21 * mm, 16 * mm, 20 * mm, 21 * mm, 25 * mm, 39 * mm],
            repeatRows=1,
            hAlign="LEFT",
        )
        history_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#263a71")),
            ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#d9e1ed")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f8fc")]),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(history_table)

    if comparison_scans:
        story.append(Paragraph("Selected two-scan comparison", styles["OcuTwinSection"]))
        comparison_cells: list[list[object]] = [[
            _report_paragraph("Selected observation 1", styles["OcuTwinTableHeader"]),
            _report_paragraph("Selected observation 2", styles["OcuTwinTableHeader"]),
        ]]
        comparison_cells.append([
            _report_paragraph(
                f"{scan.get('scan_id')} · {scan.get('scan_date') or 'Date not available'} · "
                f"{scan.get('eye_side') or 'Eye side not available'} · {scan.get('prediction') or 'Prediction not available'}",
                styles["OcuTwinSmall"],
            )
            for scan, _ in comparison_scans
        ])
        comparison_cells.append([
            _report_image(image_bytes, 78 * mm, 50 * mm)
            if image_bytes is not None
            else _report_paragraph("Original saved image unavailable.", styles["OcuTwinSmall"])
            for _, image_bytes in comparison_scans
        ])
        for index in range(2):
            scan = comparison_scans[index][0]
            comparison_cells.append([
                _report_paragraph(
                    f"AMD: {_report_probability_text(scan, 'AMD') or 'Not available'} · "
                    f"Non-AMD: {_report_probability_text(scan, 'Non-AMD') or 'Not available'} · "
                    f"Model: {scan.get('model_version') or 'Not available'}",
                    styles["OcuTwinSmall"],
                ) if column == index else _report_paragraph("", styles["OcuTwinSmall"])
                for column in range(2)
            ])
        comparison_table = Table(comparison_cells, colWidths=[82 * mm, 82 * mm], hAlign="LEFT")
        comparison_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#263a71")),
            ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#d9e1ed")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.extend((
            comparison_table,
            Spacer(1, 2 * mm),
            _report_paragraph(
                "Observed differences between scans do not establish clinically validated disease progression.",
                styles["OcuTwinSmall"],
            ),
        ))

    story.extend((
        Paragraph("Important disclaimer", styles["OcuTwinSection"]),
        _report_paragraph(
            "OcuTwin is an experimental retinal digital-twin prototype. This report summarizes recorded OCT observations and model predictions. "
            "Predictions and Grad-CAM visualizations are not a substitute for professional clinical interpretation. "
            "Differences between observations do not establish clinically validated disease progression. "
            "This report does not provide treatment recommendations.",
            styles["OcuTwinBody"],
        ),
    ))

    output = io.BytesIO()
    document = SimpleDocTemplate(
        output,
        pagesize=A4,
        rightMargin=17 * mm,
        leftMargin=17 * mm,
        topMargin=17 * mm,
        bottomMargin=18 * mm,
        title="OcuTwin Retinal Twin Observation Report",
        author="OcuTwin",
        pageCompression=0,
    )
    document.build(story, onFirstPage=_report_page_footer, onLaterPages=_report_page_footer)
    return output.getvalue()


def _report_detail_table(fields: list[tuple[str, object]], styles: dict) -> Table:
    rows = [
        [_report_paragraph(label, styles["OcuTwinSmall"]), _report_paragraph(value, styles["OcuTwinBody"])]
        for label, value in fields
    ]
    table = Table(rows, colWidths=[52 * mm, 112 * mm], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#d9e1ed")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f5f8fc")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return table


def _report_page_footer(canvas, document) -> None:
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#7e8da0"))
    canvas.drawString(17 * mm, 9 * mm, "OcuTwin · Experimental research prototype")
    canvas.drawRightString(A4[0] - 17 * mm, 9 * mm, f"Page {document.page}")
    canvas.restoreState()


@app.get("/patients/{patient_id}/report")
def export_patient_report(
    patient_id: str,
    first_scan_id: str | None = None,
    second_scan_id: str | None = None,
    _: str = Depends(require_doctor_auth),
) -> StreamingResponse:
    patient_id = _validate_patient_id(patient_id)
    patient_directory = PATIENTS_ROOT / patient_id
    profile_path = patient_directory / "profile.json"
    if not profile_path.is_file():
        raise HTTPException(status_code=404, detail="Patient profile not found.")
    try:
        with profile_path.open("r", encoding="utf-8") as handle:
            patient = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        logger.exception("Unable to read patient profile for report generation.")
        raise HTTPException(status_code=500, detail="Patient profile is unavailable.") from exc
    if not isinstance(patient, dict) or patient.get("patient_id") != patient_id:
        raise HTTPException(status_code=500, detail="Patient profile is unavailable.")

    if bool(first_scan_id) != bool(second_scan_id):
        raise HTTPException(status_code=422, detail="Select both scans to include a comparison.")
    scans_directory = patient_directory / "scans"
    scans: list[dict] = []
    if scans_directory.is_dir():
        for scan_directory in scans_directory.iterdir():
            if scan_directory.is_dir():
                scans.append(_load_scan_metadata(patient_id, scan_directory))
    scans.sort(key=_report_history_key)

    comparison_scans: list[tuple[dict, bytes | None]] = []
    if first_scan_id and second_scan_id:
        if first_scan_id == second_scan_id:
            raise HTTPException(status_code=422, detail="Choose two different scans for comparison.")
        scans_by_id = {scan["scan_id"]: scan for scan in scans}
        selected = []
        for requested_scan_id in (first_scan_id, second_scan_id):
            try:
                normalized_scan_id = str(uuid.UUID(requested_scan_id))
            except ValueError as exc:
                raise HTTPException(status_code=400, detail="Invalid scan ID.") from exc
            scan = scans_by_id.get(normalized_scan_id)
            if scan is None or scan.get("patient_id") != patient_id:
                raise HTTPException(status_code=404, detail="Selected scans were not found for this patient.")
            selected.append((scan, _report_scan_image(patient_id, scan)))
        comparison_scans = selected

    try:
        pdf = _build_patient_report(patient, scans, comparison_scans)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Unable to generate patient observation report.")
        raise HTTPException(status_code=500, detail="Unable to generate the patient report.") from exc

    write_audit_event("patient_report_generated", "success", patient_id=patient_id)
    filename = f"ocutwin-retinal-twin-{patient_id}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/predict")
async def predict_image(
    file: UploadFile = File(...),
    patient_code: str = Form(default=""),
    _: str = Depends(require_doctor_auth),
) -> dict:
    image, _, _ = await _read_validated_image(file)

    _require_model_ready()
    try:
        result = model_service.predict_pil_image(image)
    except Exception as exc:
        write_audit_event("scan_prediction", "failure")
        logger.exception("Prediction failed.")
        raise HTTPException(status_code=500, detail="Prediction failed. Check the server logs.") from exc

    payload = {
        "timestamp": _utc_now(),
        "patient_code": patient_code.strip() or None,
        "prediction": result["prediction"],
        "confidence": result["confidence"],
        "probability": result["probability"],
        "class_probabilities": result["class_probabilities"],
        "note": "Model prediction from the current trained EfficientNetB0 baseline.",
    }
    _store_patient_observation(patient_code, payload)
    write_audit_event("prediction_completed", "success")
    return {"status": "ok", "result": result, "history": payload}


@app.post("/gradcam")
async def gradcam(file: UploadFile = File(...), _: str = Depends(require_doctor_auth)) -> dict:
    image, _, _ = await _read_validated_image(file)

    _require_model_ready()
    try:
        overlay = model_service.generate_gradcam(image)
    except Exception as exc:
        logger.exception("Grad-CAM generation failed.")
        raise HTTPException(status_code=500, detail="Grad-CAM generation failed. Check the server logs.") from exc

    return {
        "status": "ok",
        "gradcam_base64": overlay,
        "note": "Grad-CAM is an explanatory visualization aid only and is not proof of disease location.",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.app:app", host="127.0.0.1", port=8000, reload=True)
