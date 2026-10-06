// Paints the whole world once: ground (incl. buildings) and a separate canopy
// layer that is drawn above entities so characters can walk "under" trees.
import { hash, vnoise } from '../core/rng';
import { BOARD, ELDER_HOUSE, GRANARY, HUTS, inCanyon, SALA, SCARECROW, INN, MH, MW, SMITH, T, Tile, tileAt, type Biome, type WorldMap } from '../core/mapgen';
import { signposts } from '../core/signs';
import { drawAnvil, drawBoard, drawSignpost, drawFountain, drawGranary, drawHouse, drawLamps, drawPot, drawSala, drawScarecrow, type StaticLight } from './buildings';
import { drawFieldHut, drawJetty, drawPaddy, drawPond } from './fields';
import { createBuffer, ell, rect, rgb, sp, toCanvas, type PixelBuffer } from './pixelBuffer';

interface GroundPalette {
  grass: readonly string[];
  dark: readonly string[];
  sand: readonly string[];
  water: readonly string[];
  /** line between grass and paths (default dark green) */
  edge?: string;
  /** ground specks: [floor dark, wall dark, highlight, highlight 2] (default grass tufts) */
  tuft?: readonly [string, string, string, string];
  /** water accents: [shallow edge, ripple glint, south-bank foam, south-bank shallow] (default sea-green) */
  waterAccent?: readonly [string, string, string, string];
}

/** Ground colours per biome; every area stays bright (no dark/night areas). */
const PALETTES: Record<Biome, GroundPalette> = {
  home: {
    grass: ['#5c9f39', '#6aae42', '#78bb4b', '#86c754'],
    dark: ['#3f7d2e', '#478933', '#509439'],
    sand: ['#dcb46e', '#e4c07c', '#ebcb89', '#f1d696'],
    water: ['#1f9a92', '#25a69c', '#2db2a6'],
  },
  bamboo: {
    grass: ['#7fb44a', '#8cc155', '#99cc60', '#a6d66c'],
    dark: ['#5a8f35', '#64993c', '#6ea344'],
    sand: ['#d8bc7a', '#e0c688', '#e8d096', '#efdaa4'],
    water: ['#1f9a92', '#25a69c', '#2db2a6'],
  },
  swamp: {
    grass: ['#4f8a4a', '#5a944f', '#649e55', '#6fa85c'],
    dark: ['#356e3a', '#3d7841', '#458248'],
    sand: ['#a89060', '#b39a6a', '#bda474', '#c8ae7e'],
    water: ['#2f8a72', '#36947a', '#3e9e82'],
  },
  limestone: {
    grass: ['#7f9f5a', '#8aa965', '#95b370', '#a0bd7a'],
    dark: ['#5f7f45', '#67884c', '#709153'],
    sand: ['#c9c4b4', '#d3cebf', '#ddd8ca', '#e6e2d5'],
    water: ['#2a9aa8', '#30a4b2', '#38aebc'],
  },
  savanna: {
    // sunny dry-season grassland: golden-green grass, pale earth paths, blue waterholes
    grass: ['#a8b85a', '#b4c262', '#c0cc6c', '#ccd678'],
    dark: ['#8a9e48', '#94a84e', '#9eb254'],
    sand: ['#d8b878', '#e0c288', '#e8cc96', '#f0d6a4'],
    water: ['#3a9aa0', '#42a6aa', '#4ab2b4'],
    edge: '#7a8a3a',
    tuft: ['#8a9a42', '#6e8034', '#e8e49a', '#f4eea8'],
  },
  peat: {
    // bright peat swamp forest: deep greens, dark peat soil paths, amber tea-coloured water
    grass: ['#4f8f42', '#5a9a48', '#64a44e', '#6eae56'],
    dark: ['#3a7232', '#427c38', '#4a863e'],
    sand: ['#8a6a46', '#957552', '#a0805e', '#ab8b6a'],
    water: ['#8a6634', '#96723c', '#a27e46'],
    // amber blackwater: warm shallows and glints instead of sea-green
    waterAccent: ['#b08a50', '#d0aa6a', '#f0dcb0', '#c8a468'],
  },
  mangrove: {
    // bright tidal coast: green banks, grey-brown mud flats, sea-green channels
    grass: ['#5f9a46', '#6aa64e', '#76b056', '#82ba60'],
    dark: ['#41783a', '#4a8240', '#538c46'],
    sand: ['#a89678', '#b3a284', '#bdad90', '#c8b99c'],
    water: ['#2a9a98', '#30a6a2', '#38b2ac'],
  },
  cave: {
    // bright limestone cave (no dark areas): cream floor, pale walls, clear blue pools
    grass: ['#cdc3a8', '#d6cdb3', '#ded6be', '#e6dfca'],
    dark: ['#a99e85', '#b4a990', '#beb49b'],
    sand: ['#ece3ca', '#f0e8d2', '#f4eddb', '#f8f2e4'],
    water: ['#2a9cb8', '#31a8c3', '#3ab4ce'],
    edge: '#8f846c',
    tuft: ['#b9ae93', '#958a71', '#f6f0de', '#fffaee'],
  },
  deepwild: {
    grass: ['#3f8a35', '#47933b', '#509c41', '#59a548'],
    dark: ['#2a6626', '#30702b', '#377a31'],
    sand: ['#cfa864', '#d8b472', '#e0bf80', '#e8ca8e'],
    water: ['#1f9a92', '#25a69c', '#2db2a6'],
  },
};

