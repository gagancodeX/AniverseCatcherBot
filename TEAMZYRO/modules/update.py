# ==========================================
# Creator: Adam
# Project: AniverseCatcherBot
# ==========================================

from pyrogram import Client, filters
from pyrogram.types import Message
from pymongo import ReturnDocument
from TEAMZYRO import collection, app, user_collection, require_power, DATABASE_ID
from TEAMZYRO.unit.zyro_rarity import rarity_map  # Importing rarity_map

@app.on_message(filters.command("gdelete"))
@require_power("del")
async def delete_handler(client, message):
    try:
        # Extract arguments from the command
        args = message.text.split()
        if len(args) != 2:
            await message.reply_text("Incorrect format... Please use: /gdelete ID")
            return

        character_id = args[1]

        # Find and delete the character from the main collection
        character = await collection.find_one_and_delete({'id': character_id})
        if character:
            # Remove the character from all users' collections
            update_result = await user_collection.update_many(
                {'characters.id': character_id},
                {'$pull': {'characters': {'id': character_id}}}
            )

            await message.reply_text(
                f"Character with ID {character_id} deleted successfully from the database.\n"
                f"Removed from {update_result.modified_count} user collections."
            )
        else:
            await message.reply_text(f"Character with ID {character_id} not found in the database.")
    except Exception as e:
        await message.reply_text(f"Error: {str(e)}")

import asyncio

@app.on_message(filters.command("gupdate"))
@require_power("up")
async def update(client: Client, message: Message):
    try:
        args = message.text.split()
        if len(args) != 4:
            await message.reply_text('Incorrect format. Please use: /gupdate id field new_value')
            return

        character_id = args[1]
        field_to_update = args[2]
        new_value = args[3]

        # Validate field
        valid_fields = ['name', 'anime', 'rarity']
        if field_to_update not in valid_fields:
            await message.reply_text(f'Invalid field. Please use one of the following: {", ".join(valid_fields)}')
            return

        # Process the new value
        if field_to_update in ['name', 'anime']:
            new_value = new_value.replace('-', ' ').title()
        elif field_to_update == 'rarity':
            try:
                new_value = rarity_map[int(new_value)]  # Use rarity_map
            except (KeyError, ValueError):
                await message.reply_text('Invalid rarity. Please use a valid number between 1-12 for rarity.')
                return

        # Update the character in the main collection
        result = await collection.update_one({'id': character_id}, {'$set': {field_to_update: new_value}})
        if result.modified_count == 0:
            await message.reply_text('Character not found or no changes made.')
            return

        # Fetch users who have the character
        users_cursor = user_collection.find({'characters.id': character_id})
        total_users = await user_collection.count_documents({'characters.id': character_id})

        if total_users == 0:
            await message.reply_text('sᴜᴄᴄᴇssғᴜʟʟʏ ᴜᴘᴅᴀᴛᴇ ✅')
            return

        # Send initial message for progress
        progress_message = await message.reply_text('Updating: 0% completed...')
        updated_count = 0
        progress_threshold = 10  # Show progress every 10%
        next_progress_update = progress_threshold

        async for user in users_cursor:
            await user_collection.update_one(
                {'_id': user['_id'], 'characters.id': character_id},
                {'$set': {f'characters.$.{field_to_update}': new_value}}
            )
            updated_count += 1

            # Show progress at every 10% interval
            progress = (updated_count / total_users) * 100
            if progress >= next_progress_update:
                await progress_message.edit_text(f'Updating: {int(progress)}% completed...')
                next_progress_update += progress_threshold
                await asyncio.sleep(1)  # Add a 1-second delay

        # Final message with the total count
        await progress_message.edit_text('Updating: 100% completed.')
        await message.reply_text(f'sᴜᴄᴄᴇssғᴜʟʟʏ ᴜᴘᴅᴀᴛᴇ ✅ \nTotal users updated: {updated_count}/{total_users}')

    except Exception as e:
        await message.reply_text(f'Error: {str(e)}')

import time

@app.on_message(filters.command("maxupdate"))
@require_power("up")
async def update_multiple(client: Client, message: Message):
    try:
        args = message.text.split()
        if len(args) < 4:
            await message.reply_text('Incorrect format. Use: /maxupdate id1,id2,id3 field new_value')
            return

        # Parse multiple character IDs
        character_ids = args[1].split(',')
        field_to_update = args[2]
        new_value = ' '.join(args[3:])

        # Validate field
        valid_fields = ['name', 'anime', 'rarity']
        if field_to_update not in valid_fields:
            await message.reply_text(f'Invalid field. Use one of: {", ".join(valid_fields)}')
            return

        # Process the new value
        if field_to_update in ['name', 'anime']:
            new_value = new_value.replace('-', ' ').title()
        elif field_to_update == 'rarity':
            try:
                new_value = rarity_map[int(new_value)]  # Use rarity_map
            except (KeyError, ValueError):
                await message.reply_text('Invalid rarity. Use a valid number between 1-12 for rarity.')
                return

        # Track total updates
        total_characters = len(character_ids)
        updated_characters = 0
        total_users_updated = 0

        # Initial progress message
        progress_message = await message.reply_text('Updating: 0% completed...')
        next_progress_update = 10  # Update progress every 10%

        for i, character_id in enumerate(character_ids, start=1):
            # Update the character in the main collection
            result = await collection.update_one({'id': character_id}, {'$set': {field_to_update: new_value}})
            if result.modified_count == 0:
                continue

            # Fetch users with the character
            users_cursor = user_collection.find({'characters.id': character_id})
            async for user in users_cursor:
                await user_collection.update_one(
                    {'_id': user['_id'], 'characters.id': character_id},
                    {'$set': {f'characters.$.{field_to_update}': new_value}}
                )
                total_users_updated += 1

            updated_characters += 1

            # Update progress percentage
            progress = (i / total_characters) * 100
            if progress >= next_progress_update:
                await progress_message.edit_text(f'Updating: {int(progress)}% completed...')
                next_progress_update += 10
                await asyncio.sleep(1)

        # Final update after all characters
        await progress_message.edit_text('Updating: 100% completed.')
        await message.reply_text(
            f'sᴜᴄᴄᴇssғᴜʟʟʏ ᴜᴘᴅᴀᴛᴇ ✅ \nTotal characters updated: {updated_characters}/{total_characters}. '
            f'Total users updated: {total_users_updated}.'
        )

    except Exception as e:
        await message.reply_text(f'Error: {str(e)}')



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

        if saved.photo:
            media_type, file_id = "photo", saved.photo.file_id
        elif saved.video:
            media_type, file_id = "video", saved.video.file_id
        elif saved.document:
            media_type, file_id = "document", saved.document.file_id
        elif saved.animation:
            media_type, file_id = "animation", saved.animation.file_id
        else:
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

        await status.edit_text(f"✅ Character {character_id} media updated and stored on Telegram.")
    except Exception as exc:
        await status.edit_text(f"❌ Media update failed: {exc}")
