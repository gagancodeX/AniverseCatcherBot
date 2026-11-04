# ==========================================
# Creator: Adam
# Project: AniverseCatcherBot
# ==========================================

from pyrogram import Client, filters
from pyrogram.types import Message
import html
from TEAMZYRO import *
import asyncio
from pyrogram import enums

async def get_user_stats(user_id):
    # Fetch user data
    user_data = await user_collection.find_one({'id': user_id}, {'balance': 1, 'first_name': 1, 'characters': 1})
    if not user_data:
        return None, "🔎 Collector profile not found. Start collecting to unlock your stats."
    
    balance = user_data.get('balance', 0)
    first_name = html.escape(user_data.get('first_name', 'Unknown'))
    characters = user_data.get('characters', [])
    
    # Calculate total characters in collection
    total_characters = await collection.count_documents({})
    
    # Calculate character count and collection progress
    character_count = len(characters)
    progress_percentage = (character_count / total_characters * 100) if total_characters > 0 else 0
    
    # Create progress bar
    progress_bar_length = 10
    filled_slots = int(progress_percentage / 100 * progress_bar_length)
    progress_bar = '█' * filled_slots + '□' * (progress_bar_length - filled_slots)
    
    # Fetch global rank
    cursor = user_collection.find({}, {"_id": 0, "id": 1, "characters": 1})
    all_users = await cursor.to_list(length=None)
    all_users.sort(key=lambda x: len(x.get('characters', [])), reverse=True)
    total_users = len(all_users)
    rank = next((i + 1 for i, user in enumerate(all_users) if user['id'] == user_id), total_users)
    
    # Count characters by rarity
    rarity_counts = {rarity: 0 for rarity in rarity_map.values()}
    for char in characters:
        rarity = char.get('rarity')
        if rarity in rarity_counts:
            rarity_counts[rarity] += 1
    
    return {
        'user_id': user_id,
        'first_name': first_name,
        'balance': balance,
        'character_count': character_count,
        'total_characters': total_characters,
        'progress_percentage': progress_percentage,
        'progress_bar': progress_bar,
        'rank': rank,
        'total_users': total_users,
        'rarity_counts': rarity_counts
    }, None

@app.on_message(filters.command("stats"))
async def stats_handler(client: Client, message: Message):
    user_id = message.from_user.id
    
    processing_message = await message.reply_text(
        "✦ Building your collector card…",
        parse_mode=enums.ParseMode.HTML
    )

    # Small delay to simulate processing
    await asyncio.sleep(1)
    
    stats, error = await get_user_stats(user_id)
    
    if error:
        await processing_message.edit_text(text=error, parse_mode=enums.ParseMode.HTML)
        return
    
    # Build the stats caption
    stats_message = (
        f"✦ <b>ANIVERSE · COLLECTOR CARD</b> ✦\n"
        f"<b>{stats['first_name']}</b>\n"
        f"<blockquote>╭ 🆔 <b>Collector ID</b> · <code>{stats['user_id']}</code>\n"
        f"├ 🪙 <b>Wallet</b> · {stats['balance']} coins\n"
        f"├ 🗂 <b>Character Vault</b> · {stats['character_count']} / {stats['total_characters']}\n"
        f"├ 📊 <b>Collection progress</b> · {stats['progress_percentage']:.2f}%\n"
        f"│   {stats['progress_bar']}\n"
        f"╰ 🏆 <b>Global rank</b> · #{stats['rank']} of {stats['total_users']}\n\n"
        f"<b>RARITY COLLECTION</b>\n"
    )
    # Add rarity counts
    for rarity, count in stats['rarity_counts'].items():
        emoji = rarity_map2.get(rarity, '❍')
        stats_message += f"  {emoji} {rarity} · <b>{count}</b>\n"
    
    stats_message += "</blockquote>\n✧ Keep catching characters to climb the ranks."
    
    # Edit the processing message with the final stats
    await processing_message.edit_text(
        text=stats_message,
        parse_mode=enums.ParseMode.HTML
    )