// the active palette, set by buildTerrain before painting
let GRASS = PALETTES.home.grass;
let GRASS_DARK = PALETTES.home.dark;
let SAND = PALETTES.home.sand;
let WATER = PALETTES.home.water;
let TUFT: readonly [string, string, string, string] = ['#4e8a2e', '#356a26', '#a8dc6a', '#9ad460'];
const CANYON = ['#d6a35e', '#dfb06c', '#e7bd7a', '#eec98a'];
const PLAZA_STONE = ['#cfc7ab', '#d8d0b6', '#e1dac2'];
let EDGE_LINE = '#3f7a2c';
const SEA_ACCENT = ['#3fc3b2', '#6ad8c6', '#e8fff8', '#8fe6d4'] as const;
let WATER_ACCENT: readonly [string, string, string, string] = SEA_ACCENT;

const isGrassTile = (t: number): boolean => t === Tile.GRASS || t === Tile.FLOWER || t === Tile.TREE || t === Tile.BUSH || t === Tile.WALL || t === Tile.FENCE || t === Tile.MESA;
const pick = (a: readonly string[], v: number): string => a[Math.max(0, Math.min(a.length - 1, Math.floor(v * a.length)))] ?? a[0] ?? '#ff00ff';

export interface TerrainArt {
  ground: HTMLCanvasElement;
  canopy: HTMLCanvasElement;
  lights: StaticLight[];
}

/** Ground, details, trees and signposts: everything except the village buildings. Paints the top `rows` rows. */
function paintBase(map: WorldMap, rows = MH): { mb: PixelBuffer; cb: PixelBuffer; lights: StaticLight[] } {
  const lights: StaticLight[] = [];
  const mb = createBuffer(MW * T, rows * T);
  const cb = createBuffer(MW * T, rows * T);
  const pal = PALETTES[map.biome];
  ({ grass: GRASS, dark: GRASS_DARK, sand: SAND, water: WATER } = pal);
  EDGE_LINE = pal.edge ?? '#3f7a2c';
  TUFT = pal.tuft ?? ['#4e8a2e', '#356a26', '#a8dc6a', '#9ad460'];
  WATER_ACCENT = pal.waterAccent ?? SEA_ACCENT;
  paintGround(map, mb);
  paintDetails(map, mb, lights);
  paintTrees(map, mb, cb);
  for (const sg of signposts(map)) drawSignpost(mb, sg.x, sg.y, sg.arms.map((a) => a.edge));
  return { mb, cb, lights };
}

export function buildTerrain(map: WorldMap): TerrainArt {
  const { mb, cb, lights } = paintBase(map);
  if (map.area !== 'home') return { ground: toCanvas(mb), canopy: toCanvas(cb), lights };
  drawHouse(mb, SMITH, 'smith');
  drawHouse(mb, INN, 'inn');
  drawHouse(mb, ELDER_HOUSE, 'elder');
  for (const h of HUTS) drawHouse(mb, h, 'hut');
  drawGranary(mb, GRANARY);
  drawBoard(mb, BOARD.x, BOARD.y);
  // east fields: soft-edged pond and paddy painted over the tile ground, then what stands on them
  drawPaddy(mb);
  drawPond(mb);
  drawJetty(mb);
  drawFieldHut(mb);
  drawScarecrow(mb, SCARECROW.x, SCARECROW.y);
  drawSala(mb, SALA);
  drawFountain(mb);
  drawAnvil(mb);
  drawPot(mb);
  drawLamps(mb, map, lights);
  lights.push({ x: SMITH.x * T + 16, y: (SMITH.y + 3) * T + 7, r: 18, c: '255,150,60', ga: 0.2 });
  return { ground: toCanvas(mb), canopy: toCanvas(cb), lights };
}

/** Rows of dense forest painted beyond the map's north and south edges (seen when the portrait camera overscrolls). */
export const EDGE_FILL_ROWS = 12;

/**
 * Paints the strip above the map: a copy of the map shifted down by EDGE_FILL_ROWS with solid
 * forest on top, so the edge row's tree crowns, shadows and grass borders join up seamlessly.
 * Columns that are open at the edge (north exit road, river) carry on up through the forest.
 * Only the top EDGE_FILL_ROWS rows are painted.
 */
export function buildNorthFill(map: WorldMap): { ground: HTMLCanvasElement; canopy: HTMLCanvasElement } {
  const r = EDGE_FILL_ROWS;
  const tiles = new Uint8Array(MW * MH);
  const riverX = new Int16Array(MH);
  for (let y = 0; y < MH; y++) {
    riverX[y] = map.riverX[Math.max(0, y - r)] ?? 0;
    for (let x = 0; x < MW; x++) {
      const edge = tileAt(map, x, 0);
      const open = edge !== Tile.TREE && edge !== Tile.WALL && edge !== Tile.BUSH && edge !== Tile.ROCK && edge !== Tile.MESA;
      tiles[y * MW + x] = y < r ? (open ? edge : Tile.TREE) : tileAt(map, x, y - r);
    }
  }
  const shifted: WorldMap = { ...map, exits: [], tiles, riverX, reach: new Uint8Array(MW * MH), bridgeEast: map.bridgeEast + r, bridgeNorth: map.bridgeNorth + r };
  const { mb, cb } = paintBase(shifted, r);
  return { ground: toCanvas(mb), canopy: toCanvas(cb) };
}

/**
 * Paints the strip below the map, EDGE_FILL_ROWS + 1 rows tall. Row 0 lines up with the map's
 * last row: it is painted without trees or rocks (the real row is drawn by the map itself) so
 * that only the crowns of the forest below poke up into it. Show the ground from row 1 and the
 * canopy from row 0. Columns open at the edge (south exit road, river) carry on down.
 */
