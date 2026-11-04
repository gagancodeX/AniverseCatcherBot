# ==========================================
# Creator: Adam
# Project: AniverseCatcherBot
# ==========================================

from TEAMZYRO import *
from TEAMZYRO import application
from html import escape
import asyncio
import time
from pyrogram import Client, filters
from pyrogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message
from pyrogram import enums
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime

@app.on_message(filters.command(["guess", "protecc", "collect", "grab", "hunt"]))
async def guess(client: Client, message: Message):
    chat_id = message.chat.id
    user_id = message.from_user.id
    today = datetime.utcnow().date()

    if await check_cooldown(user_id):
        remaining_time = await get_remaining_cooldown(user_id)
        await message.reply_text(
            f"⏳ 𝗛𝗨𝗡𝗧 𝗢𝗡 𝗖𝗢𝗢𝗟𝗗𝗢𝗪𝗡\n\nYour next catch unlocks in {remaining_time}s. Stay ready for the next drop."
        )
        return

    if 'name' not in last_characters.get(chat_id, {}):
        await message.reply_text("✦ 𝗡𝗢 𝗔𝗖𝗧𝗜𝗩𝗘 𝗗𝗥𝗢𝗣 ✦\n\nThere is no character to catch right now. Wait for the next spawn!")
        return
    
    if chat_id not in last_characters:
        await message.reply_text("✦ 𝗡𝗢 𝗔𝗖𝗧𝗜𝗩𝗘 𝗗𝗥𝗢𝗣 ✦\n\nThere is no character to catch right now. Wait for the next spawn!")
        return

    if chat_id in first_correct_guesses:
        await message.reply_text("✦ 𝗡𝗢 𝗔𝗖𝗧𝗜𝗩𝗘 𝗗𝗥𝗢𝗣 ✦\n\nThere is no character to catch right now. Wait for the next spawn!")
        return

    if last_characters[chat_id].get('ranaway', False):
        await message.reply_text("💨 𝗧𝗢𝗢 𝗟𝗔𝗧𝗘!\n\nThis character has already escaped. Stay alert for the next appearance.")
        return 

    guess = ' '.join(message.command[1:]).lower() if len(message.command) > 1 else ''
    
    if "()" in guess or "&" in guess.lower():
        await message.reply_text("⚠️ 𝗚𝗨𝗘𝗦𝗦 𝗙𝗢𝗥𝗠𝗔𝗧 𝗡𝗢𝗧 𝗩𝗔𝗟𝗜𝗗\n\nUse the character's name only. Give it another try!")
        return

    name_parts = last_characters[chat_id]['name'].lower().split()
    
    if sorted(name_parts) == sorted(guess.split()) or any(part == guess for part in name_parts):
        first_correct_guesses[chat_id] = user_id
        for task in asyncio.all_tasks():
            if task.get_name() == f"expire_session_{chat_id}":
                task.cancel()
                break

        timestamp = last_characters[chat_id].get('timestamp')
        if timestamp:
            time_taken = time.time() - timestamp
            time_taken_str = f"{int(time_taken)} seconds"
        else:
            time_taken_str = "Unknown time"

        if user_id not in user_guess_progress or user_guess_progress[user_id]["date"] != today:
            user_guess_progress[user_id] = {"date": today, "count": 0}

        user_guess_progress[user_id]["count"] += 1
        
        # Fetch user from MongoDB
        user = await user_collection.find_one({'id': user_id})
        if user:
            update_fields = {}
            if message.from_user.username != user.get('username'):
                update_fields['username'] = message.from_user.username
            if message.from_user.first_name != user.get('first_name'):
                update_fields['first_name'] = message.from_user.first_name
            if update_fields:
                await user_collection.update_one({'id': user_id}, {'$set': update_fields})
            
            await user_collection.update_one({'id': user_id}, {'$push': {'characters': last_characters[chat_id]}})
      
        else:
            await user_collection.insert_one({
                'id': user_id,
                'username': message.from_user.username,
                'first_name': message.from_user.first_name,
                'characters': [last_characters[chat_id]],
            })

        # Update group count in top_global_groups_collection (new code)
        if message.chat.type in [enums.ChatType.GROUP, enums.ChatType.SUPERGROUP]:
            group_name = message.chat.title or f"Group_{chat_id}"
            await top_global_groups_collection.update_one(
                {'chat_id': chat_id},
                {
                    '$set': {'group_name': group_name},
                    '$inc': {'count': 1}
                },
                upsert=True
            )
            await group_user_totals_collection.update_one(
                {'group_id': str(chat_id), 'user_id': user_id},
                {
                    '$set': {
                        'group_id': str(chat_id),
                        'user_id': user_id,
                        'username': message.from_user.username,
                        'first_name': message.from_user.first_name,
                    },
                    '$inc': {'count': 1},
                },
                upsert=True
            )

        await react_to_message(chat_id, message.id)

        # Fetch user to update balance
        user = await user_collection.find_one({'id': user_id})
        if user:
            current_balance = user.get('balance', 0)
            new_balance = current_balance + 40
            await user_collection.update_one({'id': user_id}, {'$set': {'balance': new_balance}})
        else:
            new_balance = 40
            await user_collection.insert_one({
                'id': user_id,
                'username': message.from_user.username,
                'first_name': message.from_user.first_name,
                'characters': [last_characters[chat_id]],
                'balance': 40
            })

        keyboard = [[InlineKeyboardButton("✦ OPEN CHARACTER VAULT", switch_inline_query_current_chat=f"collection.{user_id}")]]
        await message.reply_text(
            f'✦ <b>ANIVERSE · CHARACTER CAPTURE</b> ✦\n\n'
            f'🏆 <a href="tg://user?id={user_id}">{escape(message.from_user.first_name)}</a> caught a new character!\n'
            f'<blockquote>╭ ✧ <b>{escape(last_characters[chat_id]["name"])}</b>\n'
            f'├ 🎬 <b>Anime</b> · {escape(last_characters[chat_id]["anime"])}\n'
            f'├ 💎 <b>Rarity</b> · {escape(last_characters[chat_id]["rarity"])}\n'
            f'├ ⏱️ <b>Capture time</b> · {time_taken_str}\n'
            f'├ 🪙 <b>Reward</b> · +40 coins\n'
            f'╰ 💳 <b>New balance</b> · {new_balance} coins</blockquote>\n'
            f'<i>Your new character is waiting in /harem.</i>',
            parse_mode=enums.ParseMode.HTML,
            reply_markup=InlineKeyboardMarkup(keyboard)
        )
    else:
        message_id = last_characters[chat_id].get('message_id')
        incorrect_text = (
            "✧ <b>GUESS MISSED</b>\n\n"
            "<blockquote>That guess missed the mark. Take another shot — the character is still waiting!</blockquote>"
        )
        if message_id:
            keyboard = [
                [InlineKeyboardButton("↻ VIEW CHARACTER AGAIN", url=f"https://t.me/c/{str(chat_id)[4:]}/{message_id}")],
            ]
            await message.reply_text(
                incorrect_text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode=enums.ParseMode.HTML
            )
        else:
            await message.reply_text(
                incorrect_text,
                parse_mode=enums.ParseMode.HTML
            )
