# ==========================================
# Creator: Adam
# Project: LunaCatcherBot
# ==========================================

from bson.objectid import ObjectId
from pyrogram import filters, enums
from pyrogram.types import InlineKeyboardButton, InlineKeyboardMarkup
from LUNA import app as bot_client, DATABASE_ID, db, collection, require_power, rarity_map
from LUNA.unit.luna_watermark import get_watermarked_photo


WRONG_FORMAT_TEXT = """✦ LUNA · CHARACTER REQUEST ✦

Reply to a character image/video, then send:
/addchar character-name anime-name

Example:
/addchar tanjiro-kamado Demon-slayer

Use hyphens between words in names. An admin will review your request."""


upload_collection = db.uploads


def extract_media_reference(message):
    if message.photo:
        return "photo", message.photo.file_id
    if message.video:
        return "video", message.video.file_id
    if message.document:
        return "document", message.document.file_id
    if message.animation:
        return "animation", message.animation.file_id
    raise ValueError("Telegram could not identify the copied media type.")


async def find_available_id():
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


@bot_client.on_message(filters.command(["addchar"]))
async def request_upload(client, message):
    reply = message.reply_to_message
    if not reply or not (reply.photo or reply.document or reply.video or reply.animation):
        return await message.reply_text("✦ CHARACTER REQUEST\nReply to a photo, image document, video, or animation.")

    args = message.text.split()
    if len(args) != 3:
        return await message.reply_text(WRONG_FORMAT_TEXT)

    character_name = args[1].replace("-", " ").title()
    anime = args[2].replace("-", " ").title()
    processing_message = await message.reply("✦ Sending your character request…")

    request_id = None
    try:
        # Create the pending request first so its ID can be placed in the
        # moderation buttons. The media itself is copied directly in Telegram.
        result = await upload_collection.insert_one({
            "name": character_name,
            "anime": anime,
            "requested_by": {
                "id": message.from_user.id,
                "name": message.from_user.first_name,
            },
        })
        request_id = result.inserted_id

        rarity_buttons = []
        rarity_items = list(rarity_map.items())
        for i in range(0, len(rarity_items), 4):
            rarity_buttons.append([
                InlineKeyboardButton(
                    text=value,
                    callback_data=f"rarity_{request_id}_{key}",
                )
                for key, value in rarity_items[i:i + 4]
            ])
        rarity_buttons.append([
            InlineKeyboardButton("↩ CANCEL REQUEST", callback_data=f"cancel_{request_id}")
        ])
        keyboard = InlineKeyboardMarkup(rarity_buttons)

        database_caption = (
            "#pending\n\n"
            "✦ **LUNA · NEW CHARACTER REQUEST** ✦\n"
            f"✧ Character · {character_name}\n"
            f"🎬 Anime · {anime}\n"
            f"Requested by [{message.from_user.first_name}](tg://user?id={message.from_user.id})\n\n"
            "Choose a rarity to approve the character, or cancel this request:"
        )

        watermarked_photo = (
            await get_watermarked_photo(client, reply.photo.file_id)
            if reply.photo else None
        )
        if watermarked_photo:
            saved_message = await client.send_photo(
                chat_id=DATABASE_ID,
                photo=watermarked_photo,
                caption=database_caption,
                parse_mode=enums.ParseMode.MARKDOWN,
                reply_markup=keyboard,
            )
        else:
            saved_message = await client.copy_message(
                chat_id=DATABASE_ID,
                from_chat_id=reply.chat.id,
                message_id=reply.id,
                caption=database_caption,
                parse_mode=enums.ParseMode.MARKDOWN,
                reply_markup=keyboard,
            )
        media_type, media_file_id = extract_media_reference(saved_message)

        await upload_collection.update_one(
            {"_id": request_id},
            {"$set": {
                "media_file_id": media_file_id,
                "media_type": media_type,
                "media_chat_id": DATABASE_ID,
                "media_message_id": saved_message.id,
                "watermarked": bool(watermarked_photo),
            }},
        )

        await processing_message.edit("✦ 𝗥𝗘𝗤𝗨𝗘𝗦𝗧 𝗦𝗘𝗡𝗧 ✦\n\nYour character is now in the review queue. You’ll be notified after moderation.")
    except Exception as exc:
        if request_id is not None:
            await upload_collection.delete_one({"_id": request_id})
        await processing_message.edit(f"⚠️ 𝗥𝗘𝗤𝗨𝗘𝗦𝗧 𝗙𝗔𝗜𝗟𝗘𝗗\nPlease try again. Details: {str(exc)}")


@bot_client.on_callback_query(filters.create(lambda _, __, q: q.data.startswith("cancel_")))
@require_power("add")
async def handle_cancel(client, callback_query):
    try:
        _, request_id = callback_query.data.split("_", 1)
        result = await upload_collection.delete_one({"_id": ObjectId(request_id)})

        if result.deleted_count > 0:
            await callback_query.edit_message_caption(
                caption="↩ 𝗖𝗛𝗔𝗥𝗔𝗖𝗧𝗘𝗥 𝗥𝗘𝗤𝗨𝗘𝗦𝗧 𝗖𝗔𝗡𝗖𝗘𝗟𝗟𝗘𝗗",
                reply_markup=None
            )
            await callback_query.answer("Request cancelled. ✦")
        else:
            await callback_query.answer("This request is no longer available.", show_alert=True)
    except Exception as exc:
        print(f"Error in handle_cancel: {exc}")
        await callback_query.answer("The request could not be cancelled. Try again.", show_alert=True)


@bot_client.on_callback_query(filters.create(lambda _, __, q: q.data.startswith("rarity_")))
@require_power("app")
async def handle_callback(client, callback_query):
    try:
        _, request_id, new_rarity = callback_query.data.split("_", 2)
        new_rarity = int(new_rarity)
        new_rarity_text = rarity_map[new_rarity]

        request = await upload_collection.find_one({"_id": ObjectId(request_id)})
        if not request:
            return await callback_query.answer("Request not found or already processed.", show_alert=True)

        if not request.get("media_file_id"):
            return await callback_query.answer("No Telegram media was saved for this request. Please send it again.", show_alert=True)

        available_id = await find_available_id()
        character = {
            "id": available_id,
            "name": request["name"],
            "anime": request["anime"],
            "rarity": new_rarity_text,
            "media_file_id": request["media_file_id"],
            "media_type": request.get("media_type", "photo"),
            "watermarked": bool(request.get("watermarked", False)),
            "media_chat_id": request.get("media_chat_id", DATABASE_ID),
            "media_message_id": request.get("media_message_id"),
        }

        await collection.insert_one(character)
        await upload_collection.delete_one({"_id": ObjectId(request_id)})

        await callback_query.edit_message_caption(
            caption=(
                "✦ **CHARACTER ADDED TO LUNA** ✦\n"
                f"✧ Character · {request['name']}\n"
                f"🎬 Anime · {request['anime']}\n"
                f"💎 Rarity · {new_rarity_text}\n"
                f"🆔 Character ID · {available_id}\n"
                f"👤 Added by [{callback_query.from_user.first_name}](tg://user?id={callback_query.from_user.id})"
            ),
            reply_markup=None
        )

        await callback_query.answer(f"✦ Character added · {new_rarity_text}")
    except Exception as exc:
        print(f"Error in handle_callback: {exc}")
        await callback_query.answer("The character request could not be approved. Please try again.", show_alert=True)
