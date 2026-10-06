// Village structures painted straight into the ground buffer.
import { hash } from '../core/rng';
import { ANVIL, LAMPS, MW, PLAZA, POT, QUARTER_LAMPS, T, Tile, type Camp, type Edge, type Rect, type WorldMap } from '../core/mapgen';
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

/** Roof shades, lit from the top-left: the left hip catches the sun, the right hip sits in shade. */
interface RoofPalette {
  out: string;
  cap: string;
  capLo: string;
  front: string;
  frontHi: string;
  frontLine: string;
  seam: string;
  left: string;
  leftLine: string;
  right: string;
  rightLine: string;
  back: string;
  backLine: string;
  eave: string;
}

const TILE_ROOF: RoofPalette = {
  out: '#4a1e0e',
  cap: '#f6b47a',
  capLo: '#8a3416',
  front: '#e2763a',
  frontHi: '#f4a466',
  frontLine: '#a8441e',
  seam: '#c45a28',
  left: '#f09a5a',
  leftLine: '#d0662e',
  right: '#b85a2a',
  rightLine: '#8a3416',
  back: '#d88a4e',
  backLine: '#b8602e',
  eave: '#9a3c1a',
};
const THATCH_ROOF: RoofPalette = {
  out: '#5a3a10',
  cap: '#9a7024',
  capLo: '#6a4a14',
  front: '#e0b860',
  frontHi: '#f4d890',
  frontLine: '#b88a34',
  seam: '#c8983c',
  left: '#f0d080',
  leftLine: '#d8b060',
  right: '#c09040',
  rightLine: '#9a7024',
  back: '#d8b05c',
  backLine: '#b88a34',
  eave: '#a87828',
};
// teak shingles, dark red: the elder's Thai house
const TEAK_ROOF: RoofPalette = {
  out: '#2e1006',
  cap: '#d8a050',
  capLo: '#5a1e0c',
  front: '#9a3e1e',
  frontHi: '#c06a3a',
  frontLine: '#5e2410',
  seam: '#7a2c14',
  left: '#b4502a',
  leftLine: '#7a2c14',
  right: '#7a2c14',
  rightLine: '#4e1a0a',
  back: '#8a3618',
  backLine: '#5e2410',
  eave: '#4e1a0a',
};

const GOLD = '#e0b050';
const GOLD_HI = '#fff0a0';

export function drawHouse(b: PixelBuffer, H: Rect, kind: HouseKind): void {
  const X = H.x * T;
  const Y = H.y * T;
  const W = H.w * T;
  const wallY = Y + (H.h - 1) * T;
  // ground shadow to the bottom-right
  rect(b, X + 3, wallY + 15, W, 3, '#000000', 0.16);
  rect(b, X + W, Y + 4, 4, wallY - Y + 12, '#000000', 0.12);
  if (kind === 'smith') smithWalls(b, X, wallY, W);
  else if (kind === 'inn') innWalls(b, X, wallY, W);
  else stiltWalls(b, X, wallY, W, kind);
  if (kind === 'elder') thaiGableRoof(b, X, Y, W, wallY);
  else hipRoof(b, X, Y, W, wallY, kind === 'hut' ? THATCH_ROOF : TILE_ROOF, kind === 'hut', H.x * 7 + H.y);
  if (kind === 'smith') {
    const cx = X + W - 16;
    rect(b, cx, Y - 11, 7, 11, '#7a7680');
    for (let y = Y - 10; y < Y; y += 3) rect(b, cx + ((y - Y) % 2 ? 0 : 3), y, 1, 1, '#5a5660');
    rect(b, cx, Y - 11, 7, 1, '#b8b4c0');
    rect(b, cx, Y - 11, 1, 11, '#5a5660');
    rect(b, cx + 6, Y - 11, 1, 11, '#4a4650');
    rect(b, cx - 1, Y - 12, 9, 1, '#3a3640');
    rect(b, cx + 1, Y - 11, 5, 1, '#2a262e');
  }
}

