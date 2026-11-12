# ==========================================
# Creator: Adam
# Project: LunaCatcherBot
# ==========================================

import asyncio
import re
from pyrogram import Client, filters, enums
from pyrogram.types import Message
from LUNA import collection, app, user_collection, require_power, DATABASE_ID, bot as aiogram_bot
from LUNA.unit.luna_rarity import rarity_map


def build_database_caption(character):
    """Build a plain-text archive caption from the latest character record."""
    caption = (
        "✦ LUNA · CHARACTER ARCHIVE ✦\n\n"
        f"✧ Character · {character.get('name', 'Unknown')}\n"
        f"🎬 Anime · {character.get('anime', 'Unknown')}\n"
        f"💎 Rarity · {character.get('rarity', 'Unknown')}\n"
        f"🆔 ID · {character.get('id', 'Unknown')}"
    )
    # Telegram media captions are limited to 1024 characters.
    return caption[:1024]


async def sync_database_channel_post(client, character):
    """
    Keep the archive entry in DATABASE_ID in sync with MongoDB.
    Existing Telegram posts are edited; legacy records without a message
    reference receive a new archive post.
    """
    caption = build_database_caption(character)
    archive_chat_id = character.get("media_chat_id") or DATABASE_ID
    archive_message_id = character.get("media_message_id")

    if archive_message_id:
        try:
            await client.edit_message_caption(
                chat_id=archive_chat_id,
                message_id=archive_message_id,
                caption=caption,
                parse_mode=enums.ParseMode.DISABLED,
            )
            return "updated existing channel post"
        except Exception as exc:
            return f"could not edit saved channel post: {str(exc)[:120]}"

    try:
        media_file_id = character.get("media_file_id")
        media_type = character.get("media_type", "photo")

        if media_file_id:
            senders = {
                "photo": ("send_photo", "photo"),
                "video": ("send_video", "video"),
                "document": ("send_document", "document"),
                "animation": ("send_animation", "animation"),
            }
            method_name, argument_name = senders.get(
                media_type, ("send_photo", "photo")
            )
            sender = getattr(client, method_name)
            saved_message = await sender(
                chat_id=DATABASE_ID,
                **{argument_name: media_file_id},
                caption=caption,
                parse_mode=enums.ParseMode.DISABLED,
            )
        elif character.get("vid_url"):
            saved_message = await client.send_video(
                chat_id=DATABASE_ID,
                video=character["vid_url"],
                caption=caption,
                parse_mode=enums.ParseMode.DISABLED,
            )
        elif character.get("img_url"):
            saved_message = await client.send_photo(
                chat_id=DATABASE_ID,
                photo=character["img_url"],
                caption=caption,
                parse_mode=enums.ParseMode.DISABLED,
            )
        else:
            saved_message = await client.send_message(
                chat_id=DATABASE_ID,
                text=caption,
                parse_mode=enums.ParseMode.DISABLED,
            )

        media_fields = {
            "media_chat_id": DATABASE_ID,
            "media_message_id": saved_message.id,
        }
        for kind in ("photo", "video", "document", "animation"):
            media = getattr(saved_message, kind, None)
            if media:
                media_fields["media_type"] = kind
                media_fields["media_file_id"] = media.file_id
                break

        await collection.update_one(
            {"id": character["id"]},
            {"$set": media_fields},
        )
        return "new channel archive post created"
    except Exception as exc:
        return f"channel sync failed: {str(exc)[:120]}"


def _message_has_character_id(post, character_id):
    """Match only an explicit archive ID marker, not incidental caption text."""
    body = (getattr(post, "caption", None) or getattr(post, "text", None) or "")
    escaped_id = re.escape(str(character_id).strip())
    marker = re.compile(
        rf"(?im)(?:^|[\n|])\s*(?:🆔\s*)?(?:character\s+)?"
        rf"id\s*[·:|]\s*{escaped_id}(?=\s*(?:\||$))"
    )
    return bool(marker.search(body))


def _message_has_saved_media(post, media_file_id):
    """Validate a saved message pointer against the character's stored Telegram file."""
    if not media_file_id:
        return False
    for kind in ("photo", "video", "document", "animation"):
        media = getattr(post, kind, None)
        if media and getattr(media, "file_id", None) == media_file_id:
            return True
    return False


