# ==========================================
# Creator: Adam
# Project: LunaCatcherBot
# ==========================================

import os
import importlib.util
import random
import time
import asyncio
from urllib.parse import urlsplit
from pyrogram import Client, filters, enums
from pyrogram.types import InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery
from LUNA import *
from LUNA.unit.luna_help import HELP_DATA  

# 🔹 Function to Calculate Uptime
START_TIME = time.time()

def get_uptime():
    uptime_seconds = int(time.time() - START_TIME)
    hours, remainder = divmod(uptime_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{hours}h {minutes}m {seconds}s"


def normalize_logging_chat_id(value):
    """Accept Telegram chat IDs and public @usernames, never phone numbers."""
    if isinstance(value, bool) or value is None:
        raise ValueError("BOT_LOGGING is empty or invalid.")

    if isinstance(value, int):
        if value == 0:
            raise ValueError("BOT_LOGGING cannot be 0.")
        return value

    raw = str(value).strip()
    if not raw:
        raise ValueError("BOT_LOGGING is empty.")

    if raw.startswith("+"):
        raise ValueError(
            "BOT_LOGGING contains a phone number. Set it to the numeric Telegram "
            "chat ID (usually -100...) or a public @channelusername instead."
        )

    if raw.startswith("@") and len(raw) > 1:
        return raw

    if raw.lstrip("-").isdigit():
        return int(raw)

    raise ValueError(
        "BOT_LOGGING must be a numeric Telegram chat ID (usually -100...) "
        "or a public @channelusername; phone numbers are not valid chat IDs."
    )


def valid_button_url(value):
    """Normalize a Telegram-style link and reject malformed button URLs."""
    if not isinstance(value, str):
        return None

    value = value.strip()
    if not value or any(char.isspace() for char in value):
        return None

    if value.startswith("@"):
        value = f"https://t.me/{value[1:]}"
    elif value.startswith(("t.me/", "telegram.me/")):
        value = f"https://{value}"
    elif "://" not in value:
        # Treat a plain username as a Telegram link; accept other explicit
        # host/path values by adding HTTPS.
        if "/" not in value:
            value = f"https://t.me/{value}"
        else:
            value = f"https://{value}"

    try:
        parsed = urlsplit(value)
        if parsed.scheme.lower() not in ("http", "https"):
            return None
        if not parsed.netloc or not parsed.hostname:
            return None
        if parsed.username or parsed.password:
            return None
        _ = parsed.port  # Force validation of malformed port values.
    except ValueError:
        return None

    return value


# START_MEDIA is imported from LUNA package

# 🔹 Function to Generate Private Start Message & Buttons
async def generate_start_message(client, message):
    bot_user = await client.get_me()
    bot_name = bot_user.first_name
    ping = round(time.time() - message.date.timestamp(), 2)
    uptime = get_uptime()
    
    caption = (
        f"✦ <b>WELCOME TO THE LUNA</b> ✦\n"
        f"<b>{bot_name}</b>  ·  Your anime character universe\n\n"
        f"<blockquote>╭  ✧ <b>COLLECT</b>\n"
        f"│  Discover characters and build your collection.\n"
        f"├  ✧ <b>PLAY</b>\n"
        f"│  Guess characters and trade with friends.\n"
        f"╰  ✧ <b>EXPLORE</b>\n"
        f"   Open /help to discover every feature.</blockquote>\n"
        f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n"
        f"⚡ <b>{ping} ms</b>  ·  ⏱ <b>{uptime}</b>\n"
        f"<i>Choose a destination below to begin.</i>"
    )

    buttons = []

    group_url = valid_button_url(
        f"https://t.me/{bot_user.username}?startgroup=true"
    ) if bot_user.username else None
    if group_url:
        buttons.append([
            InlineKeyboardButton("✚  ADD TO GROUP", url=group_url)
        ])

    social_buttons = []
    support_url = valid_button_url(SUPPORT_CHAT)
    update_url = valid_button_url(UPDATE_CHAT)
    if support_url:
        social_buttons.append(InlineKeyboardButton("◈  SUPPORT", url=support_url))
    if update_url:
        social_buttons.append(InlineKeyboardButton("✧  UPDATES", url=update_url))
    if social_buttons:
        buttons.append(social_buttons)

    buttons.append([
        InlineKeyboardButton("⌘  COMMAND CENTER", callback_data="open_help")
    ])

    owner_url = valid_button_url(DEVELOPER_LINK)
    if owner_url:
        buttons.append([InlineKeyboardButton("✦  DEVELOPER", url=owner_url)])
    
    return caption, buttons

# 🔹 Function to Generate Group Start Message & Buttons
async def generate_group_start_message(client):
    bot_user = await client.get_me()
    caption = (
        f"✦ <b>LUNA IS ONLINE</b> ✦\n"
        f"<b>{bot_user.first_name}</b> is ready for the next character hunt.\n\n"
        f"<blockquote>Characters appear as your group chats.\n"
        f"Use /guess to catch the one you recognize\n"
        f"and /help to explore the collector tools.</blockquote>"
    )
    buttons = []
    row = []

    group_url = valid_button_url(
        f"https://t.me/{bot_user.username}?startgroup=true"
    ) if bot_user.username else None
    support_url = valid_button_url(SUPPORT_CHAT)

    if group_url:
        row.append(InlineKeyboardButton("✚  ADD TO GROUP", url=group_url))
    if support_url:
        row.append(InlineKeyboardButton("◈  SUPPORT", url=support_url))
    if row:
        buttons.append(row)
    return caption, buttons

# 🔹 Send Media (Helper)
async def send_media_message(message, media, caption, buttons):
    """Send the start media; an invalid optional button must not break /start."""
    reply_markup = InlineKeyboardMarkup(buttons) if buttons else None
    if not media:
        await message.reply_text(
            caption,
            parse_mode=enums.ParseMode.HTML,
            reply_markup=reply_markup
        )
        return

    media_type = media.lower()

    async def send(markup):
        kwargs = {"caption": caption, "parse_mode": enums.ParseMode.HTML}
        if markup is not None:
            kwargs["reply_markup"] = markup

        if media_type.endswith((".png", ".jpg", ".jpeg")):
            await message.reply_photo(photo=media, **kwargs)
        elif media_type.endswith(".gif"):
            await message.reply_animation(animation=media, **kwargs)
        else:
            await message.reply_video(video=media, **kwargs)

    try:
        await send(reply_markup)
    except Exception as exc:
        if "BUTTON_URL_INVALID" not in str(exc):
            raise

        LOGGER("LUNA").warning(
            "A /start button URL was rejected by Telegram; sending media without buttons."
        )
        await send(None)

# 🔹 Private Start Command Handler
@app.on_message(filters.command("start") & filters.private)
async def start_private_command(client, message):
    existing_user = await user_collection.find_one({"id": message.from_user.id})
    
    if not existing_user:
        user_data = {
            "id": message.from_user.id,
            "username": message.from_user.username,
            "first_name": message.from_user.first_name,
            "last_name": message.from_user.last_name,
            "start_time": time.time()
        }
        await user_collection.insert_one(user_data)

    caption, buttons = await generate_start_message(client, message)
    media = random.choice(START_MEDIA) if START_MEDIA else None

    try:
        log_chat_id = normalize_logging_chat_id(BOT_LOGGING)
        # Use the Bot API client here; Pyrogram can attempt MTProto contact
        # resolution for string peers, which Telegram does not allow bots to call.
        # Keep this optional log as plain text: user names can contain
        # characters that are unsafe to interpolate into Telegram HTML.
        username = f"@{message.from_user.username}" if message.from_user.username else "N/A"
        await application.bot.send_message(
            chat_id=log_chat_id,
            text=(
                f"{message.from_user.first_name} just started the bot.\n\n"
                f"User ID: {message.from_user.id}\n"
                f"Username: {username}"
            ),
        )
    except ValueError as exc:
        LOGGER("LUNA").warning("Could not send /start log message: invalid BOT_LOGGING: %s", exc)
    except Exception as exc:
        LOGGER("LUNA").warning("Could not send /start log message: %s", exc)

    await send_media_message(message, media, caption, buttons)

# 🔹 Group Start Command Handler
@app.on_message(filters.command("start") & filters.group)
async def start_group_command(client, message):
    caption, buttons = await generate_group_start_message(client)
    media = random.choice(START_MEDIA) if START_MEDIA else None
    await send_media_message(message, media, caption, buttons)

# 🔹 Function to Find Help Modules
def find_help_modules():
    buttons = []
    for module_name, module_data in HELP_DATA.items():
        button_name = module_data.get("HELP_NAME", "Unknown")
        buttons.append(InlineKeyboardButton(button_name, callback_data=f"help_{module_name}"))
    return [buttons[i : i + 3] for i in range(0, len(buttons), 3)]

# 🔹 Help Button Click Handler
@app.on_callback_query(filters.regex("^open_help$"))
async def show_help_menu(client, query: CallbackQuery):
    await asyncio.sleep(1)
    buttons = find_help_modules()
    buttons.append([InlineKeyboardButton("⬅ Back", callback_data="back_to_home")])

    text = (
        "⌘ <b>LUNA COMMAND CENTER</b>\n\n"
        "<blockquote>Select a category to explore its commands and features.\n\n"
        "All commands use the / prefix.</blockquote>"
    )

    try:
        await query.message.edit_caption(
            caption=text,
            reply_markup=InlineKeyboardMarkup(buttons),
            parse_mode=enums.ParseMode.HTML
        )
    except Exception:
        await query.message.edit_text(
            text=text,
            reply_markup=InlineKeyboardMarkup(buttons),
            parse_mode=enums.ParseMode.HTML
        )

# 🔹 Individual Module Help Handler
@app.on_callback_query(filters.regex(r"^help_(.+)"))
async def show_help(client, query: CallbackQuery):
    await asyncio.sleep(1)
    module_name = query.data.split("_", 1)[1]
    try:
        module_data = HELP_DATA.get(module_name, {})
        help_text = module_data.get("HELP", "Is module ka koi help nahi hai.")
        buttons = [[InlineKeyboardButton("⬅ Back", callback_data="open_help")]]
        
        full_text = f"✦ <b>{module_data.get('HELP_NAME', module_name.upper())}</b>  /  GUIDE\n\n{help_text}"
        
        try:
            await query.message.edit_caption(
                caption=full_text,
                reply_markup=InlineKeyboardMarkup(buttons),
                parse_mode=enums.ParseMode.HTML
            )
        except Exception:
            await query.message.edit_text(
                text=full_text,
                reply_markup=InlineKeyboardMarkup(buttons),
                parse_mode=enums.ParseMode.HTML
            )
    except Exception as e:
        await query.answer("Help load karne me error aayi!")

# 🔹 Back to Home
@app.on_callback_query(filters.regex("^back_to_home$"))
async def back_to_home(client, query: CallbackQuery):
    await asyncio.sleep(1)
    caption, buttons = await generate_start_message(client, query.message)
    try:
        await query.message.edit_caption(
            caption=caption,
            reply_markup=InlineKeyboardMarkup(buttons),
            parse_mode=enums.ParseMode.HTML
        )
    except Exception:
        await query.message.edit_text(
            text=caption,
            reply_markup=InlineKeyboardMarkup(buttons),
            parse_mode=enums.ParseMode.HTML
        )
