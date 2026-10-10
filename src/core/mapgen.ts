// Tile map generation. Ported 1:1 from the prototype's gen() so the same seed
// yields the same world (verified against reference/prototype.html in tests).
import { TUNING } from '../data';
import type { AreaId, CropBed, ZoneId } from '../data/types';
import { parkMiller, vnoise } from './rng';

export const T = TUNING.world.tile;
export const MW = TUNING.world.width;
export const MH = TUNING.world.height;

export const Tile = {
  GRASS: 0,
  WALL: 1,
  TREE: 2,
  BUSH: 3,
  WATER: 4,
  SAND: 5,
  BRIDGE: 6,
  STONE: 7,
  HOUSE: 8,
  ROCK: 9,
  CLIFF: 10,
  SOIL: 11,
  FLOWER: 12,
  FOUNTAIN: 13,
  FENCE: 14,
  /** flooded rice field: walkable (you wade in to plant/harvest) */
  PADDY: 15,
  /** fish pond: solid like water, but arrows fly over it */
  POND: 16,
} as const;
export type TileId = (typeof Tile)[keyof typeof Tile];

const BLOCKING = new Set<number>([Tile.WALL, Tile.TREE, Tile.BUSH, Tile.WATER, Tile.HOUSE, Tile.ROCK, Tile.CLIFF, Tile.FOUNTAIN, Tile.FENCE, Tile.POND]);
/**
 * Tiles that stop arrows: buildings, rocks and cliffs. Shots fly over trees (the forest is
 * dense enough that blocking on trees forced players to hunt for firing angles), water,
 * bushes and fences.
 */
const SHOT_BLOCKING = new Set<number>([Tile.WALL, Tile.HOUSE, Tile.ROCK, Tile.CLIFF]);

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// --- Prototype generator layout (tile coordinates) ---
// generateMap() must stay identical to reference/prototype.html, so it keeps the prototype's own
// village. The home area the game plays on is the painted map instead (homeLayout.ts, areas.ts).
const GEN_VILLAGE = { x0: 4, y0: 15, x1: 25, y1: 35 } as const;
const inGenVillage = (x: number, y: number): boolean => x >= GEN_VILLAGE.x0 && x <= GEN_VILLAGE.x1 && y >= GEN_VILLAGE.y0 && y <= GEN_VILLAGE.y1;
const GEN_PLAZA = { x: 15, y: 27 } as const;
const GEN_SMITH: Rect = { x: 6, y: 18, w: 5, h: 4 };
const GEN_INN: Rect = { x: 19, y: 18, w: 5, h: 4 };
const GEN_FARM = { x0: 6, y0: 30, x1: 9, y1: 31 } as const;

// --- The isometric village (tile coordinates; layout in src/core/homeLayout.ts, tools/village/layout.py) ---
/** Village bounds for gameplay (HP regen, menus, monster leash). */
export const VILLAGE = { x0: 14, y0: 10, x1: 47, y1: 40 } as const;
/** Plaza / fountain centre (a tile corner); the fountain covers the 2x2 tiles up-left of it. */
export const PLAZA = { x: 32, y: 24 } as const;
/** Smithy (north-west of the plaza) and the market shop house that is the kitchen (north-east); HOUSE footprints. */
export const SMITH: Rect = { x: 23, y: 14, w: 3, h: 3 };
export const INN: Rect = { x: 38, y: 13, w: 3, h: 3 };
/** Fenced vegetable plot west of the plaza: 4x2 soil tiles, one plot each. */
export const FARM = { x0: 19, y0: 26, x1: 22, y1: 27 } as const;

// --- Points of interest (pixel coordinates) ---
/** Anvil at the smithy's east side. */
export const ANVIL = { x: 26.4 * T, y: 16.6 * T } as const;
/** The kitchen: the front of the shop house, where its counter faces the road. */
export const POT = { x: 39.5 * T, y: 16.6 * T } as const;
export const SPAWN = { x: PLAZA.x * T, y: (PLAZA.y + 2) * T + 8 } as const;
export const FARM_CENTER = { x: ((FARM.x0 + FARM.x1 + 1) * T) / 2, y: ((FARM.y0 + FARM.y1 + 1) * T) / 2 } as const;

