from __future__ import annotations

import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from fastapi import HTTPException
from fastapi.datastructures import UploadFile
from PIL import Image
from starlette.datastructures import Headers

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
        self.service_patch.start()
        self.addCleanup(self.patients_patch.stop)
        self.addCleanup(self.service_patch.stop)
        self.addCleanup(self.temporary_directory.cleanup)

    async def _create_patient(self, patient_id: str = "Patient_001") -> dict:
        response = backend_app.create_patient(
            backend_app.PatientCreate(patient_id=patient_id, notes="Research prototype record")
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
    ) -> dict:
        response = await backend_app.save_patient_scan(
            patient_id=patient_id,
            file=_upload(content),
            eye_side=eye_side,
            scan_date=scan_date,
            notes=notes,
        )
        return response["scan"]

    async def test_create_and_retrieve_patient_profile(self) -> None:
        created = await self._create_patient()
        retrieved = backend_app.get_patient("Patient_001")

        self.assertEqual(created["patient_id"], "Patient_001")
        self.assertEqual(created["notes"], "Research prototype record")
        self.assertEqual(retrieved["patient"], created)
        self.assertTrue((self.patients_root / "Patient_001" / "profile.json").is_file())

    async def test_duplicate_patient_id_returns_conflict(self) -> None:
        await self._create_patient()
        with self.assertRaises(HTTPException) as caught:
            await self._create_patient()
        self.assertEqual(caught.exception.status_code, 409)

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

    async def test_scan_date_can_be_omitted_and_upload_timestamp_is_server_generated(self) -> None:
        await self._create_patient()
        scan = await self._save_scan("Patient_001", _png_bytes(), eye_side="RIGHT")
        self.assertIsNone(scan["scan_date"])
        self.assertTrue(scan["uploaded_at"].endswith("+00:00"))
        self.assertEqual(scan["eye_side"], "right")


if __name__ == "__main__":
    unittest.main()
