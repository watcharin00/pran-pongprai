// The world is a set of areas (all MW×MH tiles) joined by exits at the map edges.
// The home area is the painted village (collision traced in homeLayout.ts); every other
// area is generated from its own seed. Pure and deterministic: no Math.random.
import type { AreaId, ZoneId } from '../data/types';
import { TUNING } from '../data';
import { floodReach, HOME_CANYON, inCanyon, inVillageTile, MH, MW, PLAZA, T, Tile, VILLAGE, type AreaExit, type Biome, type Camp, type Edge, type WorldMap } from './mapgen';
import { HOME_ROWS } from './homeLayout';
import { parkMiller, vnoise } from './rng';
import { exitSignTile } from './signs';
import { openTrails } from './trails';

export const AREA_IDS: readonly AreaId[] = ['home', 'bamboo', 'swamp', 'limestone', 'deepwild', 'cave', 'mangrove', 'peat', 'savanna'];

interface AreaSpec {
  seed: number;
  biome: Biome;
  zone: ZoneId;
  /** exits: edge, first tile along that edge, width in tiles, destination. The first one leads back toward the village. */
  exits: readonly { edge: Edge; at: number; width: number; to: AreaId }[];
  /** a hunter camp beside the road in from the village (rolled out one area at a time) */
  camp?: true;
}

/** Layout of the world (see CLAUDE.md "โลก"). */
const SPECS: Record<Exclude<AreaId, 'home'>, AreaSpec> = {
  bamboo: { seed: 7101, biome: 'bamboo', zone: 'bamboo', camp: true, exits: [{ edge: 's', at: 30, width: 3, to: 'home' }, { edge: 'n', at: 30, width: 3, to: 'deepwild' }] },
  deepwild: { seed: 7404, biome: 'deepwild', zone: 'deepwild', camp: true, exits: [{ edge: 's', at: 30, width: 3, to: 'bamboo' }, { edge: 'w', at: 22, width: 3, to: 'peat' }] },
  peat: { seed: 7707, biome: 'peat', zone: 'peat', camp: true, exits: [{ edge: 'e', at: 22, width: 3, to: 'deepwild' }] },
  swamp: { seed: 7202, biome: 'swamp', zone: 'swamp', camp: true, exits: [{ edge: 'n', at: 30, width: 3, to: 'home' }, { edge: 's', at: 30, width: 3, to: 'mangrove' }] },
  mangrove: { seed: 7606, biome: 'mangrove', zone: 'mangrove', camp: true, exits: [{ edge: 'n', at: 30, width: 3, to: 'swamp' }] },
  limestone: { seed: 7303, biome: 'limestone', zone: 'limestone', camp: true, exits: [{ edge: 'w', at: 22, width: 3, to: 'home' }, { edge: 'n', at: 30, width: 3, to: 'cave' }, { edge: 'e', at: 22, width: 3, to: 'savanna' }] },
  savanna: { seed: 7808, biome: 'savanna', zone: 'savanna', camp: true, exits: [{ edge: 'w', at: 22, width: 3, to: 'limestone' }] },
  cave: { seed: 7505, biome: 'cave', zone: 'cave', camp: true, exits: [{ edge: 's', at: 30, width: 3, to: 'limestone' }] },
};

/** Home exits follow the painted roads: north road, the south-west road and the south-east road past the canyon. */
const HOME_EXITS: readonly { edge: Edge; at: number; width: number; to: AreaId }[] = [
  { edge: 'n', at: 31, width: 2, to: 'bamboo' },
  { edge: 's', at: 1, width: 4, to: 'swamp' },
  { edge: 's', at: 55, width: 2, to: 'limestone' },
];

const HOME_CHARS: Record<string, number> = {
  '.': Tile.GRASS,
  ':': Tile.SAND,
  '#': Tile.STONE,
  T: Tile.TREE,
  B: Tile.BUSH,
  R: Tile.ROCK,
  W: Tile.WATER,
  '=': Tile.BRIDGE,
  H: Tile.HOUSE,
  F: Tile.FENCE,
  S: Tile.SOIL,
  P: Tile.PADDY,
  O: Tile.POND,
  U: Tile.FOUNTAIN,
};

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