/** Hunt request board beside the elder's house (one tile); the elder stands by it. */
export const BOARD = { x: 25, y: 21 } as const;

// --- Fish pond south-east of the plaza ---
/** Tiles around the pond, bank included. */
export const POND_AREA = { x0: 36, y0: 28, x1: 44, y1: 34 } as const;
/** The pond as an ellipse (px), inside the water tiles. */
export const POND_SHAPE = { cx: 40.2 * T, cy: 31.4 * T, rx: 3.4 * T, ry: 2.7 * T } as const;
/** Walkable jetty tiles out over the pond: none now (the waterside sala stands in the water, not walkable). */
export const JETTY: readonly (readonly [number, number])[] = [];

/** 0 at the pond centre, 1 at the waterline, >1 on the bank. */
export function pondDepth(px: number, py: number): number {
  return Math.hypot((px - POND_SHAPE.cx) / POND_SHAPE.rx, (py - POND_SHAPE.cy) / POND_SHAPE.ry);
}

/** Where lotus / fish go: in the water near the bank or the jetty, so they can be reached from dry ground. */
export const POND_SLOTS: readonly { x: number; y: number }[] = [
  { x: 37.5 * T, y: 31.5 * T },
  { x: 40.5 * T, y: 29 * T },
  { x: 39.8 * T, y: 33.4 * T },
  { x: 38.6 * T, y: 29.7 * T },
];

export const POND_CENTER = { x: POND_SHAPE.cx, y: POND_SHAPE.cy } as const;

// --- Chicken coop (south-west of the plaza) ---
/** fenced pen, fence included */
export const COOP: Rect = { x: 17, y: 31, w: 7, h: 5 };
/** gap in the north fence the player walks in through (this tile and the one east of it) */
export const COOP_GATE = { x: 20, y: 31 } as const;
/** feed trough by the west fence (px) */
export const TROUGH = { x: 18.6 * T, y: 33.8 * T } as const;
/** nest in the north-east corner: eggs and hatching go here (px) */
export const NEST = { x: 22.4 * T, y: 32.6 * T } as const;
/** where hens stroll (px), clear of the fence */
export const HEN_ROAM = { x0: 18 * T + 4, y0: 32 * T + 6, x1: 23 * T - 4, y1: 35 * T - 4 } as const;
export const COOP_CENTER = { x: (COOP.x + COOP.w / 2) * T, y: (COOP.y + COOP.h / 2) * T } as const;

/** Red canyon on the home map: the sandy flats east of the stream (gaur, canyon ore). */
export const HOME_CANYON = { x0: 51, y0: 28, x1: 63, y1: 43 } as const;

export type Edge = 'n' | 's' | 'e' | 'w';
/** Ground palette / decoration set used by the terrain painter. */
export type Biome = 'home' | 'bamboo' | 'swamp' | 'limestone' | 'deepwild' | 'cave' | 'mangrove' | 'peat' | 'savanna';

/** An opening in the map border that leads to another area. */
export interface AreaExit {
  edge: Edge;
  /** first tile along the edge */
  at: number;
  width: number;
  to: AreaId;
  /** where the player stands after arriving through this exit (px) */
  arrive: { x: number; y: number };
}

export interface WorldMap {
  readonly area: AreaId;
  /** zone name for everything outside the village / canyon / bridges */
  readonly zone: ZoneId;
  readonly biome: Biome;
  readonly exits: readonly AreaExit[];
  readonly tiles: Uint8Array;
  /** river centre column per row */
  readonly riverX: Int16Array;
  readonly bridgeEast: number;
  readonly bridgeNorth: number;
  /** tiles reachable on foot from the village */
  readonly reach: Uint8Array;
  readonly forestCells: readonly (readonly [number, number])[];
  readonly canyonCells: readonly (readonly [number, number])[];
  /** hunter camp in a wild area (safe ground, campfire, tent) */
  readonly camp?: Camp;
  /** the painted home map's canyon (tiles); without it the prototype rule applies (sand east of the river) */
  readonly canyon?: { x0: number; y0: number; x1: number; y1: number };
}

