# ==========================================
# Creator: Adam
# Project: LunaCatcherBot
# ==========================================

import asyncio
from datetime import datetime, timedelta, timezone
from pyrogram import Client, filters, enums
from pyrogram.types import Message
from LUNA import collection, app, user_collection, require_power, DATABASE_ID, bot as aiogram_bot, database_admin_client
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


async def delete_database_channel_post(client, chat_id, message_id):
    """
    Use an authorized human-admin session for older channel posts.
    The bot session remains the fallback for posts inside its deletion window.
    """
    message_id = int(message_id)
    existing_message = await client.get_messages(chat_id, message_id)
    if (
        not existing_message
        or getattr(existing_message, "empty", False)
        or not getattr(existing_message, "id", None)
    ):
        return "Database channel post was already removed."

    sent_at = getattr(existing_message, "date", None)
    is_older_than_48h = False
    if sent_at:
        if sent_at.tzinfo is None:
            sent_at = sent_at.replace(tzinfo=timezone.utc)
        age = datetime.now(timezone.utc) - sent_at.astimezone(timezone.utc)
        is_older_than_48h = age >= timedelta(hours=48)

    if database_admin_client and database_admin_client.is_connected:
        admin_me = await database_admin_client.get_me()
        admin_member = await database_admin_client.get_chat_member(chat_id, admin_me.id)
        admin_rights = getattr(admin_member, "privileges", None)
        status_text = str(getattr(admin_member, "status", "")).lower()
        can_delete = status_text.endswith("administrator") and bool(
            getattr(admin_rights, "can_delete_messages", False)
        )
        if not can_delete:
            raise RuntimeError(
                "DATABASE_ADMIN_SESSION_NOT_AUTHORIZED: configured user account "
                "must be a channel administrator with Delete Messages permission."
            )
        await database_admin_client.delete_messages(
            chat_id=chat_id,
            message_ids=message_id,
        )
        return "Database channel post deleted using the authorized admin account."

    if is_older_than_48h:
        raise RuntimeError(
            "OLD_POST_NEEDS_ADMIN_SESSION: this post is older than 48 hours. "
            "Set DATABASE_ADMIN_SESSION in Render to a human Telegram account "
            "that is an administrator of the database channel with Delete Messages."
        )

    bot_api_error = None
    try:
        await aiogram_bot.delete_message(chat_id=chat_id, message_id=message_id)
        return "Database channel post deleted (Bot API)."
    except Exception as exc:
        bot_api_error = exc

    try:
        await client.delete_messages(chat_id=chat_id, message_ids=message_id)
        return "Database channel post deleted (Pyrogram bot fallback)."
    except Exception as pyrogram_error:
        raise RuntimeError(
            "Bot API: "
            f"{str(bot_api_error)[:100]} | "
            "Pyrogram bot: "
            f"{str(pyrogram_error)[:100]}"
        ) from pyrogram_error


async def get_database_delete_diagnostics(client, chat_id, message_id):
    """Return safe, actionable diagnostics for a failed archive-post deletion."""
    lines = []
    me = None

    try:
        me = await client.get_me()
        member = await client.get_chat_member(chat_id, me.id)
        privileges = getattr(member, "privileges", None)
        lines.append(
            "Bot channel role: "
            f"{getattr(member, 'status', 'unknown')}; "
            f"Post Messages: {getattr(privileges, 'can_post_messages', 'n/a')}; "
            f"Delete Messages: {getattr(privileges, 'can_delete_messages', 'n/a')}"
        )
    except Exception as exc:
        lines.append(f"Bot admin check failed: {str(exc)[:110]}")

    try:
        target = await client.get_messages(chat_id, int(message_id))
        if not target or getattr(target, "empty", False):
            lines.append("Saved channel message: not found / inaccessible")
        else:
            sender = getattr(target, "from_user", None)
            sender_chat = getattr(target, "sender_chat", None)
            if sender:
                sender_text = f"user {sender.id}"
                if me and sender.id == me.id:
                    sender_text += " (this bot)"
            elif sender_chat:
                sender_text = f"channel/chat {sender_chat.id}"
            else:
                sender_text = "not exposed by Telegram"

            media_kind = next(
                (
                    kind for kind in ("photo", "video", "document", "animation")
                    if getattr(target, kind, None)
                ),
                "text/other",
            )
            sent_at = getattr(target, "date", None)
            lines.append(
                "Saved channel message: found; "
                f"sender: {sender_text}; type: {media_kind}; "
                f"date: {sent_at.isoformat() if sent_at else 'unknown'}"
            )
    except Exception as exc:
        lines.append(f"Saved message lookup failed: {str(exc)[:110]}")

    return "\n".join(lines)


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

        # Delete the exact media post saved during upload. Do this before
        # removing MongoDB data so permission/API errors do not orphan a record.
        archive_message_id = character.get("media_message_id")
        channel_status = "No saved database-channel message reference."
        if archive_message_id is not None:
            archive_chat_id = character.get("media_chat_id") or DATABASE_ID
            if not archive_chat_id:
                return await message.reply_text(
                    "❌ Cannot delete this character: its database channel is not configured. "
                    "The character record was left untouched."
                )

            try:
                channel_status = await delete_database_channel_post(
                    client,
                    archive_chat_id,
                    archive_message_id,
                )
            except Exception as exc:
                if str(exc).startswith("ARCHIVE_POST_TOO_OLD:"):
                    diagnostics = await get_database_delete_diagnostics(
                        client,
                        archive_chat_id,
                        archive_message_id,
                    )
                    return await message.reply_text(
                        "⏳ ARCHIVE POST IS OLDER THAN 48 HOURS\n"
                        f"Character {character_id} and all user copies are still safe.\n"
                        "Telegram does not allow bot accounts to delete this old post, even with admin rights.\n"
                        "Please delete only this character's archive post manually in the database channel, "
                        "then run /gdelete "
                        f"{character_id} again. The bot will detect that the post is already gone "
                        "and finish the database cleanup.\n\n"
                        f"📅 {str(exc).replace('ARCHIVE_POST_TOO_OLD: ', '')}\n\n"
                        "🔎 LIVE DIAGNOSTICS\n"
                        f"{diagnostics}"
                    )

                diagnostics = await get_database_delete_diagnostics(
                    client,
                    archive_chat_id,
                    archive_message_id,
                )
                return await message.reply_text(
                    "❌ DATABASE CHANNEL DELETE FAILED\n"
                    f"Character {character_id} was NOT deleted.\n"
                    "The MongoDB record and user collections were left untouched.\n"
                    f"Delete errors: {str(exc)[:220]}\n"
                    "Older posts require DATABASE_ADMIN_SESSION from a human channel admin.\n\n"
                    "🔎 LIVE DIAGNOSTICS\n"
                    f"{diagnostics}"
                )

        delete_result = await collection.delete_one({"_id": character["_id"]})
        if delete_result.deleted_count != 1:
            return await message.reply_text(
                "⚠️ The database-channel post was removed, but the character record "
                "could not be deleted. Please check the character record before retrying."
            )

        update_result = await user_collection.update_many(
            {"characters.id": character_id},
            {"$pull": {"characters": {"id": character_id}}},
        )

        await message.reply_text(
            f"✅ CHARACTER {character_id} DELETED\n"
            f"📦 Database channel: {channel_status}\n"
            f"👥 Removed from {update_result.modified_count} user collections."
        )
    except Exception as exc:
        await message.reply_text(f"Error: {str(exc)}")


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
