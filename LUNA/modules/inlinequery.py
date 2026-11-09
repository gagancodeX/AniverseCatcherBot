import re
import time
import os
import asyncio
from html import escape
from cachetools import TTLCache
from telegram import (
    Update, InlineQueryResultPhoto, InlineQueryResultVideo,
    InlineQueryResultCachedPhoto, InlineQueryResultCachedVideo,
    InlineQueryResultCachedDocument, InlineQueryResultArticle,
    InputTextMessageContent, InlineQueryResultsButton, WebAppInfo, InlineQueryResultGame,
)
from telegram.ext import InlineQueryHandler, CallbackContext, BaseHandler
from LUNA import application, bot_client, DATABASE_ID, db
from LUNA.unit.luna_watermark import get_watermarked_photo
from LUNA.unit.luna_inline import *


all_characters_cache = TTLCache(maxsize=10000, ttl=300)  # Cache for all characters
user_collection_cache = TTLCache(maxsize=10000, ttl=60)  # Cache for user collections


# Persist processed image variants so old archive images only need watermarking once.
inline_watermark_cache = db["luna_inline_watermark_cache"]
_inline_watermark_locks = {}
_inline_watermark_semaphore = asyncio.Semaphore(5)
_inline_watermark_tasks = set()


def _release_inline_watermark_task(task):
    _inline_watermark_tasks.discard(task)
    if not task.cancelled():
        try:
            error = task.exception()
            if error:
                from LUNA import LOGGER
                LOGGER("LUNA.INLINE").warning(
                    "Background watermark task failed: %s",
                    str(error)[:250],
                )
        except Exception:
            pass


async def _get_inline_watermarked_file_id(character):
    """Return a cached Telegram photo ID with the Luna watermark applied."""
    media_type = character.get("media_type", "photo")
    if media_type not in ("photo", "document"):
        return None

    source = character.get("media_file_id") or character.get("img_url")
    if not source:
        return None

    # New uploads already carry the mark in the stored image.
    if character.get("watermarked") and character.get("media_file_id"):
        return character["media_file_id"]

    source_key = str(source)
    cached = await inline_watermark_cache.find_one({"source_key": source_key})
    if cached and cached.get("watermarked_file_id"):
        return cached["watermarked_file_id"]

    lock = _inline_watermark_locks.setdefault(source_key, asyncio.Lock())
    async with lock:
        # Another concurrent inline query may have completed the watermark.
        cached = await inline_watermark_cache.find_one({"source_key": source_key})
        if cached and cached.get("watermarked_file_id"):
            return cached["watermarked_file_id"]

        watermarked_photo = await get_watermarked_photo(bot_client, source)
        if not watermarked_photo:
            return None

        stored_message = None
        try:
            stored_message = await bot_client.send_photo(
                chat_id=DATABASE_ID,
                photo=watermarked_photo,
                caption=f"✦ LUNA · WATERMARKED ARCHIVE · #{character.get('id', '?')} ✦",
                disable_notification=True,
            )
            if not stored_message.photo:
                return None

            watermarked_file_id = stored_message.photo.file_id
            await inline_watermark_cache.update_one(
                {"source_key": source_key},
                {"$set": {
                    "source_key": source_key,
                    "source_media_type": media_type,
                    "watermarked_file_id": watermarked_file_id,
                    "character_id": str(character.get("id", "")),
                }},
                upsert=True,
            )
            return watermarked_file_id
        except Exception as exc:
            from LUNA import LOGGER
            LOGGER("LUNA.INLINE").warning(
                "Inline watermark failed for character %s: %s",
                character.get("id", "?"),
                str(exc)[:250],
            )
            return None
        finally:
            watermarked_photo.close()


async def _prepare_inline_watermark(index, character):
    """Limit concurrent media work so the inline answer stays responsive."""
    async with _inline_watermark_semaphore:
        return index, await _get_inline_watermarked_file_id(character)


