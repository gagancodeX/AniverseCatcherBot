# ==========================================
# Creator: Adam
# Project: AniverseCatcherBot
# ==========================================

from pyrogram import Client, filters
from pyrogram.enums import ParseMode
from pyrogram.types import Message
from ANIVERSE.unit.aniverse_inline import get_all_characters
from ANIVERSE import app


@app.on_message(filters.command("total"))
async def total_characters(client: Client, message: Message):
    try:
        all_characters = await get_all_characters()
        unique_characters = len({char['id']: char for char in all_characters if 'id' in char})
        await message.reply_text(
            f"✦ <b>ANIVERSE · CHARACTER ARCHIVE</b> ✦\n\n"
            f"<blockquote>📚 Registered characters · <code>{unique_characters:,}</code>\n"
            f"🌌 The universe keeps growing...</blockquote>",
            parse_mode=ParseMode.HTML
        )
    except Exception:
        await message.reply_text(
            "✦ <b>ANIVERSE · SYSTEM NOTICE</b> ✦\n"
            "<blockquote>Character archive is temporarily unavailable.</blockquote>",
            parse_mode=ParseMode.HTML
        )
