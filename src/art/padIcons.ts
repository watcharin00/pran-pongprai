// Pixel-art faces for the action pad buttons: a metal frame (ornate gold for attack, gold for
// dodge / potion, silver for skills) around a lit coloured disc, with a pixel icon on top.
// Drawn once with the same pixel buffer + finish() as the sprites, cached as data URLs.
import type { SkillKind } from '../data/types';
import { createBuffer, ell, finish, line, rect, sp, toCanvas, type PixelBuffer } from './pixelBuffer';

const N = 48;
/** icon size on the face relative to the button */
const ICON_SCALE = 0.75;
const C = N / 2;

type Frame = 'ornate' | 'gold' | 'silver';
type Disc = readonly [string, string, string];

const METAL: Record<'gold' | 'silver', readonly [string, string, string]> = {
  gold: ['#fff0a8', '#e8b440', '#9a6814'],
  silver: ['#f6f8fc', '#b4bccb', '#5e6880'],
};

export const DISCS = {
  attack: ['#ffb27a', '#e8672a', '#8a2c10'],
  context: ['#fff3a8', '#e8b440', '#8a5c10'],
  dodge: ['#b4f4a8', '#3fae5a', '#1a4e28'],
  skill: ['#94d8ff', '#2f86c8', '#123a62'],
  potion: ['#ffb8c4', '#d8405a', '#6a1428'],
} as const satisfies Record<string, Disc>;

/** Mixes two hex colours. */
function mix(a: string, b: string, t: number): string {
  const p = (h: string, i: number): number => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const ch = (i: number): string => Math.round(p(a, i) + (p(b, i) - p(a, i)) * Math.max(0, Math.min(1, t))).toString(16).padStart(2, '0');
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}

function drawFrame(b: PixelBuffer, frame: Frame, disc: Disc): void {
  const [hi, mid, lo] = METAL[frame === 'silver' ? 'silver' : 'gold'];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x + 0.5 - C;
      const dy = y + 0.5 - C;
      const d = Math.hypot(dx, dy);
      if (d > C - 0.5) continue;
      // light from the top-left: +1 facing it, -1 facing away
      const lit = d > 0 ? -(dx + dy) / (d * Math.SQRT2) : 0;
      let c: string;
      if (d > C - 1.5) c = '#16202e';
      else if (d > C - 5) {
        // bevelled metal ring with a bright inner lip
        const t = (lit + 1) / 2;
        c = t > 0.7 ? hi : t > 0.32 ? mid : lo;
        if (d < C - 4) c = mix(c, '#2a1a10', 0.35);
        // engraved ticks around the ring
        const a = Math.atan2(dy, dx);
        if (frame !== 'silver' && Math.abs(Math.sin(a * 6)) < 0.12 && d > C - 4) c = lo;
      } else if (d > C - 6) c = '#1c1410';
      else {
        // disc: bright where the light hits (top-left), dark rim
        const lx = dx + 5;
        const ly = dy + 6;
        const k = Math.min(1, Math.hypot(lx, ly) / (C - 2));
        c = k < 0.45 ? mix(disc[0], disc[1], k / 0.45) : mix(disc[1], disc[2], (k - 0.45) / 0.55);
      }
      sp(b, x, y, c);
    }
  }
  if (frame === 'ornate') {
    // four set gems on the ring
    for (const [gx, gy] of [[C, 2.5], [N - 2.5, C], [C, N - 2.5], [2.5, C]] as const) {
      ell(b, gx, gy, 2.6, 2.6, '#16202e');
      ell(b, gx, gy, 1.8, 1.8, '#d8243c');
      sp(b, gx - 1, gy - 1, '#ffb0b8');
    }
  }
}

// ---------------------------------------------------------------- icons (drawn on their own layer, then outlined)

type Icon = (b: PixelBuffer) => void;

const thick = (b: PixelBuffer, x0: number, y0: number, x1: number, y1: number, c: string, w: number): void => {
  for (let i = 0; i < w; i++) {
    line(b, x0 + i, y0, x1 + i, y1, c);
  }
};

const sword: Icon = (b) => {
  // broad blade from the top-right down to the guard: bright edge, steel body, dark fuller
  thick(b, 33, 7, 17, 23, '#dfe7f0', 5);
  line(b, 34, 7, 18, 23, '#ffffff');
  line(b, 35, 8, 20, 23, '#ffffff');
  line(b, 35, 9, 21, 23, '#9aa8bc');
  rect(b, 34, 5, 4, 3, '#ffffff');
  // cross-guard, grip, pommel
  thick(b, 11, 19, 21, 29, '#e8b440', 3);
  line(b, 11, 19, 21, 29, '#fff0a8');
  thick(b, 15, 26, 10, 31, '#7a4a24', 3);
  ell(b, 9, 33, 2.6, 2.6, '#e8b440');
  sp(b, 8, 32, '#fff0a8');
};