export interface Camp {
  /** centre of the camp clearing (px) */
  x: number;
  y: number;
  /** campfire (px); a one-tile rock in the tile grid */
  fire: { x: number; y: number };
  /** tent footprint in tiles (HOUSE tiles) */
  tent: Rect;
  /** where fast travel and a knockout put the player (px) */
  rest: { x: number; y: number };
}

/** Is (px, py) inside the safe ground of this map's camp? */
export function inCampPx(map: Pick<WorldMap, 'camp'>, px: number, py: number, radius: number): boolean {
  const c = map.camp;
  return !!c && Math.hypot(px - c.x, py - c.y) <= radius;
}

export const riverXAt = (y: number): number => 34 + Math.round(Math.sin(y * 0.16) * 2 + Math.sin(y * 0.06 + 1) * 1.5);

export function inVillageTile(x: number, y: number): boolean {
  return x >= VILLAGE.x0 && x <= VILLAGE.x1 && y >= VILLAGE.y0 && y <= VILLAGE.y1;
}

export function inVillagePx(px: number, py: number): boolean {
  return inVillageTile(Math.floor(px / T), Math.floor(py / T));
}

export function tileAt(map: Pick<WorldMap, 'tiles'>, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= MW || y >= MH) return Tile.WALL;
  return map.tiles[y * MW + x] ?? Tile.WALL;
}

export function walkable(map: Pick<WorldMap, 'tiles'>, x: number, y: number): boolean {
  return !BLOCKING.has(tileAt(map, x, y));
}

export function shotPassablePx(map: WorldMap, px: number, py: number): boolean {
  return !SHOT_BLOCKING.has(tileAt(map, Math.floor(px / T), Math.floor(py / T)));
}

export function walkablePx(map: WorldMap, px: number, py: number): boolean {
  return walkable(map, Math.floor(px / T), Math.floor(py / T));
}

export function inCanyon(map: WorldMap, x: number, y: number): boolean {
  if (map.area !== 'home') return false;
  const c = map.canyon;
  if (c) return x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1;
  const rx = map.riverX[y];
  return y >= 20 && rx !== undefined && x > rx + 1;
}

export function zoneAtPx(map: WorldMap, px: number, py: number): ZoneId {
  const tx = Math.floor(px / T);
  const ty = Math.floor(py / T);
  if (map.area !== 'home') return map.zone;
  if (inVillageTile(tx, ty)) return 'village';
  if (tileAt(map, tx, ty) === Tile.BRIDGE) return 'bridge';
  if (inCanyon(map, tx, ty)) return 'canyon';
  return 'forest';
}

