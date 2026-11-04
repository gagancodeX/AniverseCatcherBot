# ==========================================
# Creator: MrZyro
# Telegram: @MrZyro_dev
# GitHub: https://github.com/MrZyro
# ==========================================

from bson.objectid import ObjectId
from pyrogram import filters, enums
from pyrogram.types import InlineKeyboardButton, InlineKeyboardMarkup
from TEAMZYRO import app as ZYRO, DATABASE_ID, db, collection, require_power, rarity_map


WRONG_FORMAT_TEXT = """Wrong ❌ format...

eg. /addchar reply to a photo tanjiro-kamado Demon-slayer

format:- /addchar character-name anime-name"""


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


@ZYRO.on_message(filters.command(["addchar"]))
async def request_upload(client, message):
    reply = message.reply_to_message
    if not reply or not (reply.photo or reply.document or reply.video or reply.animation):
        return await message.reply_text("Please reply to a photo, image document, video, or animation.")

    args = message.text.split()
    if len(args) != 3:
        return await message.reply_text(WRONG_FORMAT_TEXT)

    character_name = args[1].replace("-", " ").title()
    anime = args[2].replace("-", " ").title()
    processing_message = await message.reply("⏳ Processing...")

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
            InlineKeyboardButton("❌ Cancel", callback_data=f"cancel_{request_id}")
        ])
        keyboard = InlineKeyboardMarkup(rarity_buttons)

        database_caption = (
            "#pending\n\n"
            "**New Character Upload Request**\n"
            f"Character Name: {character_name}\n"
            f"Anime Name: {anime}\n"
            f"Requested by [{message.from_user.first_name}](tg://user?id={message.from_user.id})\n\n"
            "Select a rarity to upload the character or cancel the request:"
        )

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
            }},
        )

        await processing_message.edit("✅ Your request has been submitted successfully!")
    except Exception as exc:
        if request_id is not None:
            await upload_collection.delete_one({"_id": request_id})
        await processing_message.edit(f"❌ Request upload failed.\nError: {str(exc)}")


@ZYRO.on_callback_query(filters.create(lambda _, __, q: q.data.startswith("cancel_")))
@require_power("add")
async def handle_cancel(client, callback_query):
    try:
        _, request_id = callback_query.data.split("_", 1)
        result = await upload_collection.delete_one({"_id": ObjectId(request_id)})

        if result.deleted_count > 0:
            await callback_query.edit_message_caption(
                caption="❌ The upload request has been canceled.",
                reply_markup=None
            )
            await callback_query.answer("Request canceled successfully.")
        else:
            await callback_query.answer("Request not found or already processed.", show_alert=True)
    except Exception as exc:
        print(f"Error in handle_cancel: {exc}")
        await callback_query.answer("An error occurred while canceling the request.", show_alert=True)


@ZYRO.on_callback_query(filters.create(lambda _, __, q: q.data.startswith("rarity_")))
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
            return await callback_query.answer("This request has no saved Telegram media. Please submit it again.", show_alert=True)

        available_id = await find_available_id()
        character = {
            "id": available_id,
            "name": request["name"],
            "anime": request["anime"],
            "rarity": new_rarity_text,
            "media_file_id": request["media_file_id"],
            "media_type": request.get("media_type", "photo"),
            "media_chat_id": request.get("media_chat_id", DATABASE_ID),
            "media_message_id": request.get("media_message_id"),
        }

        await collection.insert_one(character)
        await upload_collection.delete_one({"_id": ObjectId(request_id)})

        await callback_query.edit_message_caption(
            caption=(
                "**✅ Character Uploaded**\n"
                f"Character Name: {request['name']}\n"
                f"Anime Name: {request['anime']}\n"
                f"Rarity: {new_rarity_text}\n"
                f"ID: {available_id}\n"
                f"Uploaded by [{callback_query.from_user.first_name}](tg://user?id={callback_query.from_user.id})"
            ),
            reply_markup=None
        )

        await callback_query.answer(f"Character uploaded with rarity: {new_rarity_text}")
    except Exception as exc:
        print(f"Error in handle_callback: {exc}")
        await callback_query.answer("An error occurred while processing the request.", show_alert=True)
