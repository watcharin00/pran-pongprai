// Village structures painted straight into the ground buffer.
import { hash } from '../core/rng';
import { ANVIL, LAMPS, MW, PLAZA, POT, QUARTER_LAMPS, T, Tile, type Rect, type WorldMap } from '../core/mapgen';
import { ell, line, rect, sp, type PixelBuffer } from './pixelBuffer';

export interface StaticLight {
  x: number;
  y: number;
  r: number;
  /** "r,g,b" */
  c: string;
  ga: number;
}

export type HouseKind = 'smith' | 'inn' | 'elder' | 'hut';

interface HouseLook {
  /** roof: outline, ridge highlight, ridge shadow, ridge, tile line, tile seam, tile highlight, tile, patch, eave, shaded side, shaded highlight */
  roof: readonly [string, string, string, string, string, string, string, string, string, string, string, string];
  /** wall: base, left edge, plinth */
  wall: readonly [string, string, string];
  frame: string;
  window: readonly [string, string] | null;
  chimney: boolean;
  sign: 'hammer' | 'bowl' | null;
}

const TILE_ROOF = ['#4a1e0e', '#f09a5a', '#8a3416', '#c25a2a', '#a8441e', '#c45a28', '#f4a466', '#e2763a', '#d0662e', '#9a3c1a', '#b85a2a', '#d88a4e'] as const;
const LOOKS: Record<HouseKind, HouseLook> = {
  smith: { roof: TILE_ROOF, wall: ['#f3e4c2', '#e3d2ac', '#d8c49a'], frame: '#8a5530', window: ['#ffb04a', '#ffe08a'], chimney: true, sign: 'hammer' },
  inn: { roof: TILE_ROOF, wall: ['#f3e4c2', '#e3d2ac', '#d8c49a'], frame: '#8a5530', window: ['#7ec0e8', '#d8f2ff'], chimney: true, sign: 'bowl' },
  // teak house with a dark red-brown roof: the elder's
  elder: {
    roof: ['#2e1006', '#d07a44', '#5a1e0c', '#8a3418', '#5e2410', '#7a2c14', '#c06a3a', '#9a3e1e', '#8a3618', '#4e1a0a', '#7a3016', '#a85a34'],
    wall: ['#b07848', '#c08858', '#8a5a34'],
    frame: '#5a3418',
    window: ['#ffd88a', '#fff0c8'],
    chimney: false,
    sign: null,
  },
  // bamboo hut with a straw thatch
  hut: {
    roof: ['#5a3a10', '#f4d890', '#a87828', '#d8a850', '#b88a34', '#c8983c', '#f0d080', '#e0b860', '#d0a448', '#9a7024', '#c09040', '#e0c070'],
    wall: ['#dcc088', '#e8cc94', '#b89a60'],
    frame: '#8a6a30',
    window: ['#7ec0e8', '#d8f2ff'],
    chimney: false,
    sign: null,
  },
};