/** The home map: the painted village, its collision traced in homeLayout.ts. */
function homeArea(): WorldMap {
  const tiles = new Uint8Array(MW * MH);
  HOME_ROWS.forEach((row, y) => {
    for (let x = 0; x < MW; x++) tiles[y * MW + x] = HOME_CHARS[row[x] ?? 'T'] ?? Tile.TREE;
  });
  // river column per row: the west bank of the main river (east of the waterfall stream)
  const riverX = new Int16Array(MH);
  let last = 44;
  for (let y = 0; y < MH; y++) {
    let x = 34;
    while (x < MW && tiles[y * MW + x] !== Tile.WATER && tiles[y * MW + x] !== Tile.BRIDGE) x++;
    if (x < MW) last = x + 1;
    riverX[y] = last;
  }
  const canyon = HOME_CANYON;
  const partial = { area: 'home' as const, tiles, riverX, canyon };
  const reach = floodReach(partial, PLAZA.x, PLAZA.y + 2);
  const map: WorldMap = { ...partial, zone: 'forest', biome: 'home', exits: HOME_EXITS.map(toExit), reach, bridgeEast: 23, bridgeNorth: 5, forestCells: [], canyonCells: [] };
  // monsters spawn 3+ tiles outside the village, on reachable open ground
  const nearVillage = (x: number, y: number): boolean => x >= VILLAGE.x0 - 3 && x <= VILLAGE.x1 + 3 && y >= VILLAGE.y0 - 3 && y <= VILLAGE.y1 + 3;
  const forestCells: [number, number][] = [];
  const canyonCells: [number, number][] = [];
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      if (!reach[y * MW + x] || nearVillage(x, y) || inVillageTile(x, y)) continue;
      const t = tiles[y * MW + x];
      const nearExit = map.exits.some((e) => Math.hypot(e.arrive.x / T - x, e.arrive.y / T - y) < 4);
      if (inCanyon(map, x, y)) {
        if (t === Tile.SAND || t === Tile.GRASS) canyonCells.push([x, y]);
      } else if ((t === Tile.GRASS || t === Tile.FLOWER) && !nearExit) forestCells.push([x, y]);
    }
  }
  return { ...map, forestCells, canyonCells };
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
        case 'savanna':
          // open golden grassland: waterholes, tall-grass clumps, termite mounds, a few lone trees
          if (n > 0.72) set(x, y, Tile.WATER);
          else if (r < 0.05) set(x, y, Tile.TREE);
          else if (r < 0.065) set(x, y, Tile.ROCK);
          else if (r > 0.9 && n < 0.6) set(x, y, Tile.BUSH);
          break;
        case 'peat':
          // tea-coloured blackwater pools under a dense, tall swamp forest
          if (n > 0.7) set(x, y, Tile.WATER);
          else if (n > 0.58) set(x, y, r < 0.22 ? Tile.TREE : Tile.GRASS);
          else if (r < 0.26) set(x, y, Tile.TREE);
          else if (r > 0.95) set(x, y, Tile.BUSH);
          break;
        case 'mangrove':
          // tidal channels, mud flats along them, mangroves crowding the banks
          if (n > 0.67) set(x, y, Tile.WATER);
          else if (n > 0.57) set(x, y, r < 0.3 ? Tile.TREE : Tile.SAND);
          else if (r < 0.22) set(x, y, Tile.TREE);
          else if (r > 0.95) set(x, y, Tile.BUSH);
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
  // (in the peat swamp the trails also run as earth causeways across the blackwater pools)
  const clearable = new Set<number>([Tile.TREE, Tile.BUSH, Tile.ROCK]);
  if (spec.biome === 'peat') clearable.add(Tile.WATER);
  openTrails(tiles, spec.seed, { clearable });

  // roads: every exit to the centre, wide enough to walk without snagging
  const centre: [number, number] = [31, 23];
  spec.exits.forEach((e, i) => {
    const [ex, ey] = exitTiles(e, 1)[0] ?? centre;
    carvePath(tiles, [ex, ey], centre, Math.max(2, e.width - 1), i % 2 === 0 ? e.edge === 'e' || e.edge === 'w' : !(e.edge === 'e' || e.edge === 'w'));
    for (const [x, y] of exitTiles(e, 4)) set(x, y, Tile.SAND);
  });
  const camp = spec.camp ? stampCamp(tiles, spec.exits[0]) : undefined;
  // every exit road gets a signpost: if water or trees fill both roadsides, clear one spot for it
  for (const e of spec.exits) {
    if (exitSignTile({ tiles }, e)) continue;
    const side = e.at + e.width;
    if (e.edge === 'n') set(side, 7, Tile.GRASS);
    else if (e.edge === 's') set(side, MH - 8, Tile.GRASS);
    else if (e.edge === 'w') set(7, side, Tile.GRASS);
    else set(MW - 8, side, Tile.GRASS);
  }
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
      if (camp && Math.hypot(camp.x / T - x, camp.y / T - y) < 9) continue;
      forestCells.push([x, y]);
    }
  }
  return { ...partial, reach, forestCells, area: id, zone: spec.zone, biome: spec.biome, exits, ...(camp ? { camp } : {}) };
}

