# ==========================================
# Creator: Adam
# Project: AniverseCatcherBot
# ==========================================

import time

from telegram import Update
from telegram.ext import CommandHandler, CallbackContext

from ANIVERSE import application, is_vip_or_owner

async def ping(update: Update, context: CallbackContext) -> None:
    if not await is_vip_or_owner(update.effective_user.id):
        await update.message.reply_text("⛔ 𝗥𝗘𝗦𝗧𝗥𝗜𝗖𝗧𝗘𝗗 𝗖𝗢𝗠𝗠𝗔𝗡𝗗\n\nThe /ping command is reserved for the owner and VIP collectors.")
        return
    start_time = time.time()
    message = await update.message.reply_text('✦ 𝗔𝗡𝗜𝗩𝗘𝗥𝗦𝗘 𝗣𝗜𝗡𝗚 ✦\nChecking the connection…')
    end_time = time.time()
    elapsed_time = round((end_time - start_time) * 1000, 3)
    await message.edit_text(f'✦ 𝗔𝗡𝗜𝗩𝗘𝗥𝗦𝗘 𝗣𝗜𝗡𝗚 ✦\n\n⚡ 𝗥𝗘𝗦𝗣𝗢𝗡𝗦𝗘 · {elapsed_time} ms\n✦ Connection is responding normally.')

application.add_handler(CommandHandler("ping", ping))
