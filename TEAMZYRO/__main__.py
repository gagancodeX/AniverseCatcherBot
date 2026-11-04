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

    # Verify FORCE_JOIN admin permissions and get/generate invite link.
    # Numeric channel IDs must be present in the MTProto peer cache before
    # Kurigram/Pyrogram can resolve them. Loading dialogs first fixes fresh
    # Render containers where the local session starts with an empty cache.
    import sys
    import TEAMZYRO

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
            raise ValueError("FORCE_JOIN is empty. Set it to the channel ID or @username.")

        try:
            chat_target = int(force_join_value)
        except ValueError:
            chat_target = force_join_value

        if isinstance(chat_target, int):
            chat_found = False
            for dialog in ZYRO.get_dialogs():
                if dialog.chat.id == chat_target:
                    chat_found = True
                    break

            if not chat_found:
                raise RuntimeError(
                    f"Chat ID {chat_target} was not found in the bot's Telegram dialogs. "
                    "Check the FORCE_JOIN value and make sure the bot has been added to that chat."
                )

        chat_obj = ZYRO.get_chat(chat_target)
        invite_link = chat_obj.invite_link
        if not invite_link:
            invite = ZYRO.create_chat_invite_link(chat_target)
            invite_link = invite.invite_link

        TEAMZYRO.FORCE_JOIN_LINK = invite_link
        LOGGER("TEAMZYRO").info("FORCE_JOIN chat verified successfully.")
    except Exception as e:
        LOGGER("TEAMZYRO").error(
            "\n"
            "=======================================================================\n"
            "❌ FORCE_JOIN CONFIGURATION ERROR:\n"
            f"Could not verify FORCE_JOIN ({FORCE_JOIN!r}).\n"
            "Check that the chat ID/@username is correct, the bot is a member/admin, "
            "and it has permission to create invite links when needed.\n"
            f"Details: {e}\n"
            "======================================================================="
        )
        try:
            ZYRO.stop()
        except Exception:
            pass
        sys.exit(1)

    # Verify BOT_LOGGING permissions by sending a startup message.
    try:
        log_value = str(BOT_LOGGING or "").strip()
        if not log_value:
            raise ValueError("BOT_LOGGING is empty. Set it to a log chat ID or @username.")

        try:
            log_target = int(log_value)
        except ValueError:
            log_target = log_value

        test_msg = ZYRO.send_message(
            chat_id=log_target,
            text="⚙️ **ANIVERSE CATCHER Startup Notification**:\nSuccessfully connected & verified write permissions in the logs channel!"
        )
        LOGGER("TEAMZYRO").info(
            "BOT_LOGGING permissions verified. Test message sent (ID: %s).",
            test_msg.id,
        )
    except Exception as e:
        LOGGER("TEAMZYRO").error(
            "\n"
            "=======================================================================\n"
            "❌ BOT_LOGGING CONFIGURATION ERROR:\n"
            f"Could not send a message to BOT_LOGGING ({BOT_LOGGING!r}).\n"
            "Check the chat ID/@username and make sure the bot can post messages there.\n"
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
    
    
