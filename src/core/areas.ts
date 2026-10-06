// The world is a set of areas (all MW×MH tiles) joined by exits at the map edges.
// The home area is the prototype map plus carved exits; every other area is
// generated from its own seed. Pure and deterministic: no Math.random.
import type { AreaId, ZoneId } from '../data/types';
import { TUNING } from '../data';
import { floodReach, generateMap, inVillageTile, MH, MW, PLAZA, stampEastFields, stampVillageQuarter, T, Tile, VILLAGE, walkable, type AreaExit, type Biome, type Edge, type WorldMap } from './mapgen';
import { parkMiller, vnoise } from './rng';
import { openTrails } from './trails';

export const AREA_IDS: readonly AreaId[] = ['home', 'bamboo', 'swamp', 'limestone', 'deepwild', 'cave'];

interface AreaSpec {
  seed: number;
  biome: Biome;
  zone: ZoneId;
  /** exits: edge, first tile along that edge, width in tiles, destination */
  exits: readonly { edge: Edge; at: number; width: number; to: AreaId }[];
}

/** Layout of the world (see CLAUDE.md "โลก"). */
const SPECS: Record<Exclude<AreaId, 'home'>, AreaSpec> = {
  bamboo: { seed: 7101, biome: 'bamboo', zone: 'bamboo', exits: [{ edge: 's', at: 30, width: 3, to: 'home' }, { edge: 'n', at: 30, width: 3, to: 'deepwild' }] },
  deepwild: { seed: 7404, biome: 'deepwild', zone: 'deepwild', exits: [{ edge: 's', at: 30, width: 3, to: 'bamboo' }] },
  swamp: { seed: 7202, biome: 'swamp', zone: 'swamp', exits: [{ edge: 'n', at: 30, width: 3, to: 'home' }] },
  limestone: { seed: 7303, biome: 'limestone', zone: 'limestone', exits: [{ edge: 'w', at: 22, width: 3, to: 'home' }, { edge: 'n', at: 30, width: 3, to: 'cave' }] },
  cave: { seed: 7505, biome: 'cave', zone: 'cave', exits: [{ edge: 's', at: 30, width: 3, to: 'limestone' }] },
};

/** Home exits line up with the existing village roads / canyon floor. */
const HOME_EXITS: readonly { edge: Edge; at: number; width: number; to: AreaId }[] = [
  { edge: 'n', at: 14, width: 2, to: 'bamboo' },
  { edge: 's', at: 14, width: 2, to: 'swamp' },
  { edge: 'e', at: 34, width: 2, to: 'limestone' },
];

/** Tiles of an exit opening, from the map edge inward `depth` tiles. */
function exitTiles(e: { edge: Edge; at: number; width: number }, depth: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < e.width; i++) {
    for (let d = 0; d < depth; d++) {
      if (e.edge === 'n') out.push([e.at + i, d]);
      else if (e.edge === 's') out.push([e.at + i, MH - 1 - d]);
      else if (e.edge === 'w') out.push([d, e.at + i]);
      else out.push([MW - 1 - d, e.at + i]);
    }
  }
  return out;
}

/** Where a player stands after arriving through `e` (a few tiles inside the opening). */
function arrivalOf(e: { edge: Edge; at: number; width: number }): { x: number; y: number } {
  const mid = e.at + (e.width - 1) / 2;
  const inset = 4;
  if (e.edge === 'n') return { x: mid * T + 8, y: inset * T + 8 };
  if (e.edge === 's') return { x: mid * T + 8, y: (MH - 1 - inset) * T + 8 };
  if (e.edge === 'w') return { x: inset * T + 8, y: mid * T + 8 };
  return { x: (MW - 1 - inset) * T + 8, y: mid * T + 8 };
}

function toExit(e: { edge: Edge; at: number; width: number; to: AreaId }): AreaExit {
  return { ...e, arrive: arrivalOf(e) };
}

/** Carves a straight path from an exit to (tx, ty), turning once. */
function carvePath(tiles: Uint8Array, from: [number, number], to: [number, number], width: number, horizontalFirst: boolean): void {
  const set = (x: number, y: number): void => {
    if (x < 1 || y < 1 || x >= MW - 1 || y >= MH - 1) return;
    for (let i = 0; i < width; i++) for (let j = 0; j < width; j++) {
      const k = (y + j) * MW + x + i;
      if (y + j < MH - 1 && x + i < MW - 1) tiles[k] = Tile.SAND;
    }
  };
  let [x, y] = from;
  const [tx, ty] = to;
  const stepX = (): void => {
    while (x !== tx) {
      set(x, y);
      x += Math.sign(tx - x);
    }
  };
  const stepY = (): void => {
    while (y !== ty) {
      set(x, y);
      y += Math.sign(ty - y);
    }
  };
  if (horizontalFirst) {
    stepX();
    stepY();
  } else {
    stepY();
    stepX();
  }
  set(x, y);
}