async def inlinequery(update: Update, context: CallbackContext) -> None:
    query = update.inline_query.query

    # Inline Mini App launcher for the Luna arcade. The Mini App URL is supplied
    # by the static-site host through GAMEZONE_URL; normal character search is
    # unchanged for every other inline query.
    if query.strip().lower() in {"game", "games", "gamezone", "arcade", "play"}:
        # Native Telegram Games are enabled only after all six titles have been
        # registered through @BotFather with the matching short names below.
        # Until then, retain the existing Mini App launcher so the arcade remains usable.
        native_games_enabled = os.getenv("LUNA_NATIVE_GAMES_ENABLED", "1").strip().lower() in {
            "1", "true", "yes", "on"
        }
        native_games = [
            ("luna_flappy", "FLAPPY LUNA"),
            ("luna_run", "LUNA RUN"),
            ("luna_sky_jumper", "SKY JUMPER"),
            ("luna_star_defender", "STAR DEFENDER"),
            ("luna_neon_breaker", "NEON BREAKER"),
            ("luna_neon_racer", "NEON RACER"),
        ]
        if native_games_enabled:
            await update.inline_query.answer(
                results=[
                    InlineQueryResultGame(
                        id=f"luna_native_{index}",
                        game_short_name=short_name,
                    )
                    for index, (short_name, _title) in enumerate(native_games, start=1)
                ],
                cache_time=0,
                is_personal=True,
            )
            return

        gamezone_url = os.getenv("GAMEZONE_URL", "").strip()
        if gamezone_url.startswith("https://"):
            await update.inline_query.answer(
                results=[],
                button=InlineQueryResultsButton(
                    text="☾ OPEN LUNA GAMEZONE",
                    web_app=WebAppInfo(url=gamezone_url),
                ),
                cache_time=2,
                is_personal=True,
            )
        else:
            await update.inline_query.answer(
                results=[
                    InlineQueryResultArticle(
                        id="luna_gamezone_setup",
                        title="☾ LUNA GAMEZONE",
                        description="Arcade files are ready; public HTTPS hosting is not connected yet.",
                        input_message_content=InputTextMessageContent(
                            "✦ LUNA GAMEZONE ✦\\n\\n"
                            "The arcade is built, but its public HTTPS URL has not been connected to the bot yet."
                        ),
                    )
                ],
                cache_time=2,
                is_personal=True,
            )
        return
    offset = int(update.inline_query.offset) if update.inline_query.offset else 0

    # Check if query is for a user's collection
    if query.startswith('collection.'):
        user_id, *search_terms = query.split(' ')[0].split('.')[1], ' '.join(query.split(' ')[1:])
        if user_id.isdigit():
            user = user_collection_cache.get(user_id) or await get_user_collection(user_id)
            if user:
                user_collection_cache[user_id] = user  # Cache the result
                all_characters = list({char['id']: char for char in user['characters'] if 'id' in char}.values())  # Deduplicate by ID
                
                if search_terms:
                    regex = re.compile(' '.join(search_terms), re.IGNORECASE)
                    all_characters = [char for char in all_characters if regex.search(char['name']) or regex.search(char['anime'])]
            else:
                all_characters = []
        else:
            all_characters = []
    else:
        # General character search
        if query:
            all_characters = await search_characters(query)
        else:
            all_characters = all_characters_cache.get('all_characters') or await get_all_characters()
            all_characters_cache['all_characters'] = all_characters  # Cache the result

    # New Telegram-stored media and older URL-based media are both supported.
    if '.AMV' in query:
        all_characters = [
            char for char in all_characters
            if char.get('media_type') == 'video' or 'vid_url' in char
        ]
    else:
        all_characters = [
            char for char in all_characters
            if (
                (char.get('media_file_id') and char.get('media_type') != 'video')
                or 'img_url' in char
            )
        ]

    # Pagination logic
    characters = all_characters[offset:offset + 50]
    next_offset = str(offset + len(characters)) if len(characters) == 50 else None

    # Process the visible result page concurrently. Slow items keep processing
    # in the background and are cached for the user's next inline refresh.
    inline_watermarked_ids = {}
    pending_watermark_tasks = {}
    for index, character in enumerate(characters):
        media_type = character.get("media_type", "photo")
        if media_type not in ("photo", "document"):
            continue
        if character.get("watermarked") and character.get("media_file_id"):
            inline_watermarked_ids[index] = character["media_file_id"]
            continue
        if character.get("media_file_id") or character.get("img_url"):
            task = asyncio.create_task(_prepare_inline_watermark(index, character))
            pending_watermark_tasks[task] = index
            _inline_watermark_tasks.add(task)
            task.add_done_callback(_release_inline_watermark_task)

    if pending_watermark_tasks:
        done, _pending = await asyncio.wait(
            pending_watermark_tasks,
            timeout=5.0,
        )
        for task in done:
            try:
                index, watermarked_file_id = task.result()
                if watermarked_file_id:
                    inline_watermarked_ids[index] = watermarked_file_id
            except Exception as exc:
                from LUNA import LOGGER
                LOGGER("LUNA.INLINE").warning(
                    "Inline watermark task failed: %s",
                    str(exc)[:250],
                )

    # Construct results for inline query
    results = []
    for character_index, character in enumerate(characters):
        # Generate caption based on whether it's a user collection or global character search
        if 'user' in locals():
            user_character_count = sum(1 for char in user['characters'] if 'id' in char and char['id'] == character['id'])
            caption = (
                f"<b>👤 Check out <a href='tg://user?id={user['id']}'>{escape(user.get('first_name', 'User'))}</a>'s character:</b>\n\n"
                f"🌸 <b>{character['name']} (x{user_character_count})</b>\n"
                f"🏖️ From: <b>{character['anime']}</b>\n"
                f"🔮 Rarity: <b>{character['rarity']}</b>\n\n"
                f"🆔️ <b>{character['id']}</b>\n\n"
            )
        else:
            caption = (
                f"<b>Discover this amazing character:</b>\n\n"
                f"🌸 <b>{character['name']}</b>\n"
                f"🏖️ From: <b>{character['anime']}</b>\n"
                f"🔮 Rarity: <b>{character['rarity']}</b>\n"
                f"🆔️ <b>{character['id']}</b>\n\n"
            )

        media_file_id = character.get('media_file_id')
        media_type = character.get('media_type', 'photo')
        result_id = f"{character['id']}_{time.time_ns()}"

        # Existing archive images use the processed cached file ID.
        inline_photo_id = inline_watermarked_ids.get(character_index)
        if media_type in ("photo", "document") and inline_photo_id:
            results.append(
                InlineQueryResultCachedPhoto(
                    id=result_id,
                    photo_file_id=inline_photo_id,
                    caption=caption,
                    parse_mode='HTML'
                )
            )
            continue

        # Cached Telegram results need no public URL or external hosting.
        if media_file_id:
            if media_type == 'video':
                results.append(
                    InlineQueryResultCachedVideo(
                        id=result_id,
                        video_file_id=media_file_id,
                        title=character['name'],
                        description=f"From: {character['anime']} | Rarity: {character['rarity']}",
                        caption=caption,
                        parse_mode='HTML'
                    )
                )
            elif media_type in ('document', 'animation'):
                results.append(
                    InlineQueryResultCachedDocument(
                        id=result_id,
                        document_file_id=media_file_id,
                        title=character['name'],
                        description=f"From: {character['anime']} | Rarity: {character['rarity']}",
                        caption=caption,
                        parse_mode='HTML'
                    )
                )
            else:
                results.append(
                    InlineQueryResultCachedPhoto(
                        id=result_id,
                        photo_file_id=media_file_id,
                        caption=caption,
                        parse_mode='HTML'
                    )
                )
        elif 'vid_url' in character:
            thumbnail_url = character.get('thum_url', 'https://envs.sh/6Y3.jpg')
            results.append(
                InlineQueryResultVideo(
                    id=result_id,
                    video_url=character['vid_url'],
                    mime_type="video/mp4",
                    thumbnail_url=thumbnail_url,
                    title=character['name'],
                    description=f"From: {character['anime']} | Rarity: {character['rarity']}",
                    caption=caption,
                    parse_mode='HTML'
                )
            )
        elif 'img_url' in character:
            results.append(
                InlineQueryResultPhoto(
                    thumbnail_url=character['img_url'],
                    id=result_id,
                    photo_url=character['img_url'],
                    caption=caption,
                    parse_mode='HTML'
                )
            )

    # Send the results with pagination
    await update.inline_query.answer(results, next_offset=next_offset, cache_time=5)
    

