from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.audit import write_audit_event

PASSWORD_HASH_ITERATIONS = 600_000
PASSWORD_HASH_PREFIX = "pbkdf2_sha256"
TOKEN_TTL_SECONDS = 3600
TOKEN_ISSUER = "ocutwin-local-demo"
bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str, *, salt: bytes | None = None) -> str:
    if not password:
        raise ValueError("Password must not be empty.")
    password_salt = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        password_salt,
        PASSWORD_HASH_ITERATIONS,
    )
    return "$".join(
        (
            PASSWORD_HASH_PREFIX,
            str(PASSWORD_HASH_ITERATIONS),
            password_salt.hex(),
            digest.hex(),
        )
    )


def _configured_credentials() -> tuple[str, str, bytes]:
    doctor_id = os.environ.get("DOCTOR_LOGIN_ID", "").strip()
    password_hash = os.environ.get("DOCTOR_PASSWORD_HASH", "").strip()
    secret = os.environ.get("AUTH_SECRET", "")
    if not doctor_id or not password_hash or len(secret.encode("utf-8")) < 32:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Doctor login is not configured. Set DOCTOR_LOGIN_ID, DOCTOR_PASSWORD_HASH, and a 32-byte AUTH_SECRET.",
        )
    return doctor_id, password_hash, secret.encode("utf-8")


def _parse_password_hash(encoded_hash: str) -> tuple[int, bytes, bytes]:
    try:
        scheme, iteration_text, salt_text, digest_text = encoded_hash.split("$")
        iterations = int(iteration_text)
        salt = bytes.fromhex(salt_text)
        digest = bytes.fromhex(digest_text)
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Doctor login configuration is invalid. Generate DOCTOR_PASSWORD_HASH again.",
        ) from exc
    if (
        scheme != PASSWORD_HASH_PREFIX
        or iterations < PASSWORD_HASH_ITERATIONS
        or len(salt) < 16
        or len(digest) != hashlib.sha256().digest_size
    ):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Doctor login configuration is invalid. Generate DOCTOR_PASSWORD_HASH again.",
        )
    return iterations, salt, digest


def verify_doctor_credentials(doctor_id: str, password: str) -> str:
    configured_id, encoded_hash, secret = _configured_credentials()
    iterations, salt, expected_digest = _parse_password_hash(encoded_hash)
    supplied_digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        iterations,
    )
    if not (
        hmac.compare_digest(doctor_id.strip().casefold(), configured_id.casefold())
        and hmac.compare_digest(supplied_digest, expected_digest)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid doctor ID/email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return create_access_token(configured_id, secret)


def _encode_segment(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _decode_segment(segment: str) -> bytes:
    return base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4))


def create_access_token(
    doctor_id: str,
    secret: bytes | None = None,
    *,
    ttl_seconds: int = TOKEN_TTL_SECONDS,
    now: int | None = None,
) -> str:
    signing_key = secret
    if signing_key is None:
        _, _, signing_key = _configured_credentials()
    issued_at = int(time.time()) if now is None else now
    payload = {
        "iss": TOKEN_ISSUER,
        "sub": doctor_id,
        "iat": issued_at,
        "exp": issued_at + ttl_seconds,
    }
    encoded_payload = _encode_segment(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    signature = hmac.new(signing_key, encoded_payload.encode("ascii"), hashlib.sha256).digest()
    return f"{encoded_payload}.{_encode_segment(signature)}"


def verify_access_token(token: str) -> str:
    configured_id, _, secret = _configured_credentials()
    if len(token) > 4096:
        raise _invalid_token()
    try:
        payload_segment, signature_segment = token.split(".")
        provided_signature = _decode_segment(signature_segment)
        payload_bytes = _decode_segment(payload_segment)
        payload = json.loads(payload_bytes)
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
        raise _invalid_token() from None

    expected_signature = hmac.new(secret, payload_segment.encode("ascii"), hashlib.sha256).digest()
    if not hmac.compare_digest(provided_signature, expected_signature):
        raise _invalid_token()
    if not isinstance(payload, dict):
        raise _invalid_token()

    now = int(time.time())
    subject = payload.get("sub")
    issued_at = payload.get("iat")
    expires_at = payload.get("exp")
    if (
        payload.get("iss") != TOKEN_ISSUER
        or not isinstance(subject, str)
        or not hmac.compare_digest(subject.casefold(), configured_id.casefold())
        or not isinstance(issued_at, int)
        or not isinstance(expires_at, int)
        or issued_at > now + 60
        or expires_at <= now
        or expires_at <= issued_at
        or expires_at - issued_at > TOKEN_TTL_SECONDS
    ):
        raise _invalid_token()
    return subject


def _invalid_token() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication token.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def require_doctor_auth(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str:
    if credentials is None or credentials.scheme.casefold() != "bearer":
        write_audit_event("authorization_failed", "failure")
        raise _invalid_token()
    try:
        return verify_access_token(credentials.credentials)
    except HTTPException:
        write_audit_event("authorization_failed", "failure")
        raise