async def _find_character_archive_posts(client, chat_id, character_id):
    """Find every archive post carrying this exact character ID in a channel."""
    matches = []
    async for post in client.get_chat_history(chat_id, limit=0):
        if _message_has_character_id(post, character_id):
            matches.append(post)
    return matches


# Delete the archived Telegram post, the character record, and all user copies.
@app.on_message(filters.command("gdelete"))
@require_power("del")
async def delete_handler(client, message):
    try:
        args = message.text.split()
        if len(args) != 2:
            return await message.reply_text("Incorrect format. Use: /gdelete ID")

        character_id = args[1]
        character = await collection.find_one({"id": character_id})
        if not character:
            return await message.reply_text(
                f"Character with ID {character_id} was not found."
            )

        # Search the configured database channel first. Older records can retain
        # a channel ID from a previous configuration, so check that saved channel
        # only as a fallback. Never trust a stale message ID without validation.
        saved_chat_id = character.get("media_chat_id")
        saved_message_id = character.get("media_message_id")
        archive_channels = []
        for chat_id in (DATABASE_ID, saved_chat_id):
            if chat_id and str(chat_id) not in [str(item) for item in archive_channels]:
                archive_channels.append(chat_id)

        if not archive_channels:
            return await message.reply_text(
                "❌ DATABASE CHANNEL NOT CONFIGURED\n"
                f"Character {character_id} was NOT deleted.\n"
                "The MongoDB record and user collections were left untouched."
            )

        target_chat_id = None
        target_posts = []
        search_errors = []

        for chat_id in archive_channels:
            try:
                matches = await _find_character_archive_posts(
                    client, chat_id, character_id
                )
            except Exception as exc:
                search_errors.append(f"{chat_id}: {str(exc)[:120]}")
                continue

            if matches:
                target_chat_id = chat_id
                target_posts = matches
                break

            # Backward compatibility for old archive captions without an ID
            # marker: accept the saved message only when its media file_id agrees.
            if (
                saved_message_id is not None
                and saved_chat_id is not None
                and str(chat_id) == str(saved_chat_id)
            ):
                try:
                    saved_post = await client.get_messages(
                        chat_id, int(saved_message_id), replies=0
                    )
                    if (
                        saved_post
                        and not getattr(saved_post, "empty", False)
                        and _message_has_saved_media(
                            saved_post, character.get("media_file_id")
                        )
                    ):
                        target_chat_id = chat_id
                        target_posts = [saved_post]
                        break
                except Exception as exc:
                    search_errors.append(
                        f"saved reference {chat_id}/{saved_message_id}: {str(exc)[:120]}"
                    )

        if not target_posts:
            details = (
                f"Saved reference: chat {saved_chat_id or 'unknown'}, "
                f"message {saved_message_id or 'unknown'}."
            )
            if search_errors:
                details += "\nSearch details: " + " | ".join(search_errors)
            return await message.reply_text(
                "❌ DATABASE CHANNEL POST NOT FOUND\n"
                f"Character {character_id} was NOT deleted.\n"
                "No verified archive post for this character was found. "
                "MongoDB and user collections were left untouched.\n"
                + details
            )

        # Delete the verified post(s), then ask Telegram again to confirm they
        # are gone. A successful API response alone is not reported as success.
        deleted_ids = []
        try:
            for post in target_posts:
                await aiogram_bot.delete_message(
                    chat_id=target_chat_id,
                    message_id=int(post.id),
                )
                await asyncio.sleep(0.25)
                verification = await client.get_messages(
                    target_chat_id, int(post.id), replies=0
                )
                if verification and not getattr(verification, "empty", False):
                    raise RuntimeError(
                        f"Telegram returned success but message {post.id} is still present."
                    )
                deleted_ids.append(int(post.id))
        except Exception as exc:
            return await message.reply_text(
                "❌ DATABASE CHANNEL DELETE FAILED\n"
                f"Character {character_id} was NOT deleted.\n"
                "The MongoDB record and user collections were left untouched.\n"
                f"Channel: {target_chat_id} | Message IDs: "
                f"{', '.join(str(post.id) for post in target_posts)}\n"
                f"Telegram/verification error: {str(exc)[:180]}"
            )

        delete_result = await collection.delete_one({"_id": character["_id"]})
        if delete_result.deleted_count != 1:
            return await message.reply_text(
                "⚠️ The channel post was deleted and verified, but the character "
                "record could not be deleted. Please check the character record "
                "before retrying."
            )

        update_result = await user_collection.update_many(
            {"characters.id": character_id},
            {"$pull": {"characters": {"id": character_id}}},
        )

        await message.reply_text(
            f"✅ CHARACTER {character_id} DELETED\n"
            f"📦 Database channel: Verified deletion of {len(deleted_ids)} post(s).\n"
            f"🆔 Message ID(s): {', '.join(str(item) for item in deleted_ids)}\n"
            f"👥 Removed from {update_result.modified_count} user collections."
        )

