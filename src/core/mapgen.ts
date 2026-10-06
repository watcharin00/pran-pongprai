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

// --- Village layout (tile coordinates) ---
/**
 * Village bounds the prototype generator uses (tree density, cleared ground). Never change these:
 * generateMap() must stay identical to reference/prototype.html.
 */
const GEN_VILLAGE = { x0: 4, y0: 15, x1: 25, y1: 35 } as const;
const inGenVillage = (x: number, y: number): boolean => x >= GEN_VILLAGE.x0 && x <= GEN_VILLAGE.x1 && y >= GEN_VILLAGE.y0 && y <= GEN_VILLAGE.y1;
/** Village bounds for gameplay (HP regen, menus, monster leash): the prototype village plus the south quarter. */
export const VILLAGE = { x0: 4, y0: 15, x1: 31, y1: 41 } as const;
/** Plaza / fountain centre (a tile corner). */
export const PLAZA = { x: 15, y: 27 } as const;
export const SMITH: Rect = { x: 6, y: 18, w: 5, h: 4 };
export const INN: Rect = { x: 19, y: 18, w: 5, h: 4 };
export const FARM = { x0: 6, y0: 30, x1: 9, y1: 31 } as const;
/** Lamp posts around the plaza (tile coordinates). */
export const LAMPS: readonly (readonly [number, number])[] = [
  [PLAZA.x - 6, PLAZA.y - 3],
  [PLAZA.x + 5, PLAZA.y - 3],
  [PLAZA.x - 6, PLAZA.y + 3],
  [PLAZA.x + 5, PLAZA.y + 3],
];

// --- Points of interest (pixel coordinates) ---
export const ANVIL = { x: 11 * T + 7, y: 21 * T + 9 } as const;
export const POT = { x: 18 * T + 7, y: 21 * T + 9 } as const;
export const SPAWN = { x: PLAZA.x * T, y: (PLAZA.y + 2) * T + 8 } as const;
export const FARM_CENTER = { x: ((FARM.x0 + FARM.x1 + 1) * T) / 2, y: ((FARM.y0 + FARM.y1 + 1) * T) / 2 } as const;
export const CHIMNEY = { x: SMITH.x * T + SMITH.w * T - 13, y: SMITH.y * T - 12 } as const;

// --- South quarter: the village expansion, stamped onto the home map in areas.ts ---
export const QUARTER = { x0: 4, y0: 36, x1: 25, y1: 41 } as const;
/** Village elder's house (gives hunt requests); the request board stands by its door. */
export const ELDER_HOUSE: Rect = { x: 5, y: 36, w: 6, h: 4 };
export const HUTS: readonly Rect[] = [
  { x: 17, y: 36, w: 4, h: 3 },
  { x: 22, y: 36, w: 4, h: 3 },
];
/** Rice granary on stilts. */
export const GRANARY: Rect = { x: 19, y: 40, w: 3, h: 2 };
/** Hunt request board (one tile). */
export const BOARD = { x: 12, y: 39 } as const;
/** Fence row closing the quarter to the south; the road keeps its gap. */
export const QUARTER_FENCE_Y = 42;
export const QUARTER_LAMPS: readonly (readonly [number, number])[] = [
  [13, 37],
  [16, 37],
];
const QUARTER_FLOWERS: readonly (readonly [number, number])[] = [[5, 41], [9, 41], [11, 41], [17, 41], [23, 40], [24, 41]];

// --- East fields: rice paddy and fish pond between the village and the river ---
/** Ground cleared around the paddy, its bunds and the field hut. */
export const PADDY_AREA = { x0: 25, y0: 14, x1: 33, y1: 19 } as const;
/** The flooded field: 6x4 tiles, split by bunds into six 2x2 sections (กระทง), one plot each. */
export const PADDY = { x0: 26, y0: 15, x1: 31, y1: 18 } as const;
export const PADDY_SECTIONS: readonly Rect[] = [0, 1].flatMap((r) => [0, 1, 2].map((c) => ({ x: PADDY.x0 + c * 2, y: PADDY.y0 + r * 2, w: 2, h: 2 })));
/** Scarecrow on the west bund (painted, not solid). */
export const SCARECROW = { x: 25, y: 16 } as const;
/** Field hut on stilts (ห้างนา) at the paddy's east edge. */
export const FIELD_HUT: Rect = { x: 32, y: 15, w: 2, h: 2 };

