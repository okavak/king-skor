#!/usr/bin/env python3
"""King Skor ikonları: lacivert zemin üstünde hafif eğik bir iskambil kartı, kırmızı K ve kupa (Rıfkı)."""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
NAVY = (27, 34, 54, 255)
CARD = (251, 248, 240, 255)
RED = (200, 50, 58, 255)
FONT = '/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf'


def font(size):
    try:
        return ImageFont.truetype(FONT, size)
    except Exception:
        return ImageFont.load_default()


def heart(d, cx, cy, w, fill):
    r = w / 4
    d.ellipse([cx - w / 2, cy - r, cx, cy + r], fill=fill)
    d.ellipse([cx, cy - r, cx + w / 2, cy + r], fill=fill)
    d.polygon([(cx - w / 2, cy), (cx + w / 2, cy), (cx, cy + w * 0.72)], fill=fill)


def make(size, rounded, card_scale, out_name):
    S = size * 4
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22) if rounded else 0, fill=NAVY)
    ch = int(S * card_scale)
    cw = int(ch * 0.70)
    card = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
    cd = ImageDraw.Draw(card)
    cd.rounded_rectangle([0, 0, cw - 1, ch - 1], radius=int(cw * 0.12), fill=CARD)
    cd.text((cw / 2, ch * 0.33), 'K', font=font(int(ch * 0.50)), fill=RED, anchor='mm')
    heart(cd, cw / 2, ch * 0.70, cw * 0.44, RED)
    card = card.rotate(8, expand=True, resample=Image.BICUBIC)
    img.alpha_composite(card, ((S - card.width) // 2, (S - card.height) // 2))
    img = img.resize((size, size), Image.LANCZOS)
    os.makedirs(OUT, exist_ok=True)
    img.save(os.path.join(OUT, out_name))
    print(out_name, size)


if __name__ == '__main__':
    make(512, True, 0.72, 'icon-512.png')
    make(192, True, 0.72, 'icon-192.png')
    make(512, False, 0.60, 'maskable-512.png')   # kenarlar maskelenir: iç %80 güvenli alan
    make(180, False, 0.72, 'apple-touch-icon.png')  # iOS köşeleri kendisi yuvarlar
    make(32, False, 0.80, 'favicon-32.png')
