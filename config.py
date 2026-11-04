# ==========================================
# Creator: MrZyro
# Telegram: @MrZyro_dev
# GitHub: https://github.com/MrZyro
# ==========================================

import os
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Telegram API credentials
api_id = os.getenv("API_ID", "")
api_hash = os.getenv("API_HASH", "")

# Bot Token
TOKEN = os.getenv("TOKEN", "").strip()

# Optional Pyrogram session string. Prefer a persistent Render disk for SQLite sessions.
SESSION_STRING = os.getenv("SESSION_STRING", "").strip()
PYROGRAM_WORKDIR = os.getenv("PYROGRAM_WORKDIR", "/var/data").strip() or "/var/data"

# Logging & Logs Channel
BOT_LOGGING = os.getenv("BOT_LOGGING", "")
_database_id = os.getenv("DATABASE_ID", "").strip()
# Pyrogram treats string chat IDs as usernames. Convert numeric channel IDs
# (including -100...) to integers before passing them to Telegram methods.
try:
    DATABASE_ID = int(_database_id) if _database_id else ""
except ValueError:
    DATABASE_ID = _database_id
FORCE_JOIN = os.getenv("FORCE_JOIN", "")

# Database configuration
# Trim accidental whitespace from Render environment variables. Atlas users
# authenticate against the admin database unless an explicit authSource is set.
def _normalize_mongo_uri(value: str) -> str:
    uri = (value or "").strip()
    if not uri:
        return ""
    try:
        parts = urlsplit(uri)
        hostname = (parts.hostname or "").lower()
        if hostname.endswith(".mongodb.net"):
            options = parse_qsl(parts.query, keep_blank_values=True)
            if not any(key.lower() == "authsource" for key, _ in options):
                options.append(("authSource", "admin"))
            uri = urlunsplit(parts._replace(query=urlencode(options)))
    except Exception:
        # Leave malformed/nonstandard URIs unchanged so the driver reports
        # the original configuration error without logging credentials.
        pass
    return uri


mongo_url = _normalize_mongo_uri(os.getenv("MONGO_URL", ""))
backup_mongo_url = _normalize_mongo_uri(os.getenv("BACKUP_MONGO_URL", ""))
DB_NAME = os.getenv("DB_NAME", "WAIFUBOT")

# Channels & Chats
SUPPORT_CHAT = os.getenv("SUPPORT_CHAT", "")
UPDATE_CHAT = os.getenv("UPDATE_CHAT", "")
MUSJ_JOIN = os.getenv("MUSJ_JOIN", "")

# Admin user configurations
OWNER_ID = int(os.getenv("OWNER_ID", "0"))

# Optional start media URLs. Leave them unset to use a text-only /start.
# Start command uses text/buttons only; no external media host is required.
START_MEDIA = []