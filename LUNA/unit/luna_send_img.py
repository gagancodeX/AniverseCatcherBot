# ==========================================
# Creator: Adam
# Project: LunaCatcherBot
# ==========================================

from LUNA import *
from LUNA.unit.luna_rarity import rarity_map
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

# Use the canonical rarity labels so the spawn query always matches
# the values saved by uploads and the database rarity migration.
RARITY_WEIGHTS = {
    rarity_map[1]: (40, True),   # Origin
    rarity_map[2]: (20, True),   # Phantom
    rarity_map[3]: (12, True),   # Vanguard
    rarity_map[4]: (10, True),   # Arcane
    rarity_map[5]: (8, True),    # Zenith
    rarity_map[6]: (6, True),    # Ethereal
    rarity_map[7]: (4, True),    # Mythic
    rarity_map[8]: (3, False),   # Summer event
    rarity_map[9]: (2.5, True),  # Divine
    rarity_map[10]: (2, False), # Winter event
    rarity_map[11]: (2, False), # Valentine event
    rarity_map[12]: (1.8, False), # Halloween event
    rarity_map[13]: (1.5, False), # Christmas event
    rarity_map[14]: (1.2, True), # Infinity
    rarity_map[15]: (1, True),   # Cosplay
    rarity_map[16]: (0.8, False), # Event exclusive
    rarity_map[18]: (0.5, False), # Cinematic
    rarity_map[19]: (0.5, True), # Radiant
    rarity_map[20]: (2, False),  # Rainfall event
}


async def send_image(update: Update, context: CallbackContext) -> None:
    chat_id = update.effective_chat.id

    # Only canonical, spawn-enabled rarity labels are eligible.
    allowed_rarities = [
        rarity for rarity, (weight, enabled) in RARITY_WEIGHTS.items()
        if enabled and weight > 0
    ]

    # Fetch characters that have an approved rarity and a usable media reference.
    all_characters = list(await collection.find({
        "rarity": {"$in": allowed_rarities},
        "$or": [
            {"media_file_id": {"$exists": True, "$nin": [None, ""]}},
            {"img_url": {"$exists": True, "$nin": [None, ""]}},
            {"vid_url": {"$exists": True, "$nin": [None, ""]}},
        ],
    }).to_list(length=None))

    if not all_characters:
        rarity_count = await collection.count_documents(
            {"rarity": {"$in": allowed_rarities}}
        )
        total_count = await collection.count_documents({})
        LOGGER("LUNA.SPAWN").warning(
            "Character spawn skipped for group %s: no eligible media records "
            "(total_records=%s, allowed_rarity_records=%s, allowed_rarities=%s). "
            "Check archive rarity labels and media fields.",
            chat_id,
            total_count,
            rarity_count,
            allowed_rarities,
        )
        return

    # Filter characters with valid rarity
    available_characters = [
        c for c in all_characters 
        if 'id' in c and c.get('rarity') is not None and RARITY_WEIGHTS.get(c['rarity'], (0, False))[1]
    ]

    if not available_characters:
        LOGGER("LUNA.SPAWN").warning(
            "Character spawn skipped for group %s: matched archive records do not "
            "contain a valid character ID and enabled rarity.",
            chat_id,
        )
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
