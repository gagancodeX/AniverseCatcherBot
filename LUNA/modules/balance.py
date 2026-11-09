# ==========================================
# Creator: Adam
# Project: LunaCatcherBot
# ==========================================

from LUNA import *
from pyrogram import Client, filters
from pyrogram.types import Message
import html
import re
import time
from datetime import datetime, timedelta

# Lock system to prevent spam
lock = {}

async def get_balance(user_id):
    user_data = await user_collection.find_one({'id': user_id}, {'balance': 1, 'tokens': 1})
    if user_data:
        return user_data.get('balance', 0), user_data.get('tokens', 0)
    return 0, 0

# Daily gift system
@app.on_message(filters.command("daily"))
async def daily_gift(client: Client, message: Message):
    user_id = message.from_user.id
    
    # Check if user is in lock (cooldown)
    if user_id in lock and time.time() - lock[user_id] < 5:  # 5 second cooldown
        await message.reply_text("⏳ 𝗪𝗔𝗟𝗟𝗘𝗧 𝗖𝗢𝗢𝗟𝗗𝗢𝗪𝗡\nPlease wait a moment before claiming again.")
        return
    
    lock[user_id] = time.time()
    
    # Check if user already claimed daily gift
    user_data = await user_collection.find_one({'id': user_id}, {'last_daily': 1, 'balance': 1})
    
    today = datetime.now().date()
    
    if user_data and 'last_daily' in user_data:
        last_daily = user_data['last_daily']
        if isinstance(last_daily, datetime):
            last_daily = last_daily.date()
        elif isinstance(last_daily, str):
            last_daily = datetime.fromisoformat(last_daily).date()
        
        if last_daily == today:
            await message.reply_text("✦ 𝗗𝗔𝗜𝗟𝗬 𝗕𝗢𝗡𝗨𝗦 𝗖𝗢𝗟𝗟𝗘𝗖𝗧𝗘𝗗 ✦\nYour next daily gift arrives tomorrow. Keep your streak going!")
            return
    
    # Give daily gift of 100 coins
    daily_amount = 100
    await user_collection.update_one(
        {'id': user_id}, 
        {
            '$inc': {'balance': daily_amount},
            '$set': {'last_daily': datetime.now()}
        },
        upsert=True
    )
    
    new_balance, _ = await get_balance(user_id)
    user_name = html.escape(message.from_user.first_name)
    
    await message.reply_text(
        f"✦ 𝗗𝗔𝗜𝗟𝗬 𝗥𝗘𝗪𝗔𝗥𝗗 ✦\n\n👤 {user_name}\n╭ 🪙 +{daily_amount} coins\n"
        f"╰ 💳 Wallet balance · {new_balance} coins\n"
        
    )

# Weekly gift system
@app.on_message(filters.command("weekly"))
async def weekly_gift(client: Client, message: Message):
    user_id = message.from_user.id
    
    # Check if user is in lock (cooldown)
    if user_id in lock and time.time() - lock[user_id] < 5:  # 5 second cooldown
        await message.reply_text("⏳ 𝗪𝗔𝗟𝗟𝗘𝗧 𝗖𝗢𝗢𝗟𝗗𝗢𝗪𝗡\nPlease wait a moment before claiming again.")
        return
    
    lock[user_id] = time.time()
    
    # Check if user already claimed weekly gift
    user_data = await user_collection.find_one({'id': user_id}, {'last_weekly': 1, 'balance': 1})
    
    now = datetime.now()
    week_start = now - timedelta(days=now.weekday())  # Monday of current week
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
    
    if user_data and 'last_weekly' in user_data:
        last_weekly = user_data['last_weekly']
        if isinstance(last_weekly, str):
            last_weekly = datetime.fromisoformat(last_weekly)
        
        if last_weekly >= week_start:
            next_week = week_start + timedelta(days=7)
            days_left = (next_week - now).days
            await message.reply_text(f"✦ 𝗪𝗘𝗘𝗞𝗟𝗬 𝗕𝗢𝗡𝗨𝗦 𝗖𝗢𝗟𝗟𝗘𝗖𝗧𝗘𝗗 ✦\nYour next gift is available in {days_left} day(s).")
            return
    
    # Give weekly gift of 2000 coins
    weekly_amount = 2000
    await user_collection.update_one(
        {'id': user_id}, 
        {
            '$inc': {'balance': weekly_amount},
            '$set': {'last_weekly': datetime.now()}
        },
        upsert=True
    )
    
    new_balance, _ = await get_balance(user_id)
    user_name = html.escape(message.from_user.first_name)
    
    await message.reply_text(
        f"✦ 𝗪𝗘𝗘𝗞𝗟𝗬 𝗥𝗘𝗪𝗔𝗥𝗗 ✦\n\n👤 {user_name}\n╭ 🪙 +{weekly_amount} coins\n"
        f"╰ 💳 Wallet balance · {new_balance} coins\n"
        
    )

