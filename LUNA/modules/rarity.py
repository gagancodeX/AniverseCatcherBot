# ==========================================
# Creator: Adam
# Project: LunaCatcherBot
# ==========================================

from LUNA import app, collection, user_collection, rarity_map, RARITY_NAMES
from pyrogram import filters, enums


# Existing character records keep their IDs; only their display labels change.
LEGACY_RARITY_RENAMES = {
    "⚪️ Common": rarity_map[1],
    "🟣 Rare": rarity_map[2],
    "🟡 Legendary": rarity_map[3],
    "🟢 Medium": rarity_map[4],
    "💮 Special Edition": rarity_map[5],
    "🔮 Limited Edition": rarity_map[6],
    "💸 Premium Edition": rarity_map[7],
    "🎐 Celestial": rarity_map[9],
    "🪐 Omniversal": rarity_map[14],
    "🎭 Cosplay Master 🎭": rarity_map[15],
    "🧧 Events": rarity_map[16],
    "🎗️ AMV Edition": rarity_map[18],
    "🌟 Luminous": rarity_map[19],
    "🌧 Rainy": rarity_map[20],
    "🍭 Winter event": rarity_map[10],
    "🍭 Winter Event": rarity_map[10],
}

# The retired rarity is kept as archived data so existing character records
# remain intact without exposing the removed category in rarity selection.
REMOVED_RARITY_LABELS = {
    "🍑 Echhi": "🗃️ Archived / Unassigned",
}


async def migrate_rarity_labels():
    """Rename legacy labels in the archive, saved vaults, and stored filters."""
    modified = 0

    for old_label, new_label in LEGACY_RARITY_RENAMES.items():
        archive_result = await collection.update_many(
            {"rarity": old_label},
            {"$set": {"rarity": new_label}},
        )
        modified += archive_result.modified_count

        vault_result = await user_collection.update_many(
            {"characters.rarity": old_label},
            {"$set": {"characters.$[ownedcharacter].rarity": new_label}},
            array_filters=[{"ownedcharacter.rarity": old_label}],
        )
        modified += vault_result.modified_count

        filter_result = await user_collection.update_many(
            {"filter_rarity": old_label},
            {"$set": {"filter_rarity": new_label}},
        )
        modified += filter_result.modified_count

    # Retire removed rarity labels without deleting any characters from the archive.
    for removed_label, archived_label in REMOVED_RARITY_LABELS.items():
        archive_result = await collection.update_many(
            {"rarity": removed_label},
            {"$set": {"rarity": archived_label}},
        )
        modified += archive_result.modified_count

        vault_result = await user_collection.update_many(
            {"characters.rarity": removed_label},
            {"$set": {"characters.$[ownedcharacter].rarity": archived_label}},
            array_filters=[{"ownedcharacter.rarity": removed_label}],
        )
        modified += vault_result.modified_count

        filter_result = await user_collection.update_many(
            {"filter_rarity": removed_label},
            {"$set": {"filter_rarity": None}},
        )
        modified += filter_result.modified_count

    return modified


@app.on_message(filters.command("rarity"))
async def rarity_count(client, message):
    try:
        distinct_rarities = set(await collection.distinct("rarity"))
        total_count = await collection.count_documents({})

        if not total_count:
            await message.reply_text(
                "✦ LUNA · RARITY INDEX ✦\n<blockquote>No rarities are registered yet.</blockquote>",
                parse_mode=enums.ParseMode.HTML
            )
            return

        response_message = (
            "<b>✦ LUNA · RARITY INDEX ✦</b>\n"
            "<blockquote>Explore the character universe by rarity</blockquote>\n"
        )
        active_total = 0

        for rarity in RARITY_NAMES:
            if rarity not in distinct_rarities:
                continue
            count = await collection.count_documents({"rarity": rarity})
            active_total += count
            response_message += f"◈ {rarity} — <b>{count:,}</b> character(s)\n"

        # Keep retired or unknown records in the universe total without making
        # their old labels selectable as active rarities.
        archived_count = max(total_count - active_total, 0)
        if archived_count:
            response_message += (
                f"◈ 🗃️ Archived / Unassigned — <b>{archived_count:,}</b> character(s)\n"
            )

        response_message += (
            f"\n✧ <b>UNIVERSE TOTAL</b> · <code>{total_count:,}</code>"
        )
        await message.reply_text(response_message, parse_mode=enums.ParseMode.HTML)

    except Exception:
        await message.reply_text(
            "✦ LUNA · SYSTEM NOTICE ✦\n<blockquote>Unable to load the rarity index right now.</blockquote>",
            parse_mode=enums.ParseMode.HTML
        )
