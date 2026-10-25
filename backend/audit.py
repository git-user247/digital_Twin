from __future__ import annotations

import json
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path

AUDIT_LOG_PATH = Path(__file__).resolve().parents[1] / "data" / "audit_events.jsonl"
_AUDIT_LOCK = threading.Lock()
logger = logging.getLogger(__name__)


def write_audit_event(
    event_type: str,
    status: str,
    *,
    patient_id: str | None = None,
    scan_id: str | None = None,
) -> None:
    event = {
        "event_type": event_type,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": status,
    }
    if patient_id is not None:
        event["patient_id"] = patient_id
    if scan_id is not None:
        event["scan_id"] = scan_id

    try:
        AUDIT_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        line = json.dumps(event, separators=(",", ":")) + "\n"
        with _AUDIT_LOCK, AUDIT_LOG_PATH.open("a", encoding="utf-8") as handle:
            handle.write(line)
            handle.flush()
    except OSError:
        logger.warning("Audit event could not be persisted: %s", event_type)
