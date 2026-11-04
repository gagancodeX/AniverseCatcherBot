# ==========================================
# Creator: MrZyro
# Telegram: @MrZyro_dev
# GitHub: https://github.com/MrZyro
# ==========================================

from pyrogram import Client, filters
from pyrogram.types import InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery
from pymongo import MongoClient
from TEAMZYRO import app, user_collection

@app.on_message(filters.command("fav"))
async def fav_command(client, message):
    user_id = message.from_user.id

    if len(message.command) < 2:
        await message.reply_text("Please provide a character ID. ❌")
        return

    character_id = message.command[1]

    # Fetch user from MongoDB
    user = await user_collection.find_one({"id": user_id})
    if not user:
        await message.reply_text("You have not guessed any characters yet. ❌")
        return

    # Find character in user's collection
    character = next((c for c in user.get("characters", []) if c["id"] == character_id), None)
    if not character:
        await message.reply_text("This character is not in your collection. ❌")
        return

    keyboard = InlineKeyboardMarkup(
        [[
            InlineKeyboardButton("✅ Yes", callback_data=f"fav_yes_{character_id}_{user_id}"),
            InlineKeyboardButton("❎ No", callback_data="fav_no")
        ]]
    )

    media_file_id = character.get("media_file_id")
    media_type = character.get("media_type", "photo")

    if media_file_id:
        if media_type == "video":
            await message.reply_video(media_file_id, caption=f"Add {character['name']} to favorites?", reply_markup=keyboard)
        elif media_type == "document":
            await message.reply_document(media_file_id, caption=f"Add {character['name']} to favorites?", reply_markup=keyboard)
        elif media_type == "animation":
            await message.reply_animation(media_file_id, caption=f"Add {character['name']} to favorites?", reply_markup=keyboard)
        else:
            await message.reply_photo(media_file_id, caption=f"Add {character['name']} to favorites?", reply_markup=keyboard)
    elif character.get("vid_url"):
        await message.reply_video(character["vid_url"], caption=f"Add {character['name']} to favorites?", reply_markup=keyboard)
    elif character.get("img_url"):
        await message.reply_photo(character["img_url"], caption=f"Add {character['name']} to favorites?", reply_markup=keyboard)
    else:
        await message.reply_text(f"Add {character['name']} to favorites?", reply_markup=keyboard)


# Handle button clicks
@app.on_callback_query(filters.regex(r"fav_yes_(.+?)_(\d+)"))
async def fav_yes(client, callback_query: CallbackQuery):
    character_id, user_id = callback_query.data.split("_")[2], int(callback_query.data.split("_")[3])

    # Ensure only the user who clicked can add to favorites
    if callback_query.from_user.id != user_id:
        await callback_query.answer("This button is not for you! ❌", show_alert=True)
        return

    # Fetch user and update favorites
    user = await user_collection.find_one({"id": user_id})
    if not user:
        await callback_query.message.reply_text("User not found. ❌")
        return

    character = next((c for c in user.get("characters", []) if c["id"] == character_id), None)
    if not character:
        await callback_query.message.reply_text("Character not found in your collection. ❎")
        return

    user["favorites"] = [character_id]
    await user_collection.update_one({"id": user_id}, {"$set": {"favorites": user["favorites"]}})

    await callback_query.message.edit_caption(f"{character['name']} has been added to your favorites! ✅")
    await callback_query.answer("Character added to favorites. ✅")

@app.on_callback_query(filters.regex(r"fav_no"))
async def fav_no(client, callback_query: CallbackQuery):
    await callback_query.message.delete()
    await callback_query.answer("Action canceled.")
