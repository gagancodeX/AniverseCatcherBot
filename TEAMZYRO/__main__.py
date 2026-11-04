# ==========================================
# ANIVERSE CATCHER - Runtime entry point
# ==========================================

import importlib
import logging
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import requests
from pyrogram.errors import FloodWait

import TEAMZYRO
from TEAMZYRO import TOKEN, ZYRO, application, LOGGER, FORCE_JOIN, BOT_LOGGING
from TEAMZYRO.modules import ALL_MODULES


BOT_READY = False


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
    LOGGER("ANIVERSE").info("Render health endpoint listening on port %s", port)


def telegram_api(method: str, payload=None):
    """
    Call Telegram Bot API and honor Telegram's flood-control timer.

    A 429 response is not a fatal startup error: Telegram supplies
    parameters.retry_after, so keep this single Render process alive and retry
    only after that interval instead of crashing into a restart loop.
    """
    logger = LOGGER("ANIVERSE")

    while True:
        try:
            response = requests.post(
                f"https://api.telegram.org/bot{TOKEN}/{method}",
                json=payload or {},
                timeout=(10, 30),
            )
        except requests.RequestException as exc:
            logger.warning(
                "Temporary network error calling Telegram %s: %s. Retrying in 10 seconds.",
                method,
                exc,
            )
            time.sleep(10)
            continue

        try:
            result = response.json()
        except ValueError:
            if response.status_code == 429:
                retry_header = response.headers.get("Retry-After", "60")
                try:
                    retry_after = max(1, int(float(retry_header)))
                except (TypeError, ValueError):
                    retry_after = 60
                logger.warning(
                    "Telegram rate-limited %s. Retrying in %s seconds.",
                    method,
                    retry_after + 2,
                )
                time.sleep(retry_after + 2)
                continue
            raise RuntimeError(
                f"Telegram {method} returned HTTP {response.status_code} with a non-JSON response"
            )

        error_code = result.get("error_code", response.status_code)
        if error_code == 429 or response.status_code == 429:
            parameters = result.get("parameters") or {}
            retry_after = parameters.get("retry_after")
            if retry_after is None:
                retry_after = response.headers.get("Retry-After", 60)
            try:
                retry_after = max(1, int(float(retry_after)))
            except (TypeError, ValueError):
                retry_after = 60

            wait_seconds = retry_after + 2
            logger.warning(
                "Telegram rate-limited %s (retry_after=%s). "
                "Keeping Render alive and retrying in %s seconds; do not redeploy.",
                method,
                retry_after,
                wait_seconds,
            )
            time.sleep(wait_seconds)
            continue

        if not response.ok or not result.get("ok"):
            description = result.get("description", "Unknown Telegram API error")
            raise RuntimeError(f"Telegram {method} failed: {description}")

        return result["result"]


def normalise_chat_target(value: str):
    value = str(value or "").strip()
    value = value.replace("https://t.me/", "").replace("http://t.me/", "")
    value = value.replace("t.me/", "")
    value = value.replace("\u2212", "-").replace("\u2013", "-").replace("\u2014", "-")
    value = value.replace("\u200b", "").replace("\ufeff", "")
    if not value:
        raise ValueError("Chat setting is empty")
    if value.lstrip("-").isdigit():
        return int(value)
    return value if value.startswith("@") else f"@{value}"


