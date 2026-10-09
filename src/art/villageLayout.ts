// Where the village's sprites stand on the isometric home map. Pure data (no Phaser).
// The ground is one pre-painted image (src/assets/village/ground.webp, tools/village/build_ground.py);
// everything with height (houses, trees, fences, rocks, the fountain, lamps) is one of the owner's
// sprites, y-sorted with the characters so they walk behind roofs and tree crowns.
// Positions here are SCREEN px of the isometric drawing layer (see scenes/view.ts ISO).
import { hash } from '../core/rng';
import { HOME_ROWS } from '../core/homeLayout';
import { MH, MW, T } from '../core/mapgen';
import { ISO } from '../scenes/view';

export const VILLAGE_SPRITES = [
  'smithy', 'inn', 'fountain', 'crates', 'firewood', 'campfire', 'board', 'tent', 'bedroll',
  'rock', 'rockpile', 'tree1', 'tree2', 'pine1', 'pine2', 'bush', 'lamp',
  'railfence', 'picket', 'wall', 'stonebridge', 'woodbridge', 'floor',
] as const;
export type VillageSprite = (typeof VILLAGE_SPRITES)[number];

export interface VillageProp {
  key: VillageSprite;
  /** bottom centre of the sprite on screen */
  x: number;
  y: number;
  /** display width (screen px); height follows the image */
  w: number;
  /** y-sort key (defaults to y) */
  depth?: number;
  flip?: boolean;
  /** turns see-through while the player stands behind it */
  fade?: boolean;
  /** sways gently (trees) */
  sway?: boolean;
  /** soft contact shadow width (0 = none) */
  shadow?: number;
}

const sx = (x: number, y: number): number => ISO.x(x * T, y * T);
const sy = (x: number, y: number): number => ISO.y(x * T, y * T);

/**
 * A sprite standing on a footprint of tiles (x, y, w, h): centred on the footprint's diamond, its
 * bottom at the diamond's front (lowest) corner plus `lift`.
 */
function onFootprint(key: VillageSprite, x: number, y: number, w: number, h: number, width: number, extra: Partial<VillageProp> = {}, lift = 0): VillageProp {
  const front = sy(x + w, y + h);
  return { key, x: sx(x + w / 2, y + h / 2), y: front + lift, w: width, shadow: width * 0.75, ...extra };
}

const PLACED: readonly VillageProp[] = [
  onFootprint('smithy', 23, 14, 3, 3, 92, { fade: true }, 4),
  onFootprint('firewood', 21, 16, 2, 1, 40, {}, 2),
  onFootprint('inn', 38, 13, 4, 3, 122, { fade: true }, 4),
  onFootprint('crates', 42, 15, 1, 1, 40, { fade: true }, 4),
  onFootprint('campfire', 39, 17, 2, 1, 44, {}, 4),
  onFootprint('board', 24, 27, 1, 1, 36, {}, 2),
  onFootprint('tent', 12, 18, 2, 2, 70, { fade: true }, 4),
  onFootprint('bedroll', 15, 20, 1, 1, 34, {}, 2),
  onFootprint('fountain', 31, 23, 2, 2, 66, {}, 4),
  // lamps at the plaza corners and by the notice board
  ...([[27.5, 19.5], [37.5, 19.5], [27.5, 29.5], [37.5, 29.5], [23.6, 26.6]] as const).map(([x, y]) => ({
    key: 'lamp' as const, x: sx(x, y), y: sy(x, y) + 2, w: 14, shadow: 8, flip: x > 32,
  })),
  // the east road crosses the stream on the stone bridge; the pond has a wooden jetty
  { key: 'stonebridge', x: sx(49.5, 24), y: sy(49.5, 24) + 30, w: 112, flip: true, depth: sy(49.5, 24) - 20, shadow: 0 },
  { key: 'woodbridge', x: sx(38, 31.5), y: sy(38, 31.5) + 20, w: 72, flip: true, depth: sy(38, 31.5) - 16, shadow: 0 },
];

/** Lantern glow of a lamp sprite (screen px from its foot). */
export const LAMP_LIGHT = { dx: 4, dy: -20 } as const;

const ch = (x: number, y: number): string => {
  if (x < 0 || x >= MW || y < 0 || y >= MH) return 'T';
  return HOME_ROWS[y]?.[x] ?? 'T';
};