# Native Telegram Games: map each BotFather short name to the hosted HTML5 game.
# Telegram opens this URL in its in-app game view after the user taps Play.
NATIVE_GAME_ROUTES = {
    "luna_flappy": "flappy",
    "luna_run": "runner",
    "luna_sky_jumper": "jumper",
    "luna_star_defender": "space",
    "luna_neon_breaker": "brick",
    "luna_neon_racer": "racer",
}


async def game_callback_query(update: Update, context: CallbackContext) -> None:
    """Answer game callbacks with the matching hosted game URL."""
    callback_query = update.callback_query
    if callback_query is None or not callback_query.game_short_name:
        return

    game_slug = NATIVE_GAME_ROUTES.get(callback_query.game_short_name)
    gamezone_url = os.getenv("GAMEZONE_URL", "").strip()
    if not game_slug:
        await callback_query.answer(
            text="This Luna game is not configured yet.",
            show_alert=True,
        )
        return

    if not gamezone_url.startswith("https://"):
        await callback_query.answer(
            text="Luna GameZone is temporarily unavailable. Please try again later.",
            show_alert=True,
        )
        return

    game_url = f"{gamezone_url.rstrip('/')}/?game={game_slug}"
    await callback_query.answer(url=game_url)


class GameCallbackHandler(BaseHandler):
    """PTB 20.6 handler for game_short_name callbacks.

    PTB 20.6's CallbackQueryHandler only matches callback_data. Game callbacks
    carry game_short_name instead, so check that field explicitly.
    """

    def check_update(self, update):
        if not isinstance(update, Update):
            return False
        callback_query = update.callback_query
        return bool(callback_query and callback_query.game_short_name)


# Add handlers to the bot application.
application.add_handler(InlineQueryHandler(inlinequery, block=False))
application.add_handler(GameCallbackHandler(game_callback_query))