export function generateMap(seed: number = TUNING.world.seed): WorldMap {
  const rnd = parkMiller(seed);
  const tiles = new Uint8Array(MW * MH);
  const get = (x: number, y: number): number => tiles[y * MW + x] ?? Tile.WALL;
  const set = (x: number, y: number, t: number): void => {
    if (x >= 0 && y >= 0 && x < MW && y < MH) tiles[y * MW + x] = t;
  };

  const RX = new Int16Array(MH);
  for (let y = 0; y < MH; y++) RX[y] = riverXAt(y);
  const rx = (y: number): number => RX[y] ?? 0;
  const pickBridge = (near: number): number => {
    let best = near;
    let bd = 99;
    for (let y = near - 4; y <= near + 4; y++) {
      if (rx(y) === rx(y + 1) && Math.abs(y - near) < bd) {
        bd = Math.abs(y - near);
        best = y;
      }
    }
    return best;
  };
  const BE = pickBridge(26);
  const BN = pickBridge(8);

  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) tiles[y * MW + x] = x < 3 || y < 3 || x >= MW - 3 || y >= MH - 3 ? Tile.WALL : Tile.GRASS;
  // river, canyon floor and the cliff line above it
  for (let y = 0; y < MH; y++) for (let d = -1; d <= 1; d++) set(rx(y) + d, y, Tile.WATER);
  for (let y = 20; y < MH - 3; y++) for (let x = rx(y) + 2; x < MW - 3; x++) set(x, y, Tile.SAND);
  for (let x = rx(19) + 2; x < MW - 3; x++) set(x, 19, Tile.CLIFF);
  // forest: trees except in noise clearings, sparser near the village
  for (let y = 3; y < MH - 3; y++) {
    for (let x = 3; x < MW - 3; x++) {
      if (get(x, y) !== Tile.GRASS || inGenVillage(x, y)) continue;
      const dv = Math.max(GEN_VILLAGE.x0 - x, x - GEN_VILLAGE.x1, GEN_VILLAGE.y0 - y, y - GEN_VILLAGE.y1, 0);
      const clearing = vnoise(x, y, 7) > 0.54;
      const r = rnd();
      const dens = dv < 3 ? 0.1 : 0.32;
      if (!clearing && r < dens) set(x, y, Tile.TREE);
      else if (r > 0.975) set(x, y, Tile.BUSH);
      else if (r > 0.93) set(x, y, Tile.FLOWER);
    }
  }
  for (let y = 21; y < MH - 3; y++) for (let x = rx(y) + 3; x < MW - 3; x++) if (get(x, y) === Tile.SAND && rnd() < 0.065) set(x, y, Tile.ROCK);
  // village ground + oval stone plaza
  for (let y = GEN_VILLAGE.y0; y <= GEN_VILLAGE.y1; y++) for (let x = GEN_VILLAGE.x0; x <= GEN_VILLAGE.x1; x++) set(x, y, Tile.GRASS);
  for (let y = GEN_PLAZA.y - 4; y <= GEN_PLAZA.y + 4; y++) {
    for (let x = GEN_PLAZA.x - 6; x <= GEN_PLAZA.x + 6; x++) {
      const dx = (x + 0.5 - GEN_PLAZA.x) / 5.4;
      const dy = (y + 0.5 - GEN_PLAZA.y) / 3.9;
      if (dx * dx + dy * dy <= 1) set(x, y, Tile.STONE);
    }
  }
  // roads
  for (let x = 6; x <= 24; x++) for (let y = 22; y <= 23; y++) set(x, y, Tile.SAND);
  for (let y = BN; y <= 22; y++) for (let x = 14; x <= 15; x++) set(x, y, Tile.SAND);
  for (let x = 14; x <= rx(BN) + 14; x++) for (let y = BN; y <= BN + 1; y++) set(x, y, get(x, y) === Tile.WATER ? Tile.BRIDGE : Tile.SAND);
  for (let x = 19; x <= rx(BE) + 7; x++) {
    for (let y = BE; y <= BE + 1; y++) if (get(x, y) !== Tile.STONE) set(x, y, get(x, y) === Tile.WATER ? Tile.BRIDGE : Tile.SAND);
  }
  for (let y = 31; y < MH - 3; y++) for (let x = 14; x <= 15; x++) if (get(x, y) !== Tile.STONE) set(x, y, Tile.SAND);
  // buildings and fountain
  for (const H of [GEN_SMITH, GEN_INN]) for (let y = H.y; y < H.y + H.h; y++) for (let x = H.x; x < H.x + H.w; x++) set(x, y, Tile.HOUSE);
  for (let y = GEN_PLAZA.y - 1; y <= GEN_PLAZA.y; y++) for (let x = GEN_PLAZA.x - 1; x <= GEN_PLAZA.x; x++) set(x, y, Tile.FOUNTAIN);
  // fenced farm with a gap on the east side
  for (let y = GEN_FARM.y0 - 1; y <= GEN_FARM.y1 + 1; y++) {
    for (let x = GEN_FARM.x0 - 1; x <= GEN_FARM.x1 + 1; x++) {
      const edge = y === GEN_FARM.y0 - 1 || y === GEN_FARM.y1 + 1 || x === GEN_FARM.x0 - 1 || x === GEN_FARM.x1 + 1;
      if (edge && !(x === GEN_FARM.x1 + 1 && y >= GEN_FARM.y0 && y <= GEN_FARM.y1)) set(x, y, Tile.FENCE);
      else if (!edge) set(x, y, Tile.SOIL);
    }
  }
  for (let x = GEN_FARM.x1 + 1; x <= 12; x++) for (let y = GEN_FARM.y0; y <= GEN_FARM.y1; y++) if (get(x, y) !== Tile.STONE) set(x, y, Tile.SAND);
  // village decor
  for (const [x, y] of [[5, 22], [25, 22], [11, 18], [18, 18], [9, 25], [21, 25], [21, 29], [5, 26], [24, 32]] as const) set(x, y, Tile.BUSH);
  for (const [x, y] of [[12, 19], [12, 20], [17, 19], [17, 20], [11, 25], [19, 25], [6, 25], [7, 26], [22, 31], [23, 30], [18, 33], [11, 33]] as const) {
    if (get(x, y) === Tile.GRASS) set(x, y, Tile.FLOWER);
  }
  for (const [x, y] of [[5, 34], [24, 34], [24, 16], [5, 16]] as const) set(x, y, Tile.TREE);

  const partial: Omit<WorldMap, 'reach' | 'forestCells' | 'canyonCells'> = { area: 'home', zone: 'forest', biome: 'home', exits: [], tiles, riverX: RX, bridgeEast: BE, bridgeNorth: BN };
  const reach = floodReach(partial as WorldMap, GEN_PLAZA.x, 29);
  const map: WorldMap = { ...partial, reach, forestCells: [], canyonCells: [] };

  const forestCells: [number, number][] = [];
  const canyonCells: [number, number][] = [];
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      if (!reach[y * MW + x]) continue;
      const t = get(x, y);
      const nearVillage = x >= GEN_VILLAGE.x0 - 3 && x <= GEN_VILLAGE.x1 + 3 && y >= GEN_VILLAGE.y0 - 3 && y <= GEN_VILLAGE.y1 + 3;
      if ((t === Tile.GRASS || t === Tile.FLOWER) && !inCanyon(map, x, y) && !nearVillage) forestCells.push([x, y]);
      if (t === Tile.SAND && inCanyon(map, x, y) && x > rx(y) + 4 && y >= 22 && !(y >= BE - 1 && y <= BE + 2 && x < rx(y) + 9)) canyonCells.push([x, y]);
    }
  }
  return { ...map, forestCells, canyonCells };
}

