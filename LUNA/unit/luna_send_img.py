# ==========================================
# Creator: Adam
# Project: LunaCatcherBot
# ==========================================

from LUNA import *
import random
import asyncio
import time
from telegram import Update
from telegram.ext import CallbackContext
from LUNA import bot_client
from LUNA.unit.luna_watermark import get_watermarked_photo

log = "-1002155818429"

async def delete_message(chat_id, message_id, context):
    await asyncio.sleep(300)  # 5 minutes (300 seconds)
    try:
        await context.bot.delete_message(chat_id, message_id)
    except Exception as e:
        print(f"Error deleting message: {e}")

RARITY_WEIGHTS = {
    "⚪️ Common": (40, True),             # Most frequent
    "🟣 Rare": (20, True),               # Less frequent than Common
    "🟡 Legendary": (12, True),          # Rare but obtainable
    "🟢 Medium": (10, True),             # Less common than Rare
    "💮 Special Edition": (8, True),     # Very rare
    "🔮 Limited Edition": (6, True),     # Extremely rare
    "💸 Premium Edition": (4, True),     # Ultra-rare
    "🌤 Summer": (3, False),             # Seasonal rarity
    "🎐 Celestial": (2.5, True),         # Cosmic themed rarity
    "❄️ Winter": (2, False),             # Winter themed rarity
    "💝 Valentine": (2, False),          # Valentine's rarity
    "🎃 Halloween": (1.8, False),        # Halloween themed rarity
    "🎄 Christmas Special": (1.5, False),# Christmas themed rarity
    "🪐 Omniversal": (1.2, True),        # Very rare cosmic rarity
    "🎭 Cosplay Master 🎭": (1, True),   # Exclusive cosplay edition
    "🧧 Events": (0.8, False),           # Limited-time event rarity
    "🍑 Echhi": (0.6, True),             # Adult-themed rarity
    "🎗️ AMV Edition": (0.5, False),     # AMV special rarity
    "🌧 Rainy": (2.0, False),            # Rainy event rarity
}


async def send_image(update: Update, context: CallbackContext) -> None:
    chat_id = update.effective_chat.id

    # Fetch all characters from MongoDB
    all_characters = list(await collection.find({
        "rarity": {"$in": [k for k, v in RARITY_WEIGHTS.items() if v[1]]},
        "$or": [
            {"media_file_id": {"$exists": True, "$ne": ""}},
            {"img_url": {"$exists": True, "$ne": ""}},
            {"vid_url": {"$exists": True, "$ne": ""}},
        ],
    }).to_list(length=None))

    if not all_characters:
        await context.bot.send_message(chat_id, "No characters found with allowed rarities in the database.")
        return

    # Filter characters with valid rarity
    available_characters = [
        c for c in all_characters 
        if 'id' in c and c.get('rarity') is not None and RARITY_WEIGHTS.get(c['rarity'], (0, False))[1]
    ]

    if not available_characters:
        await context.bot.send_message(chat_id, "No available characters with the allowed rarities.")
        return

    # Weighted random selection
    cumulative_weights = []
    cumulative_weight = 0
    for character in available_characters:
        cumulative_weight += RARITY_WEIGHTS.get(character.get('rarity'), (1, False))[0]
        cumulative_weights.append(cumulative_weight)

    rand = random.uniform(0, cumulative_weight)
    selected_character = None
    for i, character in enumerate(available_characters):
        if rand <= cumulative_weights[i]:
            selected_character = character
            break

    if not selected_character:
        selected_character = random.choice(available_characters)

    # Clear first_correct_guesses if exists
    last_characters[chat_id] = selected_character
    last_characters[chat_id]['timestamp'] = time.time()
    
    if chat_id in first_correct_guesses:
        del first_correct_guesses[chat_id]

    caption = f"""✨ A {selected_character['rarity']} Character Appears! ✨
🔍 Use /guess to claim this mysterious character!
💫 Hurry, before someone else snatches them!"""

    # New characters use Telegram file_id. Legacy URL records remain supported.
    media_file_id = selected_character.get("media_file_id")
    media_type = selected_character.get("media_type", "photo")

    if media_file_id:
        if media_type == "video":
            sent_message = await context.bot.send_video(
                chat_id=chat_id, video=media_file_id,
                caption=caption, parse_mode="Markdown"
            )
        elif media_type == "document":
            watermarked_photo = None if selected_character.get("watermarked") else await get_watermarked_photo(bot_client, media_file_id)
            if watermarked_photo:
                sent_message = await context.bot.send_photo(
                    chat_id=chat_id, photo=watermarked_photo,
                    caption=caption, parse_mode="Markdown"
                )
            else:
                sent_message = await context.bot.send_document(
                    chat_id=chat_id, document=media_file_id,
                    caption=caption, parse_mode="Markdown"
                )
        elif media_type == "animation":
            sent_message = await context.bot.send_animation(
                chat_id=chat_id, animation=media_file_id,
                caption=caption, parse_mode="Markdown"
            )
        else:
            watermarked_photo = None if selected_character.get("watermarked") else await get_watermarked_photo(bot_client, media_file_id)
            sent_message = await context.bot.send_photo(
                chat_id=chat_id, photo=watermarked_photo or media_file_id,
                caption=caption, parse_mode="Markdown"
            )
    elif selected_character.get("vid_url"):
        sent_message = await context.bot.send_video(
            chat_id=chat_id, video=selected_character["vid_url"],
            caption=caption, parse_mode="Markdown"
        )
    else:
        image_reference = selected_character.get("img_url")
        watermarked_photo = None if selected_character.get("watermarked") else await get_watermarked_photo(bot_client, image_reference)
        sent_message = await context.bot.send_photo(
            chat_id=chat_id, photo=watermarked_photo or image_reference,
            caption=caption, parse_mode="Markdown"
        )

    # Keep the spawn message ID for the /guess retry button.
    last_characters[chat_id]["message_id"] = sent_message.message_id

    # Schedule message deletion after 5 minutes
    asyncio.create_task(delete_message(chat_id, sent_message.message_id, context))
