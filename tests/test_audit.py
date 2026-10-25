from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import audit


class AuditTrailTests(unittest.TestCase):
    def test_events_record_minimal_metadata_without_credentials_or_tokens(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            path = Path(temporary_directory) / "audit.jsonl"
            with patch.object(audit, "AUDIT_LOG_PATH", path):
                audit.write_audit_event("doctor_login", "success")
                audit.write_audit_event(
                    "scan_uploaded",
                    "success",
                    patient_id="Patient_001",
                    scan_id="12345678-1234-5678-1234-567812345678",
                )

            events = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]

        self.assertEqual(events[0]["event_type"], "doctor_login")
        self.assertEqual(events[0]["status"], "success")
        self.assertEqual(
            set(events[0]),
            {"event_type", "timestamp", "status"},
        )
        self.assertEqual(events[1]["patient_id"], "Patient_001")
        self.assertEqual(events[1]["scan_id"], "12345678-1234-5678-1234-567812345678")
        serialized_events = json.dumps(events)
        self.assertNotIn("password", serialized_events.lower())
        self.assertNotIn("token", serialized_events.lower())
        self.assertNotIn("contact", serialized_events.lower())

    def test_audit_write_failure_does_not_raise(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            path = Path(temporary_directory)
            with patch.object(audit, "AUDIT_LOG_PATH", path):
                audit.write_audit_event("patient_created", "success")


if __name__ == "__main__":
    unittest.main()
