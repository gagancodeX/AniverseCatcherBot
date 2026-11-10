"""Group and private-chat leaderboards for Luna GameZone."""
import asyncio
import html
import logging
import os
from datetime import datetime, timezone

import aiohttp
from telegram import InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import CallbackQueryHandler, CommandHandler

import LUNA
from LUNA import application

LOGGER = logging.getLogger(__name__)

AUTO_INTERVAL_SECONDS = 6 * 60 * 60
AUTO_INTERVAL_LABEL = "6 hours"
GAMEZONE_URL = os.getenv(
    "GAMEZONE_URL", "https://luna-gamezone.onrender.com"
).strip().rstrip("/")

GAMES = {
    "flappy": {"name": "FLAPPY BIRD", "emoji": "🐦"},
    "runner": {"name": "LUNA RUN", "emoji": "🏃"},
    "racer": {"name": "RACE BLAZE", "emoji": "🚗"},
    "space": {"name": "LUNAR ECLIPSE", "emoji": "🌌"},
    "jumper": {"name": "LUNA THE NINJA", "emoji": "🥷"},
    "brick": {"name": "BREAKER BALL", "emoji": "🧱"},
}


def _is_group(chat):
    return bool(chat and chat.type in ("group", "supergroup"))


async def _get_entries(session, slug):
    if slug not in GAMES:
        raise ValueError("Unknown game.")
    if not GAMEZONE_URL.startswith("https://"):
        raise RuntimeError("GameZone URL is not configured.")
    url = f"{GAMEZONE_URL}/api/game-leaderboard"
    async with session.get(url, params={"game": slug}) as response:
        payload = await response.json(content_type=None)
        if response.status != 200 or not payload.get("ok"):
            raise RuntimeError(
                payload.get("error", "Leaderboard is temporarily unavailable.")
            )
        return payload.get("entries", [])


def _entry_line(entry, index):
    medals = {1: "🥇", 2: "🥈", 3: "🥉"}
    marker = medals.get(index, f"<b>{index}.</b>")
    name = html.escape(str(entry.get("name") or "Player")[:64])
    username = str(entry.get("username") or "").strip().lstrip("@")
    if username:
        name += f" <i>(@{html.escape(username[:32])})</i>"
    try:
        score = int(entry.get("score", 0))
    except (TypeError, ValueError):
        score = 0
    return f"{marker} {name}  ·  <code>{score:,}</code>"


def _format_game_board(slug, entries, limit=10):
    game = GAMES[slug]
    lines = [
        f"✦ <b>LUNA · GAME LEADERBOARD</b> ✦",
        f"{game['emoji']} <b>{game['name']}</b>",
        "",
        "🏆 <b>TOP 10 PLAYERS</b>",
        "",
    ]
    if not entries:
        lines.append("No scores yet. Be the first to set a record!")
    else:
        lines.extend(
            _entry_line(entry, index)
            for index, entry in enumerate(entries[:limit], start=1)
        )
    lines.extend(["", "<i>Scores are based on each player's personal best.</i>"])
    return "\n".join(lines)


async def _auto_is_enabled(chat_id):
    record = await LUNA.db["game_leaderboard_chats"].find_one(
        {"chat_id": int(chat_id), "enabled": True},
        {"_id": 1},
    )
    return bool(record)


def _menu_keyboard(is_group, auto_enabled=False):
    rows = []
    buttons = [
        InlineKeyboardButton(
            f"{game['emoji']} {game['name']}",
            callback_data=f"luna_lb:game:{slug}",
        )
        for slug, game in GAMES.items()
    ]
    for index in range(0, len(buttons), 2):
        rows.append(buttons[index:index + 2])

    if is_group:
        if auto_enabled:
            label, action = "🔔 AUTO UPDATES: ON · TURN OFF", "off"
        else:
            label, action = "🔔 ENABLE AUTO UPDATES · 6H", "on"
        rows.append([
            InlineKeyboardButton(label, callback_data=f"luna_lb:auto:{action}")
        ])
    return InlineKeyboardMarkup(rows)


async def _show_menu(message, chat):
    auto_enabled = _is_group(chat) and await _auto_is_enabled(chat.id)
    status = (
        f"\n\n🔔 Automatic group posts: <b>{'ON' if auto_enabled else 'OFF'}</b>"
        f" · Every {AUTO_INTERVAL_LABEL}"
        if _is_group(chat)
        else ""
    )
    text = (
        "✦ <b>LUNA · GAMEZONE LEADERBOARDS</b> ✦\n\n"
        "Choose a game to view its Top 10 players.\n"
        "Each game has a separate leaderboard."
        f"{status}\n\n"
        "<i>Automatic updates post one combined Top 5 for all six games.</i>"
    )
    await message.reply_text(
        text,
        reply_markup=_menu_keyboard(_is_group(chat), auto_enabled),
        parse_mode="HTML",
        disable_web_page_preview=True,
    )