export function buildSouthFill(map: WorldMap): { ground: HTMLCanvasElement; canopy: HTMLCanvasElement } {
  const r = EDGE_FILL_ROWS;
  const tiles = new Uint8Array(MW * MH);
  const blocking = (t: number): boolean => t === Tile.TREE || t === Tile.WALL || t === Tile.BUSH || t === Tile.ROCK || t === Tile.MESA;
  for (let x = 0; x < MW; x++) {
    const edge = tileAt(map, x, MH - 1);
    tiles[x] = blocking(edge) ? Tile.GRASS : edge;
    for (let y = 1; y < MH; y++) tiles[y * MW + x] = blocking(edge) ? Tile.TREE : edge;
  }
  const strip: WorldMap = { ...map, exits: [], tiles, riverX: new Int16Array(MH).fill(map.riverX[MH - 1] ?? -100), reach: new Uint8Array(MW * MH), bridgeEast: -10, bridgeNorth: -10 };
  const { mb, cb } = paintBase(strip, r + 1);
  return { ground: toCanvas(mb), canopy: toCanvas(cb) };
}

/** Height (px) of the grassy top band on a mesa's front tiles, above the cliff face. */
const MESA_TOP = 5;

/**
 * One pixel of a mesa tile, SNES style: a lighter grass top with a dark outline and a bright
 * rim lit from the top-left; on tiles whose south neighbour is low ground, a layered limestone
 * cliff face with a bright lip, strata lines and a dark foot.
 */
function mesaPixel(map: WorldMap, tx: number, ty: number, lx: number, ly: number, px: number, py: number, n: number): string {
  const isM = (x: number, y: number): boolean => tileAt(map, x, y) === Tile.MESA;
  const front = !isM(tx, ty + 1);
  const left = !isM(tx - 1, ty);
  const right = !isM(tx + 1, ty);
  const up = !isM(tx, ty - 1);
  const OUT = '#2c3a1e';
  const ground = pick(GRASS, n);
  // rounded outer corners (the cut-off pixels show the ground)
  const cornerTL = up && left && lx + ly < 3;
  const cornerTR = up && right && 15 - lx + ly < 3;
  const cornerBL = front && left && lx + (15 - ly) < 2;
  const cornerBR = front && right && 15 - lx + (15 - ly) < 2;
  if (cornerTL || cornerTR || cornerBL || cornerBR) return ground;
  if ((up && left && lx + ly === 3) || (up && right && 15 - lx + ly === 3)) return OUT;
  // cliff face on the front tiles
  if (front && ly >= MESA_TOP) {
    if (ly === 15) return '#3e3a2c';
    if ((left && lx === 0) || (right && lx === 15)) return '#3e3a2c';
    if (ly === MESA_TOP) return '#f0ead6'; // lip catching the light
    const band = (ly - MESA_TOP) % 4;
    const crack = (px + (hash(tx, Math.floor(ly / 4)) * 9) | 0) % 9 === 0;
    if (crack && ly < 14) return '#8a806a';
    const base = band === 0 ? '#9a8f76' : band === 1 ? '#d6ccb2' : band === 2 ? '#c4b99e' : '#b0a68c';
    // the left side of the face is lit, the right side in shade
    if (left && lx < 3) return '#e2d9c0';
    if (right && lx > 12) return '#8f846c';
    return ly > 12 ? '#9a8f76' : base;
  }
  // grassy top: lighter than the ground around it, so it reads as higher
  if (up && ly === 0) return OUT;
  if (left && lx === 0) return OUT;
  if (right && lx === 15) return OUT;
  if (front && ly === MESA_TOP - 1) return '#c8e890';
  if ((up && ly === 1) || (left && lx === 1)) return '#d4f09a';
  if (right && lx === 14) return pick(GRASS, n * 0.6);
  return lighten(pick(GRASS, 0.45 + n * 0.55), 1.13);
}

