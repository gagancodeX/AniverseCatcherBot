"""Native Telegram Gaming Platform integration for Luna's arcade."""
import os

from telegram import InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import CallbackQueryHandler, CommandHandler
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
    base_url = os.getenv("GAMEZONE_URL", "https://luna-gamezone.onrender.com").strip().rstrip("/")
    if not game_slug or not base_url.startswith("https://"):
        await query.answer(
            text="This Luna game is not configured yet. Please try again later.",
            show_alert=True,
        )
        return

    await query.answer(url=f"{base_url}/?game={game_slug}")




async def open_gamezone(update, context):
    """Open the full Luna arcade as a Telegram Web App."""
    base_url = os.getenv("GAMEZONE_URL", "https://luna-gamezone.onrender.com").strip().rstrip("/")
    message = update.effective_message
    chat = update.effective_chat
    if not message:
        return
    if not base_url.startswith("https://"):
        await message.reply_text("Luna GameZone is not configured yet. Please try again later.")
        return

    # Launch the native inline game picker in the current chat.
    # The inline query handler returns all six registered Telegram games.
    button = InlineKeyboardButton(
        "🎮  PLAY ALL GAMES",
        switch_inline_query_current_chat="games",
    )

    text = (
        "✦ <b>LUNA · GAMEZONE</b> ✦\n\n"
        "Choose your game and chase a new high score.\n"
        "Six arcade games · Personal bests · Separate game leaderboards"
    )
    await message.reply_text(
        text,
        reply_markup=InlineKeyboardMarkup([[button]]),
        parse_mode="HTML",
        disable_web_page_preview=True,
    )

# The Web App button provides Telegram initData so scores can be tied to a
# verified player account. In groups, fall back to a normal URL button.
application.add_handler(CommandHandler("gamezone", open_gamezone))

# PTB 20.6 predates CallbackQueryHandler.game_pattern. Register a broad
# fallback handler in a later group and only process Telegram game callbacks.
application.add_handler(CallbackQueryHandler(launch_luna_game), group=1)
