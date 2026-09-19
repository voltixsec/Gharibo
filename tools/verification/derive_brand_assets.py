"""Derive GHARIBO brand assets from the official supplied logo.

Only cropping, resizing and format conversion are performed. The mark is never
redrawn, recoloured or replaced, and the wordmark is never altered — the
supplied asset remains the visual source of truth.
"""
import sys
from pathlib import Path

from PIL import Image

SRC = Path(sys.argv[1])
OUT = Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)

img = Image.open(SRC).convert("RGB")
W, H = img.size
gray = img.convert("L")
px = gray.load()

THRESH = 60


def col_extent(y0, y1, thresh_ratio=0.02):
    """Horizontal extent of content within a row band."""
    counts = []
    for x in range(W):
        c = sum(1 for y in range(y0, y1, 2) if px[x, y] > THRESH)
        counts.append(c)
    peak = max(counts) or 1
    cut = peak * thresh_ratio
    xs = [x for x, c in enumerate(counts) if c > cut]
    return (min(xs), max(xs)) if xs else (0, W)


def row_extent(x0, x1, y0, y1, thresh_ratio=0.02):
    """Vertical extent of content within a column band."""
    counts = []
    for y in range(y0, y1):
        c = sum(1 for x in range(x0, x1, 2) if px[x, y] > THRESH)
        counts.append(c)
    peak = max(counts) or 1
    cut = peak * thresh_ratio
    ys = [y0 + i for i, c in enumerate(counts) if c > cut]
    return (min(ys), max(ys)) if ys else (y0, y1)


# --- Mark: the orbital sphere ------------------------------------------------
SPHERE_Y0, SPHERE_Y1 = 150, 760
sx0, sx1 = col_extent(SPHERE_Y0, SPHERE_Y1)
sy0, sy1 = row_extent(sx0, sx1, SPHERE_Y0, SPHERE_Y1)

# Square crop centred on the sphere so the mark stays perfectly circular.
cx = (sx0 + sx1) // 2
cy = (sy0 + sy1) // 2
half = max(sx1 - sx0, sy1 - sy0) // 2
pad = int(half * 0.10)
half += pad

mx0 = max(0, cx - half)
my0 = max(0, cy - half)
mx1 = min(W, cx + half)
my1 = min(H, cy + half)
mark = img.crop((mx0, my0, mx1, my1))
side = min(mark.size)
mark = mark.crop((0, 0, side, side))

print(f"mark crop: ({mx0},{my0})-({mx1},{my1}) -> {mark.size}")

mark.resize((512, 512), Image.LANCZOS).save(OUT / "gharibo-ai-mark.png", optimize=True)
mark.resize((1024, 1024), Image.LANCZOS).save(OUT / "gharibo-ai-mark@2x.png", optimize=True)

# --- Wordmark: "GHARIBO AI" --------------------------------------------------
WORD_Y0, WORD_Y1 = 770, 930
wx0, wx1 = col_extent(WORD_Y0, WORD_Y1)
wy0, wy1 = row_extent(wx0, wx1, WORD_Y0, WORD_Y1)
wpad_y = int((wy1 - wy0) * 0.35)
word = img.crop(
    (
        max(0, wx0 - 12),
        max(0, wy0 - wpad_y),
        min(W, wx1 + 12),
        min(H, wy1 + wpad_y),
    )
)
print(f"wordmark crop: ({wx0},{wy0})-({wx1},{wy1}) -> {word.size}")
word.save(OUT / "gharibo-ai-wordmark.png", optimize=True)

# --- Full lockup (mark + wordmark + tagline), optimised ----------------------
LOCK_Y0, LOCK_Y1 = 150, 990
lx0, lx1 = col_extent(LOCK_Y0, LOCK_Y1)
lock = img.crop(
    (max(0, lx0 - 30), max(0, LOCK_Y0), min(W, lx1 + 30), min(H, LOCK_Y1))
)
print(f"lockup crop -> {lock.size}")
lock.resize(
    (1024, int(1024 * lock.size[1] / lock.size[0])), Image.LANCZOS
).save(OUT / "gharibo-ai-lockup.png", optimize=True)

# --- App icon ---------------------------------------------------------------
icon = mark.resize((512, 512), Image.LANCZOS)
icon.save(OUT / "gharibo-ai-icon.png", optimize=True)

for f in sorted(OUT.iterdir()):
    print(f"  {f.name}: {f.stat().st_size / 1024:.1f} KB")