/** 4-way flood fill from a tile; mirrors the prototype's DFS order. */
export function floodReach(map: Pick<WorldMap, 'tiles'>, sx: number, sy: number): Uint8Array {
  const reach = new Uint8Array(MW * MH);
  const s = sy * MW + sx;
  const stack = [s];
  reach[s] = 1;
  while (stack.length) {
    const c = stack.pop() as number;
    const cx = c % MW;
    const cy = (c / MW) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (walkable(map, nx, ny) && !reach[ny * MW + nx]) {
        reach[ny * MW + nx] = 1;
        stack.push(ny * MW + nx);
      }
    }
  }
  return reach;
}

export interface PlotSpot {
  tx: number;
  ty: number;
  x: number;
  y: number;
  bed: CropBed;
}

export function farmPlots(): PlotSpot[] {
  const out: PlotSpot[] = [];
  const add = (x: number, y: number, bed: CropBed): void => {
    out.push({ tx: x, ty: y, x: x * T + 8, y: y * T + 8, bed });
  };
  // soil first, so plot indices of older saves (8 soil plots) stay the same
  for (let y = FARM.y0; y <= FARM.y1; y++) for (let x = FARM.x0; x <= FARM.x1; x++) add(x, y, 'soil');
  for (const p of POND_SLOTS) out.push({ tx: Math.floor(p.x / T), ty: Math.floor(p.y / T), x: p.x, y: p.y, bed: 'pond' });
  return out;
}
