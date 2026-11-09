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
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import LUNA
from telegram import Update
from LUNA import TOKEN, bot_client, application, LOGGER, FORCE_JOIN, BOT_LOGGING
from LUNA.modules import ALL_MODULES


BOT_READY = False

BOT_DESCRIPTION = "🌙 WELCOME TO LUNA\n\n✦ Catch characters from your favourite anime.\n✦ Collect rare finds and build your own collection.\n✦ Search the archive, save favourites and trade.\n✦ Gift characters and claim daily rewards.\n✦ Earn coins and rise through collector rankings.\n\n✨ Your next favourite character is waiting. Tap /start!"

USER_COMMANDS = [
    {
        "command": "start",
        "description": "🌙 Open the Luna world"
    },
    {
        "command": "guess",
        "description": "🎯 Guess the hidden character"
    },
    {
        "command": "protecc",
        "description": "🛡️ Catch a mystery character"
    },
    {
        "command": "collect",
        "description": "✨ Collect a mystery character"
    },
    {
        "command": "grab",
        "description": "💫 Grab the appearing character"
    },
    {
        "command": "hunt",
        "description": "🔍 Hunt for a character"
    },
    {
        "command": "harem",
        "description": "💖 View your character collection"
    },
    {
        "command": "collection",
        "description": "📚 Open your collection"
    },
    {
        "command": "hmode",
        "description": "🎨 Filter your collection by rarity"
    },
    {
        "command": "hclaim",
        "description": "🎁 Claim your daily character"
    },
    {
        "command": "claim",
        "description": "🌟 Claim a character reward"
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
        "command": "addchar",
        "description": "➕ Request a character for the archive"
    },
    {
        "command": "gift",
        "description": "🎀 Gift a character to a friend"
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
        "command": "shop",
        "description": "🛍️ Explore the character shop"
    },
    {
        "command": "hshop",
        "description": "🛒 Open the character shop"
    },
    {
        "command": "hshopmenu",
        "description": "✨ Open the shop menu"
    },
    {
        "command": "rank",
        "description": "🏆 View collector rankings"
    },
    {
        "command": "bounty",
        "description": "📜 Create a wanted-style bounty poster"
    },
    {
        "command": "topgroups",
        "description": "🌐 See the top capture groups"
    },
    {
        "command": "ctop",
        "description": "👑 Top collectors in this group"
    },
    {
        "command": "st",
        "description": "📡 View Luna network status"
    },
    {
        "command": "stats",
        "description": "📊 View your collector stats"
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
        "command": "transfer",
        "description": "🔁 Transfer a collection (VIP)"
    },
    {
        "command": "backtransfer",
        "description": "↩️ Undo a recent transfer (VIP)"
    },
    {
        "command": "untransfer",
        "description": "↩️ Undo a recent transfer (VIP)"
    },
    {
        "command": "trback",
        "description": "↩️ Undo a recent transfer (VIP)"
    },
    {
        "command": "rarity",
        "description": "💎 View character rarity details"
    },
    {
        "command": "redeem",
        "description": "🎟️ Redeem a character code"
    },
    {
        "command": "valentine",
        "description": "💝 Claim the seasonal event reward"
    },
    {
        "command": "ping",
        "description": "🏓 Check Luna's response"
    }
]
ADMIN_COMMANDS = [
    {
        "command": "backup",
        "description": "📦 Create a database backup (VIP)"
    },
    {
        "command": "backupstatus",
        "description": "📈 Check backup status (VIP)"
    },
    {
        "command": "mongobackup",
        "description": "🛡️ Run MongoDB backup (owner)"
    },
    {
        "command": "eval",
        "description": "🧪 Run owner diagnostics"
    },
    {
        "command": "sh",
        "description": "🖥️ Run owner shell diagnostics"
    },
    {
        "command": "listbackups",
        "description": "🗂️ List saved backups (VIP)"
    },
    {
        "command": "startbackup",
        "description": "⚙️ Start automatic backups (owner)"
    },
    {
        "command": "bcast",
        "description": "📣 Send an admin broadcast (VIP)"
    },
    {
        "command": "broadcast",
        "description": "📣 Send an admin broadcast (VIP)"
    },
    {
        "command": "ctime",
        "description": "⏱️ Set the group's capture interval (admin)"
    },
    {
        "command": "cgen",
        "description": "🎟️ Generate redeem codes (VIP)"
    },
    {
        "command": "discount",
        "description": "🏷️ Set a shop discount (owner)"
    },
    {
        "command": "reupload",
        "description": "☁️ Migrate character media (admin)"
    },
    {
        "command": "telegramize",
        "description": "☁️ Migrate media to Telegram (admin)"
    },
    {
        "command": "saddsudo",
        "description": "🛡️ Add a sudo user (VIP)"
    },
    {
        "command": "sremovesudo",
        "description": "🧹 Remove a sudo user (VIP)"
    },
    {
        "command": "seditsudo",
        "description": "🔧 Edit sudo permissions (VIP)"
    },
    {
        "command": "sudolist",
        "description": "👥 List sudo users (owner)"
    },
    {
        "command": "gdelete",
        "description": "🗑️ Delete an archive character (admin)"
    },
    {
        "command": "gupdate",
        "description": "📝 Update a character record (admin)"
    },
    {
        "command": "maxupdate",
        "description": "📝 Update multiple characters (admin)"
    },
    {
        "command": "gmedia",
        "description": "🖼️ Replace character media (admin)"
    },
    {
        "command": "find",
        "description": "🆔 Find the next character ID (admin)"
    },
    {
        "command": "server",
        "description": "☁️ Check media storage (admin)"
    },
    {
        "command": "gupload",
        "description": "⬆️ Upload a character directly (admin)"
    },
    {
        "command": "upload",
        "description": "⬆️ Upload a character directly (admin)"
    },
    {
        "command": "u",
        "description": "⬆️ Upload a character directly (admin)"
    },
    {
        "command": "kill",
        "description": "🧹 Remove a user's saved character data (VIP)"
    }
]
ALL_OWNER_COMMANDS = USER_COMMANDS + ADMIN_COMMANDS

