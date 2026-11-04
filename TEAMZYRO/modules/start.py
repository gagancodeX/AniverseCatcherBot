# ==========================================
# Creator: MrZyro
# Telegram: @MrZyro_dev
# GitHub: https://github.com/MrZyro
# ==========================================

import os
import importlib.util
import random
import time
import asyncio
from urllib.parse import urlsplit
from pyrogram import Client, filters, enums
from pyrogram.types import InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery
from TEAMZYRO import *
from TEAMZYRO.unit.zyro_help import HELP_DATA  

# 🔹 Function to Calculate Uptime
START_TIME = time.time()

def get_uptime():
    uptime_seconds = int(time.time() - START_TIME)
    hours, remainder = divmod(uptime_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{hours}h {minutes}m {seconds}s"


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


# START_MEDIA is imported from TEAMZYRO package

# 🔹 Function to Generate Private Start Message & Buttons
async def generate_start_message(client, message):
    bot_user = await client.get_me()
    bot_name = bot_user.first_name
    ping = round(time.time() - message.date.timestamp(), 2)
    uptime = get_uptime()
    
    caption = (
        f"🍃 𝖦𝗋𝖾𝖾𝗍𝗂𝗇𝗀𝗌, 𝖨'𝗆 <b>{bot_name}</b> 🫧\n\n"
        f"<blockquote>━━━━━━━▧▣▧━━━━━━━\n"
        f"⦾ <b>𝖶𝖧𝖤𝖱𝖤:</b> 𝖨 𝗌𝗉𝖺𝗐𝗇 𝗐𝖺𝗂𝖿𝗎𝗌 𝗂𝗇 𝗒𝗈𝗎𝗋 𝖼𝗁𝖺𝗍 𝖿𝗈𝗋 𝗎𝗌𝖾𝗋𝗌 𝗍𝗈 𝗀𝗋𝖺𝖻.\n"
        f"⦾ <b>𝖧𝖮𝖶 𝖳𝖮 𝖴𝖲𝖤:</b> 𝖠𝖽𝖽 𝗆𝖾 𝗍𝗈 𝗒𝗈𝗎𝗋 𝗀𝗋𝗈𝗎𝗉 𝖺𝗇𝖽 𝗎𝗌𝖾 /help 𝖿𝗈𝗋 𝖼𝗈𝗆𝗆𝖺𝗇𝖽𝗌.\n"
        f"━━━━━━━▧▣▧━━━━━━━\n"
        f"⚡ <b>𝖯𝖨𝖭𝖦:</b> {ping} ms\n"
        f"⏳ <b>𝖴𝖯𝖳𝖨𝖬𝖤:</b> {uptime}</blockquote>"
    )

    buttons = []

    group_url = valid_button_url(
        f"https://t.me/{bot_user.username}?startgroup=true"
    ) if bot_user.username else None
    if group_url:
        buttons.append([
            InlineKeyboardButton("Aᴅᴅ Tᴏ Yᴏᴜʀ Gʀᴏᴜᴘ ", url=group_url)
        ])

    social_buttons = []
    support_url = valid_button_url(SUPPORT_CHAT)
    update_url = valid_button_url(UPDATE_CHAT)
    if support_url:
        social_buttons.append(InlineKeyboardButton("Sᴜᴘᴘᴏʀᴛ", url=support_url))
    if update_url:
        social_buttons.append(InlineKeyboardButton("Cʜᴀɴɴᴇʟ", url=update_url))
    if social_buttons:
        buttons.append(social_buttons)

    buttons.append([
        InlineKeyboardButton("Hᴇʟᴘ", callback_data="open_help")
    ])

    owner_url = valid_button_url("https://t.me/xeno_kakarot")
    if owner_url:
        buttons.append([InlineKeyboardButton("Owner", url=owner_url)])
    
    return caption, buttons

# 🔹 Function to Generate Group Start Message & Buttons
async def generate_group_start_message(client):
    bot_user = await client.get_me()
    caption = (
        f"🍃 𝖨'𝗆 <b>{bot_user.first_name}</b> 🫧\n\n"
        f"<blockquote>𝖨 𝗌𝗉𝖺𝗐𝗇 𝗐𝖺𝗂𝖿𝗎𝗌 𝗂𝗇 𝗒𝗈𝗎𝗋 𝗀𝗋𝗈𝗎𝗉 𝗐𝗂𝗍𝗁 𝗆𝖾𝗌𝗌𝖺𝗀𝖾 𝖼𝗈𝗎𝗇𝗍𝗌 𝖿𝗈𝗋 𝗉𝗅𝖺𝗒𝖾𝗋𝗌 𝗍𝗈 /guess.\n"
        f"𝖴𝗌𝖾 /help 𝖿𝗈ʀ ᴍᴏʀᴇ ɪɴғᴏ.</blockquote>"
    )
    buttons = []
    row = []

    group_url = valid_button_url(
        f"https://t.me/{bot_user.username}?startgroup=true"
    ) if bot_user.username else None
    support_url = valid_button_url(SUPPORT_CHAT)

    if group_url:
        row.append(InlineKeyboardButton("Aᴅᴅ Mᴇ", url=group_url))
    if support_url:
        row.append(InlineKeyboardButton("Sᴜᴘᴘᴏʀᴛ", url=support_url))
    if row:
        buttons.append(row)
    return caption, buttons

# 🔹 Send Media (Helper)
async def send_media_message(message, media, caption, buttons):
    """Send the start media; an invalid optional button must not break /start."""
    media_type = media.lower()
    reply_markup = InlineKeyboardMarkup(buttons) if buttons else None

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

        LOGGER("TEAMZYRO").warning(
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
    media = random.choice(START_MEDIA)

    try:
        await app.send_message(
            chat_id=BOT_LOGGING,
            text=f"{message.from_user.mention} ᴊᴜsᴛ sᴛᴀʀᴛᴇᴅ ᴛʜᴇ ʙᴏᴛ ᴛᴏ ᴄʜᴇᴄᴋ <b>sᴜᴅᴏʟɪsᴛ</b>.\n\n<b>ᴜsᴇʀ ɪᴅ :</b> <code>{message.from_user.id}</code>\n<b>ᴜsᴇʀɴᴀᴍᴇ :</b> @{message.from_user.username}",
        )
    
    except Exception as exc:
        LOGGER("TEAMZYRO").warning("Could not send /start log message: %s", exc)

    await send_media_message(message, media, caption, buttons)

# 🔹 Group Start Command Handler
@app.on_message(filters.command("start") & filters.group)
async def start_group_command(client, message):
    caption, buttons = await generate_group_start_message(client)
    media = random.choice(START_MEDIA)
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
        "⚙️ <b>𝖧𝖤𝖫𝖯 𝖬𝖤𝖭𝖴</b>\n\n"
        "<blockquote>ᴄʜᴏᴏsᴇ ᴛʜᴇ ᴄᴀᴛᴇɢᴏʀʏ ғᴏʀ ᴡʜɪᴄʜ ʏᴏᴜ ᴡᴀɴɴᴀ ɢᴇᴛ ʜᴇʟᴩ.\n\n"
        "ᴀʟʟ ᴄᴏᴍᴍᴀɴᴅs ᴄᴀɴ ʙᴇ ᴜsᴇᴅ ᴡɪᴛʜ : /</blockquote>"
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
        
        full_text = f"<b>{module_name.upper()} Help:</b>\n\n{help_text}"
        
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
