"""Elegant, small Luna branding for character still images."""

from io import BytesIO
from pathlib import Path

import aiohttp
from PIL import Image, ImageDraw, ImageFont, ImageOps


WATERMARK_TEXT = "@LunaWaifuBot"
_FONT_PATH = Path(__file__).resolve().parents[1] / "PlayfairDisplay-Bold.ttf"


def _load_font(size: int):
    try:
        return ImageFont.truetype(str(_FONT_PATH), size)
    except OSError:
        return ImageFont.load_default()


def _draw_four_point_star(draw, cx, cy, radius, fill):
    draw.polygon(
        [
            (cx, cy - radius),
            (cx + radius * 0.22, cy - radius * 0.22),
            (cx + radius, cy),
            (cx + radius * 0.22, cy + radius * 0.22),
            (cx, cy + radius),
            (cx - radius * 0.22, cy + radius * 0.22),
            (cx - radius, cy),
            (cx - radius * 0.22, cy - radius * 0.22),
        ],
        fill=fill,
    )


def _watermark_image(source: BytesIO) -> BytesIO:
    """Create an elegant translucent crescent-and-type badge on a still photo."""
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
        shortest = min(width, height)
        margin = max(5, round(shortest * 0.018))

        # Compact on larger art and keep the whole badge inside small images.
        badge_w = min(max(96, round(width * 0.30)), 250, max(1, width - 2 * margin))
        badge_h = min(max(36, round(shortest * 0.095)), 76, max(1, height - 2 * margin))
        radius = max(7, round(badge_h * 0.25))

        badge = Image.new("RGBA", (badge_w, badge_h), (0, 0, 0, 0))
        gradient = Image.new("RGBA", (badge_w, badge_h), (0, 0, 0, 0))
        grad_pixels = gradient.load()
        for x in range(badge_w):
            blend = x / max(1, badge_w - 1)
            # Midnight indigo blending into a muted plum tone.
            color = (
                int(17 + (43 - 17) * blend),
                int(19 + (27 - 19) * blend),
                int(43 + (68 - 43) * blend),
                204,
            )
            for y in range(badge_h):
                grad_pixels[x, y] = color

        shape_mask = Image.new("L", (badge_w, badge_h), 0)
        mask_draw = ImageDraw.Draw(shape_mask)
        mask_draw.rounded_rectangle(
            (0, 0, badge_w - 1, badge_h - 1),
            radius=radius,
            fill=255,
        )
        badge = Image.composite(gradient, badge, shape_mask)
        draw = ImageDraw.Draw(badge, "RGBA")

        # A fine lavender outer rim and warm inner highlight create a glassy seal.
        draw.rounded_rectangle(
            (0, 0, badge_w - 1, badge_h - 1),
            radius=radius,
            outline=(205, 185, 255, 155),
            width=max(1, round(badge_h * 0.022)),
        )
        draw.rounded_rectangle(
            (3, 3, badge_w - 4, badge_h - 4),
            radius=max(6, radius - 3),
            outline=(255, 224, 183, 55),
            width=1,
        )

        icon_cx = round(badge_h * 0.52)
        icon_cy = round(badge_h * 0.49)
        moon_r = max(8, round(badge_h * 0.22))
        draw.ellipse(
            (
                icon_cx - moon_r,
                icon_cy - moon_r,
                icon_cx + moon_r,
                icon_cy + moon_r,
            ),
            fill=(255, 221, 169, 245),
        )
        # Dark inner disc forms a crisp crescent rather than a full moon.
        cut = round(moon_r * 0.78)
        draw.ellipse(
            (
                icon_cx - cut + round(moon_r * 0.55),
                icon_cy - cut - round(moon_r * 0.08),
                icon_cx + cut + round(moon_r * 0.55),
                icon_cy + cut - round(moon_r * 0.08),
            ),
            fill=(30, 24, 55, 245),
        )
        _draw_four_point_star(
            draw,
            icon_cx + round(moon_r * 1.05),
            icon_cy - round(moon_r * 0.9),
            max(2, round(badge_h * 0.075)),
            (255, 240, 211, 245),
        )
        _draw_four_point_star(
            draw,
            icon_cx - round(moon_r * 0.9),
            icon_cy + round(moon_r * 0.95),
            max(1, round(badge_h * 0.045)),
            (211, 197, 255, 220),
        )

        text_x = round(badge_h * 0.94)
        main_size = max(14, round(badge_h * 0.39))
        sub_size = max(7, round(badge_h * 0.17))
        main_font = _load_font(main_size)
        sub_font = _load_font(sub_size)

        draw.text(
            (text_x, round(badge_h * 0.10)),
            "LUNA",
            font=main_font,
            fill=(255, 248, 238, 250),
            stroke_width=0,
        )
        draw.text(
            (text_x + 1, round(badge_h * 0.64)),
            WATERMARK_TEXT,
            font=sub_font,
            fill=(222, 211, 255, 235),
        )

        # A tiny accent at the far edge balances the composition.
        _draw_four_point_star(
            draw,
            badge_w - round(badge_h * 0.27),
            round(badge_h * 0.31),
            max(2, round(badge_h * 0.07)),
            (255, 223, 178, 220),
        )

        # A soft dark shadow separates the badge from busy anime backgrounds.
        shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        shadow_draw = ImageDraw.Draw(shadow)
        x2 = width - margin
        y2 = height - margin
        x1 = x2 - badge_w
        y1 = y2 - badge_h
        shadow_draw.rounded_rectangle(
            (x1 + 1, y1 + max(2, round(badge_h * 0.06)), x2 + 1, y2 + max(2, round(badge_h * 0.06))),
            radius=radius,
            fill=(0, 0, 0, 75),
        )
        canvas = Image.alpha_composite(canvas, shadow)
        canvas.alpha_composite(badge, (x1, y1))

        output = BytesIO()
        if has_alpha:
            canvas.save(output, format="PNG", optimize=True)
            output.name = "luna-watermarked.png"
        else:
            canvas.convert("RGB").save(
                output,
                format="JPEG",
                quality=93,
                optimize=True,
                progressive=True,
            )
            output.name = "luna-watermarked.jpg"
        output.seek(0)
        return output


async def get_watermarked_photo(client, media_reference):
    """
    Download a Telegram file_id or HTTP(S) image and return a watermarked copy.
    Returns None on unsupported media/errors so callers can fall back safely.
    """
    if not media_reference:
        return None

    downloaded = None
    try:
        if isinstance(media_reference, str) and media_reference.lower().startswith(("http://", "https://")):
            timeout = aiohttp.ClientTimeout(total=20)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(media_reference) as response:
                    response.raise_for_status()
                    source = BytesIO(await response.read())
        else:
            downloaded = await client.download_media(media_reference, in_memory=True)
            if downloaded is None:
                return None
            source = BytesIO(downloaded) if isinstance(downloaded, bytes) else downloaded

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
