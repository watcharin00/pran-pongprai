// Tile map generation. Ported 1:1 from the prototype's gen() so the same seed
// yields the same world (verified against reference/prototype.html in tests).
import { TUNING } from '../data';
import type { ZoneId } from '../data/types';
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
} as const;
export type TileId = (typeof Tile)[keyof typeof Tile];

const BLOCKING = new Set<number>([Tile.WALL, Tile.TREE, Tile.BUSH, Tile.WATER, Tile.HOUSE, Tile.ROCK, Tile.CLIFF, Tile.FOUNTAIN, Tile.FENCE]);
/** Tiles that stop arrows: everything tall. Shots fly over water, bushes and fences. */
const SHOT_BLOCKING = new Set<number>([Tile.WALL, Tile.TREE, Tile.HOUSE, Tile.ROCK, Tile.CLIFF]);

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// --- Village layout (tile coordinates) ---
export const VILLAGE = { x0: 4, y0: 15, x1: 25, y1: 35 } as const;
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

export interface WorldMap {
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

export function tileAt(map: WorldMap, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= MW || y >= MH) return Tile.WALL;
  return map.tiles[y * MW + x] ?? Tile.WALL;
}

export function walkable(map: WorldMap, x: number, y: number): boolean {
  return !BLOCKING.has(tileAt(map, x, y));
}

export function shotPassablePx(map: WorldMap, px: number, py: number): boolean {
  return !SHOT_BLOCKING.has(tileAt(map, Math.floor(px / T), Math.floor(py / T)));
}

export function walkablePx(map: WorldMap, px: number, py: number): boolean {
  return walkable(map, Math.floor(px / T), Math.floor(py / T));
}

export function inCanyon(map: WorldMap, x: number, y: number): boolean {
  const rx = map.riverX[y];
  return y >= 20 && rx !== undefined && x > rx + 1;
}

export function zoneAtPx(map: WorldMap, px: number, py: number): ZoneId {
  const tx = Math.floor(px / T);
  const ty = Math.floor(py / T);
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
      if (get(x, y) !== Tile.GRASS || inVillageTile(x, y)) continue;
      const dv = Math.max(VILLAGE.x0 - x, x - VILLAGE.x1, VILLAGE.y0 - y, y - VILLAGE.y1, 0);
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
  for (let y = VILLAGE.y0; y <= VILLAGE.y1; y++) for (let x = VILLAGE.x0; x <= VILLAGE.x1; x++) set(x, y, Tile.GRASS);
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

  const partial: Omit<WorldMap, 'reach' | 'forestCells' | 'canyonCells'> = { tiles, riverX: RX, bridgeEast: BE, bridgeNorth: BN };
  const reach = floodReach(partial as WorldMap, PLAZA.x, 29);
  const map: WorldMap = { ...partial, reach, forestCells: [], canyonCells: [] };

  const forestCells: [number, number][] = [];
  const canyonCells: [number, number][] = [];
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      if (!reach[y * MW + x]) continue;
      const t = get(x, y);
      const nearVillage = x >= VILLAGE.x0 - 3 && x <= VILLAGE.x1 + 3 && y >= VILLAGE.y0 - 3 && y <= VILLAGE.y1 + 3;
      if ((t === Tile.GRASS || t === Tile.FLOWER) && !inCanyon(map, x, y) && !nearVillage) forestCells.push([x, y]);
      if (t === Tile.SAND && inCanyon(map, x, y) && x > rx(y) + 4 && y >= 22 && !(y >= BE - 1 && y <= BE + 2 && x < rx(y) + 9)) canyonCells.push([x, y]);
    }
  }
  return { ...map, forestCells, canyonCells };
}

/** 4-way flood fill from a tile; mirrors the prototype's DFS order. */
function floodReach(map: WorldMap, sx: number, sy: number): Uint8Array {
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
}

export function farmPlots(): PlotSpot[] {
  const out: PlotSpot[] = [];
  for (let y = FARM.y0; y <= FARM.y1; y++) for (let x = FARM.x0; x <= FARM.x1; x++) out.push({ tx: x, ty: y, x: x * T + 8, y: y * T + 8 });
  return out;
}
