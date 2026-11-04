# ==========================================
# Creator: MrZyro
# Telegram: @MrZyro_dev
# GitHub: https://github.com/MrZyro
# ==========================================

import html

from pyrogram import Client, filters
from pyrogram.types import Message

from TEAMZYRO import (app, OWNER_ID,
                      user_collection, top_global_groups_collection, 
                      group_user_totals_collection)


# Global Leaderboard Command
@app.on_message(filters.command("TopGroups"))
async def global_leaderboard(client: Client, message: Message):
    cursor = top_global_groups_collection.aggregate([
        {"$project": {"group_name": 1, "count": 1}},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ])
    leaderboard_data = await cursor.to_list(length=10)

    leaderboard_message = "<b>✦ ANIVERSE · GROUP RANKINGS ✦</b>\n<blockquote>Top 10 communities by character captures</blockquote>\n"

    for i, group in enumerate(leaderboard_data, start=1):
        group_name = html.escape(group.get('group_name', 'Unknown'))

        if len(group_name) > 10:
            group_name = group_name[:15] + '...'
        count = group['count']
        leaderboard_message += f'{i}. <b>{group_name}</b> ➾ <b>{count}</b>\n'

    await message.reply_text(leaderboard_message, parse_mode='html')

# Group Top Users Command
@app.on_message(filters.command("ctop"))
async def ctop(client: Client, message: Message):
    chat_id = message.chat.id

    cursor = group_user_totals_collection.aggregate([
        {"$match": {"group_id": str(chat_id)}},
        {"$project": {"username": 1, "first_name": 1, "character_count": "$count"}},
        {"$sort": {"character_count": -1}},
        {"$limit": 10}
    ])
    leaderboard_data = await cursor.to_list(length=10)

    leaderboard_message = "<b>✦ ANIVERSE · GROUP COLLECTORS ✦</b>\n<blockquote>Top 10 collectors in this group</blockquote>\n"

    for i, user in enumerate(leaderboard_data, start=1):
        username = user.get('username', 'Unknown')
        first_name = html.escape(user.get('first_name', 'Unknown'))

        if len(first_name) > 10:
            first_name = first_name[:15] + '...'
        character_count = user['character_count']
        leaderboard_message += f'{i}. <a href="https://t.me/{username}"><b>{first_name}</b></a> ➾ <b>{character_count}</b>\n'

    await message.reply_text(leaderboard_message, parse_mode='html')

# Stats Command
@app.on_message(filters.command("st"))
async def stats(client: Client, message: Message):
    user_count = await user_collection.count_documents({})
    group_count = await group_user_totals_collection.distinct('group_id')

    await message.reply_text(\n        f'✦ <b>ANIVERSE · NETWORK STATUS</b> ✦\\n\\n'\n        f'👥 <b>Registered users</b> · <code>{user_count:,}</code>\\n'\n        f'🌐 <b>Active groups</b> · <code>{len(group_count):,}</code>',\n        parse_mode='html'\n    )


