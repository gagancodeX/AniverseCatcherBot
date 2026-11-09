"""Native Telegram Gaming Platform integration for Luna's arcade."""
import os

from telegram.ext import CallbackQueryHandler
from LUNA import application


# These short names must match the games registered for this bot in @BotFather.
GAME_SHORT_NAMES = {
    "luna_flappy": "flappy",
    "luna_run": "runner",
    "luna_sky_jumper": "jumper",
    "luna_star_defender": "space",
    "luna_neon_breaker": "brick",
    "luna_neon_racer": "racer",
}


async def launch_luna_game(update, context):
    """Open the selected native Telegram game at its own direct game route."""
    query = update.callback_query
    if not query or not query.game_short_name:
        # This fallback handler runs after ordinary callback handlers.
        return

    game_slug = GAME_SHORT_NAMES.get(query.game_short_name)
    base_url = os.getenv("GAMEZONE_URL", "").strip().rstrip("/")
    if not game_slug or not base_url.startswith("https://"):
        await query.answer(
            text="This Luna game is not configured yet. Please try again later.",
            show_alert=True,
        )
        return

    await query.answer(url=f"{base_url}/?game={game_slug}")


# PTB 20.6 predates CallbackQueryHandler.game_pattern. Register a broad
# fallback handler in a later group and only process Telegram game callbacks.
application.add_handler(CallbackQueryHandler(launch_luna_game), group=1)