# Clear the profile About text for the default, English and Hindi languages.
ABOUT_LANGUAGES = ("", "en", "hi")


def _telegram_api_call(method: str, payload: dict):
    """Call the Telegram Bot API and return its result or a useful error."""
    request = urllib.request.Request(
        f"https://api.telegram.org/bot{TOKEN}/{method}",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        details = exc.read().decode("utf-8", "replace")
        raise RuntimeError(f"HTTP {exc.code}: {details}") from exc

    if not result.get("ok"):
        raise RuntimeError(result.get("description", "Telegram rejected the request"))
    return result.get("result")


def _apply_command_scope(scope: dict, commands: list, language_code: str = "") -> None:
    payload = {"commands": commands, "scope": scope}
    if language_code:
        payload["language_code"] = language_code
    _telegram_api_call("setMyCommands", payload)


def sync_bot_profile() -> None:
    """Clear About and install complete command lists for private chats, groups and admins."""
    # Telegram allows an empty short_description to remove the About text.
    for language_code in ABOUT_LANGUAGES:
        payload = {"short_description": ""}
        if language_code:
            payload["language_code"] = language_code
        try:
            _telegram_api_call("setMyShortDescription", payload)
            LOGGER("LUNA").info(
                "Telegram About text cleared for language %r",
                language_code or "default",
            )
        except Exception as exc:
            LOGGER("LUNA").warning("Could not clear Telegram About text: %s", exc)

    # Keep the public-facing name and long description current.
    for language_code in ABOUT_LANGUAGES:
        language_payload = {"language_code": language_code} if language_code else {}
        try:
            _telegram_api_call(
                "setMyDescription",
                {"description": BOT_DESCRIPTION, **language_payload},
            )
            LOGGER("LUNA").info(
                "Telegram description synced for language %r",
                language_code or "default",
            )
        except Exception as exc:
            LOGGER("LUNA").warning("Could not sync Telegram profile text: %s", exc)

    # Replace any narrower menu lists too; Telegram prefers a narrower command scope
    # over the default scope when displaying the slash-command menu.
    command_scopes = [
        ({"type": "default"}, USER_COMMANDS, "default"),
        ({"type": "all_private_chats"}, USER_COMMANDS, "all private chats"),
        ({"type": "all_group_chats"}, USER_COMMANDS, "all group chats"),
        ({"type": "all_chat_administrators"}, ALL_OWNER_COMMANDS, "group administrators"),
    ]
    for scope, commands, label in command_scopes:
        language_codes = ("", "en", "hi") if scope.get("type") == "default" else ("",)
        for language_code in language_codes:
            try:
                _apply_command_scope(scope, commands, language_code)
                LOGGER("LUNA").info(
                    "Telegram command menu synced: %s (%s commands, language=%r)",
                    label,
                    len(commands),
                    language_code or "default",
                )
            except Exception as exc:
                LOGGER("LUNA").warning(
                    "Could not sync command menu for %s (%r): %s",
                    label,
                    language_code or "default",
                    exc,
                )

    # Give the configured bot owner the complete command list in the private bot chat.
    if getattr(LUNA, "OWNER_ID", 0):
        try:
            _apply_command_scope(
                {"type": "chat", "chat_id": LUNA.OWNER_ID},
                ALL_OWNER_COMMANDS,
            )
            LOGGER("LUNA").info("Telegram owner command menu synced (%s commands)", len(ALL_OWNER_COMMANDS))
        except Exception as exc:
            LOGGER("LUNA").warning("Could not sync owner command menu: %s", exc)

    # Read back the default list so the logs show what Telegram actually saved.
    try:
        actual_commands = _telegram_api_call(
            "getMyCommands",
            {"scope": {"type": "default"}},
        )
        actual_about = _telegram_api_call("getMyShortDescription", {})
        LOGGER("LUNA").info(
            "Telegram profile verification: %s default commands; About length=%s",
            len(actual_commands or []),
            len((actual_about or {}).get("short_description", "")),
        )
    except Exception as exc:
        LOGGER("LUNA").warning("Could not verify Telegram profile settings: %s", exc)


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
            allowed_updates=Update.ALL_TYPES,
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
