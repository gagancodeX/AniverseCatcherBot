# ==========================================
# Creator: MrZyro
# Telegram: @MrZyro_dev
# GitHub: https://github.com/MrZyro
# ==========================================

# TEAMZYRO/commands/check.py
from TEAMZYRO import app, collection as character_collection, user_collection
from pyrogram import Client, filters, enums
from pyrogram.types import InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery

import asyncio 

@app.on_message(filters.command("check"))
async def check_character(client, message):
    args = message.command
    if len(args) < 2:
        await message.reply_text("✦ 𝗖𝗛𝗔𝗥𝗔𝗖𝗧𝗘𝗥 𝗟𝗢𝗢𝗞𝗨𝗣 ✦\n\nSend a character ID like this:\n<code>/check 01</code>")
        return

    character_id = args[1]
    character = await character_collection.find_one({'id': character_id})

    if not character:
        await message.reply_text("🔎 𝗡𝗢 𝗖𝗛𝗔𝗥𝗔𝗖𝗧𝗘𝗥 𝗙𝗢𝗨𝗡𝗗\n\nCheck the ID and try again.")
        return

    # Power nikaalo using rarity

    # Create the 'Who Have It' button
    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton("♛ WHO OWNS THIS?", callback_data=f"whohaveit_{character_id}")]
    ])

    # Send character details
    text = (
        f"✦ **ANIVERSE CHARACTER FILE** ✦\n\n"
        f"🆔 ID: `{character_id}`\n"
        f"✧ **Name:** {character['name']}\n"
        f"🎬 **Anime:** {character['anime']}\n"
        f"💠 **Rarity:** {character['rarity']}\n"
    )

    media_file_id = character.get('media_file_id')
    media_type = character.get('media_type', 'photo')

    if media_file_id:
        if media_type == 'video':
            await message.reply_video(media_file_id, caption=text, reply_markup=keyboard)
        elif media_type == 'document':
            await message.reply_document(media_file_id, caption=text, reply_markup=keyboard)
        elif media_type == 'animation':
            await message.reply_animation(media_file_id, caption=text, reply_markup=keyboard)
        else:
            await message.reply_photo(media_file_id, caption=text, reply_markup=keyboard)
    elif 'vid_url' in character:
        await message.reply_video(character['vid_url'], caption=text, reply_markup=keyboard)
    elif 'img_url' in character:
        await message.reply_photo(character['img_url'], caption=text, reply_markup=keyboard)
    else:
        await message.reply_text(text, reply_markup=keyboard)


@app.on_callback_query(filters.regex("^whohaveit_"))
async def who_have_it(client, callback_query):
    character_id = callback_query.data.split("_")[1]

    # Find users who own the character
    users = await user_collection.find({'characters.id': character_id}).to_list(length=10)

    if not users:
        await callback_query.answer("No collectors own this character yet.", show_alert=True)
        return

    # Generate top 10 owners list with count
    owner_text = "**♛ CHARACTER OWNERS · TOP 10**\n\n"
    for i, user in enumerate(users, 1):
        user_name = user.get('first_name', 'Unknown')  # Use 'Unknown' if missing
        count = sum(1 for char in user.get("characters", []) if char["id"] == character_id)
        owner_text += f"{i}. [{user_name}](tg://user?id={user['id']}) — x{count}\n"

    # Edit message to include the owner list and remove the button
    await callback_query.message.edit_caption(
        caption=f"{callback_query.message.caption}\n\n{owner_text}",
        reply_markup=None
    )