def verify_bot_api_and_chats() -> None:
    """Validate token, public/private FORCE_JOIN group and log-chat access."""
    me = telegram_api("getMe")
    LOGGER("ANIVERSE").info("Bot API authenticated as @%s", me.get("username"))

    force_join_target = normalise_chat_target(FORCE_JOIN)
    chat_info = telegram_api("getChat", {"chat_id": force_join_target})
    bot_member = telegram_api(
        "getChatMember",
        {"chat_id": force_join_target, "user_id": me["id"]},
    )

    if bot_member.get("status") not in ("administrator", "creator"):
        raise RuntimeError(
            "The bot must be an administrator in FORCE_JOIN. "
            "Promote it in the public group and restart the service."
        )

    username = chat_info.get("username")
    invite_link = chat_info.get("invite_link")
    if username:
        invite_link = f"https://t.me/{username}"
    elif not invite_link:
        if not bot_member.get("can_invite_users", False):
            raise RuntimeError(
                "FORCE_JOIN is private and the bot needs the 'Invite Users' permission."
            )
        invite = telegram_api("createChatInviteLink", {"chat_id": force_join_target})
        invite_link = invite["invite_link"]

    TEAMZYRO.FORCE_JOIN_LINK = invite_link
    LOGGER("ANIVERSE").info(
        "FORCE_JOIN group verified: %s",
        chat_info.get("title") or username or force_join_target,
    )

    log_target = normalise_chat_target(BOT_LOGGING)
    test_message = telegram_api(
        "sendMessage",
        {
            "chat_id": log_target,
            "text": "ANIVERSE CATCHER startup check: log chat connected.",
        },
    )
    try:
        telegram_api(
            "deleteMessage",
            {
                "chat_id": log_target,
                "message_id": test_message["message_id"],
            },
        )
    except Exception:
        LOGGER("ANIVERSE").warning(
            "Could not remove the temporary BOT_LOGGING startup-check message."
        )
    LOGGER("ANIVERSE").info("BOT_LOGGING chat verified successfully.")


def load_modules() -> None:
    for module_name in ALL_MODULES:
        importlib.import_module(f"TEAMZYRO.modules.{module_name}")
    LOGGER("ANIVERSE").info("Loaded %s feature modules.", len(ALL_MODULES))


def start_pyrogram_client() -> None:
    """Respect Pyrogram FloodWait timers without exiting the Render process."""
    logger = LOGGER("ANIVERSE")

    while True:
        try:
            ZYRO.start()
            break
        except FloodWait as exc:
            wait_seconds = max(1, int(exc.value)) + 3
            logger.warning(
                "Telegram rate-limited Pyrogram authorization. "
                "Waiting %s seconds before retrying. Keep this Render instance running.",
                wait_seconds,
            )
            try:
                ZYRO.disconnect()
            except Exception:
                pass
            time.sleep(wait_seconds)

    logger.info("Pyrogram client connected successfully.")


def main() -> None:
    global BOT_READY

    start_health_server()

    if not TOKEN:
        raise RuntimeError("TOKEN is missing in Render environment variables.")
    if not TEAMZYRO.api_id or not TEAMZYRO.api_hash:
        raise RuntimeError("API_ID or API_HASH is missing in Render environment variables.")
    if not TEAMZYRO.mongo_url:
        raise RuntimeError("MONGO_URL is missing in Render environment variables.")
    if not FORCE_JOIN:
        raise RuntimeError("FORCE_JOIN is missing in Render environment variables.")
    if not BOT_LOGGING:
        raise RuntimeError("BOT_LOGGING is missing in Render environment variables.")

    # Validate Bot API settings before making an MTProto authorization attempt.
    verify_bot_api_and_chats()
    load_modules()

    start_pyrogram_client()

    try:
        BOT_READY = True
        LOGGER("ANIVERSE").info("ANIVERSE CATCHER is online. Starting update polling.")
        # The bot's feature modules use Pyrogram; these PTB handlers are used
        # for group message counting, inline queries and a few utility commands.
        application.run_polling(
            drop_pending_updates=True,
            close_loop=False,
        )
    finally:
        BOT_READY = False
        try:
            if ZYRO.is_connected:
                ZYRO.stop()
        except Exception:
            LOGGER("ANIVERSE").exception("Error while stopping the Pyrogram client.")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        logging.getLogger("ANIVERSE").exception("Bot startup/runtime failed.")
        sys.exit(1)