@app.on_message(filters.command("balance"))
async def balance(client: Client, message: Message):
    if not message.from_user:
        await message.reply_text("⚠️ I could not identify your Telegram account. Please send this command from a user account.")
        return

    projection = {
        "id": 1,
        "balance": 1,
        "tokens": 1,
        "first_name": 1,
        "username": 1,
    }
    args = message.command or []
    target_data = None
    target_id = message.from_user.id
    target_name = message.from_user.first_name or "Collector"
    is_other_user = False

    # Replying to a user's message checks that user's wallet.
    replied_user = (
        message.reply_to_message.from_user
        if message.reply_to_message
        else None
    )
    if replied_user:
        target_id = replied_user.id
        target_name = replied_user.first_name or "Collector"
        is_other_user = target_id != message.from_user.id
        target_data = await user_collection.find_one({"id": target_id}, projection)

    # Also support the username and user-ID formats shown in /help.
    elif len(args) > 1:
        target = args[1].strip()
        if target.startswith("@"):
            username = target[1:].strip()
            if not username:
                await message.reply_text("Usage: /balance or /balance @username or /balance user_id")
                return

            target_data = await user_collection.find_one(
                {
                    "username": {
                        "$regex": f"^{re.escape(username)}$",
                        "$options": "i",
                    }
                },
                projection,
            )
            if not target_data:
                await message.reply_text(
                    "🔎 Collector not found. Ask them to start Luna first, then try again."
                )
                return

            target_id = target_data["id"]
            target_name = (
                target_data.get("first_name")
                or target_data.get("username")
                or str(target_id)
            )
            is_other_user = target_id != message.from_user.id

        else:
            try:
                target_id = int(target)
                if target_id <= 0:
                    raise ValueError
            except ValueError:
                await message.reply_text(
                    "Usage: /balance or /balance @username or /balance user_id"
                )
                return

            target_data = await user_collection.find_one({"id": target_id}, projection)
            if not target_data:
                await message.reply_text(
                    "🔎 Collector not found. Ask them to start Luna first, then try again."
                )
                return

            target_name = (
                target_data.get("first_name")
                or target_data.get("username")
                or str(target_id)
            )
            is_other_user = target_id != message.from_user.id

    else:
        target_data = await user_collection.find_one({"id": target_id}, projection)

    try:
        user_balance = int((target_data or {}).get("balance", 0) or 0)
    except (TypeError, ValueError):
        user_balance = 0

    try:
        user_tokens = int((target_data or {}).get("tokens", 0) or 0)
    except (TypeError, ValueError):
        user_tokens = 0

    safe_name = html.escape(str(target_name))
    response = (
        f"✦ 𝗔𝗡𝗜𝗩𝗘𝗥𝗦𝗘 𝗪𝗔𝗟𝗟𝗘𝗧 ✦\n\n"
        f"👤 {safe_name}\n"
        f"╭ 🪙 Coins · {user_balance:,}\n"
        f"╰ 🎟 Tokens · {user_tokens:,}"
    )
    await message.reply_text(response)

