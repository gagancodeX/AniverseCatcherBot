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
    game_slug = GAME_SHORT_NAMES.get(query.game_short_name or "")
    base_url = os.getenv("GAMEZONE_URL", "").strip().rstrip("/")

    if not game_slug or not base_url.startswith("https://"):
        await query.answer(
            text="This Luna game is not configured yet. Please try again later.",
            show_alert=True,
        )
        return

    await query.answer(url=f"{base_url}/?game={game_slug}")


# Game callbacks are distinct from ordinary callback_data button presses.
application.add_handler(
    CallbackQueryHandler(
        launch_luna_game,
        game_pattern=r"^(luna_flappy|luna_run|luna_sky_jumper|luna_star_defender|luna_neon_breaker|luna_neon_racer)$",
    )
)