export function drawHouse(b: PixelBuffer, H: Rect, kind: HouseKind): void {
  const L = LOOKS[kind];
  const [rOut, rRidgeHi, rRidgeLo, rRidge, rLine, rSeam, rHi, rTile, rPatch, rEave, rSide, rSideHi] = L.roof;
  const X = H.x * T;
  const Y = H.y * T;
  const W = H.w * T;
  const roofH = (H.h - 1) * T;
  const wallY = Y + roofH;
  rect(b, X + 4, wallY + 16, W, 3, '#000000', 0.18);
  rect(b, X + W, Y + 6, 3, roofH + 10, '#000000', 0.14);
  for (let y = wallY; y < wallY + 16; y++) {
    for (let x = X + 1; x < X + W - 1; x++) {
      let c = y >= wallY + 13 ? L.wall[2] : x === X + 1 ? L.wall[1] : L.wall[0];
      // vertical planks / woven bamboo on the non-plaster houses
      if (kind === 'elder' && y < wallY + 13 && (x - X) % 6 === 0) c = '#9a6438';
      if (kind === 'hut' && y < wallY + 13 && (x + y) % 4 === 0) c = '#c8a870';
      sp(b, x, y, c);
    }
  }
  rect(b, X + 1, wallY, 2, 16, L.frame);
  rect(b, X + W - 3, wallY, 2, 16, L.frame);
  rect(b, X + 1, wallY + 15, W - 2, 1, '#6a4020');
  const win = (x: number): void => {
    if (!L.window) return;
    rect(b, x, wallY + 4, 9, 7, '#6a3a1c');
    rect(b, x + 1, wallY + 5, 7, 5, L.window[0]);
    rect(b, x + 1, wallY + 5, 3, 2, L.window[1]);
    rect(b, x + 4, wallY + 5, 1, 5, '#6a3a1c');
    rect(b, x, wallY + 11, 9, 1, '#a87040');
  };
  win(X + 6);
  if (H.w >= 5) win(X + W - 15);
  const dx = X + Math.floor(W / 2) - 5 + (H.w < 5 ? 6 : 0);
  rect(b, dx, wallY + 3, 10, 13, '#5a2e14');
  rect(b, dx + 1, wallY + 4, 8, 12, '#8a4a22');
  for (let i = dx + 3; i < dx + 9; i += 3) rect(b, i, wallY + 4, 1, 12, '#6a3618');
  sp(b, dx + 7, wallY + 10, '#ffd166');
  rect(b, dx + 1, wallY + 3, 8, 1, '#a8602e');
  // hanging sign: hammer for the smith, steaming bowl for the kitchen
  if (L.sign) {
    const sx = dx + 12;
    rect(b, sx, wallY + 1, 1, 3, '#3a2a1a');
    rect(b, sx - 1, wallY + 3, 10, 8, '#5a2e14');
    rect(b, sx, wallY + 4, 8, 6, '#d8a060');
    if (L.sign === 'hammer') {
      rect(b, sx + 1, wallY + 6, 6, 1, '#4a4e58');
      rect(b, sx + 3, wallY + 7, 2, 2, '#4a4e58');
    } else {
      rect(b, sx + 1, wallY + 6, 6, 1, '#7a4a24');
      rect(b, sx + 2, wallY + 7, 4, 2, '#7a4a24');
      sp(b, sx + 3, wallY + 5, '#ffffff');
      sp(b, sx + 5, wallY + 4, '#ffffff');
    }
  }
  // roof, lit from the top-left (tiles, teak shingles or thatch depending on the palette)
  const rx0 = X - 3;
  const rx1 = X + W + 3;
  const ry0 = Y - 5;
  const ry1 = wallY + 3;
  for (let y = ry0; y < ry1; y++) {
    for (let x = rx0; x < rx1; x++) {
      const ly = y - ry0;
      const lx = x - rx0;
      let c: string;
      if (x === rx0 || x === rx1 - 1 || y === ry0 || y === ry1 - 1) c = rOut;
      else if (ly < 6) c = ly === 1 ? rRidgeHi : ly === 5 ? rRidgeLo : rRidge;
      else {
        const row = Math.floor((ly - 6) / 5);
        const off = (row % 2) * 4;
        const yin = (ly - 6) % 5;
        const xin = (lx + off) % 8;
        if (kind === 'hut') c = yin === 4 ? rLine : (lx + ly * 3) % 5 === 0 ? rSeam : yin === 0 ? rHi : rTile;
        else c = yin === 4 ? rLine : xin === 0 ? rSeam : yin === 0 ? rHi : rTile;
        if (hash(Math.floor((lx + off) / 8), row + H.x) < 0.1 && yin !== 4 && xin !== 0) c = rPatch;
      }
      if (y >= ry1 - 3 && c !== rOut) c = rEave;
      if (x >= rx1 - 5 && c !== rOut && ly >= 6 && c !== rEave) c = c === rHi ? rSideHi : rSide;
      sp(b, x, y, c);
    }
  }
  // Thai gable finials on the elder's house
  if (kind === 'elder') {
    for (const fx of [rx0 + 1, rx1 - 2]) {
      sp(b, fx, ry0 - 1, rOut);
      sp(b, fx, ry0 - 2, '#d8a050');
      sp(b, fx + (fx < X ? -1 : 1), ry0 - 3, '#d8a050');
    }
  }
  if (!L.chimney) return;
  const cxm = X + W - 16;
  rect(b, cxm, Y - 11, 7, 10, '#6a6a74');
  rect(b, cxm, Y - 11, 7, 2, '#a8a8b4');
  rect(b, cxm, Y - 11, 1, 10, '#4a4a54');
  rect(b, cxm - 1, Y - 12, 9, 1, '#3a3a44');
}