/** Brightens a #rrggbb colour (clamped). */
function lighten(hex: string, k: number): string {
  const [r, g, b] = rgb(hex);
  const c = (v: number): string => Math.min(255, Math.round(v * k)).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function sandNeighbours(map: WorldMap, tx: number, ty: number): number {
  let n = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (tileAt(map, tx + dx, ty + dy) === Tile.SAND) n++;
  return n;
}

function paintGround(map: WorldMap, mb: PixelBuffer): void {
  const d = mb.d;
  const isWater = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= MW || y >= MH) return true;
    const t = tileAt(map, x, y);
    return t === Tile.WATER || t === Tile.BRIDGE;
  };
  // 1-3px wobble so grass/path borders are organic rather than grid-straight
  const bump = (k: number, s: number, o: number): number => 1 + Math.floor(hash((k >> 1) + o * 53, s * 7919 + o) * 3);
  const isGrassAt = (x: number, y: number): boolean => isGrassTile(tileAt(map, x, y));

  for (let py = 0; py < mb.h; py++) {
    for (let px = 0; px < MW * T; px++) {
      const tx = px >> 4;
      const ty = py >> 4;
      const lx = px & 15;
      const ly = py & 15;
      const t = tileAt(map, tx, ty);
      const n = vnoise(px, py, 20) * 0.8 + hash(px, py) * 0.3 - 0.08;
      let c: string | null = null;
      if (t === Tile.MESA) {
        c = mesaPixel(map, tx, ty, lx, ly, px, py, n);
      } else if (t === Tile.WATER) {
        const up = !isWater(tx, ty - 1);
        const dn = !isWater(tx, ty + 1);
        const lf = !isWater(tx - 1, ty);
        const rt = !isWater(tx + 1, ty);
        if (up && (map.biome === 'swamp' || map.biome === 'mangrove' || map.biome === 'peat') && ly < 3) {
          // muddy bank instead of a cliff face
          c = ly === 0 ? EDGE_LINE : ly === 1 ? '#6a5a34' : '#4a6a4a';
        } else if (up && map.biome === 'cave' && ly < 3) {
          // smooth stone rim of a cave pool
          c = ly === 0 ? EDGE_LINE : ly === 1 ? '#b9ae93' : '#5fb4c8';
        } else if (up && map.biome !== 'swamp' && map.biome !== 'mangrove' && map.biome !== 'peat' && map.biome !== 'cave' && ly < 6) {
          // cliff face dropping into the water
          const above = tileAt(map, tx, ty - 1);
          c = ly === 0 ? (isGrassTile(above) ? EDGE_LINE : '#f3dca0') : ly === 5 ? '#5a3418' : (lx + (ly >> 1)) % 5 === 0 ? '#9a5a2a' : ly < 3 ? '#d4914a' : '#bf7a3a';
        } else if (lf && lx < 2) c = map.biome === 'cave' ? (lx === 0 ? EDGE_LINE : '#b9ae93') : lx === 0 ? '#7a4420' : '#bf7a3a';
        else if (rt && lx > 13) c = map.biome === 'cave' ? (lx === 15 ? EDGE_LINE : '#b9ae93') : lx === 15 ? '#7a4420' : '#bf7a3a';
        else if (dn && ly > 13) c = ly === 15 ? WATER_ACCENT[2] : WATER_ACCENT[3];
        else {
          let dd = 99;
          if (up) dd = Math.min(dd, ly - 6);
          if (lf) dd = Math.min(dd, lx - 2);
          if (rt) dd = Math.min(dd, 13 - lx);
          if (dn) dd = Math.min(dd, 13 - ly);
          if (dd < 3) c = WATER_ACCENT[0];
          else if (Math.sin(px * 0.35 + py * 0.9 + vnoise(px, py, 10) * 6) > 0.94) c = WATER_ACCENT[1];
          else c = pick(WATER, n * 0.9);
        }
      } else if (t === Tile.BRIDGE) {
        const top = isWater(tx, ty - 1) && tileAt(map, tx, ty - 1) !== Tile.BRIDGE;
        const bot = isWater(tx, ty + 1) && tileAt(map, tx, ty + 1) !== Tile.BRIDGE;
        if (top && ly < 3) c = ly === 0 ? '#3a1e0c' : lx % 8 === 0 ? '#5a2e14' : '#8a5530';
        else if (bot && ly > 12) c = ly === 15 ? '#3a1e0c' : lx % 8 === 0 ? '#5a2e14' : '#8a5530';
        else if (lx % 4 === 3) c = '#7a4420';
        else c = (tx * 4 + (lx >> 2)) % 2 ? '#d0924e' : '#c08242';
      } else if (t === Tile.PADDY || t === Tile.POND) {
        c = fieldPixel(map, t, tx, ty, lx, ly, px, py);
      } else if (t === Tile.SOIL) {
        c = '#8f5e34';
      } else {
        let pal: readonly string[] | null = GRASS;
        if (t === Tile.WALL) pal = GRASS_DARK;
        else if (t === Tile.ROCK && map.area !== 'home' && sandNeighbours(map, tx, ty) < 2) pal = GRASS; // boulder sitting on grass
        else if (t === Tile.SAND || t === Tile.ROCK || t === Tile.CLIFF) pal = inCanyon(map, tx, ty) ? CANYON : SAND;
        else if (t === Tile.STONE || t === Tile.FOUNTAIN) pal = null;
        if (pal === SAND || pal === CANYON || pal === null) {
          const sides: [boolean, number, number][] = [
            [isGrassAt(tx - 1, ty), lx, bump(py, 0, tx)],
            [isGrassAt(tx + 1, ty), 15 - lx, bump(py, 1, tx)],
            [isGrassAt(tx, ty - 1), ly, bump(px, 2, ty)],
            [isGrassAt(tx, ty + 1), 15 - ly, bump(px, 3, ty)],
          ];
          for (const [on, dist, bb] of sides) {
            if (!on) continue;
            if (dist < bb - 1) {
              c = pick(GRASS, n);
              break;
            }
            if (dist === bb - 1) {
              c = EDGE_LINE;
              break;
            }
            if (dist === bb && !c) c = pal ? '#c99a58' : '#a39a80';
          }
        }
        if (!c) {
          if (pal === null) {
            // offset stone slabs
            const X = px + ((py >> 3) % 2) * 4;
            const gx = X % 8;
            const gy = py % 8;
            c = gx === 0 || gy === 0 ? '#a39a80' : gx === 1 || gy === 1 ? '#ebe5d0' : gx === 7 || gy === 7 ? '#bdb498' : pick(PLAZA_STONE, hash(X >> 3, py >> 3));
          } else c = pick(pal, n);
        }
      }
      let [r, g, b] = rgb(c);
      // a mesa casts a short shadow onto the ground just below its cliff
      if (t !== Tile.MESA && ly < 5 && tileAt(map, tx, ty - 1) === Tile.MESA) {
        const k = ly < 2 ? 0.66 : ly < 4 ? 0.78 : 0.9;
        r *= k;
        g *= k;
        b *= k;
      }
      const i = (py * mb.w + px) * 4;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  }
}

