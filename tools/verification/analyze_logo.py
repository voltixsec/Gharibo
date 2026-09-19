"""Analyse the official GHARIBO logo to find safe crop boundaries.

Derives the mark (orbital sphere) and wordmark regions by measuring where
bright content actually is, rather than guessing at fixed percentages.
"""
import sys
from pathlib import Path

from PIL import Image

SRC = Path(sys.argv[1])
img = Image.open(SRC).convert("RGB")
w, h = img.size
print(f"size: {w}x{h}")

gray = img.convert("L")
px = gray.load()

# Row/column energy: count pixels brighter than a threshold.
THRESH = 60


def row_energy(y):
    return sum(1 for x in range(0, w, 2) if px[x, y] > THRESH)


def col_energy(x):
    return sum(1 for y in range(0, h, 2) if px[x, y] > THRESH)


rows = [row_energy(y) for y in range(h)]
cols = [col_energy(x) for x in range(w)]

max_row = max(rows) or 1
max_col = max(cols) or 1

# Report contiguous bands of "significant" content.
band_thresh = max_row * 0.04
bands = []
start = None
for y, e in enumerate(rows):
    significant = e > band_thresh
    if significant and start is None:
        start = y
    elif not significant and start is not None:
        if y - start > 8:
            bands.append((start, y))
        start = None
if start is not None:
    bands.append((start, h))

print("horizontal content bands (y0, y1, height):")
for b in bands:
    print("   ", b[0], b[1], b[1] - b[0])

col_thresh = max_col * 0.04
cstart = None
cbands = []
for x, e in enumerate(cols):
    significant = e > col_thresh
    if significant and cstart is None:
        cstart = x
    elif not significant and cstart is not None:
        if x - cstart > 8:
            cbands.append((cstart, x))
        cstart = None
if cstart is not None:
    cbands.append((cstart, w))
print("vertical content bands (x0, x1, width):")
for b in cbands:
    print("   ", b[0], b[1], b[1] - b[0])