@app.on_message(filters.command("gupdate"))
@require_power("up")
async def update(client: Client, message: Message):
    try:
        args = message.text.split()
        if len(args) != 4:
            return await message.reply_text(
                "Incorrect format. Use: /gupdate id field new_value"
            )

        character_id = args[1]
        field_to_update = args[2]
        new_value = args[3]

        valid_fields = ["name", "anime", "rarity"]
        if field_to_update not in valid_fields:
            return await message.reply_text(
                f"Invalid field. Choose: {', '.join(valid_fields)}"
            )

        if field_to_update in ["name", "anime"]:
            new_value = new_value.replace("-", " ").title()
        else:
            try:
                new_value = rarity_map[int(new_value)]
            except (KeyError, ValueError):
                return await message.reply_text(
                    "Invalid rarity. Use a valid rarity number from the rarity map."
                )

        result = await collection.update_one(
            {"id": character_id},
            {"$set": {field_to_update: new_value}},
        )
        if result.matched_count == 0:
            return await message.reply_text(
                f"Character ID {character_id} was not found."
            )

        updated_character = await collection.find_one({"id": character_id})
        channel_status = await sync_database_channel_post(
            client, updated_character
        )

        users_cursor = user_collection.find(
            {"characters.id": character_id}
        )
        total_users = await user_collection.count_documents(
            {"characters.id": character_id}
        )

        if total_users == 0:
            return await message.reply_text(
                "✦ CHARACTER UPDATE COMPLETE ✦\n"
                f"Character ID: {character_id}\n"
                "User collections: no copies to update\n"
                f"Database channel: {channel_status}"
            )

        progress_message = await message.reply_text(
            "Updating user collections: 0% completed..."
        )
        updated_count = 0
        next_progress_update = 10

        async for user in users_cursor:
            await user_collection.update_one(
                {"_id": user["_id"], "characters.id": character_id},
                {"$set": {f"characters.$.{field_to_update}": new_value}},
            )
            updated_count += 1

            progress = (updated_count / total_users) * 100
            if progress >= next_progress_update:
                await progress_message.edit_text(
                    f"Updating user collections: {int(progress)}% completed..."
                )
                next_progress_update += 10
                await asyncio.sleep(0.2)

        await progress_message.edit_text(
            "✦ CHARACTER UPDATE COMPLETE ✦\n"
            f"Character ID: {character_id}\n"
            f"User collections: {updated_count}/{total_users}\n"
            f"Database channel: {channel_status}"
        )
    except Exception as exc:
        await message.reply_text(f"Error: {str(exc)}")


