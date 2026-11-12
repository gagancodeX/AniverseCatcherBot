# ==========================================
# LUNA CATCHER - Runtime entry point
# ==========================================

import asyncio
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
        "command": "gamezone",
        "description": "🎮 Open all Luna arcade games"
    },
    {
        "command": "leaderboard",
        "description": "🏆 View GameZone Top 10 rankings"
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
    """Serve Render health checks and the verified GameZone score API."""
    from datetime import datetime, timezone
    from urllib.parse import parse_qs, urlsplit

    from pymongo import DESCENDING, MongoClient

    from LUNA.game_scores import MAX_SCORE, VALID_GAMES, verify_telegram_init_data

    port = int(os.environ.get("PORT", "10000"))
    gamezone_origin = os.environ.get(
        "GAMEZONE_URL", "https://luna-gamezone.onrender.com"
    ).strip().rstrip("/")
    mongo_client = MongoClient(
        LUNA.mongo_url,
        serverSelectionTimeoutMS=5000,
        connectTimeoutMS=5000,
    )
    score_collection = mongo_client[LUNA.DB_NAME]["game_scores"]

    try:
        score_collection.create_index(
            [("game", 1), ("user_id", 1)],
            unique=True,
            name="game_user_unique",
        )
        score_collection.create_index(
            [("game", 1), ("best_score", DESCENDING)],
            name="game_best_score",
        )
    except Exception as exc:
        LOGGER("LUNA").warning("Game leaderboard index setup failed: %s", exc)

    class HealthHandler(BaseHTTPRequestHandler):
        def _send_json(self, status, payload):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            origin = self.headers.get("Origin", "")
            if origin == gamezone_origin:
                self.send_header("Access-Control-Allow-Origin", gamezone_origin)
                self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self):
            if self.headers.get("Origin", "") != gamezone_origin:
                self._send_json(403, {"ok": False, "error": "Origin not allowed."})
                return
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", gamezone_origin)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Max-Age", "600")
            self.send_header("Vary", "Origin")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_GET(self):
            parsed = urlsplit(self.path)
            if parsed.path == "/api/game-leaderboard":
                params = parse_qs(parsed.query)
                game = (params.get("game") or [""])[0].strip().lower()
                if game not in VALID_GAMES:
                    self._send_json(400, {"ok": False, "error": "Unknown game."})
                    return
                try:
                    rows = list(
                        score_collection.find(
                            {"game": game},
                            {
                                "_id": 0,
                                "first_name": 1,
                                "username": 1,
                                "best_score": 1,
                                "plays": 1,
                            },
                        )
                        .sort([("best_score", DESCENDING), ("updated_at", 1)])
                        .limit(10)
                    )
                    entries = [
                        {
                            "rank": index,
                            "name": row.get("first_name") or "Player",
                            "username": row.get("username") or "",
                            "score": int(row.get("best_score", 0)),
                            "plays": int(row.get("plays", 0)),
                        }
                        for index, row in enumerate(rows, start=1)
                    ]
                    self._send_json(200, {"ok": True, "game": game, "entries": entries})
                except Exception as exc:
                    LOGGER("LUNA").warning("Game leaderboard query failed: %s", exc)
                    self._send_json(503, {"ok": False, "error": "Leaderboard is temporarily unavailable."})
                return

            if parsed.path == "/ready" and not BOT_READY:
                self.send_response(503)
                body = b"Telegram bot is still starting"
            else:
                self.send_response(200)
                body = b"OK"
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            if urlsplit(self.path).path != "/api/game-score":
                self._send_json(404, {"ok": False, "error": "Not found."})
                return
            if self.headers.get("Origin", "") != gamezone_origin:
                self._send_json(403, {"ok": False, "error": "Open GameZone from the Luna bot."})
                return

            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > 8192:
                    raise ValueError("Invalid request size.")
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
                game = str(payload.get("game", "")).strip().lower()
                score = payload.get("score")
                if game not in VALID_GAMES:
                    raise ValueError("Unknown game.")
                if isinstance(score, bool) or not isinstance(score, int) or score < 0 or score > MAX_SCORE:
                    raise ValueError("Score is outside the accepted range.")

                user = verify_telegram_init_data(payload.get("initData"), TOKEN)
                now = datetime.now(timezone.utc)
                score_collection.update_one(
                    {"game": game, "user_id": user["id"]},
                    {
                        "$max": {"best_score": score},
                        "$set": {
                            "first_name": user["first_name"],
                            "username": user["username"],
                            "updated_at": now,
                            "last_score": score,
                        },
                        "$setOnInsert": {"created_at": now},
                        "$inc": {"plays": 1},
                    },
                    upsert=True,
                )
                best = score_collection.find_one(
                    {"game": game, "user_id": user["id"]},
                    {"_id": 0, "best_score": 1},
                )
                self._send_json(
                    200,
                    {"ok": True, "game": game, "best_score": int((best or {}).get("best_score", score))},
                )
            except ValueError as exc:
                self._send_json(400, {"ok": False, "error": str(exc)})
            except (json.JSONDecodeError, UnicodeDecodeError):
                self._send_json(400, {"ok": False, "error": "Invalid request body."})
            except Exception as exc:
                LOGGER("LUNA").warning("Game score submission failed: %s", exc)
                self._send_json(503, {"ok": False, "error": "Score could not be saved right now."})

        def log_message(self, format, *args):
            pass

    server = ThreadingHTTPServer(("0.0.0.0", port), HealthHandler)
    threading.Thread(
        target=server.serve_forever,
        daemon=True,
        name="render-health-server",
    ).start()
    LOGGER("LUNA").info("Render health and GameZone score API listening on port %s", port)

