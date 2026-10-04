// Character, monster, weapon and pickup sprites.
import type { MonsterId, WeaponDef } from '../data/types';
import { hash } from '../core/rng';
import { createBuffer, ell, finish, fromRows, rect, sp } from './pixelBuffer';

// ---------- player ----------
const PLAYER_PAL: Record<string, string> = {
  h: '#8a5434', H: '#6b3f27', b: '#e0b04a', S: '#d39a76', s: '#f6c8a0', e: '#221a2a', c: '#d8473c', C: '#962f2a',
  T: '#2f5a85', t: '#4a86b8', l: '#6e4a2c', L: '#f0cd60', p: '#4d3f58', k: '#3b2a20',
};
const PLAYER_TOP = [
  '....hhhh....', '...hhhhhh...', '..bbbbbbbb..', 'HHHHHHHHHHHH', '..SSSSSSSS..', '..ssssssess.', '..sssssssss.',
  '...ccccccC..', '..TccccccCT.', '.sTttttttTs.', '..llllLlll..', '..tttttttt..', '..pppppppp..',
];
const PLAYER_LEGS = [
  ['..ppp..ppp..', '..kkk..kkk..'],
  ['.ppp....ppp.', '.kk......kk.'],
  ['...ppp.ppp..', '...kkk.kkk..'],
];

/** Frame 0 = idle, 1-2 = walk. */
export function buildPlayerFrames(): HTMLCanvasElement[] {
  return PLAYER_LEGS.map((legs) => finish(fromRows(PLAYER_TOP.concat(legs), PLAYER_PAL), true));
}

// ---------- monsters ----------
/** Builds one animation frame (0-3); broken parts must visibly disappear. */
export type MonsterSpriteBuilder = (frame: number, headBroken: boolean, tailBroken: boolean) => HTMLCanvasElement;

function buildMossfang(f: number, broken: boolean): HTMLCanvasElement {
  const b = createBuffer(25, 17);
  const o = 1;
  const B = '#2f7d5c';
  const D = '#225e44';
  const L = '#cfe6a0';
  const M = '#b6ec7a';
  ell(b, 4 + o, 7 + o, 3.4, 1.6, D);
  sp(b, 1 + o, 6 + o, M);
  sp(b, 2 + o, 5 + o, M);
  ([[6, 0], [8, 1], [14, 0], [16, 1]] as const).forEach(([x, ph], i) => {
    const off = Math.round(Math.sin(((f + ph * 2) * Math.PI) / 2) * 1.3);
    rect(b, x + off + o, 10 + o, 2, 3, i % 2 ? D : '#2a6e50');
    sp(b, x + off + o, 13 + o, '#f4eed4');
    sp(b, x + off + 1 + o, 13 + o, '#f4eed4');
  });
  ell(b, 10.5 + o, 8 + o, 6.8, 3.7, B);
  ell(b, 10.5 + o, 10.2 + o, 4.6, 1.3, L);
  for (let x = 5; x <= 14; x++) {
    if (hash(x, 3) < 0.7) sp(b, x + o, 4 + o + (x % 3 === 0 ? -1 : 0), M);
    sp(b, x + o, 5 + o, hash(x, 9) < 0.5 ? M : B);
  }
  ell(b, 16.5 + o, 6.5 + o, 3.8, 3.1, B);
  rect(b, 18 + o, 6 + o, 3, 3, B);
  rect(b, 18 + o, 8 + o, 3, 1, '#7a1f1a');
  if (!broken) {
    // fangs
    sp(b, 19 + o, 9 + o, '#ffffff');
    sp(b, 21 + o, 8 + o, '#ffffff');
    sp(b, 18 + o, 9 + o, '#ffffff');
  }
  sp(b, 15 + o, 2 + o, D);
  sp(b, 15 + o, 3 + o, D);
  sp(b, 16 + o, 3 + o, D);
  sp(b, 16 + o, 2 + o, '#c86a6a');
  sp(b, 17 + o, 5 + o, '#fff06a');
  return finish(b);
}

