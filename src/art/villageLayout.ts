// Where the painted village's sprites stand on the home map. Pure data (no Phaser): the ground is
// one pre-painted image (src/assets/village/ground.webp, built by tools/village/build_ground.py),
// everything that has height (houses, trees, fountain, lamps) is a sprite y-sorted with the
// characters, so the player can walk behind roofs and tree crowns.
import { hash } from '../core/rng';
import { HOME_ROWS } from '../core/homeLayout';
import { MH, MW, T } from '../core/mapgen';

export const VILLAGE_SPRITES = [
  'smithy', 'inn', 'elder', 'hut1', 'hut2', 'granary', 'henhouse', 'sala', 'fieldhut',
  'fountain', 'lamp', 'tree1', 'tree2', 'bush',
] as const;
export type VillageSprite = (typeof VILLAGE_SPRITES)[number];

/** Sprite pixels per game pixel in src/assets/village/*.webp (5: sharp on phones, which show ~5 screen px per game px). */
export const SPRITE_SCALE = 5;

export interface VillageProp {
  key: VillageSprite;
  /** centre of the sprite's foot (game px); also the y-sort key */
  x: number;
  y: number;
  /** display width (game px); height follows the image */
  w: number;
  flip?: boolean;
  /** turns see-through while the player stands behind it */
  fade?: boolean;
  /** sways gently (trees) */
  sway?: boolean;
}

/** Hand-placed sprites, matched to the HOUSE tiles of the collision grid. */
const PLACED: readonly VillageProp[] = [
  { key: 'smithy', x: 410, y: 302, w: 112, fade: true },
  { key: 'inn', x: 632, y: 294, w: 136, fade: true },
  { key: 'elder', x: 336, y: 386, w: 100, fade: true },
  { key: 'hut1', x: 280, y: 608, w: 90, fade: true },
  { key: 'hut2', x: 376, y: 608, w: 88, fade: true },
  { key: 'granary', x: 160, y: 352, w: 66, fade: true },
  { key: 'henhouse', x: 352, y: 482, w: 34, fade: true },
  { key: 'sala', x: 456, y: 530, w: 54, fade: true },
  { key: 'fieldhut', x: 688, y: 496, w: 40, fade: true },
  { key: 'fountain', x: 512, y: 402, w: 44 },
  // the hunt-request board lamp and a few lamps along the roads
  { key: 'lamp', x: 26 * T + 8, y: 21 * T, w: 15 },
  { key: 'lamp', x: 19 * T + 12, y: 28 * T, w: 15 },
  { key: 'lamp', x: 30 * T + 14, y: 37 * T, w: 15, flip: true },
  { key: 'lamp', x: 36 * T + 2, y: 37 * T, w: 15 },
  { key: 'lamp', x: 38 * T + 12, y: 23 * T, w: 15, flip: true },
];

/** Lantern glow of a lamp sprite (relative to its foot). */
export const LAMP_LIGHT = { dx: 4, dy: -19 } as const;

const ch = (x: number, y: number): string => {
  if (x < 0 || x >= MW) return 'T';
  // beyond the top/bottom edge (portrait overscroll): forest wherever the edge row is forest
  const row = HOME_ROWS[Math.max(0, Math.min(MH - 1, y))] ?? '';
  return row[x] ?? 'T';
};

/** Trees on a jittered 2-tile grid over the forest tiles (and past the edges), bushes on bush tiles. Deterministic. */
function greenery(): VillageProp[] {
  const out: VillageProp[] = [];
  const EDGE = 12;
  for (let gy = -EDGE; gy < MH + EDGE; gy += 2) {
    for (let gx = (gy / 2) % 2 === 0 ? 0 : 1; gx < MW; gx += 2) {
      if (ch(gx, gy) !== 'T') continue;
      const h1 = hash(gx, gy + 100);
      const h2 = hash(gx + 7, gy * 3 + 1);
      const h3 = hash(gx * 5 + 3, gy + 41);
      const s = 0.85 + h1 * 0.3;
      out.push({
        key: h2 < 0.16 ? 'tree2' : 'tree1',
        x: gx * T + 8 + (h3 - 0.5) * 10,
        y: gy * T + 14 + (h1 - 0.5) * 8,
        w: Math.round(50 * s),
        flip: h3 > 0.5,
        fade: true,
        sway: true,
      });
    }
  }
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) if (ch(x, y) === 'B') out.push({ key: 'bush', x: x * T + 8, y: y * T + 14, w: 22, flip: hash(x, y) > 0.5 });
  }
  return out;
}

let cached: VillageProp[] | null = null;

/** Every sprite of the painted village. */
export function villageProps(): readonly VillageProp[] {
  cached ??= [...PLACED, ...greenery()];
  return cached;
}
