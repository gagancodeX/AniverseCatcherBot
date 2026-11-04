# ==========================================
# Creator: MrZyro
# Telegram: @MrZyro_dev
# GitHub: https://github.com/MrZyro
# ==========================================

from TEAMZYRO import *
import importlib
import logging
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from TEAMZYRO.modules import ALL_MODULES


def start_health_server() -> None:
    """Expose a small HTTP health endpoint for Render Web Services."""
    port = int(os.environ.get("PORT", "10000"))

    class HealthHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"OK")

        def log_message(self, format, *args):
            pass

    server = ThreadingHTTPServer(("0.0.0.0", port), HealthHandler)
    threading.Thread(
        target=server.serve_forever,
        daemon=True,
        name="render-health-server",
    ).start()
    LOGGER("TEAMZYRO").info("Render health endpoint listening on port %s", port)


def main() -> None:
    start_health_server()

    for module_name in ALL_MODULES:
        imported_module = importlib.import_module("TEAMZYRO.modules." + module_name)
    LOGGER("TEAMZYRO.modules").info("𝐀𝐥𝐥 𝐅𝐞𝐚𝐭𝐮𝐫𝐞𝐬 𝐋𝐨𝐚𝐝𝐞𝐝 𝐁𝐚𝐛𝐲🥳...")

    ZYRO.start()

    # Verify FORCE_JOIN using the official Telegram Bot API.
    # MTProto messages.GetDialogs is not available to bot accounts.
    import sys
    import requests
    import TEAMZYRO

    def telegram_api(method, payload=None):
        response = requests.post(
            "https://api.telegram.org/bot" + TOKEN + "/" + method,
            json=payload or {},
            timeout=20,
        )
        try:
            result = response.json()
        except ValueError:
            raise RuntimeError("Telegram returned a non-JSON response.")
        if not response.ok or not result.get("ok"):
            description = result.get("description", "Unknown Telegram API error")
            raise RuntimeError(f"{method} failed: {description}")
        return result["result"]

    try:
        force_join_value = str(FORCE_JOIN or "").strip()
        force_join_value = (
            force_join_value
            .replace("\u2212", "-")
            .replace("\u2013", "-")
            .replace("\u2014", "-")
            .replace("\u200b", "")
            .replace("\ufeff", "")
        )
        if not force_join_value:
            raise ValueError("FORCE_JOIN is empty. Set a channel ID or @username.")

        try:
            chat_target = int(force_join_value)
        except ValueError:
            chat_target = force_join_value
            if not chat_target.startswith("@"):
                chat_target = "@" + chat_target

        chat_info = telegram_api("getChat", {"chat_id": chat_target})
        me = telegram_api("getMe")
        bot_member = telegram_api(
            "getChatMember",
            {"chat_id": chat_target, "user_id": me["id"]},
        )

        if bot_member.get("status") not in ("administrator", "creator"):
            raise RuntimeError(
                "The bot is not an administrator in the FORCE_JOIN channel. "
                "Promote it to admin in Telegram."
            )

        invite_link = chat_info.get("invite_link")
        if not invite_link and chat_info.get("username"):
            invite_link = "https://t.me/" + chat_info["username"]

        if not invite_link:
            if not bot_member.get("can_invite_users", False):
                raise RuntimeError(
                    "The channel is private and the bot lacks the 'Invite Users' admin permission."
                )
            invite = telegram_api(
                "createChatInviteLink",
                {"chat_id": chat_target},
            )
            invite_link = invite["invite_link"]

        TEAMZYRO.FORCE_JOIN_LINK = invite_link
        LOGGER("TEAMZYRO").info("FORCE_JOIN channel verified successfully.")
    except Exception as e:
        LOGGER("TEAMZYRO").error(
            "\\n"
            "=======================================================================\\n"
            "❌ FORCE_JOIN CONFIGURATION ERROR:\\n"
            f"Could not verify FORCE_JOIN ({FORCE_JOIN!r}).\\n"
            "Check the chat ID/@username and ensure the bot is an admin.\\n"
            f"Details: {e}\\n"
            "======================================================================="
        )
        try:
            ZYRO.stop()
        except Exception:
            pass
        sys.exit(1)

    # Verify BOT_LOGGING through the Bot API as well; this avoids relying
    # on an MTProto peer cache in a fresh Render container.
    try:
        log_value = str(BOT_LOGGING or "").strip()
        if not log_value:
            raise ValueError("BOT_LOGGING is empty. Set a log chat ID or @username.")

        try:
            log_target = int(log_value)
        except ValueError:
            log_target = log_value if log_value.startswith("@") else "@" + log_value

        log_msg = telegram_api(
            "sendMessage",
            {
                "chat_id": log_target,
                "text": "⚙️ ANIVERSE CATCHER startup check: logging channel connected.",
            },
        )
        LOGGER("TEAMZYRO").info(
            "BOT_LOGGING permissions verified. Test message sent (ID: %s).",
            log_msg["message_id"],
        )
    except Exception as e:
        LOGGER("TEAMZYRO").error(
            "\n"
            "=======================================================================\n"
            "❌ BOT_LOGGING CONFIGURATION ERROR:\n"
            f"Could not send a message to BOT_LOGGING ({BOT_LOGGING!r}).\n"
            "Check the chat ID/@username and ensure the bot can post messages there.\n"
            f"Details: {e}\n"
            "======================================================================="
        )
        try:
            ZYRO.stop()
        except Exception:
            pass
        sys.exit(1)

    application.run_polling(drop_pending_updates=True)
    LOGGER("TEAMZYRO").info(
        "╔═════ஜ۩۞۩ஜ════╗\n  ☠︎︎MADE BY TEAMZYRO☠︎︎\n╚═════ஜ۩۞۩ஜ════╝"
    )
    send_start_message()
    

if __name__ == "__main__":
    main()
    
    