function paintDetails(map: WorldMap, mb: PixelBuffer, lights: StaticLight[]): void {
  for (let ty = 0; ty < mb.h / T; ty++) {
    for (let tx = 0; tx < MW; tx++) {
      const t = tileAt(map, tx, ty);
      const X = tx * T;
      const Y = ty * T;
      const h = hash(tx, ty);
      const h2 = hash(tx + 99, ty + 7);
      if (t === Tile.GRASS || t === Tile.WALL) {
        for (let i = 0; i < (t === Tile.WALL ? 3 : 2); i++) {
          const x = X + 1 + Math.floor(hash(tx * 7 + i, ty * 3) * 12);
          const y = Y + 2 + Math.floor(hash(tx * 5, ty * 11 + i) * 12);
          const dk = t === Tile.WALL ? TUFT[1] : TUFT[0];
          sp(mb, x, y, dk);
          sp(mb, x + 2, y, dk);
          sp(mb, x + 1, y + 1, dk);
        }
        if (t === Tile.GRASS && h2 < 0.5) {
          sp(mb, X + Math.floor(h * 15), Y + (Math.floor(h2 * 30) % 16), TUFT[2]);
          sp(mb, X + Math.floor(h2 * 15), Y + Math.floor(h * 16), TUFT[3]);
        }
        // cave: sunlight falling through holes in the roof (additive glow, never darkens the screen)
        if (t === Tile.GRASS && map.biome === 'cave' && hash(tx * 13 + 5, ty * 7 + 3) > 0.985 && map.reach[ty * MW + tx]) {
          ell(mb, X + 8, Y + 9, 9, 5, '#fff8e4', 0.55);
          ell(mb, X + 8, Y + 9, 5, 2.6, '#ffffff', 0.5);
          lights.push({ x: X + 8, y: Y + 6, r: 30, c: '255,246,214', ga: 0.2 });
        }
      }
      if (t === Tile.WATER && map.biome === 'swamp' && h < 0.35) {
        // lotus pads, some with a pink flower
        const x = X + 3 + Math.floor(h2 * 8);
        const y = Y + 4 + Math.floor(hash(tx * 9, ty) * 7);
        ell(mb, x, y, 3, 2, '#4f9a44');
        ell(mb, x - 1, y - 0.5, 1.6, 1, '#7cc25a');
        sp(mb, x + 2, y, '#2f6e36');
        if (h < 0.12) {
          sp(mb, x, y - 2, '#f2a0c0');
          sp(mb, x - 1, y - 1, '#f2a0c0');
          sp(mb, x + 1, y - 1, '#f2a0c0');
          sp(mb, x, y - 1, '#ffe0ec');
        }
      }
      if (t === Tile.FLOWER) {
        const fc = ['#ff8fb0', '#ffffff', '#ffd84a', '#b98ae6', '#ff7a5a'];
        for (let i = 0; i < 7; i++) {
          const x = X + 2 + Math.floor(hash(tx * 3 + i, ty) * 12);
          const y = Y + 2 + Math.floor(hash(tx, ty * 3 + i) * 12);
          const c = fc[Math.floor(hash(tx + i, ty + 2) * fc.length)] ?? '#ffffff';
          sp(mb, x, y + 2, EDGE_LINE);
          sp(mb, x - 1, y, c);
          sp(mb, x + 1, y, c);
          sp(mb, x, y - 1, c);
          sp(mb, x, y + 1, c);
          sp(mb, x, y, '#ffd84a');
        }
      }
      if (t === Tile.SAND) {
        for (let i = 0; i < 2; i++) {
          const x = X + 2 + Math.floor(hash(tx * 3 + i, ty) * 12);
          const y = Y + 2 + Math.floor(hash(tx, ty * 3 + i) * 12);
          sp(mb, x, y, '#c99a58');
          sp(mb, x + 1, y, '#f6e2ae');
        }
        if (inCanyon(map, tx, ty)) {
          if (h < 0.08) {
            const x = X + 4;
            const y = Y + 10;
            sp(mb, x, y, '#b8903c');
            sp(mb, x + 1, y - 1, '#c9a050');
            sp(mb, x + 2, y, '#b8903c');
            sp(mb, x + 3, y - 1, '#c9a050');
          }
          // glowing lava cracks
          if (h2 > 0.975 && map.reach[ty * MW + tx] && !(ty >= map.bridgeEast - 1 && ty <= map.bridgeEast + 2)) {
            const cx = X + 8;
            const cy = Y + 8;
            ell(mb, cx, cy, 5, 3, '#7a3418');
            ell(mb, cx, cy, 3.6, 2, '#e05a1e');
            ell(mb, cx, cy, 2, 1, '#ffd35c');
            lights.push({ x: cx, y: cy, r: 14, c: '255,120,40', ga: 0.16 });
          }
        }
      }
      if (t === Tile.BUSH && map.biome === 'savanna') {
        ell(mb, X + 8, Y + 14, 7, 2, '#000000', 0.18);
        for (let i = 0; i < 9; i++) {
          const bx = X + 2 + Math.floor(hash(tx * 5 + i, ty) * 12);
          const hgt = 7 + Math.floor(hash(tx, ty * 7 + i) * 7);
          const lean = hash(tx + i, ty * 3) < 0.5 ? -1 : 1;
          for (let k = 0; k < hgt; k++) {
            const x = bx + Math.round((k / hgt) * lean * 2);
            sp(mb, x, Y + 14 - k, k > hgt - 3 ? '#f4e6a0' : k % 3 === 0 ? '#9aa848' : '#c8c46a');
          }
        }
        continue;
      }
      if (t === Tile.ROCK && map.biome === 'savanna') {
        // termite mound: a tall lumpy earth cone
        ell(mb, X + 9, Y + 14, 7, 2.2, '#000000', 0.22);
        for (let y = 0; y < 14; y++) {
          const half = 2 + (y / 13) * 4.6 + (hash(tx, y) - 0.5);
          for (let dx = Math.floor(-half); dx <= Math.ceil(half); dx++) {
            const edge = Math.abs(dx) >= half - 0.6;
            sp(mb, X + 8 + dx, Y + 1 + y, edge ? '#6a4628' : dx < -half * 0.3 ? '#d8a868' : dx < half * 0.3 ? '#b8854a' : '#9a6a3a');
          }
        }
        continue;
      }
      if (t === Tile.BUSH) {
        ell(mb, X + 9, Y + 14, 7.5, 2.2, '#000000', 0.22);
        const pal = ['#24572e', '#347a3a', '#4f9a44', '#7cc25a'];
        const fl = h < 0.6 ? (['#f28ab0', '#e8504a', '#b48ae6', '#ffffff'][Math.floor(h2 * 4)] ?? null) : null;
        for (let y = Y; y < Y + 16; y++) {
          for (let x = X; x < X + 16; x++) {
            const dx = (x + 0.5 - X - 8) / 7.4;
            const dy = (y + 0.5 - Y - 8.5) / 6.6;
            const q = dx * dx + dy * dy;
            if (q > 1) continue;
            const l = -(dx * 0.55 + dy * 0.85) + (hash(x, y) - 0.5) * 0.45;
            sp(mb, x, y, q > 0.8 ? '#173823' : ((l > 0.6 ? pal[3] : l > 0.1 ? pal[2] : l > -0.4 ? pal[1] : pal[0]) ?? '#347a3a'));
            if (fl && q < 0.7 && dy < 0.3 && hash(x * 5, y * 3) < 0.16) sp(mb, x, y, fl);
          }
        }
      }
      if (t === Tile.ROCK) {
        const can = inCanyon(map, tx, ty);
        const cave = map.biome === 'cave';
        const P = can
          ? ['#7a2e18', '#a8462a', '#cc6a3c', '#ec9a62', '#4a1a0e']
          : cave
            ? ['#8a8068', '#a89e84', '#c8bfa6', '#ece6d4', '#4a4436']
            : ['#4c4e58', '#6c6e78', '#8d9098', '#b8bbc2', '#24252b'];
        ell(mb, X + 9, Y + 13.5, 7, 2.3, '#000000', 0.25);
        const rx = 6 + h;
        const ry = 5;
        for (let y = Y; y < Y + 16; y++) {
          for (let x = X; x < X + 16; x++) {
            const dx = (x + 0.5 - X - 8) / rx;
            const dy = (y + 0.5 - Y - 9) / ry;
            const q = dx * dx + dy * dy;
            if (q > 1) continue;
            const l = -(dx * 0.6 + dy * 0.8) + (hash(x, y) - 0.5) * 0.3;
            let c = (q > 0.78 ? P[4] : l > 0.55 ? P[3] : l > 0.05 ? P[2] : l > -0.45 ? P[1] : P[0]) ?? '#6c6e78';
            if (!can && !cave && dy < -0.35 && q <= 0.78 && hash(x, y + 5) < 0.45) c = '#78b35c';
            sp(mb, x, y, c);
          }
        }
      }
      if (t === Tile.CLIFF) {
        for (let y = 0; y < 16; y++) {
          for (let x = 0; x < 16; x++) {
            let c: string;
            if (y < 3) c = pick(GRASS_DARK, hash(X + x, Y + y));
            else if (y === 3) c = '#2c5a22';
            else if (y < 13) c = y % 3 === 0 ? '#a5622e' : (x + Math.floor(hash(tx, y) * 4)) % 6 === 0 ? '#b06a34' : y < 6 ? '#e3a060' : '#c97f42';
            else c = y === 13 ? '#5a3418' : '#b8894e';
            sp(mb, X + x, Y + y, c);
          }
        }
      }
      if (t === Tile.SOIL) {
        rect(mb, X, Y, 16, 16, '#6a4226');
        rect(mb, X + 1, Y + 1, 14, 14, '#8f5e34');
        for (let r = 3; r <= 11; r += 4) {
          rect(mb, X + 2, Y + r, 12, 1, '#6f4626');
          rect(mb, X + 2, Y + r + 1, 12, 1, '#ad7a4c');
        }
      }
      if (t === Tile.FENCE) {
        const H = tileAt(map, tx - 1, ty) === Tile.FENCE || tileAt(map, tx + 1, ty) === Tile.FENCE;
        const V = tileAt(map, tx, ty - 1) === Tile.FENCE || tileAt(map, tx, ty + 1) === Tile.FENCE;
        if (H) {
          rect(mb, X, Y + 6, 16, 2, '#d8a060');
          rect(mb, X, Y + 8, 16, 1, '#7a4a24');
          rect(mb, X, Y + 11, 16, 2, '#d8a060');
          rect(mb, X, Y + 13, 16, 1, '#7a4a24');
        }
        if (V) {
          rect(mb, X + 6, Y, 2, 16, '#d8a060');
          rect(mb, X + 8, Y, 1, 16, '#7a4a24');
        }
        ell(mb, X + 8, Y + 15, 4, 1.2, '#000000', 0.2);
        rect(mb, X + 6, Y + 3, 4, 12, '#a86a34');
        rect(mb, X + 6, Y + 3, 4, 2, '#e8b070');
        rect(mb, X + 9, Y + 5, 1, 10, '#7a4a24');
      }
    }
  }
}