/** Plastered timber-frame wall: base colour, corner posts, a beam under the eave and a plinth. */
function plasterWall(b: PixelBuffer, X: number, wallY: number, W: number, stone: boolean): void {
  for (let y = wallY; y < wallY + 16; y++) {
    for (let x = X + 1; x < X + W - 1; x++) {
      let c = x === X + 2 ? '#fff4da' : '#f3e4c2';
      if (y >= wallY + 12) {
        if (stone) {
          // rubble-stone plinth
          const row = Math.floor((y - wallY - 12) / 2);
          const sx = (x + row * 3) % 6;
          c = sx === 0 || (y - wallY) % 2 === 1 ? '#7d7562' : (x + y) % 5 === 0 ? '#b8b09a' : '#a39a80';
        } else c = y === wallY + 12 ? '#c8b48a' : '#d8c49a';
      }
      sp(b, x, y, c);
    }
  }
  // eave shadow on the wall top
  rect(b, X + 1, wallY + 3, W - 2, 3, '#7a4a20', 0.22);
  rect(b, X + 1, wallY + 3, 2, 13, '#8a5530');
  rect(b, X + W - 3, wallY + 3, 2, 13, '#6a4020');
  rect(b, X + 1, wallY + 11, W - 2, 1, '#8a5530');
  rect(b, X + 1, wallY + 15, W - 2, 1, '#5a3418');
}

function door(b: PixelBuffer, dx: number, top: number, bottom: number): void {
  rect(b, dx - 1, top - 1, 12, bottom - top + 1, '#5a2e14');
  rect(b, dx, top, 10, bottom - top, '#8a4a22');
  for (let i = dx + 3; i < dx + 9; i += 3) rect(b, i, top, 1, bottom - top, '#6a3618');
  rect(b, dx, top, 10, 1, '#a8602e');
  sp(b, dx + 7, top + Math.floor((bottom - top) / 2), '#ffd166');
  rect(b, dx - 1, top - 2, 12, 1, '#a87040');
}

/** Window with open wooden shutters; `glow` is the forge seen through it. */
function shutterWindow(b: PixelBuffer, x: number, y: number, glass: readonly [string, string], glow = false): void {
  rect(b, x - 2, y, 2, 7, '#a8602e');
  rect(b, x + 9, y, 2, 7, '#a8602e');
  rect(b, x - 2, y, 1, 7, '#c88a50');
  rect(b, x, y, 9, 7, '#5a3418');
  rect(b, x + 1, y + 1, 7, 5, glass[0]);
  if (glow) {
    rect(b, x + 1, y + 4, 7, 2, '#ff7a2a');
    rect(b, x + 3, y + 3, 3, 2, '#ffd166');
    sp(b, x + 4, y + 2, '#fff0a0');
  } else {
    rect(b, x + 1, y + 1, 3, 2, glass[1]);
    rect(b, x + 4, y + 1, 1, 5, '#5a3418');
  }
  rect(b, x - 1, y + 7, 11, 1, '#c88a50');
}

function smithWalls(b: PixelBuffer, X: number, wallY: number, W: number): void {
  plasterWall(b, X, wallY, W, true);
  // forge window glowing orange (the static light in terrain.ts sits on it)
  shutterWindow(b, X + 6, wallY + 4, ['#3a1a0a', '#3a1a0a'], true);
  const dx = X + Math.floor(W / 2) - 5;
  door(b, dx, wallY + 4, wallY + 16);
  // hammer sign
  const sx = dx + 13;
  rect(b, sx + 3, wallY + 2, 1, 2, '#3a2a1a');
  rect(b, sx - 1, wallY + 4, 10, 7, '#5a2e14');
  rect(b, sx, wallY + 5, 8, 5, '#d8a060');
  rect(b, sx + 1, wallY + 6, 6, 1, '#4a4e58');
  rect(b, sx + 1, wallY + 6, 6, 1, '#6a6e78');
  rect(b, sx + 3, wallY + 7, 2, 2, '#4a4e58');
  // firewood stack against the right wall
  const wx = X + W - 14;
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 4 - r; i++) {
      const lx = wx + i * 3 + r * 1.5;
      const ly = wallY + 13 - r * 2;
      ell(b, lx + 1, ly, 1.6, 1.3, '#8a5530');
      sp(b, lx + 1, ly, '#d8a870');
    }
  }
}

