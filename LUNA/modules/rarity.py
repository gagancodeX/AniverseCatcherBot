# ==========================================
# Creator: Adam
# Project: LunaCatcherBot
# ==========================================

from pyrogram import filters, enums
from pyrogram.types import MessageEntity

from LUNA import (
    app,
    bot_client,
    DATABASE_ID,
    collection,
    user_collection,
    rarity_map,
    RARITY_NAMES,
    LOGGER,
)


# Existing character records keep their IDs; only their display labels change.
LEGACY_RARITY_RENAMES = {
    # Previous emoji labels for the six core rarities.
    "⚪️ Origin Edition": rarity_map[1],
    "🟣 Phantom Edition": rarity_map[2],
    "🟡 Vanguard Edition": rarity_map[3],
    "🟢 Arcane Edition": rarity_map[4],
    "💮 Zenith Edition": rarity_map[5],
    "🔮 Ethereal Edition": rarity_map[6],
    # Earlier rarity names retained for backward-compatible data migration.
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

ALL_LEGACY_LABELS = {
    **LEGACY_RARITY_RENAMES,
    **REMOVED_RARITY_LABELS,
}


def _utf16_length(value):
    """Telegram message entity offsets are measured in UTF-16 code units."""
    return len(value.encode("utf-16-le")) // 2


def _shift_caption_entities(entities, old_caption, old_label, match_index, new_label):
    """Preserve Telegram formatting and links after replacing an emoji label."""
    start = _utf16_length(old_caption[:match_index])
    old_end = start + _utf16_length(old_label)
    delta = _utf16_length(new_label) - _utf16_length(old_label)
    shifted = []

    for entity in entities or []:
        offset = entity.offset
        length = entity.length
        entity_end = offset + length

        if offset >= old_end:
            offset += delta
        elif offset <= start and entity_end >= old_end:
            length += delta

        shifted.append(
            MessageEntity(
                type=entity.type,
                offset=offset,
                length=length,
                url=getattr(entity, "url", None),
                user=getattr(entity, "user", None),
                language=getattr(entity, "language", None),
                custom_emoji_id=getattr(entity, "custom_emoji_id", None),
            )
        )

    return shifted


async def sync_database_channel_captions():
    """Update old rarity labels in existing Telegram database-channel posts.

    The archive stores each copied post's chat and message IDs. This allows the
    migration to edit the original channel caption without changing its media.
    """
    active_labels = list(RARITY_NAMES) + list(REMOVED_RARITY_LABELS.values())
    cursor = collection.find({
        "rarity": {"$in": active_labels},
        "media_message_id": {"$exists": True, "$ne": None},
    })

    characters = await cursor.to_list(length=None)
    grouped = {}
    for character in characters:
        message_id = character.get("media_message_id")
        if not message_id:
            continue
        chat_id = character.get("media_chat_id") or DATABASE_ID
        if not chat_id:
            continue
        grouped.setdefault(chat_id, []).append(character)

    edited = 0
    seen_messages = set()

    for chat_id, records in grouped.items():
        for offset in range(0, len(records), 100):
            batch = records[offset:offset + 100]
            message_ids = [int(item["media_message_id"]) for item in batch]

            try:
                fetched = await bot_client.get_messages(
                    chat_id=chat_id,
                    message_ids=message_ids,
                )
            except Exception as exc:
                LOGGER("LUNA.RARITY").warning(
                    "Could not read database-channel messages in %s: %s",
                    chat_id,
                    str(exc)[:180],
                )
                continue

            if not isinstance(fetched, list):
                fetched = [fetched]
            messages_by_id = {
                message.id: message for message in fetched
                if message and getattr(message, "id", None)
            }

            for character in batch:
                message_id = int(character["media_message_id"])
                message_key = (str(chat_id), message_id)
                if message_key in seen_messages:
                    continue
                seen_messages.add(message_key)

                message = messages_by_id.get(message_id)
                caption = getattr(message, "caption", None) if message else None
                current_label = character.get("rarity")
                if not caption or not current_label:
                    continue

                replacement = None
                match_index = None
                for old_label, new_label in ALL_LEGACY_LABELS.items():
                    if new_label == current_label and old_label in caption:
                        replacement = (old_label, new_label)
                        match_index = caption.find(old_label)
                        break

                if not replacement:
                    continue

                old_label, new_label = replacement
                updated_caption = (
                    caption[:match_index]
                    + new_label
                    + caption[match_index + len(old_label):]
                )
                entities = _shift_caption_entities(
                    getattr(message, "caption_entities", None),
                    caption,
                    old_label,
                    match_index,
                    new_label,
                )

                try:
                    await bot_client.edit_message_caption(
                        chat_id=chat_id,
                        message_id=message_id,
                        caption=updated_caption,
                        caption_entities=entities,
                        parse_mode=enums.ParseMode.DISABLED,
                    )
                    edited += 1
                except Exception as exc:
                    LOGGER("LUNA.RARITY").warning(
                        "Could not update rarity caption for database post %s: %s",
                        message_id,
                        str(exc)[:180],
                    )

    LOGGER("LUNA.RARITY").info(
        "Database channel rarity caption sync complete: %s message(s) edited.",
        edited,
    )
    return edited


async def migrate_rarity_labels():
    """Rename old labels in the archive, vaults, filters, and channel captions."""
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

    await sync_database_channel_captions()
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