/** Trunks go on the ground layer; the big round canopy goes on the overlay layer. */
function paintTrees(map: WorldMap, mb: PixelBuffer, cb: PixelBuffer): void {
  // crowns reach ~18px above their tile, so a short buffer also needs the row just below it
  const lastRow = Math.min(MH - 1, mb.h / T + 1);
  for (let ty = 0; ty <= lastRow; ty++) {
    for (let tx = 0; tx < MW; tx++) {
      const t = tileAt(map, tx, ty);
      const isTree = t === Tile.TREE || (t === Tile.WALL && (tx + ty) % 2 === 0 && hash(tx, ty) < 0.8);
      if (!isTree) continue;
      if (map.biome === 'bamboo') {
        paintBamboo(mb, cb, tx, ty);
        continue;
      }
      if (map.biome === 'cave') {
        paintStalagmites(mb, cb, tx, ty);
        continue;
      }
      const cx = tx * 16 + 8;
      const cy = ty * 16 - 3;
      const v = hash(tx * 3, ty * 5);
      // mostly green, some mint and a few autumn-orange trees
      const mangrove = map.biome === 'mangrove';
      const peat = map.biome === 'peat';
      const savanna = map.biome === 'savanna';
      const pal = mangrove
        ? v < 0.35 ? ['#1f5a3a', '#2c7a4a', '#46985a', '#74c07a'] : ['#24572e', '#327a3c', '#4c9646', '#78be5c']
        : savanna
          ? ['#3e5a24', '#566e2e', '#728a3a', '#98ac50']
          : peat
          ? v < 0.12 ? ['#6a2a24', '#9a3e30', '#c8604a', '#e88a6a'] : ['#1f5230', '#2c6e3a', '#468c44', '#6eb05a']
          : v < 0.06 ? ['#8a3a1c', '#c0582a', '#e08040', '#f4b060'] : v < 0.3 ? ['#2a6a4a', '#3c8a5a', '#58ac6a', '#8ad48a'] : ['#24572e', '#347a3a', '#4f9a44', '#7cc25a'];
      ell(mb, cx + 3, ty * 16 + 14, 10, 3.2, '#000000', 0.22);
      if (mangrove || peat) {
        // stilt roots (mangrove) or knee roots (peat swamp) arching out of the mud beside the trunk
        for (const side of [-1, 1] as const) {
          for (let k = 0; k < (peat ? 1 : 2); k++) {
            const reach = 4 + k * 2;
            for (let i = 0; i <= reach; i++) {
              const x = cx + side * (1 + i);
              const y = ty * 16 + 9 + k * 2 + Math.round((i / reach) ** 2 * (5 - k * 2));
              sp(mb, x, y, '#5a3a22');
              sp(mb, x, y - 1, '#a8703c');
            }
          }
        }
      }
      for (let y = ty * 16 + 6; y < ty * 16 + 16; y++) {
        sp(mb, cx - 2, y, '#7a3e1c');
        sp(mb, cx - 1, y, '#d0803e');
        sp(mb, cx, y, '#a85a26');
        sp(mb, cx + 1, y, '#7a3e1c');
      }
      sp(mb, cx - 3, ty * 16 + 15, '#a85a26');
      sp(mb, cx - 4, ty * 16 + 15, '#7a3e1c');
      sp(mb, cx + 2, ty * 16 + 15, '#a85a26');
      sp(mb, cx + 3, ty * 16 + 15, '#7a3e1c');
      const jit = v - 0.5;
      const blobs = ([[-7, 3, 7], [7, 3, 7], [0, -5, 8.4], [-3, 7, 6.4], [4, 7, 6.2]] as const).map(
        (bl, i) => [bl[0] + (hash(tx + i, ty) - 0.5) * 2, bl[1], bl[2] + jit] as const,
      );
      const inside = (dx: number, dy: number): number => {
        let best = -9;
        let bi = -1;
        blobs.forEach(([bx, by, r], i) => {
          const q = 1 - ((dx - bx) ** 2 + (dy - by) ** 2) / (r * r);
          if (q >= 0 && q > best) {
            best = q;
            bi = i;
          }
        });
        return bi;
      };
      for (let dy = -15; dy <= 15; dy++) {
        for (let dx = -16; dx <= 16; dx++) {
          const bi = inside(dx + 0.5, dy + 0.5);
          if (bi < 0) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (inside(dx - 0.5, dy + 0.5) < 0 || inside(dx + 1.5, dy + 0.5) < 0 || inside(dx + 0.5, dy - 0.5) < 0 || inside(dx + 0.5, dy + 1.5) < 0) {
            sp(cb, x, y, '#173823');
            continue;
          }
          const [bx, by, r] = blobs[bi] ?? [0, 0, 1];
          const nx = (dx + 0.5 - bx) / r;
          const ny = (dy + 0.5 - by) / r;
          const l = -(nx * 0.55 + ny * 0.85) + (hash(x, y) - 0.5) * 0.4;
          sp(cb, x, y, (l > 0.6 ? pal[3] : l > 0.12 ? pal[2] : l > -0.38 ? pal[1] : pal[0]) ?? '#347a3a');
        }
      }
    }
  }
}

