from __future__ import annotations

import asyncio
import base64
import io
import json
import os
import tempfile
import unittest
import uuid
from pathlib import Path
from urllib.parse import urlencode
from unittest.mock import Mock, patch

from fastapi.datastructures import UploadFile
from PIL import Image
from starlette.datastructures import Headers

from backend import audit as audit_log
from backend import app as backend_app
from backend.auth import create_access_token, hash_password


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


async def _asgi_request(
    method: str,
    path: str,
    *,
    token: str | None = None,
) -> tuple[int, dict[str, str], bytes]:
    raw_path, _, query = path.partition("?")
    headers = []
    if token:
        headers.append((b"authorization", f"Bearer {token}".encode("ascii")))
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": raw_path,
        "raw_path": raw_path.encode("ascii"),
        "query_string": query.encode("ascii"),
        "headers": headers,
        "server": ("testserver", 80),
        "client": ("testclient", 1234),
        "root_path": "",
    }
    response_status = 500
    response_headers: dict[str, str] = {}
    response_body = bytearray()
    request_sent = False
    response_complete = asyncio.Event()

    async def receive() -> dict:
        nonlocal request_sent
        if request_sent:
            await response_complete.wait()
            return {"type": "http.disconnect"}
        request_sent = True
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: dict) -> None:
        nonlocal response_status
        if message["type"] == "http.response.start":
            response_status = message["status"]
            response_headers.update({
                key.decode("latin-1").lower(): value.decode("latin-1")
                for key, value in message.get("headers", [])
            })
        elif message["type"] == "http.response.body":
            response_body.extend(message.get("body", b""))
            if not message.get("more_body", False):
                response_complete.set()

    await backend_app.app(scope, receive, send)
    return response_status, response_headers, bytes(response_body)


class RetinalTwinReportTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.secret = "test-report-auth-secret-with-more-than-32-bytes"
        self.environment_patch = patch.dict(
            os.environ,
            {
                "DOCTOR_LOGIN_ID": "doctor@example.edu",
                "DOCTOR_PASSWORD_HASH": hash_password("report test password"),
                "AUTH_SECRET": self.secret,
            },
        )
        self.environment_patch.start()
        self.addCleanup(self.environment_patch.stop)
        self.token = create_access_token("doctor@example.edu", self.secret.encode("utf-8"))
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.patients_root = Path(self.temporary_directory.name) / "patients"
        self.audit_patch = patch.object(
            audit_log,
            "AUDIT_LOG_PATH",
            Path(self.temporary_directory.name) / "audit.jsonl",
        )
        self.audit_patch.start()
        self.patients_patch = patch.object(backend_app, "PATIENTS_ROOT", self.patients_root)
        self.service = Mock()
        self.service.model_version = "test-model-v1"
        self.service.model_ready = True
        self.service.predict_pil_image.return_value = {
            "prediction": "AMD",
            "probability": 0.73,
            "confidence": 73.0,
            "class_probabilities": {"Non-AMD": 0.27, "AMD": 0.73},
        }
        self.service.generate_gradcam.return_value = base64.b64encode(_png_bytes((200, 40, 20))).decode("ascii")
        self.service_patch = patch.object(backend_app, "model_service", self.service)
        self.patients_patch.start()
        self.service_patch.start()
        self.addCleanup(self.patients_patch.stop)
        self.addCleanup(self.audit_patch.stop)
        self.addCleanup(self.service_patch.stop)
        self.addCleanup(self.temporary_directory.cleanup)

    def _create_patient(self, patient_id: str, name: str = "Demo alias") -> None:
        backend_app.create_patient(
            backend_app.PatientCreate(
                patient_id=patient_id,
                name=name,
                age=64,
                sex="Not specified",
                contact="Demo reference",
                notes="Research notes",
            )
        )

    async def _save_scan(
        self,
        patient_id: str,
        content: bytes | None = None,
        scan_date: str | None = "2025-02-01",
    ) -> dict:
        response = await backend_app.save_patient_scan(
            patient_id=patient_id,
            file=_upload(content or _png_bytes()),
            eye_side="left",
            scan_date=scan_date,
            notes=None,
            idempotency_key=None,
        )
        return response["scan"]

    async def _export(self, patient_id: str, query: dict[str, str] | None = None) -> tuple[int, dict[str, str], bytes]:
        query_string = f"?{urlencode(query)}" if query else ""
        return await _asgi_request(
            "GET",
            f"/patients/{patient_id}/report{query_string}",
            token=self.token,
        )

    async def test_authenticated_report_contains_only_requested_patient_saved_records(self) -> None:
        self._create_patient("Selected_123", "Selected alias")
        self._create_patient("Other_456", "Other private alias")
        scan = await self._save_scan("Selected_123")
        await self._save_scan("Other_456")

        status, headers, body = await self._export(
            "Selected_123",
            {"first_scan_id": scan["scan_id"], "second_scan_id": scan["scan_id"]},
        )
        self.assertEqual(status, 422)
        self.assertIn(b"Choose two different scans", body)

        status, headers, body = await self._export("Selected_123")
        self.assertEqual(status, 200)
        self.assertEqual(headers["content-type"], "application/pdf")
        self.assertIn("attachment;", headers["content-disposition"])
        self.assertTrue(body.startswith(b"%PDF-"))
        self.assertIn(b"Selected_123", body)
        self.assertIn(b"Selected alias", body)
        self.assertIn(b"AMD probability", body)
        self.assertIn(b"Chronological scan history", body)
        self.assertIn(b"experimental retinal digital-twin prototype", body)
        self.assertIn(b"/Subtype /Image", body)
        self.assertNotIn(b"Other_456", body)
        self.assertNotIn(b"Other private alias", body)
        self.service.generate_gradcam.assert_called_once()
        audit_text = audit_log.AUDIT_LOG_PATH.read_text(encoding="utf-8")
        self.assertIn(scan["scan_id"], audit_text)
        self.assertNotIn(self.token, audit_text)
        self.assertNotIn("report test password", audit_text)

    async def test_report_rejects_unauthenticated_and_nonexistent_patient_requests(self) -> None:
        status, _, _ = await _asgi_request("GET", "/patients/Selected_123/report")
        self.assertEqual(status, 401)

        status, _, body = await self._export("Missing_123")
        self.assertEqual(status, 404)
        self.assertIn(b"Patient profile not found", body)

    async def test_patient_without_scans_receives_valid_pdf_and_missing_fields_are_not_invented(self) -> None:
        legacy_directory = self.patients_root / "Legacy_123"
        legacy_directory.mkdir(parents=True)
        (legacy_directory / "profile.json").write_text(
            json.dumps({"patient_id": "Legacy_123"}),
            encoding="utf-8",
        )

        status, _, body = await self._export("Legacy_123")

        self.assertEqual(status, 200)
        self.assertTrue(body.startswith(b"%PDF-"))
        self.assertIn(b"No OCT scans recorded", body)
        self.assertIn(b"Not available", body)
        self.assertNotIn(b"placeholder", body.lower())

    async def test_missing_saved_scan_metadata_is_rendered_as_unavailable(self) -> None:
        self._create_patient("Legacy_123")
        scan_id = str(uuid.uuid4())
        scan_directory = self.patients_root / "Legacy_123" / "scans" / scan_id
        scan_directory.mkdir(parents=True)
        (scan_directory / "original.png").write_bytes(_png_bytes())
        (scan_directory / "metadata.json").write_text(
            json.dumps({
                "patient_id": "Legacy_123",
                "scan_id": scan_id,
                "image_extension": "png",
                "uploaded_at": "2025-02-01T00:00:00+00:00",
            }),
            encoding="utf-8",
        )

        status, _, body = await self._export("Legacy_123")

        self.assertEqual(status, 200)
        self.assertTrue(body.startswith(b"%PDF-"))
        self.assertIn(b"Not available", body)
        self.assertIn(scan_id.encode("ascii"), body)

    async def test_missing_image_is_reported_without_using_another_patients_image_or_data(self) -> None:
        self._create_patient("Selected_123", "Selected alias")
        self._create_patient("Other_456", "Other private alias")
        scan = await self._save_scan("Selected_123")
        await self._save_scan("Other_456", _png_bytes((220, 30, 30)))
        (self.patients_root / "Selected_123" / "scans" / scan["scan_id"] / "original.png").unlink()

        status, _, body = await self._export("Selected_123")

        self.assertEqual(status, 200)
        self.assertIn(b"Original saved OCT image is unavailable", body)
        self.assertNotIn(b"Other_456", body)
        self.assertNotIn(b"Other private alias", body)

    async def test_corrupt_saved_image_is_reported_and_does_not_block_report(self) -> None:
        self._create_patient("Selected_123")
        scan = await self._save_scan("Selected_123")
        image_path = self.patients_root / "Selected_123" / "scans" / scan["scan_id"] / "original.png"
        image_path.write_bytes(b"corrupt stored content")

        status, _, body = await self._export("Selected_123")

        self.assertEqual(status, 200)
        self.assertTrue(body.startswith(b"%PDF-"))
        self.assertIn(b"Original saved OCT image is unavailable", body)

    async def test_gradcam_failure_does_not_prevent_pdf_generation(self) -> None:
        self._create_patient("Selected_123")
        await self._save_scan("Selected_123")
        self.service.generate_gradcam.side_effect = RuntimeError("model explanation unavailable")

        status, _, body = await self._export("Selected_123")

        self.assertEqual(status, 200)
        self.assertTrue(body.startswith(b"%PDF-"))
        self.assertIn(b"Grad-CAM is unavailable for this saved scan", body)

    async def test_comparison_requires_two_saved_scans_owned_by_the_requested_patient(self) -> None:
        self._create_patient("Selected_123")
        self._create_patient("Other_456")
        first = await self._save_scan("Selected_123")
        second = await self._save_scan("Selected_123", _png_bytes((200, 100, 50)), "2025-03-01")
        other = await self._save_scan("Other_456")

        status, _, body = await self._export(
            "Selected_123",
            {"first_scan_id": first["scan_id"], "second_scan_id": second["scan_id"]},
        )
        self.assertEqual(status, 200)
        self.assertIn(b"Selected two-scan comparison", body)
        self.assertIn(first["scan_id"].encode("ascii"), body)
        self.assertIn(second["scan_id"].encode("ascii"), body)
        self.assertIn(b"/Subtype /Image", body)

        status, _, body = await self._export(
            "Selected_123",
            {"first_scan_id": first["scan_id"], "second_scan_id": other["scan_id"]},
        )
        self.assertEqual(status, 404)
        self.assertIn(b"Selected scans were not found for this patient", body)

    async def test_long_scan_history_spans_multiple_pdf_pages(self) -> None:
        self._create_patient("History_123")
        scans_directory = self.patients_root / "History_123" / "scans"
        for index in range(36):
            scan_id = str(uuid.uuid4())
            scan_directory = scans_directory / scan_id
            scan_directory.mkdir(parents=True)
            (scan_directory / "metadata.json").write_text(
                json.dumps({
                    "patient_id": "History_123",
                    "scan_id": scan_id,
                    "uploaded_at": f"2025-{(index % 12) + 1:02d}-01T00:00:00+00:00",
                    "scan_date": f"2025-{(index % 12) + 1:02d}-01",
                    "eye_side": "left",
                    "prediction": "AMD",
                    "amd_probability": 0.73,
                    "class_probabilities": {"Non-AMD": 0.27, "AMD": 0.73},
                    "model_version": "test-model-v1",
                    "image_extension": "png",
                }),
                encoding="utf-8",
            )

        status, _, body = await self._export("History_123")

        self.assertEqual(status, 200)
        self.assertTrue(body.startswith(b"%PDF-"))
        self.assertIn(b"Page 2", body)


if __name__ == "__main__":
    unittest.main()
