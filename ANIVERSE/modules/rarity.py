# ==========================================
# Creator: Adam
# Project: AniverseCatcherBot
# ==========================================

from ANIVERSE import app, collection
from pyrogram import filters, enums


@app.on_message(filters.command("rarity"))
async def rarity_count(client, message):
    try:
        distinct_rarities = await collection.distinct('rarity')

        if not distinct_rarities:
            await message.reply_text(
                "✦ ANIVERSE · RARITY INDEX ✦\n<blockquote>No rarities are registered yet.</blockquote>",
                parse_mode=enums.ParseMode.HTML
            )
            return

        response_message = (
            "<b>✦ ANIVERSE · RARITY INDEX ✦</b>\n"
            "<blockquote>Explore the character universe by rarity</blockquote>\n"
        )
        total_count = 0

        for rarity in distinct_rarities:
            count = await collection.count_documents({'rarity': rarity})
            total_count += count
            response_message += f"◈ {rarity} — <b>{count:,}</b> character(s)\n"

        response_message += (
            f"\n✧ <b>UNIVERSE TOTAL</b> · <code>{total_count:,}</code>"
        )
        await message.reply_text(response_message, parse_mode=enums.ParseMode.HTML)

    except Exception:
        await message.reply_text(
            "✦ ANIVERSE · SYSTEM NOTICE ✦\n<blockquote>Unable to load the rarity index right now.</blockquote>",
            parse_mode=enums.ParseMode.HTML
        )