/** One to three limestone stalagmites: the base on the ground layer, the tall tips on the canopy. */
function paintStalagmites(mb: PixelBuffer, cb: PixelBuffer, tx: number, ty: number): void {
  const X = tx * 16;
  const base = ty * 16 + 14;
  ell(mb, X + 9, base, 8, 2.6, '#000000', 0.2);
  const n = 1 + Math.floor(hash(tx * 7, ty * 3) * 3);
  for (let i = 0; i < n; i++) {
    const cx = X + 4 + Math.floor(hash(tx * 3 + i, ty * 2) * 9);
    const h = 14 + Math.floor(hash(tx, ty * 5 + i) * 14) - i * 3;
    const w = 3.5 + hash(tx + i, ty + 9) * 2.5;
    const by = base - (i === 0 ? 0 : 1);
    for (let k = 0; k <= h; k++) {
      const y = by - k;
      const half = Math.max(0.6, w * (1 - k / h) ** 0.8);
      const layer = k < 6 ? mb : cb;
      for (let dx = Math.floor(-half); dx <= Math.ceil(half); dx++) {
        const edge = Math.abs(dx) >= half - 0.5;
        const ring = (k + Math.floor(hash(tx + i, k) * 2)) % 5 === 0;
        // lit from the upper left: cream highlight, pale stone, warm shade, dark outline
        let c = dx < -half * 0.35 ? '#fbf6e8' : dx < half * 0.3 ? '#ddd3ba' : '#b3a68a';
        if (ring && !edge) c = dx < 0 ? '#e9e0c8' : '#a3967a';
        sp(layer, cx + dx, y, edge ? '#5a5240' : c);
      }
    }
    sp(cb, cx, by - h - 1, '#5a5240');
  }
}

