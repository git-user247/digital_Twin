from __future__ import annotations

import io
import json
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import Mock, patch

from fastapi import HTTPException
from fastapi.datastructures import UploadFile
from PIL import Image
from pydantic import ValidationError
from starlette.datastructures import Headers

from backend import audit as audit_log
from backend import app as backend_app


def _png_bytes(color: tuple[int, int, int] = (40, 120, 200)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (24, 16), color).save(buffer, format="PNG")
    return buffer.getvalue()


def _upload(content: bytes) -> UploadFile:
    return UploadFile(
        file=io.BytesIO(content),
        filename="oct.png",
        headers=Headers({"content-type": "image/png"}),
    )


class PatientRecordTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.patients_root = Path(self.temporary_directory.name) / "patients"
        self.patients_patch = patch.object(backend_app, "PATIENTS_ROOT", self.patients_root)
        self.audit_patch = patch.object(audit_log, "AUDIT_LOG_PATH", Path(self.temporary_directory.name) / "audit.jsonl")
        self.service = Mock()
        self.service.model_version = "baseline_efficientnetb0_best.pth:epoch-12"
        self.service.predict_pil_image.return_value = {
            "prediction": "AMD",
            "probability": 0.73,
            "confidence": 73.0,
            "class_probabilities": {"Non-AMD": 0.27, "AMD": 0.73},
        }
        self.service_patch = patch.object(backend_app, "model_service", self.service)
        self.patients_patch.start()
        self.audit_patch.start()
        self.service_patch.start()
        self.addCleanup(self.patients_patch.stop)
        self.addCleanup(self.audit_patch.stop)
        self.addCleanup(self.service_patch.stop)
        self.addCleanup(self.temporary_directory.cleanup)

    async def _create_patient(self, patient_id: str = "Patient_001") -> dict:
        response = backend_app.create_patient(
            backend_app.PatientCreate(
                patient_id=patient_id,
                name="Demo patient",
                age=64,
                notes="Research prototype record",
            )
        )
        return response["patient"]

    async def _save_scan(
        self,
        patient_id: str,
        content: bytes,
        *,
        eye_side: str = "left",
        scan_date: str | None = None,
        notes: str | None = None,
        idempotency_key: str | None = None,
    ) -> dict:
        response = await backend_app.save_patient_scan(
            patient_id=patient_id,
            file=_upload(content),
            eye_side=eye_side,
            scan_date=scan_date,
            notes=notes,
            idempotency_key=idempotency_key,
        )
        return response["scan"]

    async def test_create_and_retrieve_patient_profile(self) -> None:
        created = await self._create_patient()
        retrieved = backend_app.get_patient("Patient_001")

        self.assertEqual(created["patient_id"], "Patient_001")
        self.assertEqual(created["name"], "Demo patient")
        self.assertEqual(created["age"], 64)
        self.assertEqual(created["notes"], "Research prototype record")
        self.assertEqual(retrieved["patient"], created)
        profile_path = self.patients_root / "Patient_001" / "profile.json"
        self.assertTrue(profile_path.is_file())
        self.assertEqual(json.loads(profile_path.read_text(encoding="utf-8")), created)

    async def test_patient_creation_requires_name_and_age(self) -> None:
        with self.assertRaises(ValidationError):
            backend_app.PatientCreate(patient_id="Patient_001")
        with self.assertRaises(ValidationError):
            backend_app.PatientCreate(patient_id="Patient_001", name="Demo patient")

    async def test_patient_creation_rejects_invalid_age(self) -> None:
        for age in (-1, 121, 42.5, True):
            with self.subTest(age=age):
                with self.assertRaises(ValidationError):
                    backend_app.PatientCreate(
                        patient_id="Patient_001",
                        name="Demo patient",
                        age=age,
                    )

    async def test_legacy_patient_profile_remains_readable(self) -> None:
        legacy_directory = self.patients_root / "LegacyPatient"
        legacy_directory.mkdir(parents=True)
        legacy_profile = {
            "patient_id": "LegacyPatient",
            "created_at": "2023-01-01T00:00:00+00:00",
            "notes": "Existing local record",
        }
        (legacy_directory / "profile.json").write_text(
            json.dumps(legacy_profile),
            encoding="utf-8",
        )

        self.assertEqual(backend_app.get_patient("LegacyPatient")["patient"], legacy_profile)
        listed = backend_app.list_patients()["patients"][0]
        self.assertEqual(listed["patient_id"], "LegacyPatient")
        self.assertIsNone(listed["name"])

    async def test_list_patients_returns_profiles_and_latest_scan_summary(self) -> None:
        created = await self._create_patient("Patient_B")
        await self._create_patient("Patient_A")
        older_scan = await self._save_scan(
            "Patient_B",
            _png_bytes(),
            eye_side="right",
            scan_date="2024-05-12",
        )
        latest_scan = await self._save_scan(
            "Patient_B",
            _png_bytes((200, 150, 100)),
            eye_side="left",
            scan_date="2024-02-03",
        )
        for scan, uploaded_at in (
            (older_scan, "2024-05-13T09:00:00+00:00"),
            (latest_scan, "2024-05-14T09:00:00+00:00"),
        ):
            metadata_path = self.patients_root / "Patient_B" / "scans" / scan["scan_id"] / "metadata.json"
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            metadata["uploaded_at"] = uploaded_at
            metadata_path.write_text(json.dumps(metadata), encoding="utf-8")

        result = backend_app.list_patients()

        self.assertEqual([patient["patient_id"] for patient in result["patients"]], ["Patient_A", "Patient_B"])
        patient_without_scans, patient_with_scan = result["patients"]
        self.assertEqual(patient_without_scans["scan_count"], 0)
        self.assertIsNone(patient_without_scans["latest_scan"])
        self.assertEqual(patient_with_scan["created_at"], created["created_at"])
        self.assertEqual(patient_with_scan["scan_count"], 2)
        self.assertEqual(
            patient_with_scan["latest_scan"],
            {
                "scan_id": latest_scan["scan_id"],
                "uploaded_at": "2024-05-14T09:00:00+00:00",
                "scan_date": "2024-02-03",
                "eye_side": "left",
                "prediction": "AMD",
                "amd_probability": 0.73,
                "class_probabilities": {"Non-AMD": 0.27, "AMD": 0.73},
                "model_version": self.service.model_version,
            },
        )
        self.assertNotIn("image_path", patient_with_scan["latest_scan"])
        self.assertNotIn("image_url", patient_with_scan["latest_scan"])
        self.assertNotIn("image", patient_with_scan["latest_scan"])

    async def test_list_patients_handles_missing_and_empty_storage(self) -> None:
        self.assertEqual(backend_app.list_patients(), {"patients": []})

        self.patients_root.mkdir()
        self.assertEqual(backend_app.list_patients(), {"patients": []})

    async def test_duplicate_patient_id_returns_conflict(self) -> None:
        existing = await self._create_patient()
        original_profile = (self.patients_root / "Patient_001" / "profile.json").read_text(encoding="utf-8")
        with self.assertRaises(HTTPException) as caught:
            await self._create_patient()
        self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(
            (self.patients_root / "Patient_001" / "profile.json").read_text(encoding="utf-8"),
            original_profile,
        )
        self.assertEqual(backend_app.get_patient("Patient_001")["patient"], existing)

    async def test_invalid_patient_ids_are_rejected_without_path_escape(self) -> None:
        for patient_id in ("../outside", "with space", "", "a" * 65):
            with self.subTest(patient_id=patient_id):
                with self.assertRaises(HTTPException) as caught:
                    await self._create_patient(patient_id)
                self.assertEqual(caught.exception.status_code, 400)
        self.assertEqual(list(self.patients_root.iterdir()) if self.patients_root.exists() else [], [])

    async def test_multiple_visits_preserve_images_and_record_distinct_metadata(self) -> None:
        await self._create_patient()
        first_bytes = _png_bytes((10, 20, 30))
        second_bytes = _png_bytes((200, 150, 100))
        first = await self._save_scan(
            "Patient_001",
            first_bytes,
            eye_side="left",
            scan_date="2024-01-05",
            notes="First observation",
        )
        second = await self._save_scan(
            "Patient_001",
            second_bytes,
            eye_side="right",
            scan_date="2024-03-09",
        )

        self.assertNotEqual(first["scan_id"], second["scan_id"])
        self.assertNotEqual(first["image_path"], second["image_path"])
        self.assertEqual(first["eye_side"], "left")
        self.assertEqual(second["eye_side"], "right")
        self.assertEqual(first["scan_date"], "2024-01-05")
        self.assertNotEqual(first["scan_date"], first["uploaded_at"])
        self.assertEqual(first["notes"], "First observation")
        self.assertEqual(first["model_version"], self.service.model_version)
        self.assertEqual(first["amd_probability"], 0.73)
        self.assertEqual(first["class_probabilities"]["AMD"], 0.73)

        first_image_path = self.patients_root / "Patient_001" / "scans" / first["scan_id"] / "original.png"
        second_image_path = self.patients_root / "Patient_001" / "scans" / second["scan_id"] / "original.png"
        self.assertEqual(first_image_path.read_bytes(), first_bytes)
        self.assertEqual(second_image_path.read_bytes(), second_bytes)
        self.assertEqual(len(list((self.patients_root / "Patient_001" / "scans").iterdir())), 2)
        image_response = backend_app.get_patient_scan_image("Patient_001", first["scan_id"])
        self.assertEqual(Path(image_response.path).read_bytes(), first_bytes)

        with (self.patients_root / "Patient_001" / "scans" / first["scan_id"] / "metadata.json").open(
            encoding="utf-8"
        ) as handle:
            metadata = json.load(handle)
        self.assertEqual(metadata["scan_id"], first["scan_id"])
        self.assertEqual(metadata["patient_id"], "Patient_001")

    async def test_history_is_sorted_by_scan_date_then_upload_time(self) -> None:
        await self._create_patient()
        later_visit_uploaded_first = await self._save_scan(
            "Patient_001",
            _png_bytes(),
            scan_date="2024-05-12",
        )
        earlier_visit_uploaded_second = await self._save_scan(
            "Patient_001",
            _png_bytes((80, 70, 60)),
            scan_date="2024-02-03",
        )

        history = backend_app.get_patient_scans("Patient_001")["scans"]
        self.assertEqual(
            [record["scan_id"] for record in history],
            [earlier_visit_uploaded_second["scan_id"], later_visit_uploaded_first["scan_id"]],
        )
        self.assertTrue(all(record["image_available"] for record in history))

    async def test_missing_patient_scan_and_invalid_scan_id_errors(self) -> None:
        with self.assertRaises(HTTPException) as caught:
            await backend_app.save_patient_scan(
                patient_id="absent",
                file=_upload(_png_bytes()),
                eye_side="left",
                idempotency_key=None,
            )
        self.assertEqual(caught.exception.status_code, 404)

        await self._create_patient()
        with self.assertRaises(HTTPException) as caught:
            backend_app.get_patient_scan_image("Patient_001", "../profile.json")
        self.assertEqual(caught.exception.status_code, 400)

    async def test_invalid_eye_side_and_scan_date_are_rejected(self) -> None:
        await self._create_patient()
        with self.assertRaises(HTTPException) as caught:
            await self._save_scan("Patient_001", _png_bytes(), eye_side="both")
        self.assertEqual(caught.exception.status_code, 422)

        with self.assertRaises(HTTPException) as caught:
            await self._save_scan("Patient_001", _png_bytes(), scan_date="09/12/2024")
        self.assertEqual(caught.exception.status_code, 422)

        with self.assertRaises(HTTPException) as caught:
            await self._save_scan("Patient_001", _png_bytes(), scan_date="2024-02-30")
        self.assertEqual(caught.exception.status_code, 422)

    async def test_history_reports_missing_image_and_download_returns_not_found(self) -> None:
        await self._create_patient()
        scan = await self._save_scan("Patient_001", _png_bytes())
        image_path = self.patients_root / "Patient_001" / "scans" / scan["scan_id"] / "original.png"
        image_path.unlink()

        history = backend_app.get_patient_scans("Patient_001")["scans"]
        self.assertFalse(history[0]["image_available"])
        with self.assertRaises(HTTPException) as caught:
            backend_app.get_patient_scan_image("Patient_001", scan["scan_id"])
        self.assertEqual(caught.exception.status_code, 404)
        self.assertEqual(caught.exception.detail, "Stored scan image is unavailable.")

    async def test_saved_scan_image_is_scoped_to_its_patient(self) -> None:
        await self._create_patient("Patient_001")
        await self._create_patient("Patient_002")
        scan = await self._save_scan("Patient_001", _png_bytes())

        self.assertEqual(backend_app.get_patient_scans("Patient_002")["scans"], [])
        with self.assertRaises(HTTPException) as caught:
            backend_app.get_patient_scan_image("Patient_002", scan["scan_id"])
        self.assertEqual(caught.exception.status_code, 404)

    async def test_scan_date_can_be_omitted_and_upload_timestamp_is_server_generated(self) -> None:
        await self._create_patient()
        scan = await self._save_scan("Patient_001", _png_bytes(), eye_side="RIGHT")
        self.assertIsNone(scan["scan_date"])
        self.assertTrue(scan["uploaded_at"].endswith("+00:00"))
        self.assertEqual(scan["eye_side"], "right")

    async def test_upload_uses_detected_image_format_not_filename_extension(self) -> None:
        await self._create_patient()
        jpeg_buffer = io.BytesIO()
        Image.new("RGB", (24, 16), (50, 80, 100)).save(jpeg_buffer, format="JPEG")
        scan = await self._save_scan("Patient_001", jpeg_buffer.getvalue())

        self.assertEqual(scan["image_extension"], "jpg")
        image_path = self.patients_root / "Patient_001" / "scans" / scan["scan_id"] / "original.jpg"
        with Image.open(image_path) as stored_image:
            self.assertEqual(stored_image.format, "JPEG")

    async def test_failed_prediction_does_not_create_scan_record(self) -> None:
        await self._create_patient()
        self.service.predict_pil_image.side_effect = RuntimeError("inference failed")

        with self.assertRaises(HTTPException) as caught:
            await self._save_scan("Patient_001", _png_bytes())

        self.assertEqual(caught.exception.status_code, 500)
        scans_directory = self.patients_root / "Patient_001" / "scans"
        self.assertFalse(scans_directory.exists())
        self.assertEqual(backend_app.get_patient_scans("Patient_001")["scans"], [])

    async def test_conflicting_scan_id_does_not_overwrite_saved_scan(self) -> None:
        await self._create_patient()
        existing = await self._save_scan("Patient_001", _png_bytes())
        metadata_path = self.patients_root / "Patient_001" / "scans" / existing["scan_id"] / "metadata.json"
        original_metadata = metadata_path.read_bytes()

        with patch.object(backend_app.uuid, "uuid4", return_value=uuid.UUID(existing["scan_id"])):
            with self.assertRaises(HTTPException) as caught:
                await self._save_scan("Patient_001", _png_bytes((210, 10, 10)))

        self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(metadata_path.read_bytes(), original_metadata)
        self.assertEqual(len(backend_app.get_patient_scans("Patient_001")["scans"]), 1)

    async def test_scan_upload_retry_replays_record_and_conflicting_payload_is_rejected(self) -> None:
        await self._create_patient()
        request_id = str(uuid.uuid4())
        image = _png_bytes()
        first = await self._save_scan("Patient_001", image, scan_date="2025-01-01", idempotency_key=request_id)
        prediction_call_count = self.service.predict_pil_image.call_count

        replay = await self._save_scan("Patient_001", image, scan_date="2025-01-01", idempotency_key=request_id)

        self.assertEqual(replay["scan_id"], first["scan_id"])
        self.assertNotIn("idempotency_key", replay)
        self.assertEqual(self.service.predict_pil_image.call_count, prediction_call_count)
        self.assertEqual(len(backend_app.get_patient_scans("Patient_001")["scans"]), 1)

        with self.assertRaises(HTTPException) as caught:
            await self._save_scan(
                "Patient_001",
                _png_bytes((240, 10, 10)),
                scan_date="2025-01-01",
                idempotency_key=request_id,
            )
        self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(len(backend_app.get_patient_scans("Patient_001")["scans"]), 1)

    async def test_audit_failure_does_not_fail_patient_creation(self) -> None:
        await self._create_patient()
        with patch.object(audit_log, "AUDIT_LOG_PATH", self.patients_root):
            created = backend_app.create_patient(
                backend_app.PatientCreate(patient_id="Patient_002", name="Second alias", age=50)
            )
        self.assertEqual(created["patient"]["patient_id"], "Patient_002")
        self.assertTrue((self.patients_root / "Patient_002" / "profile.json").is_file())

    async def test_malformed_legacy_history_returns_useful_server_error(self) -> None:
        history_path = Path(self.temporary_directory.name) / "patient_history.json"
        history_path.write_text("{invalid", encoding="utf-8")
        with patch.object(backend_app, "PATIENT_HISTORY_PATH", history_path):
            with self.assertRaises(HTTPException) as caught:
                backend_app.patient_history(patient_code="demo-001")
        self.assertEqual(caught.exception.status_code, 500)
        self.assertEqual(caught.exception.detail, "Legacy patient history is unavailable.")

    async def test_malformed_scan_timestamp_returns_useful_history_error(self) -> None:
        await self._create_patient()
        scan_id = str(uuid.uuid4())
        scan_directory = self.patients_root / "Patient_001" / "scans" / scan_id
        scan_directory.mkdir(parents=True)
        (scan_directory / "metadata.json").write_text(
            json.dumps({
                "patient_id": "Patient_001",
                "scan_id": scan_id,
                "image_extension": "png",
                "scan_date": None,
            }),
            encoding="utf-8",
        )

        with self.assertRaises(HTTPException) as caught:
            backend_app.get_patient_scans("Patient_001")
        self.assertEqual(caught.exception.status_code, 500)
        self.assertEqual(caught.exception.detail, "Stored scan history is unavailable.")


if __name__ == "__main__":
    unittest.main()
