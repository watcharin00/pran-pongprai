// Village structures painted straight into the ground buffer.
import { hash } from '../core/rng';
import { ANVIL, LAMPS, MW, PLAZA, POT, T, Tile, type Rect, type WorldMap } from '../core/mapgen';
import { ell, line, rect, sp, type PixelBuffer } from './pixelBuffer';

export interface StaticLight {
  x: number;
  y: number;
  r: number;
  /** "r,g,b" */
  c: string;
  ga: number;
}

export function drawHouse(b: PixelBuffer, H: Rect, kind: 'smith' | 'inn'): void {
  const X = H.x * T;
  const Y = H.y * T;
  const W = H.w * T;
  const roofH = (H.h - 1) * T;
  const wallY = Y + roofH;
  rect(b, X + 4, wallY + 16, W, 3, '#000000', 0.18);
  rect(b, X + W, Y + 6, 3, roofH + 10, '#000000', 0.14);
  for (let y = wallY; y < wallY + 16; y++) for (let x = X + 1; x < X + W - 1; x++) sp(b, x, y, y >= wallY + 13 ? '#d8c49a' : x === X + 1 ? '#e3d2ac' : '#f3e4c2');
  rect(b, X + 1, wallY, 2, 16, '#8a5530');
  rect(b, X + W - 3, wallY, 2, 16, '#8a5530');
  rect(b, X + 1, wallY + 15, W - 2, 1, '#6a4020');
  const win = (x: number): void => {
    rect(b, x, wallY + 4, 9, 7, '#6a3a1c');
    rect(b, x + 1, wallY + 5, 7, 5, kind === 'smith' ? '#ffb04a' : '#7ec0e8');
    rect(b, x + 1, wallY + 5, 3, 2, kind === 'smith' ? '#ffe08a' : '#d8f2ff');
    rect(b, x + 4, wallY + 5, 1, 5, '#6a3a1c');
    rect(b, x, wallY + 11, 9, 1, '#a87040');
  };
  win(X + 6);
  win(X + W - 15);
  const dx = X + Math.floor(W / 2) - 5;
  rect(b, dx, wallY + 3, 10, 13, '#5a2e14');
  rect(b, dx + 1, wallY + 4, 8, 12, '#8a4a22');
  for (let i = dx + 3; i < dx + 9; i += 3) rect(b, i, wallY + 4, 1, 12, '#6a3618');
  sp(b, dx + 7, wallY + 10, '#ffd166');
  rect(b, dx + 1, wallY + 3, 8, 1, '#a8602e');
  // hanging sign: hammer for the smith, steaming bowl for the kitchen
  const sx = dx + 12;
  rect(b, sx, wallY + 1, 1, 3, '#3a2a1a');
  rect(b, sx - 1, wallY + 3, 10, 8, '#5a2e14');
  rect(b, sx, wallY + 4, 8, 6, '#d8a060');
  if (kind === 'smith') {
    rect(b, sx + 1, wallY + 6, 6, 1, '#4a4e58');
    rect(b, sx + 3, wallY + 7, 2, 2, '#4a4e58');
  } else {
    rect(b, sx + 1, wallY + 6, 6, 1, '#7a4a24');
    rect(b, sx + 2, wallY + 7, 4, 2, '#7a4a24');
    sp(b, sx + 3, wallY + 5, '#ffffff');
    sp(b, sx + 5, wallY + 4, '#ffffff');
  }
  // tiled orange roof, lit from the top-left
  const rx0 = X - 3;
  const rx1 = X + W + 3;
  const ry0 = Y - 5;
  const ry1 = wallY + 3;
  for (let y = ry0; y < ry1; y++) {
    for (let x = rx0; x < rx1; x++) {
      const ly = y - ry0;
      const lx = x - rx0;
      let c: string;
      if (x === rx0 || x === rx1 - 1 || y === ry0 || y === ry1 - 1) c = '#4a1e0e';
      else if (ly < 6) c = ly === 1 ? '#f09a5a' : ly === 5 ? '#8a3416' : '#c25a2a';
      else {
        const row = Math.floor((ly - 6) / 5);
        const off = (row % 2) * 4;
        const yin = (ly - 6) % 5;
        const xin = (lx + off) % 8;
        c = yin === 4 ? '#a8441e' : xin === 0 ? '#c45a28' : yin === 0 ? '#f4a466' : '#e2763a';
        if (hash(Math.floor((lx + off) / 8), row + H.x) < 0.1 && yin !== 4 && xin !== 0) c = '#d0662e';
      }
      if (y >= ry1 - 3 && c !== '#4a1e0e') c = '#9a3c1a';
      if (x >= rx1 - 5 && c !== '#4a1e0e' && ly >= 6 && c !== '#9a3c1a') c = c === '#f4a466' ? '#d88a4e' : '#b85a2a';
      sp(b, x, y, c);
    }
  }
  const cxm = X + W - 16;
  rect(b, cxm, Y - 11, 7, 10, '#6a6a74');
  rect(b, cxm, Y - 11, 7, 2, '#a8a8b4');
  rect(b, cxm, Y - 11, 1, 10, '#4a4a54');
  rect(b, cxm - 1, Y - 12, 9, 1, '#3a3a44');
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
  for (const [lx, ly] of LAMPS) {
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