/** Tapered crescent along a circle arc: thickest in the middle, light on the outer edge. */
function crescent(b: PixelBuffer, cx: number, cy: number, r: number, a0: number, a1: number, wMax: number, cols: readonly [string, string, string]): void {
  for (let a = a0; a <= a1; a += 0.015) {
    const t = (a - a0) / (a1 - a0);
    const w = Math.max(1, wMax * Math.sin(t * Math.PI));
    for (let k = 0; k < w; k += 0.5) {
      const rr = r - k;
      const c = k < 1 ? cols[0] : k < w * 0.6 ? cols[1] : cols[2];
      sp(b, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, c);
    }
  }
}

const wind: Icon = (b) => {
  // a rolling swoosh: one big crescent curling over, an arrow head, motion lines behind
  crescent(b, 25, 23, 12, Math.PI * 0.9, Math.PI * 2.05, 5, ['#ffffff', '#b8f8ec', '#4fd0c0']);
  const hx = Math.round(25 + Math.cos(Math.PI * 2.05) * 10);
  const hy = Math.round(23 + Math.sin(Math.PI * 2.05) * 10);
  for (let i = 0; i < 4; i++) rect(b, hx - 3 + i, hy - 1 + i, 7 - i * 2, 1, '#ffffff');
  rect(b, 7, 25, 6, 2, '#b8f8ec');
  rect(b, 9, 30, 8, 2, '#4fd0c0');
  rect(b, 5, 20, 5, 1, '#e8fff8');
};

const potion: Icon = (b) => {
  rect(b, 20, 7, 8, 3, '#a8703c');
  rect(b, 20, 7, 8, 1, '#d8a060');
  rect(b, 21, 10, 6, 5, '#d8eef8');
  ell(b, C, 23, 9, 9, '#cfe6f2');
  ell(b, C, 25, 8, 7, '#e8344a');
  ell(b, C - 2, 23, 3, 2, '#ff8a98');
  rect(b, 17, 18, 2, 4, '#ffffff');
  sp(b, 29, 27, '#ff8a98');
};

const whirl: Icon = (b) => {
  // three blades sweeping round a centre
  for (let i = 0; i < 3; i++) {
    const a0 = (i / 3) * Math.PI * 2 - 0.4;
    crescent(b, C, 21, 13, a0, a0 + Math.PI * 0.55, 4, ['#ffffff', '#c8f0ff', '#5ab0e8']);
  }
  ell(b, C, 21, 3, 3, '#e8b440');
  ell(b, C - 1, 20, 1.2, 1.2, '#fff0a8');
};

const bolt: Icon = (b) => {
  const pts: [number, number][] = [
    [30, 7],
    [18, 22],
    [25, 22],
    [17, 35],
    [32, 17],
    [25, 17],
  ];
  // filled zigzag: scanline fill of the polygon
  for (let y = 6; y < 36; y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i] ?? [0, 0];
      const [x1, y1] = pts[(i + 1) % pts.length] ?? [0, 0];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i] ?? 0); x <= Math.round(xs[i + 1] ?? 0); x++) sp(b, x, y, y < 20 ? '#fff6b0' : '#ffd35c');
  }
  line(b, 29, 8, 20, 20, '#ffffff');
  // speed streaks
  rect(b, 9, 14, 7, 1, '#e8f6ff');
  rect(b, 7, 19, 8, 1, '#bfe8ff');
  rect(b, 10, 24, 6, 1, '#e8f6ff');
};

const burst: Icon = (b) => {
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = i % 2 ? 9 : 14;
    thick(b, C, 21, Math.round(C + Math.cos(a) * r), Math.round(21 + Math.sin(a) * r), '#ff8a2a', 2);
  }
  ell(b, C, 21, 8, 8, '#ff6a2a');
  ell(b, C, 21, 5.5, 5.5, '#ffd35c');
  ell(b, C - 1, 20, 2.5, 2.5, '#fff6d0');
  // cracked ground under the blast
  line(b, 12, 33, 20, 30, '#7a4a24');
  line(b, 28, 30, 36, 33, '#7a4a24');
  line(b, 20, 30, 28, 30, '#a8703c');
};

