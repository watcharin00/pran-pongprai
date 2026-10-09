"""Paints the home map's ground at 4 px per game px (4096x3072) from the collision grid.

Offline art tool, not part of the npm build. Needs numpy, scipy and pillow:
    python tools/village/build_ground.py            # writes src/assets/village/ground.webp

The grid (src/core/homeLayout.ts) says what each 16px tile is; this turns it into soft,
hand-painted ground from the owner's textures (tools/village/textures): grass, dirt roads with ragged edges, a slab plaza,
water with depth and shore foam, rocky plateaus with a cliff lip, tilled soil and a paddy.
Buildings, trees, fences and bridges are separate sprites placed by the game on top.
Deterministic: the same grid always gives the same picture.
"""
import os
import re
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
S = 4  # image px per game px
T = 16 * S  # image px per tile
rng = np.random.default_rng(20261004)


def load_rows():
    src = open(os.path.join(ROOT, 'src/core/homeLayout.ts'), encoding='utf8').read()
    rows = re.findall(r"^\s*'([^']{64})',$", src, re.M)
    assert len(rows) == 48, len(rows)
    return rows


ROWS = load_rows()
MH, MW = len(ROWS), len(ROWS[0])
H, W = MH * T, MW * T


def tile_mask(pred):
    return np.array([[1.0 if pred(x, y, ROWS[y][x]) else 0.0 for x in range(MW)] for y in range(MH)], np.float32)


def near(x, y, chars):
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            xx, yy = x + dx, y + dy
            if 0 <= xx < MW and 0 <= yy < MH and ROWS[yy][xx] in chars:
                return True
    return False


