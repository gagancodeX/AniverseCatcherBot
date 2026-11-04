# ==========================================
# Telegram-native media recovery
# ==========================================

import asyncio
from pyrogram import filters
from ANIVERSE import bot_client, collection, require_power, DATABASE_ID


async def find_char(char_id: str):
    char = await collection.find_one({"id": char_id})
    if char:
        return char

    padded = char_id.zfill(2)
    if padded != char_id:
        char = await collection.find_one({"id": padded})
        if char:
            return char

    try:
        return await collection.find_one({"id": int(char_id)})
    except ValueError:
        return None


@bot_client.on_message(filters.command(["reupload", "telegramize"]))
@require_power("add")
async def reupload_handler(client, message):
    """
    Move old URL-backed characters into Telegram storage.
    Usage: /reupload <id1> <id2> ...
    New Telegram-backed characters are skipped.
    """
    args = message.text.split()[1:]
    if not args:
        return await message.reply_text(
            "Usage: /reupload 60 61 62\n"
            "This moves old working media URLs into the Telegram database channel."
        )

    status_msg = await message.reply_text(f"⏳ Processing {len(args)} character(s)...")
    results = []
    success = 0
    failed = 0

    for char_id in args:
        sent_msg = None
        try:
            char = await find_char(char_id.strip())
            if not char:
                results.append(f"❌ {char_id}: character not found")
                failed += 1
                continue

            if char.get("media_file_id"):
                results.append(f"↪️ {char_id}: already stored on Telegram")
                continue

            stored_id = char.get("id")
            old_url = char.get("vid_url") or char.get("img_url")
            if not old_url:
                results.append(f"❌ {char_id}: no existing media URL to migrate")
                failed += 1
                continue

            is_video = bool(char.get("vid_url"))
            caption = (
                f"Telegram media archive\n"
                f"Character: {char.get('name', 'Unknown')}\n"
                f"ID: {stored_id}"
            )

            if is_video:
                sent_msg = await client.send_video(
                    chat_id=DATABASE_ID, video=old_url, caption=caption
                )
                if not sent_msg.video:
                    raise RuntimeError("Telegram did not return a video file reference.")
                file_id = sent_msg.video.file_id
                media_type = "video"
            else:
                sent_msg = await client.send_photo(
                    chat_id=BOT_LOGGING, photo=old_url, caption=caption
                )
                if not sent_msg.photo:
                    raise RuntimeError("Telegram did not return a photo file reference.")
                file_id = sent_msg.photo.file_id
                media_type = "photo"

            result = await collection.update_one(
                {"id": stored_id},
                {"$set": {
                    "media_file_id": file_id,
                    "media_type": media_type,
                    "media_chat_id": DATABASE_ID,
                    "media_message_id": sent_msg.id,
                }},
            )
            if result.matched_count != 1:
                raise RuntimeError("Character database record was not updated.")

            results.append(f"✅ {char_id}: {char.get('name', 'Character')} moved to Telegram storage")
            success += 1

        except Exception as exc:
            results.append(f"❌ {char_id}: {str(exc)[:140]}")
            failed += 1
        finally:
            # Keep the archived Telegram database message; it is the durable media copy.
            await asyncio.sleep(0.3)

    summary = "\n".join(results)
    await status_msg.edit(
        f"📦 **Telegram Storage Migration Complete**\n"
        f"✅ Migrated: {success} | ❌ Failed: {failed}\n\n{summary}"
    )
