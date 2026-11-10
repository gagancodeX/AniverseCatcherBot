# ==========================================
# Creator: Adam
# Project: LunaCatcherBot
# ==========================================

import asyncio
from pyrogram import filters, enums
from LUNA import (
    bot_client, DATABASE_ID, collection, rarity_map, require_power
)
from LUNA.unit.luna_watermark import get_watermarked_photo

RARITY_GUIDE = "\n".join(
    f"{number}: {label}" for number, label in sorted(rarity_map.items())
)

WRONG_FORMAT_TEXT = f"""✦ LUNA · CHARACTER UPLOAD ✦

Reply to a character image/video, then use:
\u002fupload character-name anime-name rarity-number

Example:
\u002fupload shinobu-kocho Demon-slayer 3

Use hyphens between words in names. Choose a rarity number from this list:

{RARITY_GUIDE}
"""


def extract_media_reference(message):
    """Return a Telegram file_id and media type from a copied channel message."""
    if message.photo:
        return "photo", message.photo.file_id
    if message.video:
        return "video", message.video.file_id
    if message.document:
        return "document", message.document.file_id
    if message.animation:
        return "animation", message.animation.file_id
    raise ValueError("Telegram could not identify the copied media type.")


async def find():
    cursor = collection.find().sort("id", 1)
    ids = []
    async for doc in cursor:
        if "id" in doc:
            try:
                ids.append(int(doc["id"]))
            except (TypeError, ValueError):
                continue

    ids.sort()
    for i in range(1, len(ids) + 2):
        if i not in ids:
            return str(i).zfill(2)
    return str(len(ids) + 1).zfill(2)


async def find_available_id():
    return await find()


upload_lock = asyncio.Lock()


@bot_client.on_message(filters.command(["find"]))
@require_power("add")
async def ul(client, message):
    available_id = await find()
    await message.reply_text(f"✦ 𝗡𝗘𝗫𝗧 𝗖𝗛𝗔𝗥𝗔𝗖𝗧𝗘𝗥 𝗜𝗗 ✦\n\n🆔 {available_id} is ready for your next upload.")


@bot_client.on_message(filters.command("server"))
@require_power("add")
async def storage_info(client, message):
    await message.reply_text(
        "✦ 𝗔𝗡𝗜𝗩𝗘𝗥𝗦𝗘 · 𝗠𝗘𝗗𝗜𝗔 𝗩𝗔𝗨𝗟𝗧 ✦\n\n📦 Storage · Telegram native media\n"
        "✧ New uploads are saved to the bot database channel.\n"
        "No external image host or API key is required."
    )


@bot_client.on_message(filters.command(["gupload", "u", "upload"]))
@require_power("add")
async def ul_main(client, message):
    reply = message.reply_to_message
    if not reply or not (reply.photo or reply.document or reply.video or reply.animation):
        await message.reply_text("✦ UPLOAD GUIDE\nReply to a photo, image document, video, or animation, then use /upload.")
        return

    if upload_lock.locked():
        await message.reply_text("⏳ Another character is being added right now. Try your upload again in a moment.")
        return

    async with upload_lock:
        args = message.text.split()
        if len(args) != 4:
            await client.send_message(chat_id=message.chat.id, text=WRONG_FORMAT_TEXT)
            return

        character_name = args[1].replace("-", " ").title()
        anime = args[2].replace("-", " ").title()

        try:
            rarity = int(args[3])
        except ValueError:
            await message.reply_text("⚠️ Rarity must be a number from the rarity map. Check the upload guide.")
            return

        if rarity not in rarity_map:
            valid_rarities = ", ".join(str(number) for number in sorted(rarity_map))
            await message.reply_text(f"⚠️ Invalid rarity number. Available options: {valid_rarities}")
            return

        rarity_text = rarity_map[rarity]
        available_id = await find_available_id()
        processing_message = await message.reply("✦ Saving character to the Luna vault…")

        try:
            database_caption = (
                f"✧ Character · {character_name}\n"
                f"🎬 Anime · {anime}\n"
                f"💎 Rarity · {rarity_text}\n"
                f"🆔 ID · {available_id}\n"
                f"Added by [{message.from_user.first_name}](tg://user?id={message.from_user.id})"
            )

            # Copy directly inside Telegram. The returned file_id belongs to this bot
            # and can be reused by Pyrogram and python-telegram-bot.
            image_file_id = (
                reply.photo.file_id if reply.photo
                else reply.document.file_id if reply.document
                else None
            )
            watermarked_photo = (
                await get_watermarked_photo(client, image_file_id)
                if image_file_id else None
            )
            if watermarked_photo:
                saved_message = await client.send_photo(
                    chat_id=DATABASE_ID,
                    photo=watermarked_photo,
                    caption=database_caption,
                    parse_mode=enums.ParseMode.MARKDOWN,
                )
            else:
                saved_message = await client.copy_message(
                    chat_id=DATABASE_ID,
                    from_chat_id=reply.chat.id,
                    message_id=reply.id,
                    caption=database_caption,
                    parse_mode=enums.ParseMode.MARKDOWN,
                )
            media_type, media_file_id = extract_media_reference(saved_message)

            character = {
                "name": character_name,
                "anime": anime,
                "rarity": rarity_text,
                "id": available_id,
                "media_file_id": media_file_id,
                "media_type": media_type,
                "media_chat_id": DATABASE_ID,
                "media_message_id": saved_message.id,
                "watermarked": bool(watermarked_photo),
            }
            await collection.insert_one(character)

            await message.reply_text(
                f"✦ 𝗖𝗛𝗔𝗥𝗔𝗖𝗧𝗘𝗥 𝗨𝗣𝗟𝗢𝗔𝗗𝗘𝗗 ✦\n\n👤 Added by · [{message.from_user.first_name}](tg://user?id={message.from_user.id})\n"
                f"✧ Character ID · {available_id}\n"
                f"💎 Rarity · {rarity_text}\n"
                f"📦 Storage · Telegram"
            )
        except Exception as exc:
            await message.reply_text(f"⚠️ 𝗨𝗣𝗟𝗢𝗔𝗗 𝗙𝗔𝗜𝗟𝗘𝗗\nPlease retry. Details: {str(exc)}")
        finally:
            try:
                await processing_message.delete()
            except Exception:
                pass