/** Rice granary on stilts with a thatched roof. */
export function drawGranary(b: PixelBuffer, H: Rect): void {
  const X = H.x * T;
  const Y = H.y * T;
  const W = H.w * T;
  const Hh = H.h * T;
  ell(b, X + W / 2 + 2, Y + Hh - 2, W / 2, 3, '#000000', 0.2);
  // stilts
  for (const sx of [X + 4, X + W / 2 - 1, X + W - 6]) {
    rect(b, sx, Y + Hh - 11, 2, 10, '#6a4020');
    rect(b, sx, Y + Hh - 11, 1, 10, '#8a5a30');
  }
  // bamboo body
  for (let y = Y + 8; y < Y + Hh - 11; y++) for (let x = X + 3; x < X + W - 3; x++) sp(b, x, y, (x + y) % 4 === 0 ? '#c8a870' : x === X + 3 ? '#e8cc94' : '#dcc088');
  rect(b, X + 3, Y + Hh - 12, W - 6, 1, '#8a6a30');
  rect(b, X + W / 2 - 3, Y + 12, 6, 6, '#6a4020');
  // thatch
  for (let y = Y - 4; y < Y + 10; y++) {
    const inset = Math.max(0, Math.floor((Y + 2 - y) * 0.9));
    for (let x = X + inset; x < X + W - inset; x++) {
      const edge = x === X + inset || x === X + W - inset - 1 || y === Y - 4 || y === Y + 9;
      sp(b, x, y, edge ? '#5a3a10' : y > Y + 6 ? '#a87828' : (x + y * 2) % 5 === 0 ? '#c8983c' : y < Y ? '#f0d080' : '#e0b860');
    }
  }
}

/** The elder's hunt request board: two posts and a plank with pinned notes. */
export function drawBoard(b: PixelBuffer, tx: number, ty: number): void {
  const X = tx * T;
  const Y = ty * T;
  ell(b, X + 9, Y + 15, 7, 1.5, '#000000', 0.22);
  rect(b, X + 2, Y + 4, 2, 12, '#6a4020');
  rect(b, X + 12, Y + 4, 2, 12, '#6a4020');
  rect(b, X, Y + 1, 16, 9, '#5a3418');
  rect(b, X + 1, Y + 2, 14, 7, '#b07848');
  rect(b, X + 1, Y + 2, 14, 1, '#d09a68');
  rect(b, X + 3, Y + 3, 4, 5, '#f3ead2');
  rect(b, X + 9, Y + 4, 4, 4, '#f3ead2');
  sp(b, X + 5, Y + 3, '#d8473c');
  sp(b, X + 11, Y + 4, '#d8473c');
  rect(b, X + 4, Y + 5, 2, 1, '#8a8070');
  rect(b, X + 10, Y + 6, 2, 1, '#8a8070');
}

