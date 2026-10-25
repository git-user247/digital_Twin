from __future__ import annotations

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

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator
from PIL import Image, UnidentifiedImageError

from backend.model_service import MODEL_METADATA, ModelService
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
    return metadata


def _load_history() -> dict:
    if not PATIENT_HISTORY_PATH.exists():
        return {}
    try:
        with PATIENT_HISTORY_PATH.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except json.JSONDecodeError:
        return {}


def _save_history(history: dict) -> None:
    PATIENT_HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    with PATIENT_HISTORY_PATH.open("w", encoding="utf-8") as handle:
        json.dump(history, handle, indent=2)


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
        "model": MODEL_METADATA,
        "ready": model_service.model_ready,
        "checkpoint_exists": model_service.model_path.exists(),
        "error": model_service.load_error,
    }


@app.post("/auth/login")
def doctor_login(credentials: DoctorLogin) -> dict:
    access_token = verify_doctor_credentials(credentials.doctor_id, credentials.password)
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

    image, original_bytes, image_format = await _read_validated_image(file)
    _require_model_ready()
    try:
        result = model_service.predict_pil_image(image)
    except Exception as exc:
        logger.exception("Prediction failed while saving patient scan.")
        raise HTTPException(status_code=500, detail="Prediction failed. Check the server logs.") from exc

    scan_id = str(uuid.uuid4())
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

    scan_directory_created = False
    try:
        scan_directory.mkdir(parents=True, exist_ok=False)
        scan_directory_created = True
        with image_path.open("xb") as handle:
            handle.write(original_bytes)
            handle.flush()
            os.fsync(handle.fileno())
        _write_json_atomic(scan_directory / "metadata.json", record)
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
