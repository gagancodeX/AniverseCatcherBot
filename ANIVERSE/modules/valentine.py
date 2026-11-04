# ==========================================
# Creator: Adam
# Project: AniverseCatcherBot
# ==========================================

import asyncio
from pyrogram import Client, filters, types as t
from pyrogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from datetime import datetime, timedelta
from ANIVERSE import bot_client as bot
from ANIVERSE import user_collection, collection, FORCE_JOIN as chat, FORCE_JOIN_LINK

async def get_unique_characters(user_id, target_rarities):
    try:
        user_data = await user_collection.find_one({'id': user_id}, {'characters.id': 1})
        claimed_ids = [char['id'] for char in user_data.get('characters', [])] if user_data else []

        pipeline = [
            {'$match': {'rarity': {'$in': target_rarities}, 'id': {'$nin': claimed_ids}}},
            {'$sample': {'size': 1}}  # Randomly sample one character
        ]
        cursor = collection.aggregate(pipeline)
        characters = await cursor.to_list(length=None)
        return characters if characters else []
    except Exception as e:
        print(f"Error retrieving unique characters: {e}")
        return []

# Helper function to format time
@bot.on_message(filters.command(["valentine"]))
async def valentine(_, message: t.Message):
    try:
        user_id = message.from_user.id
        mention = message.from_user.mention

        if str(message.chat.id) != str(chat):
            join_button = InlineKeyboardMarkup([
                [InlineKeyboardButton("Join Here", url=FORCE_JOIN_LINK)]
            ])
            return await message.reply_text(
                "✦ ANIVERSE · EVENT GATE ✦\nJoin the channel to unlock the event character.",
                reply_markup=join_button
            )

        # Get current date
        today = datetime.utcnow().date()
        start_date = datetime(today.year, 2, 7).date()
        end_date = datetime(today.year, 2, 14).date()

        # Check if today's date is between Feb 7 and Feb 14
        if not (start_date <= today <= end_date):
            return await message.reply_text("✦ ANIVERSE · VALENTINE EVENT ✦\n❌ Claims are available from 7–14 February only.")

        # Fetch user data from database
        user_data = await user_collection.find_one({'id': user_id})
        if not user_data:
            user_data = {
                'id': user_id,
                'username': message.from_user.username,
                'characters': [],
                'last_valentine_reward': None
            }
            await user_collection.insert_one(user_data)

        last_claimed_date = user_data.get('last_valentine_reward')
        if last_claimed_date:
            last_claimed_date = last_claimed_date.replace(tzinfo=None)
            if last_claimed_date.year == today.year:
                return await message.reply_text("✦ ANIVERSE · VALENTINE EVENT ✦\n💝 Your yearly Valentine character has already been claimed.")

        # Fetch a unique Valentine character
        valentine_characters = await get_unique_characters(user_id, target_rarities=['💝 Valentine'])
        if not valentine_characters:
            return await message.reply_text("✦ ANIVERSE · VALENTINE EVENT ✦\nNo unclaimed Valentine characters are available.")

        # Update user record
        await user_collection.update_one(
            {'id': user_id},
            {
                '$push': {'characters': {'$each': valentine_characters}},
                '$set': {'last_valentine_reward': datetime.utcnow()}
            }
        )

        # Send the character from Telegram storage, with legacy URL fallback.
        for character in valentine_characters:
            caption = (
                f"💖 **Happy Valentine's Day!** {mention}\n\n"
                f"🌟 **Name**: `{character['name']}`  \n"
                f"💖 **Rarity**: `{character['rarity']}`  \n"
                f"📺 **Anime**: `{character['anime']}`  \n"
                f"🆔 **ID**: `{character['id']}`  \n\n"
                f"💝 **A special addition to your character vault.** 💝"
            )
            media_file_id = character.get("media_file_id")
            media_type = character.get("media_type", "photo")

            if media_file_id:
                if media_type == "video":
                    await message.reply_video(media_file_id, caption=caption)
                elif media_type == "document":
                    await message.reply_document(media_file_id, caption=caption)
                elif media_type == "animation":
                    await message.reply_animation(media_file_id, caption=caption)
                else:
                    await message.reply_photo(media_file_id, caption=caption)
            elif character.get("vid_url"):
                await message.reply_video(character["vid_url"], caption=caption)
            elif character.get("img_url"):
                await message.reply_photo(character["img_url"], caption=caption)
            else:
                await message.reply_text(caption)

    except Exception as e:
        print(f"Error in valentine command: {e}")
        await message.reply_text("✦ ANIVERSE · SYSTEM NOTICE ✦\nThe event could not be completed right now.")