const slash: Icon = (b) => {
  for (let a = -0.9; a <= 0.9; a += 0.02) {
    const w = 3.2 * Math.cos(a * 1.7);
    for (let k = 0; k < w; k += 0.5) {
      const r = 14 - k;
      sp(b, C + Math.cos(a - 0.8) * r - 2, 23 + Math.sin(a - 0.8) * r + 2, k < 1 ? '#ffffff' : k < 2 ? '#c8f0ff' : '#6ac0f0');
    }
  }
  // sparkle at the tip
  rect(b, 34, 7, 1, 5, '#ffffff');
  rect(b, 32, 9, 5, 1, '#ffffff');
};

const arrows: Icon = (b) => {
  for (const [dx, dy] of [
    [-6, 3],
    [0, 0],
    [6, 3],
  ] as const) {
    const x0 = 15 + dx;
    const y0 = 33 + dy;
    const x1 = 31 + dx;
    const y1 = 10 + dy;
    line(b, x0, y0, x1, y1, '#8a5530');
    line(b, x0 + 1, y0, x1 + 1, y1, '#b07848');
    // head
    rect(b, x1 - 1, y1 - 1, 3, 3, '#e8eef4');
    sp(b, x1 + 1, y1 - 2, '#ffffff');
    // fletching
    rect(b, x0 - 2, y0 - 1, 2, 2, '#d8473c');
    rect(b, x0, y0 + 1, 2, 2, '#d8473c');
  }
};

const SKILL_ICONS: Record<SkillKind, Icon> = {
  radial: whirl,
  dash: bolt,
  windupArea: burst,
  windupLine: slash,
  projectile: arrows,
};

const cache = new Map<string, string>();

function face(key: string, frame: Frame, disc: Disc, icon: Icon): string {
  const hit = cache.get(key);
  if (hit) return hit;
  const base = createBuffer(N, N);
  drawFrame(base, frame, disc);
  const layer = createBuffer(N, N);
  icon(layer);
  const canvas = toCanvas(base);
  const g = canvas.getContext('2d');
  if (g) {
    // icons are drawn on a full-size layer, then placed a little smaller and higher so the
    // button's text label fits underneath; nearest-neighbour keeps the pixels crisp
    g.imageSmoothingEnabled = false;
    const k = ICON_SCALE;
    g.drawImage(finish(layer), Math.round((N - N * k) / 2), 3, Math.round(N * k), Math.round(N * k));
  }
  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}

export type PadFace = 'attack' | 'context' | 'dodge' | 'potion';

export function padFaceUrl(kind: PadFace): string {
  switch (kind) {
    case 'attack':
      return face(kind, 'ornate', DISCS.attack, sword);
    case 'context':
      return face(kind, 'ornate', DISCS.context, sword);
    case 'dodge':
      return face(kind, 'gold', DISCS.dodge, wind);
    case 'potion':
      return face(kind, 'gold', DISCS.potion, potion);
  }
}

/** Skill buttons: silver frame, icon by skill kind. */
export function skillFaceUrl(kind: SkillKind): string {
  return face(`sk:${kind}`, 'silver', DISCS.skill, SKILL_ICONS[kind]);
}

// ---------------------------------------------------------------- HUD menu tiles (right rail)

const M = 24;

/** Wooden tile with a gold rim (rounded corners), for the menu buttons. */
function drawTile(b: PixelBuffer): void {
  for (let y = 0; y < M; y++) {
    for (let x = 0; x < M; x++) {
      const e = Math.min(x, y, M - 1 - x, M - 1 - y);
      // round the corners off
      const cx = Math.min(x, M - 1 - x);
      const cy = Math.min(y, M - 1 - y);
      if (cx + cy < 2) continue;
      let c: string;
      if (e === 0 || cx + cy === 2) c = '#16202e';
      else if (e === 1) c = x + y < M - 1 ? (y <= 1 || x <= 1 ? '#fff0a8' : '#e8b440') : x >= M - 2 || y >= M - 2 ? '#9a6814' : '#e8b440';
      else if (e === 2) c = '#3a2410';
      else {
        // planks: lighter at the top, a dark seam every 6 rows
        const seam = (y - 3) % 6 === 5;
        c = seam ? '#4a2c14' : mix('#9a6436', '#6a3e1c', (y - 3) / (M - 6));
        if (!seam && (y - 3) % 6 === 0) c = mix(c, '#ffffff', 0.08);
        if (e === 3 && (x === 3 || y === 3)) c = mix(c, '#000000', 0.25);
      }
      sp(b, x, y, c);
    }
  }
}

