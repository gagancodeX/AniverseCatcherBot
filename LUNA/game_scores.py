"""Verified score storage helpers for Luna GameZone leaderboards."""
import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl

VALID_GAMES = {"flappy", "runner", "jumper", "space", "brick", "racer"}
MAX_SCORE = 2_000_000


def verify_telegram_init_data(init_data, bot_token, max_age=86400):
    """Validate Telegram Web App initData and return its trusted user object."""
    if not isinstance(init_data, str) or not init_data or len(init_data) > 12000:
        raise ValueError("Missing Telegram Web App session.")

    pairs = parse_qsl(init_data, keep_blank_values=True, strict_parsing=True)
    data = dict(pairs)
    if len(data) != len(pairs):
        raise ValueError("Duplicate session fields are not allowed.")

    received_hash = data.pop("hash", "")
    if not received_hash:
        raise ValueError("Session signature is missing.")

    check_string = "\n".join(
        f"{key}={value}" for key, value in sorted(data.items())
    )
    secret_key = hmac.new(
        b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256
    ).digest()
    expected_hash = hmac.new(
        secret_key, check_string.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected_hash, received_hash):
        raise ValueError("Telegram session signature is invalid.")

    try:
        auth_date = int(data.get("auth_date", "0"))
    except (TypeError, ValueError):
        raise ValueError("Telegram session date is invalid.")

    now = int(time.time())
    if auth_date <= 0 or auth_date > now + 60 or now - auth_date > max_age:
        raise ValueError("Telegram session has expired. Reopen GameZone from /gamezone.")

    try:
        user = json.loads(data.get("user", "{}"))
        user_id = int(user.get("id", 0))
    except (TypeError, ValueError, json.JSONDecodeError, AttributeError):
        raise ValueError("Telegram user details are unavailable.")

    if user_id <= 0:
        raise ValueError("Telegram user details are invalid.")

    return {
        "id": user_id,
        "first_name": str(user.get("first_name") or "Player")[:64],
        "username": str(user.get("username") or "")[:32],
    }
