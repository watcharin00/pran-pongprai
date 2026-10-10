"""Writes src/core/homeLayout.ts: the home map's tile grid, laid out for the isometric village.

Every piece of the village comes from the owner's art (src/assets/village, tools/village/textures);
this grid says where each one stands and what blocks movement. Run after editing, then rebuild
the ground with build_ground.py.
    python tools/village/layout.py

Legend (one character per 16px tile, 64x48):
  .  grass   :  dirt road   #  plaza   T  tree   B  bush   R  rock   W  stream   =  bridge
  H  something that blocks (house, tent, crates...)   F  wooden fence   K  stone wall
  S  soil plot   P  rice paddy   O  fish pond   U  fountain   D  pier in the pond
"""
import math
import os

MW, MH = 64, 48
g = [['T'] * MW for _ in range(MH)]


def put(x, y, c):
    if 0 <= x < MW and 0 <= y < MH:
        g[y][x] = c


def rect(x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            put(x, y, c)


def hsh(x, y):
    h = (x * 374761393 + y * 668265263) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFFFFFF) / 4294967296


# open village ground: an ellipse around the plaza, ragged at the forest edge
CX, CY = 34, 28
for y in range(MH):
    for x in range(MW):
        d = math.hypot((x - CX) / 22, (y - CY) / 19)
        if d < 1 - (hsh(x, y) - 0.5) * 0.12:
            g[y][x] = '.'

# forest clearings (hunting grounds once the wild opens up again)
for (x0, y0, x1, y1) in [(8, 3, 19, 10), (35, 3, 45, 9), (52, 4, 61, 13), (6, 35, 16, 44), (51, 29, 61, 42)]:
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if hsh(x + 3, y + 5) > 0.12:
                g[y][x] = '.'
rect(52, 30, 60, 41, ':')  # sandy flats east of the stream (gaur)

# roads: north, south, east; a lane west to the hunter's camp and paths to the clearings
rect(31, 0, 32, 47, ':')
rect(33, 23, 63, 24, ':')
rect(11, 23, 30, 24, ':')
rect(20, 6, 30, 7, ':')
rect(33, 6, 36, 7, ':')
rect(56, 14, 57, 22, ':')
rect(12, 40, 30, 41, ':')
rect(53, 25, 54, 29, ':')

# plaza with the fountain, corners cut
rect(27, 19, 37, 29, '#')
for (x, y) in [(27, 19), (37, 19), (27, 29), (37, 29), (28, 19), (27, 20), (36, 19), (37, 20), (27, 28), (28, 29), (36, 29), (37, 28)]:
    put(x, y, '.')
rect(31, 23, 32, 24, 'U')

# stream east of the village, 4 tiles wide to match the arched Thai bridge on the east road
for y in range(MH):
    sx = 47 + round(math.sin(y * 0.22) * 1.2)
    if 20 <= y <= 27:
        sx = 47
    for x in range(sx, sx + 4):
        put(x, y, 'W')
rect(47, 23, 50, 24, '=')
# a little inlet on the west bank where the waterside sala with its boat stands
rect(45, 29, 46, 32, 'W')
rect(45, 30, 47, 32, 'D')

# smithy (with the woodpile beside it), the shop house (kitchen) with its crates
rect(23, 14, 25, 16, 'H')
rect(21, 16, 22, 16, 'H')
rect(38, 13, 40, 15, 'H')
put(42, 15, 'H')

# Thai houses round the village (owner's art): the elder's spired house with the notice board,
# stilt houses, bamboo huts, a sala, a family compound. Clear a ring of grass round each one.
HOUSES = [
    (21, 19, 3, 3),  # elder (spired house)
    (19, 37, 5, 3),  # family compound
    (35, 36, 3, 3),  # stilt house
    (41, 37, 3, 3),  # stilt house
    (26, 10, 3, 3),  # stilt house by the north road
    (44, 13, 2, 2),  # bamboo hut by the paddy
    (14, 27, 2, 2),  # bamboo hut west
    (26, 36, 2, 2),  # bamboo hut south
    (40, 25, 2, 2),  # sala east of the plaza
]
# notice board beside the elder's house (the elder hands out hunts there)
put(25, 21, 'H')

# vegetable plot: soil 4x2 with a picket fence, open on the east side
rect(18, 25, 23, 28, 'F')
rect(19, 26, 22, 27, 'S')
put(23, 26, '.'), put(23, 27, '.')

# chicken coop: wooden fence, dirt yard, gate on the north side
rect(17, 31, 23, 35, 'F')
rect(18, 32, 22, 34, ':')
put(20, 31, ':'), put(21, 31, ':')

# fish pond south-east of the plaza
for y in range(28, 35):
    for x in range(36, 45):
        if ((x + 0.5 - 40.2) / 3.4) ** 2 + ((y + 0.5 - 31.4) / 2.7) ** 2 < 1:
            put(x, y, 'O')

# hunter's camp west of the village: tent, bedroll, in its own clearing
rect(10, 16, 17, 22, '.')
rect(12, 18, 13, 19, 'H')
put(15, 20, 'H')

# rocks at the forest edge and around the camp
for (x, y) in [(10, 21), (11, 27), (17, 12), (25, 37), (14, 30), (27, 10), (38, 40), (20, 39)]:
    put(x, y, 'R')
# a few bushes and trees inside the village
for (x, y) in [(26, 12), (35, 11), (19, 21), (44, 26), (28, 34), (35, 36), (16, 26)]:
    put(x, y, 'B')
for (x, y) in [(18, 13), (45, 11), (15, 36), (44, 39)]:
    put(x, y, 'T')

# houses last, so nothing decorative lands on them
for (x, y, w, h) in HOUSES:
    for yy in range(y - 1, y + h + 1):
        for xx in range(x - 1, x + w + 1):
            if g[yy][xx] in 'TBR':
                put(xx, yy, '.')
    rect(x, y, x + w - 1, y + h - 1, 'H')


rows = [''.join(r) for r in g]
assert all(len(r) == MW for r in rows) and len(rows) == MH
out = ["// The home map's tile grid: the isometric village, every piece the owner's art.",
       '// Generated by tools/village/layout.py (edit the script, not this file):',
       '//   .  grass   :  dirt road   #  plaza   T  tree   B  bush   R  rock   W  stream   =  bridge',
       '//   H  blocks (house, tent, crates...)   F  wooden fence   K  stone wall',
       '//   S  soil plot   P  rice paddy   O  fish pond   U  fountain   D  pier in the pond',
       'export const HOME_ROWS: readonly string[] = [']
out += [f"  '{r}'," for r in rows]
out.append('];')
dst = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'core', 'homeLayout.ts')
open(dst, 'w').write('\n'.join(out) + '\n')
print('\n'.join(rows))