function buildCinderhorn(f: number, hb: boolean, tb: boolean): HTMLCanvasElement {
  const b = createBuffer(37, 24);
  const o = 1;
  const B = '#3a2f31';
  const P = '#564749';
  const K = '#ff7a2e';
  const Y = '#ffc34d';
  if (!tb) {
    ell(b, 5 + o, 11 + o, 5, 2.1, B);
    sp(b, 1 + o, 10 + o, Y);
    sp(b, 2 + o, 10 + o, K);
    sp(b, 1 + o, 11 + o, K);
    sp(b, 0 + o, 10 + o, Y);
  } else {
    // stub
    ell(b, 8 + o, 11 + o, 2.6, 1.8, B);
    sp(b, 6 + o, 11 + o, K);
  }
  ([[9, 0], [13, 1], [21, 0], [25, 1]] as const).forEach(([x, ph], i) => {
    const off = Math.round(Math.sin(((f + ph * 2) * Math.PI) / 2) * 1.3);
    rect(b, x + off + o, 15 + o, 3, 4, i % 2 ? '#2a2224' : '#342b2d');
    rect(b, x + off + o, 19 + o, 3, 1, '#16100f');
  });
  ell(b, 17 + o, 12 + o, 11, 5.6, B);
  ell(b, 17 + o, 15 + o, 8, 1.4, '#2a2224');
  for (let x = 9; x <= 24; x += 3) {
    sp(b, x + o, 6 + o, P);
    sp(b, x + 1 + o, 6 + o, P);
    sp(b, x + o, 5 + o, P);
    sp(b, x + o, 4 + o, '#6e5d5f');
  }
  ([[11, 10], [12, 11], [13, 11], [14, 12], [18, 9], [19, 10], [19, 11], [20, 12], [23, 11], [24, 10], [15, 14], [16, 14], [25, 12]] as const).forEach(([x, y]) => sp(b, x + o, y + o, K));
  ([[13, 11], [19, 10], [24, 10]] as const).forEach(([x, y]) => sp(b, x + o, y + o, Y));
  ell(b, 28 + o, 11 + o, 4.6, 3.6, B);
  rect(b, 29 + o, 12 + o, 4, 2, P);
  sp(b, 32 + o, 12 + o, K);
  sp(b, 29 + o, 10 + o, '#ffb000');
  sp(b, 30 + o, 10 + o, '#ffe070');
  if (!hb) {
    ([[29, 8], [30, 7], [30, 6], [31, 5], [31, 4], [32, 3], [32, 2], [33, 1]] as const).forEach(([x, y], i) => {
      sp(b, x + o, y + o, '#ece2c6');
      if (i < 5) sp(b, x + 1 + o, y + o, '#b9a984');
    });
  } else {
    // snapped horn
    sp(b, 29 + o, 8 + o, '#b9a984');
    sp(b, 30 + o, 7 + o, '#8a7d60');
  }
  return finish(b);
}

export const MONSTER_SPRITES: Record<MonsterId, MonsterSpriteBuilder> = {
  mossfang: (f, hb) => buildMossfang(f, hb),
  cinderhorn: (f, hb, tb) => buildCinderhorn(f, hb, tb),
};

export const MONSTER_FRAMES = 4;

// ---------- weapons ----------
export function buildWeapon(w: WeaponDef): HTMLCanvasElement {
  if (w.type === 'hammer') {
    const b = createBuffer(15, 9);
    rect(b, 1, 4, 8, 2, '#6b4a2e');
    rect(b, 1, 4, 8, 1, '#9a7048');
    rect(b, 8, 1, 6, 7, w.color);
    rect(b, 8, 1, 6, 1, '#ffffff', 0.45);
    rect(b, 8, 7, 6, 1, '#000000', 0.3);
    return finish(b, false);
  }
  if (w.type === 'greatsword') {
    const b = createBuffer(21, 8);
    rect(b, 1, 3, 4, 2, '#6b4a2e');
    rect(b, 5, 1, 2, 6, '#c9a24a');
    rect(b, 7, 2, 11, 4, w.color);
    rect(b, 7, 2, 11, 1, '#ffffff', 0.55);
    rect(b, 7, 5, 11, 1, '#000000', 0.25);
    sp(b, 18, 3, w.color);
    sp(b, 18, 4, w.color);
    sp(b, 19, 3, w.color);
    return finish(b, false);
  }
  const b = createBuffer(15, 5);
  rect(b, 1, 2, 3, 1, '#6b4a2e');
  rect(b, 4, 1, 1, 3, '#c9a24a');
  rect(b, 5, 1, 8, 2, w.color);
  rect(b, 5, 1, 8, 1, '#ffffff', 0.45);
  sp(b, 13, 1, w.color);
  return finish(b, false);
}

// ---------- pickups ----------
export function buildOre(): HTMLCanvasElement {
  const b = createBuffer(13, 10);
  ell(b, 6.5, 6, 5, 3.2, '#6c7078');
  ell(b, 5, 5, 3, 2, '#8a8f98');
  ([[4, 3], [5, 2], [5, 3], [8, 3], [8, 4], [9, 2], [6, 6], [7, 6]] as const).forEach(([x, y]) => sp(b, x, y, '#7ad0ff'));
  sp(b, 5, 2, '#e6f6ff');
  sp(b, 9, 2, '#e6f6ff');
  return finish(b);
}

export function buildHerb(): HTMLCanvasElement {
  const b = createBuffer(12, 11);
  ([[5, 9], [5, 8], [5, 7], [4, 6], [6, 6], [3, 5], [7, 5], [2, 4], [8, 4], [5, 5], [4, 4], [6, 4], [5, 3]] as const).forEach(([x, y]) => sp(b, x, y, '#3fa34a'));
  ([[3, 3], [7, 2], [5, 2], [8, 3]] as const).forEach(([x, y]) => sp(b, x, y, '#ff4a5a'));
  sp(b, 7, 2, '#ffb0b0');
  return finish(b);
}

/** Soft radial glow used (additively) for lamps, lava and fire. */
export function buildGlow(size = 64): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (g) {
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
  }
  return c;
}