function homeArea(): WorldMap {
  const base = generateMap();
  const tiles = new Uint8Array(base.tiles);
  for (const e of HOME_EXITS) {
    // open the border wall and run a sand road to the nearest open ground
    for (const [x, y] of exitTiles(e, 4)) tiles[y * MW + x] = Tile.SAND;
  }
  // deer trails through the forest; the village and everything that isn't a tree or bush stay as generated
  openTrails(tiles, TUNING.world.seed, { clearable: new Set([Tile.TREE, Tile.BUSH]), keep: (x, y) => inVillageTile(x, y) });
  // north road continues from the north bridge row up to the edge
  for (let y = 0; y < base.bridgeNorth; y++) for (let x = 14; x <= 15; x++) tiles[y * MW + x] = Tile.SAND;
  // east exit: clear a lane across the canyon floor to the edge
  for (let x = (base.riverX[34] ?? 40) + 2; x < MW; x++) {
    for (let y = 34; y <= 35; y++) {
      const t = tiles[y * MW + x];
      if (t === Tile.ROCK || t === Tile.WALL || t === Tile.SAND || t === Tile.CLIFF) tiles[y * MW + x] = Tile.SAND;
    }
  }
  // the village's south quarter (elder, huts, granary) sits where the prototype had forest edge
  stampVillageQuarter(tiles);
  // rice paddy and fish pond on the river side of the village
  stampEastFields(tiles);
  const partial = { ...base, tiles };
  const reach = floodReach(partial, PLAZA.x, 29);
  // monsters keep spawning 3+ tiles outside the (now larger) village, only on reachable open ground
  const forestCells = base.forestCells.filter(
    ([x, y]) => reach[y * MW + x] && walkable(partial, x, y) && !(x >= VILLAGE.x0 - 3 && x <= VILLAGE.x1 + 3 && y >= VILLAGE.y0 - 3 && y <= VILLAGE.y1 + 3),
  );
  return { ...partial, reach, forestCells, area: 'home', zone: 'forest', biome: 'home', exits: HOME_EXITS.map(toExit) };
}