function innWalls(b: PixelBuffer, X: number, wallY: number, W: number): void {
  plasterWall(b, X, wallY, W, false);
  shutterWindow(b, X + 6, wallY + 4, ['#7ec0e8', '#d8f2ff']);
  // flower box under the window
  rect(b, X + 5, wallY + 11, 11, 2, '#8a5530');
  for (let i = 0; i < 5; i++) sp(b, X + 6 + i * 2, wallY + 10, i % 2 ? '#ff6a8a' : '#ffd166');
  for (let i = 0; i < 5; i++) sp(b, X + 7 + i * 2, wallY + 10, '#5c9f39');
  const dx = X + Math.floor(W / 2) - 5;
  door(b, dx, wallY + 4, wallY + 16);
  // steaming bowl sign
  const sx = dx + 13;
  rect(b, sx + 3, wallY + 2, 1, 2, '#3a2a1a');
  rect(b, sx - 1, wallY + 4, 10, 7, '#5a2e14');
  rect(b, sx, wallY + 5, 8, 5, '#d8a060');
  rect(b, sx + 1, wallY + 7, 6, 1, '#7a4a24');
  rect(b, sx + 2, wallY + 8, 4, 1, '#7a4a24');
  sp(b, sx + 3, wallY + 6, '#ffffff');
  sp(b, sx + 5, wallY + 5, '#ffffff');
  // strings of dried chillies and garlic hanging from the eave
  for (const [hx, col] of [[X + 4, '#d8473c'], [X + 18, '#f3ead2']] as const) {
    for (let i = 0; i < 4; i++) sp(b, hx + (i % 2), wallY + 4 + i * 2, col);
  }
  // clay water jars (โอ่ง) at the right corner
  for (const [jx, r] of [[X + W - 7, 3.6], [X + W - 12, 2.8]] as const) {
    ell(b, jx + 1, wallY + 15, r + 1, 1.2, '#000000', 0.25);
    ell(b, jx, wallY + 12, r, r * 0.95, '#8a4a22');
    ell(b, jx - 1, wallY + 11, r * 0.5, r * 0.5, '#b86a3a');
    rect(b, jx - 1.5, wallY + 12 - r - 1, 3, 1, '#5a2e14');
    sp(b, jx + 1, wallY + 13, '#d8a050');
  }
}

/** Raised Thai house: teak plank or woven bamboo wall on stilts with steps up to the door. */
function stiltWalls(b: PixelBuffer, X: number, wallY: number, W: number, kind: 'elder' | 'hut'): void {
  const elder = kind === 'elder';
  const floorY = wallY + 10;
  // dark crawl space under the floor
  rect(b, X + 2, floorY + 1, W - 4, 15 - (floorY - wallY), '#2a1e12', 0.5);
  for (let x = X + 3; x < X + W - 3; x += elder ? 11 : 13) {
    rect(b, x, floorY, 2, 16 - (floorY - wallY), '#6a4020');
    sp(b, x, floorY + 1, '#9a6a3a');
  }
  rect(b, X + W - 5, floorY, 2, 16 - (floorY - wallY), '#6a4020');
  for (let y = wallY; y < floorY; y++) {
    for (let x = X + 1; x < X + W - 1; x++) {
      let c: string;
      if (elder) c = (x - X) % 6 === 0 ? '#8a5a34' : (x - X) % 6 === 1 ? '#c89868' : '#b07848';
      else c = (x + y) % 4 === 0 ? '#c8a870' : (x - y + 64) % 4 === 0 ? '#e8cc94' : '#dcc088';
      sp(b, x, y, c);
    }
  }
  rect(b, X + 1, wallY + 3, W - 2, 3, '#3a1a08', 0.25);
  // floor beam and verandah edge
  rect(b, X, floorY, W, 2, elder ? '#5a3418' : '#8a6a30');
  rect(b, X, floorY, W, 1, elder ? '#8a5a34' : '#b8985a');
  rect(b, X + 1, wallY, 2, 10, elder ? '#5a3418' : '#8a6a30');
  rect(b, X + W - 3, wallY, 2, 10, elder ? '#4a2810' : '#7a5a24');
  // windows: teak panels on the elder's, simple openings on the huts
  const glass = elder ? (['#ffd88a', '#fff0c8'] as const) : (['#7ec0e8', '#d8f2ff'] as const);
  const winY = wallY + 3;
  const wins = elder ? [X + 6, X + W - 15] : [X + 5];
  for (const wx of wins) {
    rect(b, wx, winY, 9, 6, '#4a2810');
    rect(b, wx + 1, winY + 1, 7, 4, glass[0]);
    rect(b, wx + 1, winY + 1, 3, 2, glass[1]);
    rect(b, wx + 4, winY + 1, 1, 4, '#4a2810');
    rect(b, wx - 1, winY + 6, 11, 1, elder ? '#c89868' : '#b8985a');
  }
  // door and wooden steps down to the ground
  const dx = elder ? X + Math.floor(W / 2) - 5 : X + W - 18;
  rect(b, dx - 1, wallY + 1, 12, 9, '#3a1a08');
  rect(b, dx, wallY + 2, 10, 8, '#7a4220');
  rect(b, dx + 4, wallY + 2, 2, 8, '#5a2e14');
  sp(b, dx + 3, wallY + 6, '#ffd166');
  sp(b, dx + 6, wallY + 6, '#ffd166');
  for (let s = 0; s < 3; s++) {
    const sy = floorY + 2 + s * 2;
    rect(b, dx - s, sy, 10 + s * 2, 2, s % 2 ? '#8a5530' : '#b07848');
    rect(b, dx - s, sy, 10 + s * 2, 1, '#d8a870');
  }
  if (elder) {
    // potted plants either side of the steps and a pair of water jars
    for (const px of [dx - 6, dx + 13]) {
      rect(b, px, wallY + 12, 4, 3, '#b8603a');
      ell(b, px + 2, wallY + 11, 3, 2.2, '#3f8a2e');
      sp(b, px + 1, wallY + 10, '#ff6a8a');
    }
    ell(b, X + 5, wallY + 13, 3, 2.8, '#8a4a22');
    ell(b, X + 4, wallY + 12, 1.4, 1.2, '#b86a3a');
    rect(b, X + 4, wallY + 10, 3, 1, '#5a2e14');
  } else {
    // a woven basket and a clay jar by the hut
    ell(b, X + 7, wallY + 14, 3, 2, '#c89a50');
    rect(b, X + 4, wallY + 13, 7, 1, '#a87828');
    ell(b, X + W - 6, wallY + 13, 2.6, 2.4, '#8a4a22');
    sp(b, X + W - 7, wallY + 12, '#b86a3a');
  }
}