/** Trees on every forest tile of a checkerboard (and well past the map edges), bushes and rocks on theirs. */
function greenery(): VillageProp[] {
  const out: VillageProp[] = [];
  const EDGE = 14;
  for (let y = -EDGE; y < MH + EDGE; y++) {
    for (let x = -EDGE; x < MW + EDGE; x++) {
      const c = ch(x, y);
      const h1 = hash(x + 100, y + 300);
      const h2 = hash(x * 7 + 1, y * 3 + 11);
      const jx = (hash(x * 5 + 3, y + 41) - 0.5) * 0.5;
      const jy = (hash(x + 9, y * 5 + 7) - 0.5) * 0.5;
      const px = sx(x + 0.5 + jx, y + 0.5 + jy);
      const py = sy(x + 0.5 + jx, y + 0.5 + jy) + 6;
      if (c === 'T') {
        // a checkerboard is enough to close the canopy; lone trees inside the village always show
        const lone = x > 8 && x < 56 && y > 4 && y < 44 && ch(x - 1, y) !== 'T' && ch(x + 1, y) !== 'T';
        if (!lone && (x + y) % 2 !== 0) continue;
        const pine = h2 < 0.38;
        const s = 0.85 + h1 * 0.3;
        out.push({ key: pine ? (h1 < 0.5 ? 'pine1' : 'pine2') : h2 > 0.9 ? 'tree2' : 'tree1', x: px, y: py, w: Math.round((pine ? 46 : 84) * s), flip: hash(x, y) > 0.5, fade: true, sway: true, shadow: pine ? 26 : 42 });
      } else if (c === 'B') {
        out.push({ key: 'bush', x: px, y: py, w: 34, flip: h1 > 0.5, shadow: 26 });
      } else if (c === 'R') {
        out.push({ key: h1 < 0.5 ? 'rock' : 'rockpile', x: px, y: py, w: h1 < 0.5 ? 40 : 46, flip: h2 > 0.5, shadow: 34 });
      }
    }
  }
  return out;
}

/** Fence anchors: the feet of the left and right posts in the owner's images (fractions of width/height). */
const FENCE_ART = {
  railfence: { lx: 0.129, ly: 0.997, rx: 0.961, ry: 0.59, w: 77, h: 70 },
  picket: { lx: 0.146, ly: 0.995, rx: 0.783, ry: 0.697, w: 101, h: 95 },
  wall: { lx: 0.129, ly: 0.995, rx: 0.785, ry: 0.556, w: 98, h: 76 },
} as const;

/**
 * Fences between neighbouring fence tiles. The owner's pieces run along one isometric axis (north-
 * south: the far post up-right); mirrored they run east-west. Each piece is scaled so its two
 * posts stand on the two tile centres. Stone walls on 'K', a picket fence round the vegetable plot.
 */
function fences(): VillageProp[] {
  const out: VillageProp[] = [];
  const isF = (x: number, y: number): boolean => ch(x, y) === 'F' || ch(x, y) === 'K';
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      if (!isF(x, y)) continue;
      const key: VillageSprite = ch(x, y) === 'K' ? 'wall' : x >= 18 && x <= 23 && y >= 25 && y <= 28 ? 'picket' : 'railfence';
      const a = FENCE_ART[key];
      for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
        if (!isF(x + dx, y + dy)) continue;
        // posts on the two tile centres (screen); the one further down the screen is the near post
        const ax = sx(x + 0.5, y + 0.5);
        const ay = sy(x + 0.5, y + 0.5);
        const bx = sx(x + dx + 0.5, y + dy + 0.5);
        const by = sy(x + dx + 0.5, y + dy + 0.5);
        const flip = dx === 1; // east-west runs fall to the right: mirror the art
        const k = Math.abs(bx - ax) / ((a.rx - a.lx) * a.w); // screen px per image px
        const width = a.w * k;
        const height = a.h * k;
        // left foot of the (possibly mirrored) image sits on the left post
        const leftX = Math.min(ax, bx);
        const leftY = flip ? ay : by;
        const lx = flip ? 1 - a.rx : a.lx;
        const ly = flip ? a.ry : a.ly;
        const left = leftX - lx * width;
        const top = leftY - ly * height;
        out.push({ key, x: left + width / 2, y: top + height, w: width, flip, depth: Math.max(ay, by), shadow: 0 });
      }
    }
  }
  return out;
}

let cached: VillageProp[] | null = null;

/** Every sprite of the village. */
export function villageProps(): readonly VillageProp[] {
  cached ??= [...PLACED, ...fences(), ...greenery()];
  return cached;
}