def load_modules() -> None:
    for module_name in ALL_MODULES:
        importlib.import_module(f"LUNA.modules.{module_name}")
    LOGGER("LUNA").info("Loaded %s feature modules.", len(ALL_MODULES))


def start_pyrogram_client() -> None:
    """Start bot/admin clients and synchronize saved rarity labels."""
    bot_client.start()
    LOGGER("LUNA").info("Pyrogram bot client connected successfully.")

    # Optional user-account session is used only for deleting older archive posts.
    if LUNA.database_admin_client:
        try:
            LUNA.database_admin_client.start()
            loop = asyncio.get_event_loop()
            admin_me = loop.run_until_complete(LUNA.database_admin_client.get_me())
            admin_member = loop.run_until_complete(
                LUNA.database_admin_client.get_chat_member(LUNA.DATABASE_ID, admin_me.id)
            )
            admin_rights = getattr(admin_member, "privileges", None)
            status_text = str(getattr(admin_member, "status", "")).lower()
            can_delete = status_text.endswith("administrator") and bool(
                getattr(admin_rights, "can_delete_messages", False)
            )
            if can_delete:
                LOGGER("LUNA").info(
                    "Database admin session connected; Delete Messages right verified."
                )
            else:
                LOGGER("LUNA").warning(
                    "Database admin session is connected, but its account lacks "
                    "administrator status or Delete Messages permission."
                )
        except Exception as exc:
            LOGGER("LUNA").warning(
                "Database admin session could not be started/verified: %s",
                str(exc)[:180],
            )
            try:
                if LUNA.database_admin_client.is_connected:
                    LUNA.database_admin_client.stop()
            except Exception:
                LOGGER("LUNA").exception("Could not stop database admin session.")

    from LUNA.modules.rarity import migrate_rarity_labels

    # Kurigram exposes its active loop through the asyncio loop registered by
    # its synchronous Client.start() bridge; it no longer provides Client.loop.
    loop = asyncio.get_event_loop()
    migrated_count = loop.run_until_complete(migrate_rarity_labels())
    LOGGER("LUNA").info(
        "Rarity label migration complete; updated %s stored values.",
        migrated_count,
    )


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
            if LUNA.database_admin_client and LUNA.database_admin_client.is_connected:
                LUNA.database_admin_client.stop()
        except Exception:
            LOGGER("LUNA").exception("Error while stopping database admin client.")
        try:
            if bot_client.is_connected:
                bot_client.stop()
        except Exception:
            LOGGER("LUNA").exception("Error while stopping Pyrogram bot client.")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        logging.getLogger("LUNA").exception("Bot startup/runtime failed.")
        sys.exit(1)