/**
 * Hipped roof seen from above at 3/4: a short ridge, four slopes split by hip lines,
 * tile courses on the front, ragged eaves for thatch.
 */
function hipRoof(b: PixelBuffer, X: number, Y: number, W: number, wallY: number, P: RoofPalette, thatch: boolean, seed: number): void {
  const rx0 = X - 3;
  const ry0 = Y - 5;
  const RW = W + 6;
  const RH = wallY + 4 - ry0;
  const ridge = Math.round(RH * 0.3);
  const a = Math.min(Math.round(RH * 0.62), Math.floor(RW / 3));
  // ragged thatch hangs a little lower in places
  const hang = (lx: number): number => (thatch ? Math.floor(hash(lx + seed, 3) * 3) : 0);
  for (let lx = 0; lx < RW; lx++) {
    const bottom = RH + hang(lx);
    for (let ly = 0; ly < bottom; ly++) {
      const t = ly < ridge ? ly / ridge : Math.max(0, (RH - 1 - ly) / (RH - 1 - ridge));
      const hip = a * t;
      const corner = (lx === 0 || lx === RW - 1) && (ly === 0 || ly >= RH - 1);
      if (corner) continue;
      let c: string;
      const edge = lx === 0 || lx === RW - 1 || ly === 0 || ly === bottom - 1;
      if (edge) c = P.out;
      else if (ly === ridge && lx >= a - 1 && lx <= RW - a) c = P.cap;
      else if (ly === ridge + 1 && lx >= a && lx <= RW - a - 1) c = P.capLo;
      else if (Math.abs(lx - hip) < 0.9 || Math.abs(RW - 1 - lx - hip) < 0.9) c = lx < RW / 2 ? P.cap : P.capLo;
      else if (lx < hip) c = (thatch ? (lx * 3 + ly) % 5 === 0 : ly % 4 === 3) ? P.leftLine : P.left;
      else if (lx > RW - 1 - hip) c = (thatch ? (lx * 3 + ly) % 5 === 0 : ly % 4 === 3) ? P.rightLine : P.right;
      else if (ly < ridge) c = (thatch ? (lx + ly * 2) % 5 === 0 : (ridge - ly) % 3 === 0) ? P.backLine : P.back;
      else {
        if (thatch) {
          // straw laid in overlapping layers whose lower edges wobble a little
          const k = ly - ridge - 2 + Math.floor(hash(lx >> 1, seed) * 2) + 40;
          const tin = k % 5;
          const layer = Math.floor(k / 5);
          c = tin === 4 ? P.frontLine : tin === 0 ? P.frontHi : hash(lx + seed, layer) < 0.16 ? P.seam : P.front;
        } else {
          const yin = (ly - ridge - 2 + 40) % 4;
          const row = Math.floor((ly - ridge - 2) / 4);
          const xin = (lx + (row % 2) * 3) % 6;
          c = yin === 3 ? P.frontLine : xin === 0 ? P.seam : yin === 0 ? P.frontHi : P.front;
          if (yin !== 3 && xin !== 0 && hash(Math.floor((lx + (row % 2) * 3) / 6) + seed, row) < 0.08) c = P.seam;
        }
      }
      if (!edge && ly >= RH - 3 && ly > ridge + 2) c = ly === RH - 3 ? P.frontLine : P.eave;
      sp(b, rx0 + lx, ry0 + ly, c);
    }
  }
  // ridge-end tiles
  if (!thatch) {
    for (const ex of [rx0 + a - 2, rx0 + RW - a]) {
      rect(b, ex, ry0 + ridge - 1, 2, 3, P.out);
      sp(b, ex, ry0 + ridge - 1, P.cap);
    }
  } else {
    // bound ridge bundle with ties
    for (let x = rx0 + a; x < rx0 + RW - a; x += 4) rect(b, x, ry0 + ridge - 1, 1, 3, P.out);
  }
}

