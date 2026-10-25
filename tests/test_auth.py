from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import audit as audit_log
from backend import app as backend_app
from backend.auth import TOKEN_TTL_SECONDS, create_access_token, hash_password


async def _asgi_request(
    method: str,
    path: str,
    *,
    payload: dict | None = None,
    token: str | None = None,
) -> tuple[int, dict]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else b""
    headers = [(b"content-type", b"application/json")]
    if token:
        headers.append((b"authorization", f"Bearer {token}".encode("ascii")))
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("ascii"),
        "query_string": b"",
        "headers": headers,
        "server": ("testserver", 80),
        "client": ("testclient", 1234),
        "root_path": "",
    }
    request_sent = False
    response_status = 500
    response_body = bytearray()

    async def receive() -> dict:
        nonlocal request_sent
        if request_sent:
            return {"type": "http.disconnect"}
        request_sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(message: dict) -> None:
        nonlocal response_status
        if message["type"] == "http.response.start":
            response_status = message["status"]
        elif message["type"] == "http.response.body":
            response_body.extend(message.get("body", b""))

    await backend_app.app(scope, receive, send)
    return response_status, json.loads(response_body) if response_body else {}


class DoctorAuthenticationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.password = "A long demo password for tests"
        self.secret = "test-auth-secret-with-more-than-32-bytes"
        self.environment_patch = patch.dict(
            os.environ,
            {
                "DOCTOR_LOGIN_ID": "doctor@example.edu",
                "DOCTOR_PASSWORD_HASH": hash_password(self.password),
                "AUTH_SECRET": self.secret,
            },
        )
        self.environment_patch.start()
        self.addCleanup(self.environment_patch.stop)
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.audit_patch = patch.object(
            audit_log,
            "AUDIT_LOG_PATH",
            Path(self.temporary_directory.name) / "audit.jsonl",
        )
        self.audit_patch.start()
        self.addCleanup(self.audit_patch.stop)
        self.patient_root_patch = patch.object(
            backend_app,
            "PATIENTS_ROOT",
            Path(self.temporary_directory.name) / "patients",
        )
        self.patient_root_patch.start()
        self.addCleanup(self.patient_root_patch.stop)
        self.addCleanup(self.temporary_directory.cleanup)

    async def test_valid_login_returns_signed_expiring_token_only(self) -> None:
        status_code, response = await _asgi_request(
            "POST",
            "/auth/login",
            payload={"doctor_id": "DOCTOR@example.edu", "password": self.password},
        )

        self.assertEqual(status_code, 200)
        self.assertEqual(response["token_type"], "bearer")
        self.assertEqual(response["expires_in"], TOKEN_TTL_SECONDS)
        self.assertNotIn("password", response)
        self.assertNotIn("password_hash", response)
        self.assertNotIn(self.secret, json.dumps(response))
        self.assertEqual(set(response), {"access_token", "token_type", "expires_in"})

        current_status, current = await _asgi_request(
            "GET",
            "/auth/me",
            token=response["access_token"],
        )
        self.assertEqual(current_status, 200)
        self.assertEqual(current, {"doctor_id": "doctor@example.edu"})
        audit_text = audit_log.AUDIT_LOG_PATH.read_text(encoding="utf-8")
        self.assertIn('"event_type":"doctor_login","timestamp":', audit_text)
        self.assertIn('"status":"success"', audit_text)
        self.assertNotIn(response["access_token"], audit_text)
        self.assertNotIn(self.password, audit_text)

    async def test_invalid_credentials_are_rejected(self) -> None:
        status_code, response = await _asgi_request(
            "POST",
            "/auth/login",
            payload={"doctor_id": "doctor@example.edu", "password": "wrong password"},
        )
        self.assertEqual(status_code, 401)
        self.assertNotIn("access_token", response)
        audit_text = audit_log.AUDIT_LOG_PATH.read_text(encoding="utf-8")
        self.assertIn('"event_type":"doctor_login","timestamp":', audit_text)
        self.assertIn('"status":"failure"', audit_text)
        self.assertNotIn(self.password, audit_text)
        self.assertNotIn(self.secret, audit_text)
        self.assertNotIn(os.environ["DOCTOR_PASSWORD_HASH"], audit_text)

    async def test_protected_patient_and_inference_routes_reject_missing_token(self) -> None:
        protected_requests = (
            ("GET", "/patients"),
            ("GET", "/patients/Patient_001/report"),
            ("POST", "/patients"),
            ("GET", "/patients/demo"),
            ("POST", "/patients/demo/scans"),
            ("GET", "/patients/demo/scans/00000000-0000-0000-0000-000000000000/image"),
            ("GET", "/patients/demo/scans"),
            ("GET", "/patient-history"),
            ("POST", "/predict"),
            ("POST", "/gradcam"),
        )
        for method, path in protected_requests:
            with self.subTest(method=method, path=path):
                status_code, _ = await _asgi_request(method, path)
                self.assertEqual(status_code, 401)

    async def test_invalid_and_expired_tokens_are_rejected(self) -> None:
        invalid_token = create_access_token(
            "doctor@example.edu",
            b"a-different-secret-that-is-also-long-enough",
        )
        expired_token = create_access_token(
            "doctor@example.edu",
            self.secret.encode("utf-8"),
            ttl_seconds=-1,
        )
        for token in (invalid_token, expired_token):
            for path in ("/patients", "/patients/Patient_001/report"):
                with self.subTest(token=token, path=path):
                    status_code, _ = await _asgi_request("GET", path, token=token)
                    self.assertEqual(status_code, 401)

    async def test_unconfigured_credentials_do_not_allow_login(self) -> None:
        with patch.dict(
            os.environ,
            {"DOCTOR_LOGIN_ID": "", "DOCTOR_PASSWORD_HASH": "", "AUTH_SECRET": ""},
        ):
            status_code, _ = await _asgi_request(
                "POST",
                "/auth/login",
                payload={"doctor_id": "doctor@example.edu", "password": self.password},
            )
        self.assertEqual(status_code, 503)


if __name__ == "__main__":
    unittest.main()
