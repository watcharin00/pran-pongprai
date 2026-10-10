"""Paints the isometric home map's ground from the tile grid and the owner's textures.

Offline art tool, not part of the npm build. Needs numpy, scipy and pillow:
    python tools/village/build_ground.py       # writes src/assets/village/ground.webp and floor.webp

Every surface comes from the owner's seamless textures in tools/village/textures (grass, dirt road,
plaza slabs, soil, water). Masks are worked out on the flat tile grid (src/core/homeLayout.ts) with
soft, ragged edges. The game draws the ground with a shader (scenes/groundShader.ts) at full screen
resolution, so it is as sharp as the houses; this script writes what it needs to src/assets/terrain:
  tex-grass|dirt|water|soil|plaza.webp   the owner's textures as 1024px repeating tiles
  masks.webp (lossless)                  world-space fields, 1 px per world px, 4 quadrants:
      (0, 0)     R dirt   G water  B forest          (0.5 = the edge; the shader sharpens it)
      (1024, 0)  R plaza  G soil   B east-west road (turns the ruts in the dirt)
      (0, 1024)  R shade  G water depth
It also paints ground.webp, a small picture of the whole ground for the minimap and for browsers
without WebGL: grass, dirt, soil and water laid flat on screen (so their painting is not skewed), the
plaza's slabs projected so they become diamonds like the rest of the world. Buildings, trees, fences,
bridges and rocks are separate sprites placed by the game.
"""
import os
import re
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
TEX_DIR = os.path.join(os.path.dirname(__file__), 'textures')
OUT_DIR = os.path.join(ROOT, 'src', 'assets', 'village')
TERRAIN_DIR = os.path.join(ROOT, 'src', 'assets', 'terrain')
TILE = 16
R = 1.25  # image px per screen px of the fallback picture (src/ui/minimap.ts HOME_GROUND_SCALE)


def load_rows():
    src = open(os.path.join(ROOT, 'src/core/homeLayout.ts'), encoding='utf8').read()
    rows = re.findall(r"^\s*'([^']{64})',$", src, re.M)
    assert len(rows) == 48, len(rows)
    return rows


ROWS = load_rows()
MH, MW = len(ROWS), len(ROWS[0])
SW, SH = (MW + MH) * TILE, (MW + MH) * TILE // 2  # screen size of the map (ISO.width / height)
W, H = int(SW * R), int(SH * R)
OX = MH * TILE

# --- world coordinates of every output pixel (inverse of ISO: sx = x - y + OX, sy = (x + y) / 2)
oy, ox = np.mgrid[0:H, 0:W].astype(np.float32)
u = ox / R - OX
v = oy / R
WX = v + u / 2  # world px
WY = v - u / 2
del oy, ox, u, v
inside = (WX >= 0) & (WY >= 0) & (WX < MW * TILE) & (WY < MH * TILE)


def near(x, y, chars):
    return any(0 <= x + dx < MW and 0 <= y + dy < MH and ROWS[y + dy][x + dx] in chars for dy in (-1, 0, 1) for dx in (-1, 0, 1))


def tile_mask(pred):
    return np.array([[1.0 if pred(x, y, ROWS[y][x]) else 0.0 for x in range(MW)] for y in range(MH)], np.float32)


M = 4  # mask px per world px


