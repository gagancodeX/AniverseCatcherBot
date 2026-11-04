# ==========================================
# Creator: MrZyro
# Telegram: @MrZyro_dev
# GitHub: https://github.com/MrZyro
# ==========================================

import asyncio
from pyrogram import Client, filters, types as t
from pyrogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from datetime import datetime, timedelta
from TEAMZYRO import ZYRO as bot
from TEAMZYRO import user_collection, collection, user_nguess_progress, user_guess_progress, FORCE_JOIN as chat, FORCE_JOIN_LINK

claim_lock = {}

# Helper function to format time remaining until next claim
async def format_time_delta(delta):
    seconds = delta.total_seconds()
    hours, remainder = divmod(seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{int(hours)}h {int(minutes)}m {int(seconds)}s" if hours or minutes or seconds else "0s"

# Fetch unique characters not yet claimed by the user
async def get_unique_characters(user_id, target_rarities=['⚪️ Common', '🟡 Legendary', '🟢 Medium']):
    try:
        # Get the already claimed character ids
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

# Command handler for the daily claim (mclaim)
@bot.on_message(filters.command(["hclaim", "claim"]))
async def mclaim(_, message: t.Message):
    user_id = message.from_user.id
    mention = message.from_user.mention
    today = datetime.utcnow().date()

    # Prevent multiple claims at the same time
    if user_id in claim_lock:
        await message.reply_text("Your claim request is already being processed. Please wait.")
        return

    claim_lock[user_id] = True
    try:
        # Ensure the user is in the correct chat
        if str(message.chat.id) != str(chat):
            join_button = InlineKeyboardMarkup([[InlineKeyboardButton("Join Here", url=FORCE_JOIN_LINK)]])
            return await message.reply_text(
                "🔔 ᴊᴏɪɴ ᴛʜᴇ ᴄʜᴀɴɴᴇʟ ᴛᴏ ᴄʟᴀɪᴍ ʏᴏᴜʀ ᴅᴀɪʟʏ ᴄʜᴀʀᴀᴄᴛᴇʀ 🔔",
                reply_markup=join_button
            )

        # Fetch user data or create a new user if not found
        user_data = await user_collection.find_one({'id': user_id})
        if not user_data:
            user_data = {
                'id': user_id,
                'username': message.from_user.username,
                'characters': [],
                'last_daily_reward': None
            }
            await user_collection.insert_one(user_data)

        # Check if the user has already claimed today
        last_claimed_date = user_data.get('last_daily_reward')
        if last_claimed_date and last_claimed_date.date() == datetime.utcnow().date():
            remaining_time = timedelta(days=1) - (datetime.utcnow() - last_claimed_date)
            formatted_time = await format_time_delta(remaining_time)
            return await message.reply_text(f"⏳ *You've already claimed today! Next reward in:* `{formatted_time}`")

        # Fetch a unique character for the user
        unique_characters = await get_unique_characters(user_id)
        if not unique_characters:
            return await message.reply_text("🚫 *No characters available to claim at the moment. Please try again later.*")

        # Update user data with the new character and claim time
        await user_collection.update_one(
            {'id': user_id},
            {'$push': {'characters': {'$each': unique_characters}}, '$set': {'last_daily_reward': datetime.utcnow()}}
        )

        # Send character media from Telegram file_id, with legacy URL fallback.
        for character in unique_characters:
            caption = (
                f"🎊 ℂ𝕆ℕ𝔾ℝ𝔸𝕋𝕌𝕃𝔸𝕋𝕀𝕆ℕ𝕊 {mention}! 🎉\n"
                f"🌸 𝐍𝐚𝐦𝐞 : {character['name']}\n"
                f"🌈 𝐑𝐚𝐫𝐢𝐭𝐲 : {character['rarity']}\n"
                f"⛩️ 𝐀𝐧𝐢𝐦𝐞 : {character['anime']}\n"
                f"💫 ℭ𝔬𝔪𝔢 𝔟𝔞𝔠𝔨 𝔱𝔬𝔪𝔬𝔯𝔯𝔬𝔴 𝔣𝔬𝔯 𝔞𝔫𝔬𝔱𝔥𝔢𝔯 𝔠𝔩𝔞𝔦𝔪!"
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
        print(f"Error in mclaim command: {e}")
        await message.reply_text("❌ *An unexpected error occurred.*")

    finally:
        # Remove the user from claim lock to allow future claims
        claim_lock.pop(user_id, None)