export function drawFountain(b: PixelBuffer): void {
  const fx = PLAZA.x * T;
  const fy = PLAZA.y * T;
  ell(b, fx + 2, fy + 13, 16, 4, '#000000', 0.18);
  for (let y = fy - 14; y < fy + 14; y++) {
    for (let x = fx - 17; x < fx + 17; x++) {
      const q = ((x + 0.5 - fx) / 16) ** 2 + ((y + 0.5 - fy) / 12.5) ** 2;
      if (q > 1) continue;
      sp(b, x, y, q > 0.86 ? '#7d7562' : q > 0.64 ? (y < fy ? '#ece6d2' : '#cfc7ab') : q > 0.55 ? '#1f8a84' : (x + y) % 7 === 0 ? '#6ad8c6' : '#2fb7a8');
    }
  }
  ell(b, fx, fy - 1, 4.5, 3.2, '#cfc7ab');
  ell(b, fx, fy - 2, 3, 2, '#ece6d2');
  rect(b, fx - 1, fy - 9, 3, 7, '#bfb69a');
  rect(b, fx - 1, fy - 9, 1, 7, '#e1dac2');
  ell(b, fx, fy - 9, 3.4, 1.6, '#d8d0b6');
}

export function drawAnvil(b: PixelBuffer): void {
  const A = ANVIL;
  ell(b, A.x + 1, A.y + 5, 8, 2, '#000000', 0.25);
  rect(b, A.x - 4, A.y, 8, 5, '#7a4a2a');
  rect(b, A.x - 4, A.y, 8, 1, '#b07850');
  rect(b, A.x - 5, A.y - 4, 11, 3, '#5c6068');
  rect(b, A.x - 5, A.y - 4, 11, 1, '#c4cad4');
  rect(b, A.x - 8, A.y - 4, 3, 2, '#5c6068');
  rect(b, A.x - 2, A.y - 1, 5, 1, '#3a3d44');
}

export function drawPot(b: PixelBuffer): void {
  const Q = POT;
  ell(b, Q.x + 1, Q.y + 6, 8, 2, '#000000', 0.25);
  line(b, Q.x - 7, Q.y + 5, Q.x, Q.y - 9, '#6a3a1c');
  line(b, Q.x + 7, Q.y + 5, Q.x, Q.y - 9, '#6a3a1c');
  ell(b, Q.x, Q.y + 1, 5.5, 4.2, '#2a2a32');
  ell(b, Q.x - 1.5, Q.y, 2.5, 2, '#4a4a56');
  rect(b, Q.x - 5, Q.y - 3, 11, 1, '#6a6a78');
  ell(b, Q.x, Q.y - 3, 4, 0.9, '#e0a050');
}

export function drawLamps(b: PixelBuffer, map: WorldMap, lights: StaticLight[]): void {
  for (const [lx, ly] of [...LAMPS, ...QUARTER_LAMPS]) {
    const x = lx * T + 8;
    const y = ly * T + 8;
    if (map.tiles[ly * MW + lx] === Tile.FOUNTAIN) continue;
    ell(b, x + 1, y + 6, 3, 1, '#000000', 0.25);
    rect(b, x, y - 8, 2, 14, '#3a4050');
    rect(b, x - 2, y - 11, 6, 4, '#2a3040');
    rect(b, x - 1, y - 10, 4, 2, '#ffe08a');
    lights.push({ x: x + 1, y: y - 9, r: 16, c: '255,220,140', ga: 0.14 });
  }
}

/** Straw scarecrow on a cross of sticks, wearing a faded farmer hat. */
export function drawScarecrow(b: PixelBuffer, tx: number, ty: number): void {
  const X = tx * T + 8;
  const Y = ty * T;
  ell(b, X + 1, Y + 15, 4, 1.2, '#000000', 0.22);
  rect(b, X, Y + 4, 2, 12, '#6a4020');
  rect(b, X - 6, Y + 7, 14, 2, '#7a4a24');
  rect(b, X - 4, Y + 6, 10, 5, '#c84a3a');
  rect(b, X - 4, Y + 6, 10, 1, '#e86a5a');
  for (const sx of [X - 7, X + 8]) {
    sp(b, sx, Y + 7, '#e8c070');
    sp(b, sx, Y + 9, '#e8c070');
  }
  ell(b, X + 1, Y + 3, 3, 2.6, '#e8c878');
  sp(b, X, Y + 3, '#3a2a1a');
  sp(b, X + 2, Y + 3, '#3a2a1a');
  rect(b, X - 4, Y, 10, 1, '#b8903c');
  rect(b, X - 1, Y - 2, 5, 2, '#d8a850');
}

