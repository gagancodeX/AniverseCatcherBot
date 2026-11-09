# ==========================================
# LUNA CATCHER - Runtime entry point
# ==========================================

import importlib
import json
import logging
import os
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import LUNA
from LUNA import TOKEN, bot_client, application, LOGGER, FORCE_JOIN, BOT_LOGGING
from LUNA.modules import ALL_MODULES


BOT_READY = False

BOT_NAME = "Luna | Anime Catcher 🌙"
BOT_SHORT_DESCRIPTION = "🌙 Catch • Collect • Trade anime characters. Hunt rare finds, build your collection & become a top collector!"
BOT_DESCRIPTION = "🌙 WELCOME TO LUNA\n\n✦ Catch characters from your favourite anime.\n✦ Collect rare finds and build your own collection.\n✦ Search the archive, save favourites and trade.\n✦ Gift characters and claim daily rewards.\n✦ Earn coins and rise through collector rankings.\n\n✨ Your next favourite character is waiting. Tap /start!"

BOT_COMMANDS = [
    {
        "command": "start",
        "description": "🌙 Open the Luna world"
    },
    {
        "command": "guess",
        "description": "🎯 Guess the hidden character"
    },
    {
        "command": "harem",
        "description": "💖 View your character collection"
    },
    {
        "command": "check",
        "description": "🔎 Check a character by ID"
    },
    {
        "command": "sips",
        "description": "✨ Search the character archive"
    },
    {
        "command": "fav",
        "description": "💜 Save a favourite character"
    },
    {
        "command": "claim",
        "description": "🎁 Claim your daily character"
    },
    {
        "command": "balance",
        "description": "🪙 Check your coin balance"
    },
    {
        "command": "daily",
        "description": "☀️ Collect your daily coins"
    },
    {
        "command": "weekly",
        "description": "🌟 Collect your weekly coins"
    },
    {
        "command": "pay",
        "description": "💸 Send coins to another user"
    },
    {
        "command": "gift",
        "description": "🎀 Gift a character to a friend"
    },
    {
        "command": "shop",
        "description": "🛍️ Explore the character shop"
    },
    {
        "command": "rank",
        "description": "🏆 View collector rankings"
    },
    {
        "command": "bounty",
        "description": "📜 Create a wanted-style poster"
    },
    {
        "command": "transfer",
        "description": "🔁 Transfer characters (VIP)"
    },
    {
        "command": "addchar",
        "description": "➕ Request a character"
    },
    {
        "command": "total",
        "description": "📚 Count characters in the archive"
    },
    {
        "command": "trade",
        "description": "🤝 Trade characters with a user"
    },
    {
        "command": "rarity",
        "description": "💎 View character rarity information"
    }
]

# Telegram may keep separate profile/command overrides by language.
# Apply Luna's profile to the default, English and Hindi settings.
PROFILE_LANGUAGES = ("", "en", "hi")
BOT_PROFILE_SETTINGS = []
for _language in PROFILE_LANGUAGES:
    _localized = {"language_code": _language} if _language else {}
    BOT_PROFILE_SETTINGS.extend(
        [
            ("setMyName", {"name": BOT_NAME, **_localized}),
            ("setMyShortDescription", {
                "short_description": BOT_SHORT_DESCRIPTION,
                **_localized,
            }),
            ("setMyDescription", {
                "description": BOT_DESCRIPTION,
                **_localized,
            }),
            ("setMyCommands", {
                "commands": BOT_COMMANDS,
                "scope": {"type": "default"},
                **_localized,
            }),
        ]
    )


def sync_bot_profile() -> None:
    """Apply Luna's public profile text and command menu through the Telegram Bot API."""
    for method, payload in BOT_PROFILE_SETTINGS:
        request = urllib.request.Request(
            f"https://api.telegram.org/bot{TOKEN}/{method}",
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                result = json.loads(response.read().decode("utf-8"))
            if not result.get("ok"):
                raise RuntimeError(result.get("description", "Telegram rejected the request"))
            LOGGER("LUNA").info("Telegram bot profile setting applied: %s", method)
        except Exception as exc:
            # Keep the bot online, but preserve Telegram's real error for debugging.
            detail = str(exc)
            if isinstance(exc, urllib.error.HTTPError):
                try:
                    detail = exc.read().decode("utf-8", "replace")
                except Exception:
                    pass
            LOGGER("LUNA").warning(
                "Telegram profile setting %s failed: %s",
                method,
                detail[:500],
            )


def start_health_server() -> None:
    """Keep Render's HTTP health check responsive while Telegram connects."""
    port = int(os.environ.get("PORT", "10000"))

    class HealthHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/ready" and not BOT_READY:
                self.send_response(503)
                body = b"Telegram bot is still starting"
            else:
                self.send_response(200)
                body = b"OK"
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format, *args):
            pass

    server = ThreadingHTTPServer(("0.0.0.0", port), HealthHandler)
    threading.Thread(
        target=server.serve_forever,
        daemon=True,
        name="render-health-server",
    ).start()
    LOGGER("LUNA").info("Render health endpoint listening on port %s", port)


def load_modules() -> None:
    for module_name in ALL_MODULES:
        importlib.import_module(f"LUNA.modules.{module_name}")
    LOGGER("LUNA").info("Loaded %s feature modules.", len(ALL_MODULES))


def start_pyrogram_client() -> None:
    """Start Pyrogram once without an application-level FloodWait sleep/retry loop."""
    bot_client.start()
    LOGGER("LUNA").info("Pyrogram client connected successfully.")


def main() -> None:
    global BOT_READY

    start_health_server()

    if not TOKEN:
        raise RuntimeError("TOKEN is missing in Render environment variables.")
    if not LUNA.api_id or not LUNA.api_hash:
        raise RuntimeError("API_ID or API_HASH is missing in Render environment variables.")
    if not LUNA.mongo_url:
        raise RuntimeError("MONGO_URL is missing in Render environment variables.")
    if not FORCE_JOIN:
        raise RuntimeError("FORCE_JOIN is missing in Render environment variables.")
    if not BOT_LOGGING:
        raise RuntimeError("BOT_LOGGING is missing in Render environment variables.")

    sync_bot_profile()

    # Start the bot directly; skip the extra Bot API getMe/getChat preflight.
    load_modules()

    start_pyrogram_client()

    try:
        BOT_READY = True
        LOGGER("LUNA").info("LUNA CATCHER is online. Starting update polling.")
        # The bot's feature modules use Pyrogram; these PTB handlers are used
        # for group message counting, inline queries and a few utility commands.
        application.run_polling(
            drop_pending_updates=True,
            close_loop=False,
        )
    finally:
        BOT_READY = False
        try:
            if bot_client.is_connected:
                bot_client.stop()
        except Exception:
            LOGGER("LUNA").exception("Error while stopping the Pyrogram client.")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        logging.getLogger("LUNA").exception("Bot startup/runtime failed.")
        sys.exit(1)