@app.on_message(filters.command("pay"))
async def pay(client: Client, message: Message):
    sender_id = message.from_user.id
    
    if sender_id in lock and time.time() - lock[sender_id] < 3:  # 3 second cooldown
        await message.reply_text("⏳ 𝗧𝗥𝗔𝗡𝗦𝗙𝗘𝗥 𝗖𝗢𝗢𝗟𝗗𝗢𝗪𝗡\nPlease wait before sending another payment.")
        return
    
    lock[sender_id] = time.time()
    
    args = message.command

    if len(args) < 2:
        await message.reply_text("✦ 𝗖𝗢𝗜𝗡 𝗧𝗥𝗔𝗡𝗦𝗙𝗘𝗥 ✦\nUse /pay <amount> @username, /pay <amount> user_id, or reply to a user with /pay <amount>.")
        return

    try:
        amount = int(args[1])
        if amount <= 0:
            raise ValueError
    except ValueError:
        await message.reply_text("⚠️ Invalid amount. Enter a positive whole number of coins.")
        return

    recipient_id = None
    recipient_name = None

    if message.reply_to_message:
        recipient_id = message.reply_to_message.from_user.id
        recipient_name = message.reply_to_message.from_user.first_name
    elif len(args) > 2:
        try:
            recipient_id = int(args[2])
        except ValueError:
            recipient_username = args[2].lstrip('@')  # Remove @ from username
            user_data = await user_collection.find_one({'username': recipient_username}, {'id': 1, 'first_name': 1})
            if user_data:
                recipient_id = user_data['id']
                recipient_name = user_data.get('first_name', recipient_username)
            else:
                await message.reply_text("🔎 Recipient not found. Check the username or reply directly to their message.")
                return

    if not recipient_id:
        await message.reply_text("🔎 Choose a valid recipient: reply to their message or provide their user ID/username.")
        return

    sender_balance, _ = await get_balance(sender_id)
    if sender_balance < amount:
        await message.reply_text("🪙 Your wallet does not have enough coins for this transfer.")
        return

    await user_collection.update_one({'id': sender_id}, {'$inc': {'balance': -amount}})
    await user_collection.update_one({'id': recipient_id}, {'$inc': {'balance': amount}})

    updated_sender_balance, _ = await get_balance(sender_id)
    updated_recipient_balance, _ = await get_balance(recipient_id)

    # Use first name or ID for recipient in the response
    recipient_display = html.escape(recipient_name or str(recipient_id))
    sender_display = html.escape(message.from_user.first_name or str(sender_id))

    await message.reply_text(
        f"✦ 𝗧𝗥𝗔𝗡𝗦𝗙𝗘𝗥 𝗦𝗘𝗡𝗧 ✦\n\n🪙 {amount} coins → {recipient_display}\n"
        f"💳 Remaining balance · {updated_sender_balance} coins"
    )

    await client.send_message(
        chat_id=recipient_id,
        text=f"✦ 𝗖𝗢𝗜𝗡𝗦 𝗥𝗘𝗖𝗘𝗜𝗩𝗘𝗗 ✦\n\n🪙 +{amount} coins from {sender_display}\n"
        f"💳 Wallet balance · {updated_recipient_balance} coins"
    )

@app.on_message(filters.command("kill"))
@require_power("VIP")
async def kill_handler(client, message):
    # Get the user_id from the reply message
    if message.reply_to_message:
        user_id = message.reply_to_message.from_user.id
    else:
        await message.reply_text("✦ ADMIN ACTION · Reply to the user's message before using /kill.")
        return

    command_args = message.text.split()

    if len(command_args) < 2:
        await message.reply_text("✦ ADMIN ACTION GUIDE\nUse /kill c <character_id>, /kill f, or /kill b <amount> while replying to the user.")
        return

    option = command_args[1]

    try:
        if option == 'f':
            # Delete full user data
            await user_collection.delete_one({"id": user_id})
            await message.reply_text("✦ USER DATA CLEARED\nThe selected user's profile data was removed.")

        elif option == 'c':
            # Delete specific character from the user's collection
            if len(command_args) < 3:
                await message.reply_text("✦ CHARACTER REMOVAL\nProvide the character ID you want to remove.")
                return

            char_id = command_args[2]
            user = await user_collection.find_one({"id": user_id})

            if user and 'characters' in user:
                characters = user['characters']
                updated_characters = [c for c in characters if c.get('id') != char_id]

                if len(updated_characters) == len(characters):
                    await message.reply_text(f"🔎 Character ID {char_id} was not found in this user's vault.")
                    return

                # Update user collection
                await user_collection.update_one({"id": user_id}, {"$set": {"characters": updated_characters}})
                await message.reply_text(f"✦ CHARACTER REMOVED\nID {char_id} has been removed from the user's vault.")
            else:
                await message.reply_text(f"This user's Character Vault is empty.")

        elif option == 'b':
            # Check if amount is provided
            if len(command_args) < 3:
                await message.reply_text("✦ WALLET ADJUSTMENT\nProvide the number of coins to deduct.")
                return

            try:
                amount = int(command_args[2])
            except ValueError:
                await message.reply_text("⚠️ Enter a valid whole-number coin amount.")
                return

            # Fetch user balance
            user_data = await user_collection.find_one({"id": user_id}, {"balance": 1})
            if user_data and "balance" in user_data:
                current_balance = user_data["balance"]
                new_balance = max(0, current_balance - amount)  # Ensure balance doesn't go negative
                
                await user_collection.update_one({"id": user_id}, {"$set": {"balance": new_balance}})
                await message.reply_text(f"✦ WALLET UPDATED\n🪙 Deducted · {amount}\n💳 New balance · {new_balance}")
            else:
                await message.reply_text("This user's wallet has no coins to deduct.")

        else:
            await message.reply_text("⚠️ Invalid admin option. Use c, f, or b <amount>.")

    except Exception as e:
        print(f"Error in /kill command: {e}")
        await message.reply_text("⚠️ The admin action could not be completed. Please try again.")