type MenuIcon = (b: PixelBuffer) => void;

const MENU_ICONS: Record<'bag' | 'forge' | 'kitchen' | 'farm' | 'book' | 'map', MenuIcon> = {
  // leather backpack with a flap and a gold buckle
  bag: (b) => {
    rect(b, 7, 8, 10, 10, '#a8703c');
    rect(b, 7, 8, 10, 1, '#c8884a');
    rect(b, 8, 5, 8, 4, '#c8884a');
    rect(b, 9, 4, 6, 1, '#7a4a24');
    rect(b, 7, 9, 10, 4, '#b87a40');
    rect(b, 11, 11, 2, 2, '#e8b440');
    rect(b, 9, 14, 6, 3, '#8a5530');
    rect(b, 6, 10, 1, 7, '#7a4a24');
    rect(b, 17, 10, 1, 7, '#7a4a24');
  },
  // hammer crossed with tongs, a blue spark
  forge: (b) => {
    line(b, 6, 18, 15, 9, '#8a5a30');
    line(b, 7, 18, 16, 9, '#a8703c');
    rect(b, 13, 5, 6, 4, '#8a94a8');
    rect(b, 13, 5, 6, 1, '#d8e0ec');
    line(b, 17, 18, 8, 9, '#b4bccb');
    line(b, 18, 18, 9, 9, '#e8eef4');
    rect(b, 7, 7, 3, 2, '#b4bccb');
    sp(b, 18, 13, '#8ad4ff');
    sp(b, 19, 12, '#ffffff');
    sp(b, 17, 12, '#8ad4ff');
  },
  // a pot of curry with steam
  kitchen: (b) => {
    ell(b, 12, 14, 6.5, 5, '#4a4a56');
    ell(b, 12, 11, 6.5, 1.8, '#6a6a78');
    ell(b, 12, 11, 5, 1.2, '#e8902e');
    sp(b, 10, 11, '#ffd35c');
    rect(b, 4, 12, 2, 2, '#4a4a56');
    rect(b, 18, 12, 2, 2, '#4a4a56');
    for (const [x, y] of [[10, 8], [11, 7], [10, 6], [14, 8], [13, 7], [14, 5]] as const) sp(b, x, y, '#ffffff');
  },
  // a sprout in a mound of soil
  farm: (b) => {
    ell(b, 12, 17, 7, 3, '#7a4a24');
    ell(b, 12, 16, 6, 2, '#9a6436');
    rect(b, 11, 10, 2, 6, '#3f8a2e');
    ell(b, 8.5, 10, 3.5, 2, '#5fc26a');
    ell(b, 15.5, 8.5, 3.5, 2, '#5fc26a');
    sp(b, 7, 9, '#a8f0a0');
    sp(b, 15, 7, '#a8f0a0');
  },
  // a rolled scroll (the bestiary)
  book: (b) => {
    rect(b, 8, 5, 9, 13, '#f3e4c2');
    rect(b, 7, 4, 11, 2, '#d8c49a');
    rect(b, 7, 17, 11, 2, '#d8c49a');
    rect(b, 6, 4, 1, 2, '#a8803c');
    rect(b, 18, 17, 1, 2, '#a8803c');
    for (const y of [8, 10, 12, 14]) rect(b, 10, y, y === 14 ? 3 : 5, 1, '#8a7050');
  },
  // treasure map: a dashed path and a red X
  map: (b) => {
    rect(b, 5, 6, 14, 12, '#f1d696');
    rect(b, 5, 6, 14, 1, '#dcb46e');
    rect(b, 9, 6, 1, 12, '#dcb46e');
    rect(b, 14, 6, 1, 12, '#dcb46e');
    for (const [x, y] of [[7, 15], [8, 14], [10, 13], [11, 12], [12, 11]] as const) sp(b, x, y, '#8a5530');
    line(b, 14, 8, 17, 11, '#d8243c');
    line(b, 17, 8, 14, 11, '#d8243c');
  },
};

export type MenuTile = keyof typeof MENU_ICONS;

/** Menu rail button: wooden tile + item icon. */
export function menuTileUrl(kind: MenuTile): string {
  const key = `menu:${kind}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const base = createBuffer(M, M);
  drawTile(base);
  const layer = createBuffer(M, M);
  MENU_ICONS[kind](layer);
  const canvas = toCanvas(base);
  canvas.getContext('2d')?.drawImage(finish(layer), 0, 0);
  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}
