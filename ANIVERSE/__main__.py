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

import ANIVERSE
from ANIVERSE import TOKEN, bot_client, application, LOGGER, FORCE_JOIN, BOT_LOGGING
from ANIVERSE.modules import ALL_MODULES


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



def load_modules() -> None:
    for module_name in ALL_MODULES:
        importlib.import_module(f"ANIVERSE.modules.{module_name}")
    LOGGER("ANIVERSE").info("Loaded %s feature modules.", len(ALL_MODULES))


def start_pyrogram_client() -> None:
    """Start Pyrogram once without an application-level FloodWait sleep/retry loop."""
    bot_client.start()
    LOGGER("ANIVERSE").info("Pyrogram client connected successfully.")


def main() -> None:
    global BOT_READY

    start_health_server()

    if not TOKEN:
        raise RuntimeError("TOKEN is missing in Render environment variables.")
    if not ANIVERSE.api_id or not ANIVERSE.api_hash:
        raise RuntimeError("API_ID or API_HASH is missing in Render environment variables.")
    if not ANIVERSE.mongo_url:
        raise RuntimeError("MONGO_URL is missing in Render environment variables.")
    if not FORCE_JOIN:
        raise RuntimeError("FORCE_JOIN is missing in Render environment variables.")
    if not BOT_LOGGING:
        raise RuntimeError("BOT_LOGGING is missing in Render environment variables.")

    # Start the bot directly; skip the extra Bot API getMe/getChat preflight.
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
            if bot_client.is_connected:
                bot_client.stop()
        except Exception:
            LOGGER("ANIVERSE").exception("Error while stopping the Pyrogram client.")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        logging.getLogger("ANIVERSE").exception("Bot startup/runtime failed.")
        sys.exit(1)
