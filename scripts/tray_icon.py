"""Generate a simple tray icon for Free U Agent.

Run once to create scripts/freeu_tray.ico:
    python scripts/tray_icon.py
"""

from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("pip install Pillow first")
    raise SystemExit(1)

SIZE = 64
OUT = Path(__file__).parent / "freeu_tray.ico"


def make_icon() -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Purple circle background
    draw.ellipse([4, 4, SIZE - 4, SIZE - 4], fill=(129, 140, 248, 255))

    # White "U" letter
    try:
        font = ImageFont.truetype("arial.ttf", 36)
    except OSError:
        font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), "U", font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (SIZE - tw) / 2 - bbox[0]
    y = (SIZE - th) / 2 - bbox[1]
    draw.text((x, y), "U", fill=(255, 255, 255, 255), font=font)

    return img


if __name__ == "__main__":
    icon = make_icon()
    icon.save(str(OUT), format="ICO", sizes=[(64, 64), (32, 32), (16, 16)])
    print(f"Saved: {OUT}")