/** Cleared bank around the pond. */
export const POND_AREA = { x0: 24, y0: 28, x1: 30, y1: 34 } as const;
/** Open ground south of the sala so tree canopies do not hide it. */
export const SALA_AREA = { x0: 26, y0: 35, x1: 31, y1: 37 } as const;
/** The pond is a soft-edged ellipse (px); tiles whose centre is in the water are solid. */
export const POND_SHAPE = { cx: 27.4 * T, cy: 31 * T, rx: 2.75 * T, ry: 2.25 * T } as const;
/** Small open pavilion (ศาลา) on the pond's south-east bank. */
export const SALA: Rect = { x: 29, y: 33, w: 2, h: 2 };
/** Wooden jetty (ท่าน้ำ) from the sala's side out over the water: walkable. */
export const JETTY: readonly (readonly [number, number])[] = [
  [29, 32],
  [28, 32],
];

/**
 * 0 at the pond centre, 1 at the waterline, >1 on the bank. The outline wobbles a little
 * (deterministic noise) so the pond never reads as a perfect oval.
 */
export function pondDepth(px: number, py: number): number {
  const dx = (px - POND_SHAPE.cx) / POND_SHAPE.rx;
  const dy = (py - POND_SHAPE.cy) / POND_SHAPE.ry;
  const a = Math.atan2(dy, dx);
  const wobble = 1 + Math.sin(a * 3 + 0.7) * 0.06 + Math.sin(a * 5 + 2.1) * 0.035;
  return Math.hypot(dx, dy) / wobble;
}

/** Where lotus / fish go: inside the water near the rim or the jetty, so they can be reached from dry ground. */
export const POND_SLOTS: readonly { x: number; y: number }[] = [
  { x: POND_SHAPE.cx - 6, y: POND_SHAPE.cy - POND_SHAPE.ry * 0.62 },
  { x: POND_SHAPE.cx - POND_SHAPE.rx * 0.66, y: POND_SHAPE.cy - 2 },
  { x: POND_SHAPE.cx - 12, y: POND_SHAPE.cy + POND_SHAPE.ry * 0.62 },
  { x: POND_SHAPE.cx + POND_SHAPE.rx * 0.5, y: POND_SHAPE.cy - 6 },
];

export const PADDY_CENTER = { x: ((PADDY.x0 + PADDY.x1 + 1) * T) / 2, y: ((PADDY.y0 + PADDY.y1 + 1) * T) / 2 } as const;
export const POND_CENTER = { x: POND_SHAPE.cx, y: POND_SHAPE.cy } as const;

/** Stamps the paddy and the pond onto a home-map tile array (after generation). */
export function stampEastFields(tiles: Uint8Array): void {
  const set = (x: number, y: number, t: number): void => {
    tiles[y * MW + x] = t;
  };
  const isWater = (x: number, y: number): boolean => tiles[y * MW + x] === Tile.WATER || tiles[y * MW + x] === Tile.BRIDGE;
  for (const A of [PADDY_AREA, POND_AREA, SALA_AREA]) {
    for (let y: number = A.y0; y <= A.y1; y++) for (let x: number = A.x0; x <= A.x1; x++) if (!isWater(x, y) && tiles[y * MW + x] !== Tile.SAND) set(x, y, Tile.GRASS);
  }
  for (let y: number = PADDY.y0; y <= PADDY.y1; y++) for (let x: number = PADDY.x0; x <= PADDY.x1; x++) set(x, y, Tile.PADDY);
  for (let y: number = POND_AREA.y0; y <= POND_AREA.y1; y++) {
    for (let x: number = POND_AREA.x0; x <= POND_AREA.x1; x++) if (pondDepth(x * T + 8, y * T + 8) < 1) set(x, y, Tile.POND);
  }
  for (const [x, y] of JETTY) set(x, y, Tile.BRIDGE);
  for (const H of [SALA, FIELD_HUT]) for (let y = H.y; y < H.y + H.h; y++) for (let x = H.x; x < H.x + H.w; x++) set(x, y, Tile.HOUSE);
}