async def _set_auto(chat, enabled):
    collection = LUNA.db["game_leaderboard_chats"]
    if enabled:
        now = datetime.now(timezone.utc)
        await collection.update_one(
            {"chat_id": int(chat.id)},
            {
                "$set": {
                    "chat_id": int(chat.id),
                    "chat_title": str(chat.title or "Luna group")[:128],
                    "chat_type": chat.type,
                    "enabled": True,
                    "updated_at": now,
                },
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        )
    else:
        await collection.delete_one({"chat_id": int(chat.id)})


async def leaderboard_command(update, context):
    chat = update.effective_chat
    message = update.effective_message
    if not chat or not message:
        return

    action = (context.args[0].lower().strip() if context.args else "")
    if action in ("auto", "on", "enable"):
        if not _is_group(chat):
            await message.reply_text("Automatic leaderboard updates can only be enabled in a group.")
            return
        await _set_auto(chat, True)
        await message.reply_text(
            "🔔 <b>Automatic leaderboards enabled!</b>\n\n"
            "Luna will post one combined update with the Top 5 players "
            "for all six games every 6 hours.\n\n"
            "Use /leaderboard off to stop automatic posts.",
            parse_mode="HTML",
        )
        return

    if action in ("off", "disable", "stop"):
        if not _is_group(chat):
            await message.reply_text("Automatic updates are configured separately for each group.")
            return
        await _set_auto(chat, False)
        await message.reply_text("🔕 Automatic leaderboard posts are now disabled in this group.")
        return

    await _show_menu(message, chat)


async def leaderboard_callback(update, context):
    query = update.callback_query
    if not query or not query.data:
        return
    parts = query.data.split(":")
    chat = query.message.chat if query.message else None

    if len(parts) == 3 and parts[1] == "auto" and not _is_group(chat):
        await query.answer("Enable automatic updates from a group chat.", show_alert=True)
        return

    await query.answer()

    if len(parts) == 2 and parts[1] == "menu":
        enabled = _is_group(chat) and await _auto_is_enabled(chat.id)
        status = (
            f"\n\n🔔 Automatic group posts: <b>{'ON' if enabled else 'OFF'}</b>"
            f" · Every {AUTO_INTERVAL_LABEL}"
            if _is_group(chat)
            else ""
        )
        text = (
            "✦ <b>LUNA · GAMEZONE LEADERBOARDS</b> ✦\n\n"
            "Choose a game to view its Top 10 players.\n"
            "Each game has a separate leaderboard."
            f"{status}\n\n"
            "<i>Automatic updates post one combined Top 5 for all six games.</i>"
        )
        await query.edit_message_text(
            text,
            reply_markup=_menu_keyboard(_is_group(chat), enabled),
            parse_mode="HTML",
            disable_web_page_preview=True,
        )
        return

    if len(parts) == 3 and parts[1] == "auto":
        enabled = parts[2] == "on"
        await _set_auto(chat, enabled)
        await query.edit_message_text(
            (
                f"🔔 <b>Automatic leaderboard updates enabled.</b>\n\n"
                f"One combined Top 5 for all six games will be posted every {AUTO_INTERVAL_LABEL}."
                if enabled
                else "🔕 <b>Automatic leaderboard updates disabled.</b>"
            ),
            parse_mode="HTML",
            reply_markup=InlineKeyboardMarkup([[
                InlineKeyboardButton("← BACK TO LEADERBOARDS", callback_data="luna_lb:menu")
            ]]),
        )
        return

    if len(parts) == 3 and parts[1] == "game":
        slug = parts[2]
        if slug not in GAMES:
            return
        try:
            timeout = aiohttp.ClientTimeout(total=12)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                entries = await _get_entries(session, slug)
            board_text = _format_game_board(slug, entries, limit=10)
        except Exception:
            LOGGER.exception("Could not fetch the %s game leaderboard", slug)
            board_text = (
                "✦ <b>LUNA · GAME LEADERBOARD</b> ✦\n\n"
                "Leaderboard is temporarily unavailable. Please try again."
            )
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("← ALL GAMES", callback_data="luna_lb:menu")
        ]])
        await query.edit_message_text(
            board_text,
            reply_markup=keyboard,
            parse_mode="HTML",
            disable_web_page_preview=True,
        )


async def _send_group_digest(bot, chat_id, session):
    sections = [
        "✦ <b>LUNA · LIVE GAMEZONE LEADERBOARDS</b> ✦",
        "<i>Group arcade rankings · refreshed every 6 hours</i>",
        "",
    ]
    for slug, game in GAMES.items():
        entries = await _get_entries(session, slug)
        sections.append(f"{game['emoji']} <b>{game['name']} · TOP 5</b>")
        if entries:
            sections.extend(
                _entry_line(entry, index)
                for index, entry in enumerate(entries[:5], start=1)
            )
        else:
            sections.append("<i>No scores yet</i>")
        sections.append("")
    text = "\n".join(sections).strip()
    await bot.send_message(
        chat_id=chat_id,
        text=text,
        parse_mode="HTML",
        disable_web_page_preview=True,
    )


async def _auto_leaderboard_loop(bot):
    # Wait one full interval after startup before the first automatic post.
    while True:
        await asyncio.sleep(AUTO_INTERVAL_SECONDS)
        try:
            groups = await LUNA.db["game_leaderboard_chats"].find(
                {"enabled": True}
            ).to_list(length=None)
        except Exception:
            LOGGER.exception("Could not load groups subscribed to automatic leaderboards")
            continue

        timeout = aiohttp.ClientTimeout(total=20)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            for group in groups:
                chat_id = group.get("chat_id")
                if not chat_id:
                    continue
                try:
                    await _send_group_digest(bot, int(chat_id), session)
                except Exception:
                    LOGGER.exception(
                        "Automatic GameZone leaderboard post failed for chat %s",
                        chat_id,
                    )


async def start_leaderboard_worker(application):
    task = asyncio.create_task(_auto_leaderboard_loop(application.bot))
    application.bot_data["luna_leaderboard_worker"] = task
    LOGGER.info("Automatic GameZone leaderboard worker started (every %s).", AUTO_INTERVAL_LABEL)


async def stop_leaderboard_worker(application):
    task = application.bot_data.pop("luna_leaderboard_worker", None)
    if task:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)


application.add_handler(CommandHandler("leaderboard", leaderboard_command))
application.add_handler(
    CallbackQueryHandler(leaderboard_callback, pattern=r"^luna_lb:")
)
application.post_init = start_leaderboard_worker
application.post_shutdown = stop_leaderboard_worker