def noise(scale, octaves=3, seed=0):
    """Smooth fractal value noise in [0,1], `scale` = size of the largest blobs in image px."""
    r = np.random.default_rng(seed)
    out = np.zeros((H, W), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        s = max(2, int(scale / (2 ** o)))
        g = r.random((H // s + 3, W // s + 3)).astype(np.float32)
        up = np.asarray(Image.fromarray(g, 'F').resize(((W // s + 3) * s, (H // s + 3) * s), Image.BICUBIC))[:H, :W]
        out += up * amp
        tot += amp
        amp *= 0.5
    out /= tot
    lo, hi = np.percentile(out, 1), np.percentile(out, 99)
    return np.clip((out - lo) / (hi - lo), 0, 1)


def soft_mask(tm, wobble=0.22, blur_tiles=0.55, seed=1, sharp=3.0):
    """Tile mask -> full-res mask with organic edges (px soft edge of `sharp`)."""
    big = np.asarray(Image.fromarray(tm, 'F').resize((W, H), Image.BILINEAR))
    big = ndimage.gaussian_filter(big, T * blur_tiles)
    n = noise(T * 1.2, 3, seed) - 0.5
    v = big + n * wobble
    return np.clip((v - 0.5) * (T / sharp) * 0.25 + 0.5, 0, 1).astype(np.float32)


def hexc(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32)


def mix(a, b, t):
    return a + (b - a) * t[..., None]


def colour_field(c_dark, c_light, scale, seed, contrast=1.0):
    n = noise(scale, 4, seed)
    n = np.clip((n - 0.5) * contrast + 0.5, 0, 1)
    return mix(hexc(c_dark)[None, None], hexc(c_light)[None, None], n)


def blend(base, layer, m):
    return base * (1 - m[..., None]) + layer * m[..., None]


TEX_DIR = os.path.join(os.path.dirname(__file__), 'textures')


def tiled(name, size, rot=False):
    """An owner-made seamless texture (tools/village/textures) repeated over the map, `size` px per repeat."""
    im = Image.open(os.path.join(TEX_DIR, f'ground-{name}.png')).convert('RGB')
    if rot:
        im = im.transpose(Image.Transpose.ROTATE_90)
    t = np.asarray(im.resize((size, size), Image.LANCZOS)).astype(np.float32)
    return np.tile(t, (H // size + 1, W // size + 1, 1))[:H, :W]


# ------------------------------------------------------------------ masks
is_water = lambda x, y, c: c in 'WO' or (c == '=' and near(x, y, 'WO'))
m_water = soft_mask(tile_mask(is_water), wobble=0.18, seed=11, sharp=2)
m_rock = soft_mask(tile_mask(lambda x, y, c: c == 'R'), wobble=0.3, seed=12, sharp=2)
m_dirt = soft_mask(tile_mask(lambda x, y, c: c == ':' or (c == '=' and not near(x, y, 'WO')) or (c == 'H' and near(x, y, ':'))), wobble=0.3, seed=13, sharp=2.5)
m_forest = soft_mask(tile_mask(lambda x, y, c: c == 'T'), wobble=0.35, blur_tiles=0.9, seed=14, sharp=12)
m_soil = np.asarray(Image.fromarray(tile_mask(lambda x, y, c: c == 'S'), 'F').resize((W, H), Image.NEAREST))
m_paddy = np.asarray(Image.fromarray(tile_mask(lambda x, y, c: c == 'P'), 'F').resize((W, H), Image.NEAREST))

# plaza: slab-aligned ragged border (slabs are half a tile)
SL = T // 2
pt = tile_mask(lambda x, y, c: c in '#U')
ps = np.asarray(Image.fromarray(pt, 'F').resize((MW * 2, MH * 2), Image.BILINEAR))
ps = ndimage.gaussian_filter(ps, 0.6) + (rng.random(ps.shape) - 0.5) * 0.35
m_plaza = np.asarray(Image.fromarray((ps > 0.5).astype(np.float32), 'F').resize((W, H), Image.NEAREST))
m_plaza = ndimage.gaussian_filter(m_plaza, 1.0)

# ------------------------------------------------------------------ textures
print('textures...', file=sys.stderr)
# grass: the owner's texture, with large soft light/shade patches so the repeat does not show
grass = tiled('grass', 384)
grass = grass * (0.86 + 0.24 * noise(T * 5, 3, 21))[..., None]
forest = grass * np.array([0.62, 0.72, 0.6], np.float32)
# dirt: the owner's road texture; its wheel ruts run along the road (turned for east-west roads)
horiz = tile_mask(lambda x, y, c: c == ':' and (ROWS[y][max(0, x - 1)] == ':') + (ROWS[y][min(MW - 1, x + 1)] == ':') > (ROWS[max(0, y - 1)][x] == ':') + (ROWS[min(MH - 1, y + 1)][x] == ':'))
horiz = ndimage.gaussian_filter(np.asarray(Image.fromarray(horiz, 'F').resize((W, H), Image.BILINEAR)), T * 0.6)
dirt = blend(tiled('dirt', 448), tiled('dirt', 448, rot=True), np.clip(horiz * 2 - 0.5, 0, 1))
dirt = dirt * (0.92 + 0.12 * noise(T * 3, 2, 25))[..., None]
rock = colour_field('#8c6a4a', '#c79a6c', T * 1.2, 26, 1.3)
rock = blend(rock, colour_field('#7d7a6a', '#a8a290', T * 2, 27), noise(T * 4, 2, 28) * 0.5)
soil = colour_field('#5a3a22', '#7a5232', T * 0.6, 29)
paddy = colour_field('#6f9a6a', '#8fb98a', T * 1.0, 30)

img = forest.copy()
img = blend(img, grass, 1 - m_forest)

# dirt road: pebbles, dark border on the grass side, grass blades hanging over
ring = np.clip(ndimage.maximum_filter(m_dirt, size=7) - m_dirt, 0, 1)
img = blend(img, dirt, m_dirt)
img = blend(img, np.broadcast_to(hexc('#3f7a2c'), img.shape), ring * 0.85)

# soil plot: furrows
fur = (np.sin(np.arange(H) / (T / 4) * np.pi * 2)[:, None] * 0.5 + 0.5) * np.ones((1, W))
soil = soil * (0.8 + 0.25 * fur[..., None])
img = blend(img, soil, m_soil)

# paddy: water with rice shoots, light bunds between the 2x2 sections
img = blend(img, paddy, m_paddy)
ys, xs = np.nonzero(m_paddy[::8, ::8])
pl = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(pl)
for yy, xx in zip(ys * 8, xs * 8):
    if rng.random() < 0.35:
        x, y = int(xx + rng.integers(0, 8)), int(yy + rng.integers(0, 8))
        d.line([(x, y), (x - 2, y - 9)], fill=(70, 140, 50, 255), width=2)
        d.line([(x, y), (x + 3, y - 8)], fill=(110, 180, 70, 255), width=2)
p_arr = np.asarray(pl).astype(np.float32)
img = blend(img, p_arr[..., :3], p_arr[..., 3] / 255)
bund = np.zeros((H, W), np.float32)
py0 = min(y for y in range(MH) if 'P' in ROWS[y])
px0 = min(ROWS[py0].index('P') for _ in [0])
for k in range(4):
    x = (px0 + k * 2) * T
    bund[:, max(0, x - 5):x + 5] = 1
for k in range(3):
    y = (py0 + k * 2) * T
    bund[max(0, y - 5):y + 5, :] = 1
bund *= ndimage.maximum_filter(m_paddy, size=11)
img = blend(img, np.broadcast_to(hexc('#a88a56'), img.shape), ndimage.gaussian_filter(bund, 1.5))

# rocky plateau with a lit top rim and a dark cliff face below its southern edge
cracks = Image.new('L', (W, H), 0)
d = ImageDraw.Draw(cracks)
for _ in range(5000):
    x, y = int(rng.integers(0, W)), int(rng.integers(0, H))
    pts = [(x, y)]
    for _ in range(int(rng.integers(2, 5))):
        x += int(rng.integers(-14, 15))
        y += int(rng.integers(-10, 11))
        pts.append((x, y))
    d.line(pts, fill=255, width=2)
cr = np.asarray(cracks).astype(np.float32) / 255
rock = blend(rock, np.broadcast_to(hexc('#5a3e28'), rock.shape), cr * 0.6)
rock_shade = np.clip(ndimage.shift(m_rock, (-T * 0.35, 0), order=1) - m_rock * 0, 0, 1)
face = np.clip(m_rock - ndimage.shift(m_rock, (-T * 0.45, 0), order=1, cval=1), 0, 1)
img = blend(img, rock, m_rock)
img = blend(img, np.broadcast_to(hexc('#6a4428'), img.shape), face * 0.75)
img = blend(img, np.broadcast_to(hexc('#3a2414'), img.shape), np.clip(ndimage.maximum_filter(m_rock, 5) - m_rock, 0, 1) * 0.7)

# plaza: the owner's slab texture (8 slabs per repeat, 3/4 tile each)
plaza = tiled('plaza', SL * 12)
img = blend(img, plaza, m_plaza)
img = blend(img, np.broadcast_to(hexc('#6e664e'), img.shape), np.clip(ndimage.maximum_filter(m_plaza, 5) - m_plaza, 0, 1) * 0.8)

# water: deeper away from the bank, ripples, light foam and a dark bank line
print('water...', file=sys.stderr)
dist = ndimage.distance_transform_edt(m_water > 0.5)
deep = np.clip(dist / (T * 1.4), 0, 1)
water = mix(hexc('#3ccbbd')[None, None], hexc('#1a7f8e')[None, None], deep)
water = water * (0.93 + 0.12 * noise(T * 1.0, 3, 41))[..., None]
rip = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(rip)
for _ in range(9000):
    x, y = int(rng.integers(0, W)), int(rng.integers(0, H))
    w_ = int(rng.integers(8, 22))
    d.arc([x - w_, y - 4, x + w_, y + 4], 200, 340, fill=(220, 255, 250, 150), width=2)
ra = np.asarray(rip).astype(np.float32)
water = blend(water, ra[..., :3], ra[..., 3] / 255 * 0.7)
foam = np.clip(m_water - ndimage.minimum_filter(m_water, size=6), 0, 1)
bank = np.clip(ndimage.maximum_filter(m_water, size=9) - m_water, 0, 1)
img = blend(img, np.broadcast_to(hexc('#4a3420'), img.shape), bank * 0.75)
img = blend(img, water, m_water)
img = blend(img, np.broadcast_to(hexc('#d8fff4'), img.shape), foam * 0.8)

out = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), 'RGB')
d = ImageDraw.Draw(out)
WOOD, WOOD_HI, WOOD_LO, INK = (150, 98, 56), (196, 140, 84), (104, 64, 34), (52, 30, 16)

# bridges, the jetty and the sala deck: '=' tiles beside water, one plank deck per connected group
bm = tile_mask(lambda x, y, c: c == '=' and near(x, y, 'WO'))
lab, n = ndimage.label(bm)
for k in range(1, n + 1):
    ys, xs = np.nonzero(lab == k)
    x0, x1, y0, y1 = xs.min() * T, (xs.max() + 1) * T, ys.min() * T, (ys.max() + 1) * T
    # the deck runs across the water: along x when the water is above and below it
    wide = any(ROWS[y][x] in 'WO' for x in range(xs.min(), xs.max() + 1) for y in (ys.min() - 1, ys.max() + 1) if 0 <= y < MH)
    if wide:
        x0, x1 = x0 - 6, x1 + 6
    else:
        y0, y1 = y0 - 6, y1 + 6
    d.rectangle([x0 + 4, y0 + 8, x1 + 4, y1 + 8], fill=(20, 60, 60))  # shadow on the water
    d.rectangle([x0, y0, x1, y1], fill=WOOD, outline=INK, width=3)
    step = 14
    if wide:  # planks run across the deck (vertical seams)
        for x in range(x0 + step, x1, step):
            d.line([(x, y0 + 3), (x, y1 - 3)], fill=WOOD_LO, width=3)
            d.line([(x + 2, y0 + 3), (x + 2, y1 - 3)], fill=WOOD_HI, width=1)
        for yy in (y0 + 5, y1 - 7):
            d.rectangle([x0 + 2, yy - 3, x1 - 2, yy + 3], fill=WOOD_LO, outline=INK, width=2)
    else:
        for y in range(y0 + step, y1, step):
            d.line([(x0 + 3, y), (x1 - 3, y)], fill=WOOD_LO, width=3)
            d.line([(x0 + 3, y + 2), (x1 - 3, y + 2)], fill=WOOD_HI, width=1)
        for xx in (x0 + 5, x1 - 7):
            d.rectangle([xx - 3, y0 + 2, xx + 3, y1 - 2], fill=WOOD_LO, outline=INK, width=2)

# stone steps where '=' climbs the cliff (not beside water)
for y in range(MH):
    for x in range(MW):
        if ROWS[y][x] == '=' and not near(x, y, 'WO'):
            for k in range(4):
                yy = y * T + k * (T // 4)
                d.rectangle([x * T + 2, yy + 2, x * T + T - 2, yy + T // 4 - 1], fill=(176, 160, 132), outline=(96, 80, 60), width=2)

# wooden fences: a post on every fence tile, rails to fence neighbours east and south
fence = [[ROWS[y][x] == 'F' for x in range(MW)] for y in range(MH)]
def post(cx, cy):
    d.ellipse([cx - 7, cy + 2, cx + 9, cy + 10], fill=(40, 70, 30))
    d.rectangle([cx - 5, cy - 22, cx + 5, cy + 6], fill=WOOD, outline=INK, width=2)
    d.rectangle([cx - 3, cy - 20, cx - 1, cy + 4], fill=WOOD_HI)
for y in range(MH):
    for x in range(MW):
        if not fence[y][x]:
            continue
        cx, cy = x * T + T // 2, y * T + T // 2 + 10
        if x + 1 < MW and fence[y][x + 1]:
            for oy in (-16, -6):
                d.rectangle([cx, cy + oy - 3, cx + T, cy + oy + 3], fill=WOOD, outline=INK, width=2)
        if y + 1 < MH and fence[y + 1][x]:
            d.rectangle([cx - 4, cy - 10, cx + 4, cy + T - 10], fill=WOOD_LO, outline=INK, width=2)
for y in range(MH):
    for x in range(MW):
        if fence[y][x]:
            post(x * T + T // 2, y * T + T // 2 + 10)

os.makedirs(os.path.join(ROOT, 'src/assets/village'), exist_ok=True)
dst = os.path.join(ROOT, 'src/assets/village/ground.webp')
out.save(dst, quality=88, method=6)
print('wrote', dst, os.path.getsize(dst) // 1024, 'KB', file=sys.stderr)