/**
 * Thai gable facing the street: two steep teak slopes meeting at a ridge, a carved
 * gable (หน้าจั่ว) with gold bargeboards and crossed kalae horns, and a lower tier at each side.
 */
function thaiGableRoof(b: PixelBuffer, X: number, Y: number, W: number, wallY: number): void {
  const P = TEAK_ROOF;
  const rx0 = X - 4;
  const RW = W + 8;
  const ry0 = Y - 7;
  const mid = RW / 2;
  const half = W / 2 - 4;
  const gableH = 24;
  const baseY = wallY + 3;
  const tierW = 7;
  // front edge of the roof: an inverted V above the gable, flat over the overhangs
  const edgeY = (lx: number): number => {
    const d = Math.abs(lx + 0.5 - mid);
    if (d >= half) return baseY + (d > mid - 2 ? -1 : 0);
    return baseY - Math.round(gableH * (1 - d / half));
  };
  for (let lx = 0; lx < RW; lx++) {
    const ey = edgeY(lx);
    const lower = lx < tierW || lx >= RW - tierW;
    const top = ry0 + (lower ? 6 : 0);
    for (let y = top; y <= ey; y++) {
      const left = lx + 0.5 < mid;
      let c: string;
      if (lx === 0 || lx === RW - 1 || y === top || y === ey || lx === tierW || lx === RW - tierW - 1) c = P.out;
      else if (Math.abs(lx + 0.5 - mid) < 1) c = P.cap;
      else {
        const course = (left ? Math.floor(lx) : Math.floor(RW - 1 - lx)) % 5;
        const seam = (y - ry0 + (Math.floor(lx / 5) % 2) * 2) % 4 === 0;
        const base = left ? P.left : P.right;
        c = course === 0 ? (left ? P.leftLine : P.rightLine) : seam ? (left ? P.seam : P.rightLine) : base;
        if (left && course === 1 && !seam) c = P.frontHi;
        if (lower) c = c === P.frontHi ? P.left : c === P.left ? P.back : c;
      }
      sp(b, rx0 + lx, y, c);
    }
  }
  // the gable: teak boards radiating from a carved sun, under gold bargeboards
  const gcx = rx0 + mid;
  for (let lx = 0; lx < RW; lx++) {
    const ey = edgeY(lx);
    const d = Math.abs(lx + 0.5 - mid);
    if (d >= half) continue;
    for (let y = ey + 1; y < baseY + 1; y++) {
      const ang = Math.atan2(baseY - y, lx + 0.5 - mid);
      const ray = Math.floor(ang / (Math.PI / 9)) % 2 === 0;
      sp(b, rx0 + lx, y, ray ? '#b07848' : '#9a6438');
    }
    // bargeboard (ป้านลม), 2px gold with a dark rim
    sp(b, rx0 + lx, ey + 1, GOLD);
    sp(b, rx0 + lx, ey + 2, d < half - 1 ? '#a87830' : GOLD);
    sp(b, rx0 + lx, ey + 3, '#4a2810');
  }
  // carved half-sun at the gable base
  ell(b, gcx, baseY, 6, 5, '#c89868');
  ell(b, gcx, baseY, 4, 3, GOLD);
  ell(b, gcx, baseY, 2, 1.6, GOLD_HI);
  rect(b, X, baseY, W, 1, '#4a2810');
  // kalae: crossed horns over the apex
  const ay = baseY - gableH;
  for (let i = 0; i < 6; i++) {
    sp(b, gcx - 1 - i, ay - 2 - i, i === 5 ? GOLD_HI : GOLD);
    sp(b, gcx + i, ay - 2 - i, i === 5 ? GOLD_HI : GOLD);
    sp(b, gcx - 1 - i, ay - 1 - i, P.out);
    sp(b, gcx + i, ay - 1 - i, P.out);
  }
  // hang hong: little upturned hooks at the bargeboard feet and the lower tiers' eaves
  for (const fx of [rx0 + mid - half, rx0 + mid + half - 1]) {
    sp(b, fx, baseY - 1, GOLD_HI);
    sp(b, fx + (fx < gcx ? -1 : 1), baseY - 2, GOLD);
  }
  for (const fx of [rx0, rx0 + RW - 1]) {
    sp(b, fx, baseY - 1, GOLD);
    sp(b, fx + (fx < gcx ? -1 : 1), baseY - 2, GOLD_HI);
  }
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
  hipRoof(b, X + 2, Y + 1, W - 4, Y + 7, THATCH_ROOF, true, H.x * 7 + H.y);
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

/**
 * Wooden signpost: a post with one plank arm per destination. East/west arms point sideways
 * with a cut tip; north/south arms carry a painted arrow.
 */
export function drawSignpost(b: PixelBuffer, x: number, y: number, arms: readonly Edge[]): void {
  const n = arms.length;
  const top = y - 10 - n * 5;
  ell(b, x + 2, y, 5, 1.6, '#000000', 0.25);
  rect(b, x - 1, top, 3, y - top, '#6a4020');
  rect(b, x - 1, top, 1, y - top, '#9a6a3a');
  rect(b, x - 1, top - 1, 3, 1, '#4a2810');
  arms.forEach((edge, i) => {
    const ay = top + 1 + i * 5;
    const left = edge === 'w' || (edge !== 'e' && i % 2 === 1);
    const x0 = left ? x - 11 : x - 2;
    const w = 13;
    rect(b, x0, ay, w, 4, '#c88a50');
    rect(b, x0, ay, w, 1, '#e8b478');
    rect(b, x0, ay + 3, w, 1, '#8a5530');
    // cut tip on the side the arm points to
    const tipX = left ? x0 - 1 : x0 + w;
    rect(b, tipX, ay + 1, 1, 2, '#c88a50');
    sp(b, tipX + (left ? -1 : 1), ay + 1, '#a86a38');
    sp(b, tipX + (left ? -1 : 1), ay + 2, '#a86a38');
    // painted arrow
    const cx = x0 + Math.floor(w / 2);
    const ink = '#4a2810';
    if (edge === 'n') {
      sp(b, cx, ay + 1, ink);
      rect(b, cx - 1, ay + 2, 3, 1, ink);
    } else if (edge === 's') {
      rect(b, cx - 1, ay + 1, 3, 1, ink);
      sp(b, cx, ay + 2, ink);
    } else {
      rect(b, cx - 2, ay + 2, 4, 1, ink);
      sp(b, edge === 'e' ? cx + 2 : cx - 3, ay + 2, ink);
      sp(b, edge === 'e' ? cx + 1 : cx - 2, ay + 1, ink);
    }
    rect(b, x - 1, ay + 1, 3, 1, '#5a3418');
  });
}

/**
 * Hunter camp: an A-frame canvas tent on bamboo poles, a ring-of-stones fire pit (the flames are
 * animated in WorldScene), two log seats and a drying rack with a hide.
 */
export function drawCamp(b: PixelBuffer, camp: Camp, lights: StaticLight[]): void {
  const X = camp.tent.x * T;
  const Y = camp.tent.y * T;
  const W = camp.tent.w * T;
  const H = camp.tent.h * T;
  const cx = X + W / 2;
  // trodden earth around the fire
  ell(b, camp.fire.x, camp.fire.y + 2, 30, 16, '#b89a62', 0.35);
  ell(b, camp.fire.x, camp.fire.y + 2, 20, 11, '#a88a56', 0.35);
  // tent: shadow, back slope, front gable with the flap open
  ell(b, cx + 3, Y + H - 1, W / 2 + 3, 4, '#000000', 0.22);
  const top = Y + 1;
  const base = Y + H - 2;
  for (let y = top; y <= base; y++) {
    const k = (y - top) / (base - top);
    const half = Math.round(3 + k * (W / 2 - 1));
    for (let x = Math.round(cx - half); x < Math.round(cx + half); x++) {
      const left = x < cx;
      const edge = x === Math.round(cx - half) || x === Math.round(cx + half) - 1;
      let c = edge ? '#3e3420' : left ? '#d8c48a' : '#a8945a';
      // canvas seams running down the slopes
      if (!edge && (x - Math.round(cx - half)) % 5 === 0 && y > top + 2) c = left ? '#c4b07a' : '#968450';
      sp(b, x, y, c);
    }
  }
  // open flap: dark doorway with a rolled-back canvas edge
  for (let y = top + 9; y <= base; y++) {
    const k = (y - top - 9) / (base - top - 9);
    const half = Math.round(1 + k * 7);
    for (let x = Math.round(cx - half); x < Math.round(cx + half); x++) sp(b, x, y, x < cx - half + 2 ? '#2a2216' : '#3a3020');
    sp(b, Math.round(cx + half), y, '#e8d8a0');
  }
  rect(b, cx - 3, base - 2, 6, 2, '#8a3a2a'); // a red blanket inside
  // ridge pole sticking out, guy ropes and pegs
  rect(b, cx - 1, top - 3, 2, 4, '#8a6a30');
  sp(b, cx - 1, top - 3, '#c8a050');
  line(b, X - 3, base, Math.round(cx - W / 2 + 2), top + 10, '#6a5a3a');
  line(b, X + W + 2, base, Math.round(cx + W / 2 - 2), top + 10, '#6a5a3a');
  for (const px of [X - 3, X + W + 2]) rect(b, px, base, 2, 2, '#6a4020');
  // a small pennant on the pole
  rect(b, cx + 1, top - 3, 4, 2, '#d8473c');

  // fire pit: ring of stones, ash and crossed logs
  const fx = camp.fire.x;
  const fy = camp.fire.y + 3;
  ell(b, fx, fy, 8, 5, '#3a3430');
  ell(b, fx, fy - 1, 6, 3.4, '#5a4a40');
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const sx = fx + Math.cos(a) * 8;
    const sy = fy + Math.sin(a) * 5;
    ell(b, sx, sy, 2, 1.6, i % 2 ? '#9a948a' : '#b8b2a4');
    sp(b, sx - 1, sy - 1, '#d8d2c4');
  }
  line(b, fx - 5, fy + 1, fx + 4, fy - 3, '#6a3a1c');
  line(b, fx - 4, fy - 3, fx + 5, fy + 1, '#7a4a24');
  ell(b, fx, fy - 1, 3, 1.6, '#ff8a2a', 0.8);
  lights.push({ x: fx, y: fy - 4, r: 30, c: '255,150,60', ga: 0.22 });

  // log seats either side of the fire
  for (const dx of [-18, 16]) {
    const lx = fx + dx;
    const ly = fy + 4;
    ell(b, lx + 1, ly + 2, 6, 1.6, '#000000', 0.2);
    rect(b, lx - 5, ly - 2, 10, 4, '#7a4a24');
    rect(b, lx - 5, ly - 2, 10, 1, '#a8703c');
    ell(b, lx + 5, ly, 1.4, 2, '#d8a870');
    sp(b, lx + 5, ly, '#8a5a30');
  }

  // drying rack with a stretched hide, off to the side of the tent
  const rx = X + (camp.fire.x < X ? W + 6 : -14);
  const ry = Y + 4;
  ell(b, rx + 6, ry + 16, 8, 2, '#000000', 0.2);
  rect(b, rx, ry, 2, 16, '#8a6a30');
  rect(b, rx + 12, ry, 2, 16, '#8a6a30');
  rect(b, rx - 1, ry, 16, 2, '#a8803c');
  rect(b, rx + 3, ry + 3, 8, 9, '#b5552e');
  rect(b, rx + 4, ry + 4, 6, 7, '#c8683a');
  for (let i = 0; i < 4; i++) sp(b, rx + 4 + i * 2, ry + 2, '#3e3420');
}
