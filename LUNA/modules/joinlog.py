# ==========================================
# Creator: Adam
# Project: LunaCatcherBot
# ==========================================

from pyrogram import Client, filters
from pyrogram.types import Message
from LUNA import app, BOT_LOGGING


async def send_log_message(chat_id: int, message: str):
    """Send a log message to the specified chat."""
    await app.send_message(chat_id=chat_id, text=message)


@app.on_message(filters.new_chat_members)
async def on_new_chat_members(client: Client, message: Message):
    """Handle new chat members joining the chat."""
    bot_user = await client.get_me()

    if bot_user.id in [user.id for user in message.new_chat_members]:
        added_by = message.from_user.mention if message.from_user else "Unknown user"
        chat_title = message.chat.title
        chat_id = message.chat.id
        chat_username = f"@{message.chat.username}" if message.chat.username else "Private"

        log_message = (
            "✦ LUNA · NEW GROUP ✦\n\n"
            f"🏷 Group · {chat_title}\n"
            f"🔗 Username · {chat_username}\n"
            f"👤 Added by · {added_by}"
        )
        await send_log_message(BOT_LOGGING, log_message)

        chat_members_count = await client.get_chat_members_count(chat_id)
        if chat_members_count < 1:
            leave_message = (
                "✦ LUNA · GROUP LEFT ✦\n\n"
                f"🏷 Group · {chat_title}\n"
                f"🔗 Username · {chat_username}\n"
                "ℹ️ Reason · Group has less than 1 members"
            )
            await send_log_message(chat_id, leave_message)
            await client.leave_chat(chat_id)
            leave_message = (
                "✦ LUNA · GROUP LEFT ✦\n\n"
                f"🏷 Group · {chat_title}\n"
                f"🔗 Username · {chat_username}\n"
                "ℹ️ Reason · Group has less than 40 members"
            )
            await send_log_message(BOT_LOGGING, leave_message)


@app.on_message(filters.left_chat_member)
async def on_left_chat_member(_, message: Message):
    """Handle the bot leaving the chat."""
    bot_user = await app.get_me()

    if bot_user.id == message.left_chat_member.id:
        removed_by = message.from_user.mention if message.from_user else "Unknown user"
        chat_title = message.chat.title
        chat_username = f"@{message.chat.username}" if message.chat.username else "Private chat"

        log_message = (
            "✦ LUNA · GROUP REMOVED ✦\n\n"
            f"🏷 Group · {chat_title}\n"
            f"🔗 Username · {chat_username}\n"
            f"👤 Removed by · {removed_by}"
        )
        await send_log_message(BOT_LOGGING, log_message)