def value_noise(shape, cell, seed):
    r = np.random.default_rng(seed)
    g = r.random((shape[0] // cell + 3, shape[1] // cell + 3)).astype(np.float32)
    return np.asarray(Image.fromarray(g, 'F').resize(((shape[1] // cell + 3) * cell, (shape[0] // cell + 3) * cell), Image.BICUBIC))[: shape[0], : shape[1]]


def soft(tm, wobble=0.25, blur=0.5, sharp=2.0, seed=1):
    """Tile mask -> world-space mask (M px per world px) with ragged, slightly soft edges."""
    big = np.asarray(Image.fromarray(tm, 'F').resize((MW * TILE * M, MH * TILE * M), Image.BILINEAR))
    big = ndimage.gaussian_filter(big, TILE * M * blur)
    n = value_noise(big.shape, TILE * M, seed) * 0.6 + value_noise(big.shape, TILE * M // 3, seed + 1) * 0.4 - 0.5
    return np.clip((big + n * wobble - 0.5) * (TILE * M / sharp) * 0.25 + 0.5, 0, 1).astype(np.float32)


def sample(mask, cval=0.0):
    """World-space mask -> output pixels."""
    return ndimage.map_coordinates(mask, [WY * M, WX * M], order=1, cval=cval).astype(np.float32)


def texture(name, size, rot=0, crop=None, mirror_v=False):
    """An owner texture tiled flat over the output, `size` output px per repeat."""
    im = Image.open(os.path.join(TEX_DIR, f'ground-{name}.png')).convert('RGB')
    if crop:
        im = im.crop(crop)
    if mirror_v:  # make a strip seamless top to bottom
        w, h = im.size
        both = Image.new('RGB', (w, h * 2))
        both.paste(im, (0, 0))
        both.paste(im.transpose(Image.Transpose.FLIP_TOP_BOTTOM), (0, h))
        im = both
    im = im.resize((size, int(size * im.height / im.width)), Image.LANCZOS)
    t = np.asarray(im)
    pad = 3 if rot else 1
    big = np.tile(t, (H // t.shape[0] + 1 + pad, W // t.shape[1] + 1 + pad, 1))
    if rot:
        big = np.asarray(Image.fromarray(big).rotate(rot, resample=Image.BICUBIC))
    oy0, ox0 = (big.shape[0] - H) // 2, (big.shape[1] - W) // 2
    return big[oy0:oy0 + H, ox0:ox0 + W].astype(np.float32)


def blend(base, layer, m):
    return base * (1 - m[..., None]) + layer * m[..., None]


def solid(hex_):
    h = hex_.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32)[None, None]


print('masks...', file=sys.stderr)
is_water = lambda x, y, c: c in 'WOD' or (c == '=' and near(x, y, 'WO'))
m_water = sample(soft(tile_mask(is_water), wobble=0.18, sharp=2))
m_forest = sample(soft(tile_mask(lambda x, y, c: c == 'T'), wobble=0.4, blur=0.9, sharp=10), cval=1.0)
m_dirt = sample(soft(tile_mask(lambda x, y, c: c == ':' or (c == '=' and not near(x, y, 'WO'))), wobble=0.3, sharp=2.5, seed=3))
m_soil = sample(soft(tile_mask(lambda x, y, c: c == 'S'), wobble=0.05, blur=0.2, sharp=1.5, seed=4))
m_paddy = sample(soft(tile_mask(lambda x, y, c: c == 'P'), wobble=0.05, blur=0.2, sharp=1.5, seed=5))
# plaza: crisp border following the tiles
pt = tile_mask(lambda x, y, c: c in '#U')
m_plaza = ndimage.map_coordinates(pt, [WY / TILE - 0.5, WX / TILE - 0.5], order=0, cval=0).astype(np.float32)
m_plaza = ndimage.gaussian_filter(m_plaza, 1.2)
# east-west roads: the ruts in the dirt texture should run along the road
horiz_t = tile_mask(lambda x, y, c: c == ':' and (ROWS[y][max(0, x - 1)] == ':') + (ROWS[y][min(MW - 1, x + 1)] == ':') > (ROWS[max(0, y - 1)][x] == ':') + (ROWS[min(MH - 1, y + 1)][x] == ':'))
m_horiz = sample(ndimage.gaussian_filter(np.asarray(Image.fromarray(horiz_t, 'F').resize((MW * TILE * M, MH * TILE * M), Image.BILINEAR)), TILE * M * 0.6))

print('textures...', file=sys.stderr)
shade = (0.88 + 0.22 * value_noise((H, W), int(TILE * R * 6), 7))[..., None]
grass = texture('grass', int(380 * R / 2.25)) * shade
forest = grass * np.array([0.6, 0.7, 0.58], np.float32)
# a world-x road runs down-right on screen, a world-y road down-left: turn the ruts to match
dirt_x = texture('dirt', int(420 * R / 2.25), rot=63.4)
dirt_y = texture('dirt', int(420 * R / 2.25), rot=-63.4)
dirt = blend(dirt_y, dirt_x, np.clip(m_horiz * 2 - 0.5, 0, 1)) * (0.93 + 0.1 * value_noise((H, W), int(TILE * R * 3), 8))[..., None]
del dirt_x, dirt_y
water = texture('water', int(520 * R / 2.25), crop=(0, 0, 1024, 640), mirror_v=True)
soil = texture('soil', int(260 * R / 2.25), rot=26.6)
# plaza slabs projected with the ground: sample the slab texture at world coordinates
pz = np.asarray(Image.open(os.path.join(TEX_DIR, 'ground-plaza.png')).convert('RGB')).astype(np.float32)
period = TILE * 8  # world px per repeat: 8 slabs, one per tile
py_ = (WY % period) / period * pz.shape[0]
px_ = (WX % period) / period * pz.shape[1]
plaza = np.dstack([ndimage.map_coordinates(pz[..., c], [py_, px_], order=1, mode='grid-wrap') for c in range(3)])
del py_, px_

print('compose...', file=sys.stderr)
img = blend(grass, forest, m_forest)
ring = np.clip(ndimage.maximum_filter(m_dirt, size=int(3 * R)) - m_dirt, 0, 1)
img = blend(img, solid('#3f6a2a'), ring * 0.55)
img = blend(img, dirt, m_dirt)
img = blend(img, soil, m_soil)
# paddy: soil under shallow water (both owner textures)
img = blend(img, blend(soil, water, np.full((H, W), 0.55, np.float32)), m_paddy)
img = blend(img, solid('#6e664e'), np.clip(ndimage.maximum_filter(m_plaza, size=int(2 * R)) - m_plaza, 0, 1) * 0.7)
img = blend(img, plaza, m_plaza)
# water: darker away from the bank, a dark bank line and light foam at the edge
deep = np.clip(ndimage.distance_transform_edt(m_water > 0.5) / (TILE * R * 1.2), 0, 1)
water = water * (1 - 0.28 * deep)[..., None]
bank = np.clip(ndimage.maximum_filter(m_water, size=int(4 * R)) - m_water, 0, 1)
foam = np.clip(m_water - ndimage.minimum_filter(m_water, size=int(3 * R)), 0, 1)
img = blend(img, solid('#4a3a24'), bank * 0.7)
img = blend(img, water, m_water)
img = blend(img, solid('#e8fff8'), foam * 0.55)
img = blend(forest, img, inside.astype(np.float32))

os.makedirs(OUT_DIR, exist_ok=True)
Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), 'RGB').save(os.path.join(OUT_DIR, 'ground.webp'), quality=86, method=6)
# forest floor tile for beyond the map's diamond (repeats on its own)
fl = Image.open(os.path.join(TEX_DIR, 'ground-grass.png')).convert('RGB').resize((512, 512), Image.LANCZOS)
fl = Image.fromarray((np.asarray(fl).astype(np.float32) * np.array([0.6, 0.7, 0.58])).astype(np.uint8))
fl.save(os.path.join(OUT_DIR, 'floor.webp'), quality=86, method=6)
print('wrote', W, 'x', H, os.path.getsize(os.path.join(OUT_DIR, 'ground.webp')) // 1024, 'KB', file=sys.stderr)

# --- the shader's inputs ----------------------------------------------------------------------
print('shader masks...', file=sys.stderr)


def field(tm, wobble=0.25, blur=0.5, seed=1, nearest=False):
    """Tile mask -> world-space field (1 px per world px): 0.5 on a ragged edge, a ~10px ramp across it."""
    big = np.asarray(Image.fromarray(tm, 'F').resize((MW * TILE * M, MH * TILE * M), Image.NEAREST if nearest else Image.BILINEAR))
    big = ndimage.gaussian_filter(big, TILE * M * blur)
    if wobble:
        n = value_noise(big.shape, TILE * M, seed) * 0.6 + value_noise(big.shape, TILE * M // 3, seed + 1) * 0.4 - 0.5
        big = big + n * wobble
    small = big.reshape(MH * TILE, M, MW * TILE, M).mean(axis=(1, 3))
    return np.clip(0.5 + (small - 0.5) * 1.6, 0, 1)


def world(m):
    """A world-space mask at M px per world px -> 1 px per world px."""
    return m.reshape(MH * TILE, M, MW * TILE, M).mean(axis=(1, 3))


f_dirt = field(tile_mask(lambda x, y, c: c == ':' or (c == '=' and not near(x, y, 'WO'))), wobble=0.3, seed=3)
f_water = field(tile_mask(is_water), wobble=0.18, blur=0.35)
f_forest = world(soft(tile_mask(lambda x, y, c: c == 'T'), wobble=0.4, blur=0.9, sharp=10))
f_plaza = field(tile_mask(lambda x, y, c: c in '#U'), wobble=0, blur=0.06, nearest=True)
f_soil = field(tile_mask(lambda x, y, c: c == 'S'), wobble=0.05, blur=0.2, seed=4)
f_horiz = world(ndimage.gaussian_filter(np.asarray(Image.fromarray(horiz_t, 'F').resize((MW * TILE * M, MH * TILE * M), Image.BILINEAR)), TILE * M * 0.6))
f_shade = value_noise((MH * TILE, MW * TILE), TILE * 3, 7)
f_deep = np.clip(ndimage.distance_transform_edt(f_water > 0.5) / (TILE * 1.2), 0, 1)

Q = 1024  # quadrant size
masks = np.zeros((2 * Q, 2 * Q, 3), np.float32)
masks[:MH * TILE, :MW * TILE] = np.dstack([f_dirt, f_water, f_forest])
masks[:MH * TILE, Q:Q + MW * TILE] = np.dstack([f_plaza, f_soil, f_horiz])
masks[Q:Q + MH * TILE, :MW * TILE, 0] = f_shade
masks[Q:Q + MH * TILE, :MW * TILE, 1] = f_deep
os.makedirs(TERRAIN_DIR, exist_ok=True)
Image.fromarray(np.clip(masks * 255 + 0.5, 0, 255).astype(np.uint8), 'RGB').save(os.path.join(TERRAIN_DIR, 'masks.webp'), lossless=True, quality=100, method=6)

# the owner's textures as square 1024px repeating tiles
for name in ('grass', 'dirt', 'soil', 'plaza'):
    Image.open(os.path.join(TEX_DIR, f'ground-{name}.png')).convert('RGB').resize((1024, 1024), Image.LANCZOS).save(os.path.join(TERRAIN_DIR, f'tex-{name}.webp'), quality=90, method=6)
# water: the top of the painting, mirrored so it repeats top to bottom, squeezed square (the shader stretches it back)
wim = Image.open(os.path.join(TEX_DIR, 'ground-water.png')).convert('RGB').crop((0, 0, 1024, 640))
both = Image.new('RGB', (1024, 1280))
both.paste(wim, (0, 0))
both.paste(wim.transpose(Image.Transpose.FLIP_TOP_BOTTOM), (0, 640))
both.resize((1024, 1024), Image.LANCZOS).save(os.path.join(TERRAIN_DIR, 'tex-water.webp'), quality=90, method=6)
print('wrote', TERRAIN_DIR, file=sys.stderr)