/** Generic wild area: border wall, biome-specific obstacles, roads joining every exit at the centre. */
function wildArea(id: Exclude<AreaId, 'home'>): WorldMap {
  const spec = SPECS[id];
  const rnd = parkMiller(spec.seed);
  const tiles = new Uint8Array(MW * MH);
  const get = (x: number, y: number): number => tiles[y * MW + x] ?? Tile.WALL;
  const set = (x: number, y: number, t: number): void => {
    if (x >= 0 && y >= 0 && x < MW && y < MH) tiles[y * MW + x] = t;
  };
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) set(x, y, x < 3 || y < 3 || x >= MW - 3 || y >= MH - 3 ? Tile.WALL : Tile.GRASS);

  // vnoise's third argument is the feature size in tiles; the seed shifts the sample window
  const ox = (spec.seed * 37) % 1000;
  const oy = (spec.seed * 53) % 1000;
  for (let y = 3; y < MH - 3; y++) {
    for (let x = 3; x < MW - 3; x++) {
      const n = vnoise(x + ox, y + oy, spec.biome === 'swamp' ? 5 : 7);
      const r = rnd();
      switch (spec.biome) {
        case 'bamboo':
          if (n > 0.6) break; // clearings
          if (r < 0.34) set(x, y, Tile.TREE);
          else if (r > 0.96) set(x, y, Tile.BUSH);
          else if (r > 0.92) set(x, y, Tile.FLOWER);
          break;
        case 'deepwild':
          if (n > 0.62) break;
          if (r < 0.4) set(x, y, Tile.TREE);
          else if (r > 0.95) set(x, y, Tile.BUSH);
          break;
        case 'swamp':
          if (n > 0.58) set(x, y, Tile.WATER);
          else if (r < 0.1) set(x, y, Tile.TREE);
          else if (r > 0.9) set(x, y, Tile.BUSH);
          else if (r > 0.86) set(x, y, Tile.FLOWER);
          break;
        case 'limestone':
          if (n > 0.6) set(x, y, Tile.SAND);
          if (r < 0.09) set(x, y, Tile.ROCK);
          else if (r < 0.17 && n < 0.45) set(x, y, Tile.TREE);
          break;
        case 'cave':
          // clear pools in the low spots, stalagmite clumps (TREE tiles, painted as stone) on the rest
          if (n > 0.68) set(x, y, Tile.WATER);
          else if (n < 0.4 && r < 0.3) set(x, y, Tile.TREE);
          else if (r < 0.05) set(x, y, Tile.ROCK);
          else if (n > 0.55 && r > 0.9) set(x, y, Tile.SAND);
          break;
        default:
          break;
      }
    }
  }

  // deer trails so dense tree cover never walls the player in
  openTrails(tiles, spec.seed, { clearable: new Set([Tile.TREE, Tile.BUSH, Tile.ROCK]) });

  // roads: every exit to the centre, wide enough to walk without snagging
  const centre: [number, number] = [31, 23];
  spec.exits.forEach((e, i) => {
    const [ex, ey] = exitTiles(e, 1)[0] ?? centre;
    carvePath(tiles, [ex, ey], centre, Math.max(2, e.width - 1), i % 2 === 0 ? e.edge === 'e' || e.edge === 'w' : !(e.edge === 'e' || e.edge === 'w'));
    for (const [x, y] of exitTiles(e, 4)) set(x, y, Tile.SAND);
  });
  // an open clearing in the middle so every area has room to fight
  for (let y = centre[1] - 3; y <= centre[1] + 3; y++) for (let x = centre[0] - 4; x <= centre[0] + 4; x++) if (get(x, y) !== Tile.SAND) set(x, y, Tile.GRASS);

  const riverX = new Int16Array(MH).fill(-100);
  const exits = spec.exits.map(toExit);
  const first = exits[0];
  const startX = first ? Math.floor(first.arrive.x / T) : centre[0];
  const startY = first ? Math.floor(first.arrive.y / T) : centre[1];
  const partial = { tiles, riverX, bridgeEast: -10, bridgeNorth: -10, forestCells: [], canyonCells: [] };
  const reach = floodReach(partial as unknown as WorldMap, startX, startY);
  // monsters spawn on reachable open ground away from the exits
  const forestCells: [number, number][] = [];
  for (let y = 3; y < MH - 3; y++) {
    for (let x = 3; x < MW - 3; x++) {
      if (!reach[y * MW + x]) continue;
      const t = get(x, y);
      if (t !== Tile.GRASS && t !== Tile.FLOWER && t !== Tile.SAND) continue;
      if (exits.some((e) => Math.hypot(e.arrive.x / T - x, e.arrive.y / T - y) < 8)) continue;
      forestCells.push([x, y]);
    }
  }
  return { ...partial, reach, forestCells, area: id, zone: spec.zone, biome: spec.biome, exits };
}

/** The generation seed of a wild area (its trails and obstacles derive from it). */
export function areaSeed(id: Exclude<AreaId, 'home'>): number {
  return SPECS[id].seed;
}

/** Builds an area map from scratch (no cache); the same id always yields the same tiles. */
export function buildAreaMap(id: AreaId): WorldMap {
  return id === 'home' ? homeArea() : wildArea(id);
}

const cache = new Map<AreaId, WorldMap>();

/** The map for an area (built once, then cached; deterministic). */
export function areaMap(id: AreaId): WorldMap {
  let m = cache.get(id);
  if (!m) {
    m = buildAreaMap(id);
    cache.set(id, m);
  }
  return m;
}

/** The exit whose opening contains tile (tx, ty), if any. */
export function exitAt(map: WorldMap, tx: number, ty: number): AreaExit | null {
  for (const e of map.exits) {
    const along = e.edge === 'n' || e.edge === 's' ? tx : ty;
    if (along < e.at || along >= e.at + e.width) continue;
    if (e.edge === 'n' && ty <= 1) return e;
    if (e.edge === 's' && ty >= MH - 2) return e;
    if (e.edge === 'w' && tx <= 1) return e;
    if (e.edge === 'e' && tx >= MW - 2) return e;
  }
  return null;
}

/** The exit in `to` that leads back to `from` (where the player arrives). */
export function arrivalExit(from: AreaId, to: AreaId): AreaExit | null {
  return areaMap(to).exits.find((e) => e.to === from) ?? null;
}
