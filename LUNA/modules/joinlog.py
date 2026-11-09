# ==========================================
# Creator: Adam
# Project: LunaCatcherBot
# ==========================================

from pyrogram import Client, filters
from pyrogram.types import Message
from LUNA import app, application, BOT_LOGGING, LOGGER


def normalize_logging_chat_id(value):
    """Convert configured Telegram chat IDs to the type expected by Bot API."""
    if isinstance(value, bool) or value is None:
        raise ValueError("BOT_LOGGING is empty or invalid.")

    if isinstance(value, int):
        if value == 0:
            raise ValueError("BOT_LOGGING cannot be 0.")
        return value

    raw = str(value).strip()
    if not raw:
        raise ValueError("BOT_LOGGING is empty.")
    if raw.startswith("@") and len(raw) > 1:
        return raw
    if raw.lstrip("-").isdigit():
        return int(raw)

    raise ValueError(
        "BOT_LOGGING must be a numeric Telegram chat ID or a public @username."
    )


def get_actor_label(user):
    """Build a plain-text actor label without Telegram entity markup."""
    if not user:
        return "Unknown"

    name = user.first_name or "Unknown"
    if user.last_name:
        name = f"{name} {user.last_name}"
    if user.username:
        name = f"{name} (@{user.username})"
    return f"{name} · ID {user.id}"


async def send_log_message(message: str):
    """Send group activity logs through Telegram Bot API."""
    try:
        log_chat_id = normalize_logging_chat_id(BOT_LOGGING)
        await application.bot.send_message(
            chat_id=log_chat_id,
            text=message,
            disable_web_page_preview=True,
        )
    except Exception as exc:
        LOGGER("LUNA").warning("Could not send group activity log: %s", exc)


def get_group_details(chat):
    title = chat.title or "Unnamed group"
    username = f"@{chat.username}" if chat.username else "Private"
    return title, username, chat.id


@app.on_message(filters.new_chat_members)
async def on_new_chat_members(client: Client, message: Message):
    """Log when Luna is added to a group or supergroup."""
    if not message.chat or message.chat.type not in ("group", "supergroup"):
        return

    bot_user = await client.get_me()
    if not any(member.id == bot_user.id for member in (message.new_chat_members or [])):
        return

    group_title, group_username, group_id = get_group_details(message.chat)
    added_by = get_actor_label(message.from_user)

    log_message = (
        "✦ LUNA · ADDED TO GROUP ✦\n\n"
        f"🏷 Group · {group_title}\n"
        f"🆔 Group ID · {group_id}\n"
        f"🔗 Username · {group_username}\n"
        f"👤 Added by · {added_by}"
    )
    await send_log_message(log_message)


@app.on_message(filters.left_chat_member)
async def on_left_chat_member(client: Client, message: Message):
    """Log when Luna is removed from a group or supergroup."""
    if not message.chat or message.chat.type not in ("group", "supergroup"):
        return

    bot_user = await client.get_me()
    if not message.left_chat_member or message.left_chat_member.id != bot_user.id:
        return

    group_title, group_username, group_id = get_group_details(message.chat)
    removed_by = get_actor_label(message.from_user)

    log_message = (
        "✦ LUNA · REMOVED FROM GROUP ✦\n\n"
        f"🏷 Group · {group_title}\n"
        f"🆔 Group ID · {group_id}\n"
        f"🔗 Username · {group_username}\n"
        f"👤 Removed by · {removed_by}"
    )
    await send_log_message(log_message)
