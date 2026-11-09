# ==========================================
# Creator: Adam
# Project: LunaCatcherBot
# ==========================================

from pyrogram import Client, filters
from pyrogram.types import InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery
from pymongo import MongoClient
from LUNA import app, user_collection

@app.on_message(filters.command("fav"))
async def fav_command(client, message):
    user_id = message.from_user.id

    if len(message.command) < 2:
        await message.reply_text("✦ 𝗙𝗔𝗩𝗢𝗨𝗥𝗜𝗧𝗘 𝗦𝗘𝗧𝗨𝗣 ✦\n\nProvide a character ID: `/fav 01`")
        return

    character_id = message.command[1]

    # Fetch user from MongoDB
    user = await user_collection.find_one({"id": user_id})
    if not user:
        await message.reply_text("Your Character Vault is empty. Catch a character before adding favourites. ✧")
        return

    # Find character in user's collection
    character = next((c for c in user.get("characters", []) if c["id"] == character_id), None)
    if not character:
        await message.reply_text("That character isn't in your vault yet. Use /harem to view your collection. ✧")
        return

    keyboard = InlineKeyboardMarkup(
        [[
            InlineKeyboardButton("✦ SET FAVOURITE", callback_data=f"fav_yes_{character_id}_{user_id}"),
            InlineKeyboardButton("↩ CANCEL", callback_data="fav_no")
        ]]
    )

    media_file_id = character.get("media_file_id")
    media_type = character.get("media_type", "photo")

    if media_file_id:
        if media_type == "video":
            await message.reply_video(media_file_id, caption=f"✦ 𝗔𝗡𝗜𝗩𝗘𝗥𝗦𝗘 · 𝗙𝗔𝗩𝗢𝗨𝗥𝗜𝗧𝗘\n\n{character['name']}\n\nSet this character as your featured favourite?", reply_markup=keyboard)
        elif media_type == "document":
            await message.reply_document(media_file_id, caption=f"✦ 𝗔𝗡𝗜𝗩𝗘𝗥𝗦𝗘 · 𝗙𝗔𝗩𝗢𝗨𝗥𝗜𝗧𝗘\n\n{character['name']}\n\nSet this character as your featured favourite?", reply_markup=keyboard)
        elif media_type == "animation":
            await message.reply_animation(media_file_id, caption=f"✦ 𝗔𝗡𝗜𝗩𝗘𝗥𝗦𝗘 · 𝗙𝗔𝗩𝗢𝗨𝗥𝗜𝗧𝗘\n\n{character['name']}\n\nSet this character as your featured favourite?", reply_markup=keyboard)
        else:
            await message.reply_photo(media_file_id, caption=f"✦ 𝗔𝗡𝗜𝗩𝗘𝗥𝗦𝗘 · 𝗙𝗔𝗩𝗢𝗨𝗥𝗜𝗧𝗘\n\n{character['name']}\n\nSet this character as your featured favourite?", reply_markup=keyboard)
    elif character.get("vid_url"):
        await message.reply_video(character["vid_url"], caption=f"✦ 𝗔𝗡𝗜𝗩𝗘𝗥𝗦𝗘 · 𝗙𝗔𝗩𝗢𝗨𝗥𝗜𝗧𝗘\n\n{character['name']}\n\nSet this character as your featured favourite?", reply_markup=keyboard)
    elif character.get("img_url"):
        await message.reply_photo(character["img_url"], caption=f"✦ 𝗔𝗡𝗜𝗩𝗘𝗥𝗦𝗘 · 𝗙𝗔𝗩𝗢𝗨𝗥𝗜𝗧𝗘\n\n{character['name']}\n\nSet this character as your featured favourite?", reply_markup=keyboard)
    else:
        await message.reply_text(f"✦ 𝗔𝗡𝗜𝗩𝗘𝗥𝗦𝗘 · 𝗙𝗔𝗩𝗢𝗨𝗥𝗜𝗧𝗘\n\n{character['name']}\n\nSet this character as your featured favourite?", reply_markup=keyboard)


# Handle button clicks
@app.on_callback_query(filters.regex(r"fav_yes_(.+?)_(\d+)"))
async def fav_yes(client, callback_query: CallbackQuery):
    character_id, user_id = callback_query.data.split("_")[2], int(callback_query.data.split("_")[3])

    # Ensure only the user who clicked can add to favorites
    if callback_query.from_user.id != user_id:
        await callback_query.answer("This favourite action belongs to another collector.", show_alert=True)
        return

    # Fetch user and update favorites
    user = await user_collection.find_one({"id": user_id})
    if not user:
        await callback_query.message.reply_text("⚠️ Collector profile not found.")
        return

    character = next((c for c in user.get("characters", []) if c["id"] == character_id), None)
    if not character:
        await callback_query.message.reply_text("⚠️ This character is no longer in your Character Vault.")
        return

    user["favorites"] = [character_id]
    await user_collection.update_one({"id": user_id}, {"$set": {"favorites": user["favorites"]}})

    await callback_query.message.edit_caption(f"✦ {character['name']} is now your featured favourite! 💖")
    await callback_query.answer("Favourite updated successfully. ✦")

@app.on_callback_query(filters.regex(r"fav_no"))
async def fav_no(client, callback_query: CallbackQuery):
    await callback_query.message.delete()
    await callback_query.answer("Favourite selection cancelled. ↩")