/** A clump of bamboo: stalk bases on the ground layer, tall stalks and leaves on the canopy. */
function paintBamboo(mb: PixelBuffer, cb: PixelBuffer, tx: number, ty: number): void {
  const X = tx * 16;
  const base = ty * 16 + 15;
  ell(mb, X + 9, base - 1, 8, 2.6, '#000000', 0.2);
  const n = 2 + Math.floor(hash(tx, ty) * 2);
  for (let i = 0; i < n; i++) {
    const x = X + 2 + Math.floor(hash(tx * 3 + i, ty) * 12);
    const h = 24 + Math.floor(hash(tx, ty * 5 + i) * 12);
    const lean = hash(tx + i, ty + 3) < 0.5 ? -1 : 1;
    for (let k = 0; k < h; k++) {
      const y = base - k;
      const xx = x + Math.round((k / h) * lean * 2);
      const layer = k < 8 ? mb : cb;
      const node = k % 6 === 5;
      // lit from the left: light, mid, shade, then a soft dark-green edge
      sp(layer, xx - 1, y, '#2f5a24');
      sp(layer, xx, y, node ? '#5a9a34' : '#c4e88a');
      sp(layer, xx + 1, y, node ? '#4a8a2c' : '#94cc5a');
      sp(layer, xx + 2, y, node ? '#3f7a2c' : '#6aa83a');
      sp(layer, xx + 3, y, '#2f5a24');
      // leaf sprays near the top
      if (k > h * 0.55 && k % 5 === 2) {
        const dir = (k + i) % 2 ? 1 : -1;
        for (let j = 1; j <= 4; j++) {
          const lx = dir > 0 ? xx + 3 + j : xx - 1 - j;
          sp(cb, lx, y - Math.floor(j / 2), j < 3 ? '#7cc25a' : '#a6d66c');
          sp(cb, lx, y - Math.floor(j / 2) + 1, '#4f9a44');
        }
      }
    }
  }
}

/**
 * Paddy: shallow muddy water with a raised earth bund where it meets dry ground.
 * Pond: deeper water inside a stone rim, with a few lily pads on the empty tiles.
 */
function fieldPixel(map: WorldMap, t: number, tx: number, ty: number, lx: number, ly: number, px: number, py: number): string {
  const same = (dx: number, dy: number): boolean => tileAt(map, tx + dx, ty + dy) === t;
  const edge = Math.min(same(-1, 0) ? 99 : lx, same(1, 0) ? 99 : 15 - lx, same(0, -1) ? 99 : ly, same(0, 1) ? 99 : 15 - ly);
  if (t === Tile.PADDY) {
    if (edge === 0) return '#5a4a28';
    if (edge === 1) return ly < 8 && !same(0, -1) ? '#a88a54' : '#8a6e40';
    // furrows between the tiles so the field reads as separate plots
    if ((same(1, 0) && lx === 15) || (same(0, 1) && ly === 15)) return '#6e8a52';
    if (Math.sin(px * 0.5 + py * 1.1 + vnoise(px, py, 8) * 5) > 0.92) return '#b8dcc0';
    return pick(['#5e8a6a', '#668f6c', '#6f9870'], vnoise(px, py, 6) * 0.9 + hash(px, py) * 0.2);
  }
  if (edge === 0) return '#7d7562';
  if (edge === 1) return ly < 8 && !same(0, -1) ? '#e1dac2' : '#bdb498';
  if (edge === 2) return '#3fc3b2';
  if (Math.sin(px * 0.35 + py * 0.9 + vnoise(px, py, 10) * 6) > 0.94) return '#6ad8c6';
  return pick(['#1a8a84', '#1f9a92', '#25a69c'], vnoise(px, py, 12) * 0.9);
}
