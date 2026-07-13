"""Generate every branding asset from the two STATUS 1 logo sources.

Sources (committed, not used at runtime):
    assets/status-1-logo.png      - emblem only (hex badge + drone), dark background
    assets/status-1-logo-txt.png  - full lockup (emblem + STATUS 1 wordmark)

Both were authored on a flat, nearly noiseless dark-navy background. A neon glow on
such a background is essentially additive, so the matte is not a threshold but an
un-composite: given C = B + a * (F - B), the alpha of a glow pixel is how far it got
from the background relative to a fully lit pixel, and the straight color follows from
solving for F. Thresholding alpha instead would quantize the halo into a visible ring
(see CLAUDE.md: no alpha thresholding, no PNG quantization on these gradients).

The badge body is dark on purpose (unlit panels, city silhouette, black outlines), so
brightness alone cannot tell "inside the badge" from "background". Anything enclosed by
the bright neon frame is therefore forced opaque via a fill-holes pass on the alpha map.

Run:  python tools/gen_logo.py
"""

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = __import__('pathlib').Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'assets'

# Flat background both sources were rendered on (verified: per-channel std < 1).
BG = np.array([0.0, 3.0, 25.0])
# UI background the opaque assets (apple-touch, maskable, og) sit on - matches
# <meta name="theme-color"> and site.webmanifest.
UI_BG = (21, 24, 51)


def cutout(path):
    """Un-composite the artwork from its flat background -> straight-alpha RGBA float."""
    rgb = np.asarray(Image.open(path).convert('RGB'), dtype=np.float64)
    d = rgb - BG

    # Alpha of a glow pixel: its brightest channel's distance from the background,
    # normalized against a fully lit one. Black outlines read as "distant" too, which
    # is what we want - they are part of the artwork, not the background.
    m = np.abs(d).max(axis=2)
    alpha = np.clip(m / 255.0, 0.0, 1.0)
    alpha[m < 3.0] = 0.0  # kill sensor-level noise in the flat background

    # Everything enclosed by the neon frame belongs to the badge, however dark it is.
    core = ndimage.binary_fill_holes(
        ndimage.binary_closing(alpha > 0.5, structure=np.ones((7, 7)))
    )
    alpha = np.maximum(alpha, core.astype(np.float64))

    # Solve C = B + a*(F - B) for F. At a == 1 this is the identity, so the badge body
    # keeps its authored color and the halo blends into it without a seam.
    safe = np.maximum(alpha, 1e-6)[..., None]
    color = np.clip(BG + d / safe, 0, 255)
    # Transparent pixels carry the background color so any resampling bleed stays dark.
    color = np.where(alpha[..., None] > 0, color, BG)

    return np.dstack([color, alpha[..., None] * 255.0])


def crop(rgba, pad=0.0):
    """Crop to the visible bounds, then pad by a fraction of the longer side."""
    ys, xs = np.nonzero(rgba[..., 3] > 0.5)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    out = rgba[y0:y1, x0:x1]
    if pad > 0:
        p = int(round(max(out.shape[:2]) * pad))
        out = np.pad(out, ((p, p), (p, p), (0, 0)))
        out[..., :3] = np.where(out[..., 3:4] > 0, out[..., :3], BG)
    return out


def to_image(rgba):
    return Image.fromarray(np.round(rgba).astype(np.uint8), 'RGBA')


def resize(rgba, size, sharpen=False):
    """Resize through premultiplied alpha - straight alpha would drag halo color inward."""
    a = rgba[..., 3:4] / 255.0
    pre = np.dstack([rgba[..., :3] * a, rgba[..., 3:4]])
    small = np.asarray(
        to_image(pre).resize(size, Image.LANCZOS), dtype=np.float64
    )
    a2 = np.maximum(small[..., 3:4] / 255.0, 1e-6)
    out = np.dstack([np.clip(small[..., :3] / a2, 0, 255), small[..., 3:4]])
    img = to_image(out)
    if sharpen:  # tiny icons lose the hex silhouette to the resampler
        img = img.filter(ImageFilter.UnsharpMask(radius=1, percent=70, threshold=0))
    return img