/** Open Thai pavilion: four posts, a raised plank floor and a steep two-tier gabled roof. */
export function drawSala(b: PixelBuffer, H: Rect): void {
  const X = H.x * T;
  const Y = H.y * T;
  const W = H.w * T;
  const Hh = H.h * T;
  const cx = X + W / 2;
  ell(b, cx + 2, Y + Hh - 2, W / 2 + 2, 3, '#000000', 0.22);
  // raised plank floor with a dark front edge
  for (let y = Y + Hh - 8; y < Y + Hh - 4; y++) for (let x = X + 1; x < X + W - 1; x++) sp(b, x, y, (x - X) % 5 === 0 ? '#8a5530' : y === Y + Hh - 8 ? '#e0b070' : '#b07848');
  rect(b, X + 1, Y + Hh - 4, W - 2, 2, '#5a3418');
  // posts, open between them so it reads as a pavilion, not a house
  for (const px of [X + 3, X + W - 5]) {
    rect(b, px, Y + 9, 2, Hh - 15, '#6a4020');
    rect(b, px, Y + 9, 1, Hh - 15, '#9a6a3a');
  }
  rect(b, X + 3, Y + 11, W - 6, 1, '#5a3418');
  // gabled roof: each row narrower towards the ridge, lower tier wider than the upper
  const tier = (base: number, rows: number, half: number): void => {
    for (let r = 0; r < rows; r++) {
      const y = base - r;
      const w = Math.round(half - r * (half / (rows + 2)));
      for (let x = Math.round(cx - w); x < Math.round(cx + w); x++) {
        const edge = x === Math.round(cx - w) || x === Math.round(cx + w) - 1 || r === 0 || r === rows - 1;
        sp(b, x, y, edge ? '#4a1e0e' : x < cx ? (r % 2 ? '#e2683a' : '#c84a24') : r % 2 ? '#b84020' : '#a83a1a');
      }
    }
  };
  tier(Y + 11, 7, W / 2 + 4);
  tier(Y + 4, 6, W / 2 - 2);
  // gold finials (ช่อฟ้า) at the gable ends and ridge
  sp(b, Math.round(cx - W / 2 - 4), Y + 10, '#d8a050');
  sp(b, Math.round(cx - W / 2 - 5), Y + 9, '#d8a050');
  sp(b, Math.round(cx + W / 2 + 3), Y + 10, '#d8a050');
  sp(b, Math.round(cx + W / 2 + 4), Y + 9, '#d8a050');
  rect(b, Math.round(cx) - 1, Y - 3, 2, 2, '#d8a050');
}

/** Lily pads on pond tiles that are not planted slots. */
export function drawLilyPads(b: PixelBuffer, tiles: readonly (readonly [number, number])[]): void {
  for (const [tx, ty] of tiles) {
    const X = tx * T;
    const Y = ty * T;
    const pads: readonly [number, number, number][] = [
      [4 + hash(tx, ty) * 4, 5 + hash(ty, tx) * 3, 2.6],
      [10 + hash(tx + 3, ty) * 3, 10 + hash(tx, ty + 5) * 2, 2.2],
    ];
    for (const [px, py, r] of pads) {
      ell(b, X + px, Y + py, r, r * 0.75, '#2f7a3a');
      ell(b, X + px - 0.5, Y + py - 0.5, r - 0.8, r * 0.75 - 0.8, '#4f9a44');
      sp(b, X + px, Y + py, '#1f5a2a');
    }
  }
}