@app.on_message(filters.command("maxupdate"))
@require_power("up")
async def update_multiple(client: Client, message: Message):
    try:
        args = message.text.split()
        if len(args) < 4:
            return await message.reply_text(
                "Incorrect format. Use: /maxupdate id1,id2,id3 field new_value"
            )

        character_ids = [item.strip() for item in args[1].split(",") if item.strip()]
        if not character_ids:
            return await message.reply_text("Please provide at least one character ID.")

        field_to_update = args[2]
        new_value = " ".join(args[3:])

        valid_fields = ["name", "anime", "rarity"]
        if field_to_update not in valid_fields:
            return await message.reply_text(
                f"Invalid field. Choose: {', '.join(valid_fields)}"
            )

        if field_to_update in ["name", "anime"]:
            new_value = new_value.replace("-", " ").title()
        else:
            try:
                new_value = rarity_map[int(new_value)]
            except (KeyError, ValueError):
                return await message.reply_text(
                    "Invalid rarity. Use a valid rarity number from the rarity map."
                )

        total_characters = len(character_ids)
        updated_characters = 0
        total_users_updated = 0
        channel_synced = 0
        channel_failed = 0

        progress_message = await message.reply_text(
            "Updating characters: 0% completed..."
        )
        next_progress_update = 10

        for index, character_id in enumerate(character_ids, start=1):
            result = await collection.update_one(
                {"id": character_id},
                {"$set": {field_to_update: new_value}},
            )

            if result.matched_count:
                updated_character = await collection.find_one(
                    {"id": character_id}
                )
                channel_status = await sync_database_channel_post(
                    client, updated_character
                )
                if channel_status.startswith("channel sync failed") or channel_status.startswith("could not edit"):
                    channel_failed += 1
                else:
                    channel_synced += 1

                users_cursor = user_collection.find(
                    {"characters.id": character_id}
                )
                async for user in users_cursor:
                    await user_collection.update_one(
                        {"_id": user["_id"], "characters.id": character_id},
                        {"$set": {f"characters.$.{field_to_update}": new_value}},
                    )
                    total_users_updated += 1

                updated_characters += 1

            progress = (index / total_characters) * 100
            if progress >= next_progress_update:
                await progress_message.edit_text(
                    f"Updating characters: {int(progress)}% completed..."
                )
                next_progress_update += 10
                await asyncio.sleep(0.2)

        await progress_message.edit_text(
            "✦ BULK UPDATE COMPLETE ✦\n"
            f"Characters updated: {updated_characters}/{total_characters}\n"
            f"User copies updated: {total_users_updated}\n"
            f"Database channel synced: {channel_synced}\n"
            f"Channel sync failed: {channel_failed}"
        )
    except Exception as exc:
        await message.reply_text(f"Error: {str(exc)}")


# Replace a character's media with a Telegram-hosted copy.
@app.on_message(filters.command("gmedia"))
@require_power("up")
async def update_character_media(client: Client, message: Message):
    reply = message.reply_to_message
    args = message.text.split()

    if len(args) != 2 or not reply or not (
        reply.photo or reply.video or reply.document or reply.animation
    ):
        return await message.reply_text(
            "Reply to a photo/video/document/animation and use: /gmedia character_id"
        )

    character_id = args[1]
    character = await collection.find_one({"id": character_id})
    if not character:
        return await message.reply_text("Character not found.")

    status = await message.reply_text("⏳ Saving media to Telegram...")
    try:
        saved = await client.copy_message(
            chat_id=DATABASE_ID,
            from_chat_id=reply.chat.id,
            message_id=reply.id,
            caption=f"Character media archive | ID: {character_id} | {character.get('name', '')}",
        )

        media_type = None
        file_id = None
        for kind in ("photo", "video", "document", "animation"):
            media = getattr(saved, kind, None)
            if media:
                media_type, file_id = kind, media.file_id
                break
        if not file_id:
            raise ValueError("Telegram did not return a supported media reference.")

        await collection.update_one(
            {"id": character_id},
            {"$set": {
                "media_file_id": file_id,
                "media_type": media_type,
                "media_chat_id": DATABASE_ID,
                "media_message_id": saved.id,
            }},
        )

        await user_collection.update_many(
            {"characters.id": character_id},
            {"$set": {
                "characters.$[character].media_file_id": file_id,
                "characters.$[character].media_type": media_type,
                "characters.$[character].media_chat_id": DATABASE_ID,
                "characters.$[character].media_message_id": saved.id,
            }},
            array_filters=[{"character.id": character_id}],
        )

        await status.edit_text(
            f"✅ Character {character_id} media updated and stored on Telegram."
        )
    except Exception as exc:
        await status.edit_text(f"❌ Media update failed: {exc}")