/** Stamps the south quarter onto a home-map tile array (after generation, so the prototype parity holds). */
export function stampVillageQuarter(tiles: Uint8Array): void {
  const set = (x: number, y: number, t: number): void => {
    tiles[y * MW + x] = t;
  };
  for (let y: number = QUARTER.y0; y <= QUARTER.y1; y++) {
    for (let x: number = QUARTER.x0; x <= QUARTER.x1; x++) set(x, y, x === 14 || x === 15 ? Tile.SAND : Tile.GRASS);
  }
  for (const H of [ELDER_HOUSE, ...HUTS, GRANARY]) for (let y = H.y; y < H.y + H.h; y++) for (let x = H.x; x < H.x + H.w; x++) set(x, y, Tile.HOUSE);
  set(BOARD.x, BOARD.y, Tile.HOUSE);
  // a short sand path from the elder's door to the road
  for (let x = ELDER_HOUSE.x + 2; x <= 13; x++) set(x, ELDER_HOUSE.y + ELDER_HOUSE.h, Tile.SAND);
  for (const [x, y] of QUARTER_FLOWERS) set(x, y, Tile.FLOWER);
  for (let x: number = QUARTER.x0; x <= QUARTER.x1; x++) if (x < 13 || x > 16) set(x, QUARTER_FENCE_Y, Tile.FENCE);
}

export type Edge = 'n' | 's' | 'e' | 'w';
/** Ground palette / decoration set used by the terrain painter. */
export type Biome = 'home' | 'bamboo' | 'swamp' | 'limestone' | 'deepwild' | 'cave';

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
  for (let y = PLAZA.y - 4; y <= PLAZA.y + 4; y++) {
    for (let x = PLAZA.x - 6; x <= PLAZA.x + 6; x++) {
      const dx = (x + 0.5 - PLAZA.x) / 5.4;
      const dy = (y + 0.5 - PLAZA.y) / 3.9;
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
  for (const H of [SMITH, INN]) for (let y = H.y; y < H.y + H.h; y++) for (let x = H.x; x < H.x + H.w; x++) set(x, y, Tile.HOUSE);
  for (let y = PLAZA.y - 1; y <= PLAZA.y; y++) for (let x = PLAZA.x - 1; x <= PLAZA.x; x++) set(x, y, Tile.FOUNTAIN);
  // fenced farm with a gap on the east side
  for (let y = FARM.y0 - 1; y <= FARM.y1 + 1; y++) {
    for (let x = FARM.x0 - 1; x <= FARM.x1 + 1; x++) {
      const edge = y === FARM.y0 - 1 || y === FARM.y1 + 1 || x === FARM.x0 - 1 || x === FARM.x1 + 1;
      if (edge && !(x === FARM.x1 + 1 && y >= FARM.y0 && y <= FARM.y1)) set(x, y, Tile.FENCE);
      else if (!edge) set(x, y, Tile.SOIL);
    }
  }
  for (let x = FARM.x1 + 1; x <= 12; x++) for (let y = FARM.y0; y <= FARM.y1; y++) if (get(x, y) !== Tile.STONE) set(x, y, Tile.SAND);
  // village decor
  for (const [x, y] of [[5, 22], [25, 22], [11, 18], [18, 18], [9, 25], [21, 25], [21, 29], [5, 26], [24, 32]] as const) set(x, y, Tile.BUSH);
  for (const [x, y] of [[12, 19], [12, 20], [17, 19], [17, 20], [11, 25], [19, 25], [6, 25], [7, 26], [22, 31], [23, 30], [18, 33], [11, 33]] as const) {
    if (get(x, y) === Tile.GRASS) set(x, y, Tile.FLOWER);
  }
  for (const [x, y] of [[5, 34], [24, 34], [24, 16], [5, 16]] as const) set(x, y, Tile.TREE);

  const partial: Omit<WorldMap, 'reach' | 'forestCells' | 'canyonCells'> = { area: 'home', zone: 'forest', biome: 'home', exits: [], tiles, riverX: RX, bridgeEast: BE, bridgeNorth: BN };
  const reach = floodReach(partial as WorldMap, PLAZA.x, 29);
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
  // one plot per paddy section, centred in its 2x2 tiles
  for (const r of PADDY_SECTIONS) out.push({ tx: r.x, ty: r.y, x: (r.x + 1) * T, y: (r.y + 1) * T, bed: 'paddy' });
  for (const p of POND_SLOTS) out.push({ tx: Math.floor(p.x / T), ty: Math.floor(p.y / T), x: p.x, y: p.y, bed: 'pond' });
  return out;
}