/**
 * Clears a hunter camp beside the road that comes in from `e`: a 7×5 clearing a few tiles off the
 * road with a path to it, a 2×2 tent on the far side and a campfire (one rock tile) near the road.
 */
function stampCamp(tiles: Uint8Array, e: { edge: Edge; at: number; width: number } | undefined): Camp | undefined {
  if (!e) return undefined;
  const C = TUNING.camp;
  const get = (x: number, y: number): number => tiles[y * MW + x] ?? Tile.WALL;
  const set = (x: number, y: number, t: number): void => {
    if (x >= 3 && y >= 3 && x < MW - 3 && y < MH - 3) tiles[y * MW + x] = t;
  };
  const vertical = e.edge === 'n' || e.edge === 's';
  const road = e.at + Math.floor(e.width / 2);
  const depth = e.edge === 'n' || e.edge === 'w' ? C.inset : (vertical ? MH : MW) - 1 - C.inset;
  // side axis points away from the road; `a` runs along it
  const at = (side: number, along: number): [number, number] => (vertical ? [road + side, depth + along] : [depth + along, road + side]);
  const blocked = (dir: number): number => {
    let n = 0;
    for (let i = C.side - 3; i <= C.side + 3; i++) for (let j = -2; j <= 2; j++) {
      const [x, y] = at(dir * i, j);
      if (x < 3 || y < 3 || x >= MW - 3 || y >= MH - 3) n += 10;
      else if (get(x, y) === Tile.WATER || get(x, y) === Tile.CLIFF) n++;
    }
    return n;
  };
  const dir = blocked(1) <= blocked(-1) ? 1 : -1;
  for (let i = C.side - 3; i <= C.side + 3; i++) for (let j = -2; j <= 2; j++) set(...at(dir * i, j), Tile.GRASS);
  // a two-tile path from the road
  for (let i = 1; i < C.side - 3; i++) for (const j of [0, 1]) {
    const [x, y] = at(dir * i, j);
    if (get(x, y) !== Tile.SAND) set(x, y, Tile.GRASS);
  }
  const tentCells = [1, 2].flatMap((i) => [-1, 0].map((j) => at(dir * (C.side + i), j)));
  for (const [x, y] of tentCells) set(x, y, Tile.HOUSE);
  const [fx, fy] = at(dir * (C.side - 1), 0);
  set(fx, fy, Tile.ROCK);
  const [cx, cy] = at(dir * C.side, 0);
  const [rx, ry] = at(dir * (C.side - 1), 1);
  const xs = tentCells.map(([x]) => x);
  const ys = tentCells.map(([, y]) => y);
  return {
    x: cx * T + 8,
    y: cy * T + 8,
    fire: { x: fx * T + 8, y: fy * T + 8 },
    tent: { x: Math.min(...xs), y: Math.min(...ys), w: 2, h: 2 },
    rest: { x: rx * T + 8, y: ry * T + 8 },
  };
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
