# ==========================================
# LUNA CATCHER - Privacy information
# ==========================================

from pyrogram import filters
from LUNA import bot_client


PRIVACY_POLICY = """🌙 LUNA — PRIVACY POLICY

Luna processes a limited amount of information to operate its character-collection features.

INFORMATION THAT MAY BE STORED
• Telegram user ID, display name and username.
• Character collections, favorites, virtual coin balances and related activity.
• Daily claim records, character requests, gifts and transfer records.
• Group or chat information needed for group features and anti-spam controls.
• Character images/videos submitted for the archive, along with Telegram file references.

HOW INFORMATION IS USED
This information is used to run the bot, display collections and rankings, process requests and gifts, maintain balances, moderate submissions, and protect the service from abuse.

WHERE INFORMATION IS STORED
Bot records are stored in the database configured by the bot owner. Submitted character media may be copied to the Telegram archive channel configured for Luna. Telegram and the bot's hosting/database providers process information as needed to provide their services.

RETENTION AND REQUESTS
Information may remain stored while it is needed to operate Luna. For questions or requests about your information, contact the bot owner. Requests may require enough information to identify the relevant Telegram account.

PLEASE NOTE
Do not send passwords, payment-card details, or other sensitive personal information to the bot. Features and this policy may change as Luna is updated.
"""


@bot_client.on_message(filters.command("privacy"))
async def privacy_command(client, message):
    await message.reply_text(
        PRIVACY_POLICY,
        disable_web_page_preview=True,
    )
