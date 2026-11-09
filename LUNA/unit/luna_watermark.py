"""Small, unobtrusive watermarking for Luna character photos."""

from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


WATERMARK_TEXT = "@LunaWaifuBot"
_FONT_PATH = Path(__file__).resolve().parents[1] / "PlayfairDisplay-Bold.ttf"


def _watermark_image(source: BytesIO) -> BytesIO:
    """Return an in-memory watermarked copy; never modify the original file."""
    source.seek(0)
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened)
        if getattr(image, "is_animated", False):
            raise ValueError("Animated images are not watermarked as still photos.")
        image.load()

        has_alpha = image.mode in ("RGBA", "LA") or (
            image.mode == "P" and "transparency" in image.info
        )
        canvas = image.convert("RGBA")
        width, height = canvas.size

        # Keep the mark small and proportional on both portrait and landscape art.
        font_size = max(12, min(28, round(min(width, height) * 0.022)))
        margin = max(9, round(min(width, height) * 0.022))
        padding_x = max(7, round(font_size * 0.55))
        padding_y = max(4, round(font_size * 0.32))

        try:
            font = ImageFont.truetype(str(_FONT_PATH), font_size)
        except OSError:
            font = ImageFont.load_default()

        draw = ImageDraw.Draw(canvas, "RGBA")
        left, top, right, bottom = draw.textbbox((0, 0), WATERMARK_TEXT, font=font)
        text_width = right - left
        text_height = bottom - top

        x2 = width - margin
        y2 = height - margin
        x1 = x2 - text_width - (padding_x * 2)
        y1 = y2 - text_height - (padding_y * 2)

        # Soft translucent backing keeps the lettering legible without dominating art.
        radius = max(5, round(font_size * 0.38))
        draw.rounded_rectangle(
            (x1, y1, x2, y2),
            radius=radius,
            fill=(8, 12, 22, 105),
        )
        draw.text(
            (x1 + padding_x - left, y1 + padding_y - top),
            WATERMARK_TEXT,
            font=font,
            fill=(255, 255, 255, 220),
            stroke_width=max(0, font_size // 18),
            stroke_fill=(0, 0, 0, 90),
        )

        output = BytesIO()
        if has_alpha:
            canvas.save(output, format="PNG", optimize=True)
            output.name = "luna-watermarked.png"
        else:
            canvas.convert("RGB").save(
                output,
                format="JPEG",
                quality=91,
                optimize=True,
                progressive=True,
            )
            output.name = "luna-watermarked.jpg"
        output.seek(0)
        return output


async def get_watermarked_photo(client, media_reference):
    """
    Download a Telegram file_id or HTTP(S) image, watermark it, and return a
    rewinded BytesIO ready for Pyrogram or python-telegram-bot photo uploads.

    Returns None on unsupported media/download/image errors so callers can
    safely fall back to the original media instead of losing a character drop.
    """
    if not media_reference:
        return None

    downloaded = None
    try:
        downloaded = await client.download_media(media_reference, in_memory=True)
        if downloaded is None:
            return None
        if isinstance(downloaded, bytes):
            source = BytesIO(downloaded)
        else:
            source = downloaded
        source.seek(0)
        return _watermark_image(source)
    except Exception as exc:
        try:
            from LUNA import LOGGER
            LOGGER("LUNA.WATERMARK").warning(
                "Could not watermark character photo; using original media: %s",
                str(exc)[:300],
            )
        except Exception:
            pass
        return None
    finally:
        if downloaded is not None and hasattr(downloaded, "close"):
            try:
                downloaded.close()
            except Exception:
                pass