def square(rgba):
    """Letterbox to a square canvas so icons keep the emblem centered and unstretched."""
    h, w = rgba.shape[:2]
    s = max(h, w)
    out = np.zeros((s, s, 4))
    out[..., :3] = BG
    oy, ox = (s - h) // 2, (s - w) // 2
    out[oy:oy + h, ox:ox + w] = rgba
    return out


def flatten(img, bg=UI_BG):
    """Composite onto an opaque background (Apple icons and maskables ignore alpha)."""
    out = Image.new('RGB', img.size, bg)
    out.paste(img, (0, 0), img)
    return out


def save(img, name):
    img.save(ASSETS / name)
    print(f'  {name:24s} {img.size[0]:>4}x{img.size[1]:<4} {img.mode:5s} '
          f'{(ASSETS / name).stat().st_size / 1024:6.1f} KB')


def main():
    print('cutting out backgrounds...')
    mark_src = cutout(ASSETS / 'status-1-logo.png')
    full_src = cutout(ASSETS / 'status-1-logo-txt.png')

    # Emblem: keep a little of the halo, it is what makes the mark read as neon.
    mark = square(crop(mark_src, pad=0.02))
    # Icons: crop the halo tighter so the badge itself fills the (often 16px) frame.
    icon = square(crop(mark_src, pad=0.0))
    full = crop(full_src, pad=0.015)

    print('runtime marks:')
    save(resize(mark, (512, 512)), 'logo-mark.png')
    save(resize(full, (1024, round(1024 * full.shape[0] / full.shape[1]))), 'logo-full.png')

    print('favicons / app icons:')
    for size in (16, 32, 48, 180, 192, 512):
        save(resize(icon, (size, size), sharpen=size <= 48), f'icon-{size}.png')

    # ICO frames are built here rather than via PIL's sizes= so each one goes through
    # the premultiplied resize above.
    ico = resize(icon, (48, 48), sharpen=True)
    ico.save(ASSETS / 'favicon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48)],
             append_images=[resize(icon, (16, 16), sharpen=True),
                            resize(icon, (32, 32), sharpen=True)])
    print(f'  favicon.ico              16/32/48       ICO   '
          f'{(ASSETS / "favicon.ico").stat().st_size / 1024:6.1f} KB')

    save(flatten(resize(icon, (180, 180))), 'apple-touch-icon.png')

    # Maskable: launchers crop to a circle of radius 40% - keep the badge well inside it.
    canvas = Image.new('RGBA', (512, 512), UI_BG + (255,))
    inner = resize(icon, (296, 296))
    canvas.paste(inner, (108, 108), inner)
    save(flatten(canvas), 'icon-maskable-512.png')

    print('social preview:')
    og = Image.new('RGB', (1200, 630), (10, 13, 30))
    glow = Image.new('RGBA', (1200, 630), (0, 0, 0, 0))
    # Soft teal wash behind the lockup so the card is not a flat rectangle.
    g = Image.new('RGBA', (1200, 630), (0, 235, 199, 0))
    gd = np.zeros((630, 1200, 4))
    yy, xx = np.mgrid[0:630, 0:1200]
    r = np.hypot((xx - 600) / 620.0, (yy - 315) / 360.0)
    gd[..., :3] = (0, 90, 110)
    gd[..., 3] = np.clip(1.0 - r, 0, 1) ** 2 * 90
    g = to_image(gd)
    glow.alpha_composite(g)
    og.paste(glow, (0, 0), glow)
    lock = resize(full, (1000, round(1000 * full.shape[0] / full.shape[1])))
    og.paste(lock, ((1200 - lock.size[0]) // 2, (630 - lock.size[1]) // 2), lock)
    save(og, 'og-image.png')


if __name__ == '__main__':
    main()
