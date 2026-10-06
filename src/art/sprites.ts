// Character, monster, weapon and pickup sprites.
import type { MonsterId, NpcId, WeaponDef } from '../data/types';
import { hash } from '../core/rng';
import { createBuffer, ell, finish, fromRows, line, rect, sp, type PixelBuffer } from './pixelBuffer';

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

// ---------- villagers ----------
const SKIN = { S: '#d39a76', s: '#f6c8a0', e: '#221a2a' };
interface NpcArt {
  rows: readonly string[];
  pal: Record<string, string>;
  /** leg rows per frame (idle, walk A, walk B) */
  legs?: readonly (readonly string[])[];
}
const NPC_ART: Record<NpcId, NpcArt> = {
  // blacksmith: red headband, leather apron
  smith: {
    rows: ['............', '...HHHHHH...', '..HHHHHHHH..', '..bbbbbbbb..', '..SSSSSSSS..', '..ssssssess.', '..sssssssss.', '...ssssss...', '..TaaaaaaT..', '.sTaaaaaaTs.', '..taaaaaat..', '..taaaaaat..', '..pppppppp..'],
    pal: { ...SKIN, H: '#2a2420', b: '#d8473c', a: '#5a4a3c', T: '#7a5a40', t: '#8a6a4c', p: '#3a3440', k: '#2a2018' },
  },
  // cook: white head wrap, pink blouse, apron, sarong
  cook: {
    rows: ['....hhhh....', '...hhhhhh...', '..hhhhhhhh..', '..HHHHHHHH..', '..SSSSSSSS..', '..ssssssess.', '..sssssssss.', '...ssssss...', '..TaaaaaaT..', '.sTaaaaaaTs.', '..TaaaaaaT..', '..aaaaaaaa..', '..pppppppp..'],
    pal: { ...SKIN, h: '#f4f0e6', H: '#3a2a20', T: '#d86a8a', a: '#f4f0e6', p: '#6a3a58', k: '#3b2a20' },
  },
  // village elder: white hair and beard, indigo farmer shirt
  elder: {
    rows: ['............', '...wwwwww...', '..wwwwwwww..', '..wSSSSSSw..', '..SSSSSSSS..', '..ssssssess.', '..swwwwwwss.', '...swwwws...', '..TTttttTT..', '.sTttttttTs.', '..TtttttTT..', '..tttttttt..', '..pppppppp..'],
    pal: { ...SKIN, w: '#f0ece4', T: '#3a5a7a', t: '#4a6e94', p: '#2a2a34', k: '#3b2a20' },
  },
  // buffalo boy: wide straw hat, red shirt, shorts, bare feet
  kid: {
    rows: ['............', '............', '...hhhhhh...', '.HHHHHHHHHH.', '...SSSSSS...', '...ssssess..', '...sssssss..', '...cccccc...', '..sccccccs..', '...tttttt...', '...pppppp...'],
    pal: { ...SKIN, h: '#e8c050', H: '#c89a30', c: '#d8473c', t: '#b8382c', p: '#3a5a8a', k: '#d39a76' },
    legs: [
      ['...ss..ss...', '...kk..kk...'],
      ['..ss....ss..', '..kk....kk..'],
      ['....ss.ss...', '....kk.kk...'],
    ],
  },
};

/** Frame 0 = idle, 1-2 = walk, same layout as the player. */
export function buildNpcFrames(id: NpcId): HTMLCanvasElement[] {
  const art = NPC_ART[id];
  return (art.legs ?? PLAYER_LEGS).map((legs) => finish(fromRows(art.rows.concat(legs), art.pal), true));
}

// ---------- monsters ----------
/** Builds one animation frame (0-3); broken parts must visibly disappear. */
export type MonsterSpriteBuilder = (frame: number, headBroken: boolean, tailBroken: boolean) => HTMLCanvasElement;

type Leg = readonly [x: number, phase: number];

/** Four legs with a walk cycle; odd legs drawn darker, then a 1px foot. */
function legs(b: PixelBuffer, f: number, xs: readonly Leg[], y: number, w: number, h: number, light: string, dark: string, foot: string): void {
  xs.forEach(([x, ph], i) => {
    const off = Math.round(Math.sin(((f + ph * 2) * Math.PI) / 2) * 1.3);
    rect(b, x + off, y, w, h, i % 2 ? dark : light);
    rect(b, x + off, y + h, w, 1, foot);
  });
}

/** หมาใน (dhole): rusty red wild dog, black bushy tail. Head part = fangs. */
function buildDhole(f: number, broken: boolean): HTMLCanvasElement {
  const b = createBuffer(25, 17);
  const o = 1;
  const B = '#c0582e';
  const D = '#8e3e20';
  const L = '#f0d8b0';
  ell(b, 4 + o, 7 + o, 3.6, 1.8, D);
  ell(b, 2 + o, 6.5 + o, 2, 1.5, '#2a1e1a');
  legs(b, f, [[6 + o, 0], [8 + o, 1], [14 + o, 0], [16 + o, 1]], 10 + o, 2, 3, B, D, '#3a2418');
  ell(b, 10.5 + o, 8 + o, 6.6, 3.4, B);
  ell(b, 10.5 + o, 10 + o, 4.6, 1.3, L);
  for (let x = 6; x <= 14; x++) if (hash(x, 5) < 0.5) sp(b, x + o, 5 + o, '#d87040');
  // head with pointed ears and a dark muzzle
  ell(b, 16.5 + o, 6.5 + o, 3.6, 3, B);
  sp(b, 15 + o, 3 + o, D);
  sp(b, 15 + o, 2 + o, D);
  sp(b, 17 + o, 3 + o, D);
  sp(b, 17 + o, 2 + o, '#2a1e1a');
  rect(b, 18 + o, 6 + o, 3, 2, L);
  sp(b, 21 + o, 6 + o, '#2a1e1a');
  rect(b, 18 + o, 8 + o, 3, 1, '#7a1f1a');
  if (!broken) {
    sp(b, 19 + o, 9 + o, '#ffffff');
    sp(b, 21 + o, 8 + o, '#ffffff');
  }
  sp(b, 17 + o, 5 + o, '#221a2a');
  return finish(b);
}

/** ไก่ป่า (red junglefowl): red comb, golden hackles, arched dark tail. Head part = comb. */
function buildJunglefowl(f: number, broken: boolean): HTMLCanvasElement {
  const b = createBuffer(19, 17);
  const o = 1;
  ([[2, 3], [1, 4], [1, 5], [2, 6], [3, 7]] as const).forEach(([x, y]) => rect(b, x + o, y + o, 2, 1, '#1e4a5e'));
  ([[3, 2], [4, 3], [4, 4], [5, 5]] as const).forEach(([x, y]) => sp(b, x + o, y + o, '#2a6e50'));
  const step = Math.round(Math.sin((f * Math.PI) / 2) * 1.2);
  rect(b, 8 + step + o, 11 + o, 1, 3, '#8a8f98');
  rect(b, 10 - step + o, 11 + o, 1, 3, '#6c7078');
  rect(b, 7 + step + o, 14 + o, 3, 1, '#6c7078');
  rect(b, 9 - step + o, 14 + o, 3, 1, '#5a5e66');
  ell(b, 8.5 + o, 8.5 + o, 4.5, 3.2, '#1e3a2e');
  ell(b, 8 + o, 7.5 + o, 3, 1.6, '#2a5a44');
  // golden hackles + head
  ell(b, 12 + o, 6 + o, 2.4, 3, '#e8902e');
  ell(b, 13 + o, 5 + o, 2, 1.8, '#d8803a');
  sp(b, 13 + o, 4 + o, '#221a2a');
  rect(b, 15 + o, 5 + o, 2, 1, '#f0c040');
  sp(b, 14 + o, 7 + o, '#e0302a');
  if (!broken) {
    // tall serrated comb
    ([[11, 2], [12, 1], [12, 2], [13, 0], [13, 1], [13, 2], [14, 1], [14, 2], [15, 2], [15, 3], [12, 3], [14, 3]] as const).forEach(([x, y]) => sp(b, x + o, y + o, '#ff2a2a'));
  } else {
    sp(b, 13 + o, 3 + o, '#a8302a');
  }
  return finish(b);
}

/** หมูป่า (wild boar): grey-brown, bristly mane, white tusks. Head = tusks, tail part = mane. */
function buildBoar(f: number, hb: boolean, tb: boolean): HTMLCanvasElement {
  const b = createBuffer(31, 21);
  const o = 1;
  const B = '#5e4a3c';
  const D = '#3e3028';
  sp(b, 3 + o, 10 + o, D);
  sp(b, 2 + o, 11 + o, D);
  legs(b, f, [[7 + o, 0], [10 + o, 1], [18 + o, 0], [21 + o, 1]], 13 + o, 2, 3, B, D, '#1e1612');
  ell(b, 13.5 + o, 10 + o, 9.5, 4.8, B);
  ell(b, 13 + o, 12.5 + o, 7, 1.6, '#6e5a4a');
  if (!tb) {
    // bristle mane along the back
    for (let x = 7; x <= 20; x++) {
      const h = 2 + Math.round(hash(x, 11) * 1.5);
      rect(b, x + o, 7 - h + o, 1, h, x % 2 ? '#2a2220' : '#3a3030');
    }
  }
  ell(b, 23.5 + o, 10 + o, 4.4, 3.8, B);
  rect(b, 26 + o, 10 + o, 3, 3, '#b08878');
  sp(b, 28 + o, 11 + o, '#4a2a22');
  sp(b, 22 + o, 6 + o, D);
  sp(b, 23 + o, 5 + o, D);
  sp(b, 24 + o, 8 + o, '#221a2a');
  if (!hb) {
    sp(b, 26 + o, 9 + o, '#f4eed4');
    sp(b, 27 + o, 8 + o, '#f4eed4');
    sp(b, 25 + o, 13 + o, '#f4eed4');
  }
  return finish(b);
}

/** กระทิงผาแดง (canyon gaur): near-black bull, white stockings, ember cracks, fire-tipped tail. */
function buildGaur(f: number, hb: boolean, tb: boolean): HTMLCanvasElement {
  const b = createBuffer(37, 24);
  const o = 1;
  const B = '#3a2a24';
  const P = '#4e3a30';
  const K = '#ff7a2e';
  const Y = '#ffc34d';
  if (!tb) {
    line(b, 2 + o, 11 + o, 7 + o, 10 + o, B);
    line(b, 2 + o, 12 + o, 7 + o, 11 + o, B);
    ell(b, 1.5 + o, 11.5 + o, 1.6, 1.6, K);
    sp(b, 0 + o, 10 + o, Y);
  } else {
    ell(b, 7 + o, 11 + o, 1.8, 1.4, B);
    sp(b, 6 + o, 11 + o, K);
  }
  ([[9, 0], [13, 1], [21, 0], [25, 1]] as const).forEach(([x, ph], i) => {
    const off = Math.round(Math.sin(((f + ph * 2) * Math.PI) / 2) * 1.3);
    rect(b, x + off + o, 15 + o, 3, 2, i % 2 ? '#2a1e1a' : '#342622');
    rect(b, x + off + o, 17 + o, 3, 2, '#f0ead8');
    rect(b, x + off + o, 19 + o, 3, 1, '#16100f');
  });
  ell(b, 17 + o, 12 + o, 11, 5.4, B);
  // shoulder hump
  ell(b, 22 + o, 8 + o, 5, 3, P);
  ell(b, 17 + o, 15 + o, 8, 1.3, '#2a1e1a');
  ([[11, 10], [12, 11], [13, 11], [14, 12], [18, 9], [19, 10], [19, 11], [15, 14], [16, 14]] as const).forEach(([x, y]) => sp(b, x + o, y + o, K));
  ([[13, 11], [19, 10]] as const).forEach(([x, y]) => sp(b, x + o, y + o, Y));
  ell(b, 28 + o, 11 + o, 4.4, 3.6, B);
  rect(b, 30 + o, 12 + o, 3, 2, P);
  sp(b, 32 + o, 13 + o, '#b8a890');
  sp(b, 29 + o, 10 + o, '#ffb000');
  rect(b, 27 + o, 8 + o, 3, 1, '#c8b890');
  if (!hb) {
    // horns curving up and inward
    // far horn (darker) then near horn: thick at the base, curving up and forward
    ([[30, 7], [30, 6], [31, 5], [31, 4], [32, 3]] as const).forEach(([x, y]) => sp(b, x + o, y + o, '#b9ab88'));
    ([[27, 7], [28, 7], [26, 6], [27, 6], [26, 5], [26, 4], [27, 3], [28, 2]] as const).forEach(([x, y]) => sp(b, x + o, y + o, '#ece2c6'));
    sp(b, 29 + o, 2 + o, '#3a3028');
    sp(b, 33 + o, 3 + o, '#3a3028');
  } else {
    sp(b, 27 + o, 7 + o, '#b9a984');
    sp(b, 30 + o, 7 + o, '#b9a984');
  }
  return finish(b);
}

/** เสือโคร่ง (tiger): orange with black stripes, white muzzle. Head = fangs, tail = long striped tail. */
function buildTiger(f: number, hb: boolean, tb: boolean): HTMLCanvasElement {
  const b = createBuffer(39, 22);
  const o = 1;
  const B = '#e8902e';
  const D = '#c8701e';
  const S = '#2a1e1a';
  const W = '#f8f0e0';
  if (!tb) {
    const pts: [number, number][] = [[1, 4], [2, 5], [3, 6], [4, 7], [5, 8], [6, 9], [7, 9], [8, 10]];
    pts.forEach(([x, y], i) => rect(b, x + o, y + o, 2, 2, i < 2 || i % 2 ? S : B));
  } else {
    rect(b, 7 + o, 9 + o, 2, 2, B);
    sp(b, 7 + o, 9 + o, S);
  }
  legs(b, f, [[10 + o, 0], [13 + o, 1], [24 + o, 0], [27 + o, 1]], 14 + o, 3, 3, B, D, W);
  ell(b, 19 + o, 11 + o, 10.5, 4.6, B);
  ell(b, 19 + o, 13.5 + o, 8, 1.6, W);
  for (let x = 11; x <= 27; x += 3) line(b, x + o, 7 + o, x + 1 + o, 11 + o, S);
  ell(b, 31 + o, 9 + o, 4.6, 4, B);
  sp(b, 28 + o, 5 + o, B);
  sp(b, 28 + o, 4 + o, S);
  sp(b, 32 + o, 5 + o, B);
  sp(b, 32 + o, 4 + o, S);
  rect(b, 33 + o, 9 + o, 3, 3, W);
  sp(b, 36 + o, 9 + o, S);
  sp(b, 31 + o, 7 + o, '#9fe07a');
  line(b, 29 + o, 6 + o, 30 + o, 9 + o, S);
  rect(b, 33 + o, 12 + o, 3, 1, '#7a1f1a');
  if (!hb) {
    sp(b, 34 + o, 13 + o, '#ffffff');
    sp(b, 36 + o, 12 + o, '#ffffff');
  }
  return finish(b);
}

/** ลิงกัง (pig-tailed macaque): brown, crouched, pink face, short curled tail. Tail part = tail. */
function buildMacaque(f: number, tb: boolean): HTMLCanvasElement {
  const b = createBuffer(21, 18);
  const o = 1;
  const B = '#9a6a42';
  const D = '#6e4a2c';
  if (!tb) {
    ([[4, 9], [3, 8], [2, 7], [2, 6], [3, 5], [4, 5]] as const).forEach(([x, y]) => rect(b, x + o, y + o, 2, 1, D));
  } else {
    sp(b, 4 + o, 9 + o, D);
  }
  legs(b, f, [[6 + o, 0], [8 + o, 1], [12 + o, 0], [14 + o, 1]], 12 + o, 2, 3, B, D, '#3a2418');
  ell(b, 10 + o, 9.5 + o, 5.2, 3.6, B);
  ell(b, 9 + o, 8 + o, 3, 1.6, '#b08050');
  // head with a pale pink face
  ell(b, 15 + o, 6 + o, 3.2, 3, B);
  ell(b, 16.5 + o, 6.5 + o, 1.8, 1.8, '#e8a890');
  sp(b, 16 + o, 6 + o, '#221a2a');
  sp(b, 17 + o, 7 + o, '#b06a5a');
  sp(b, 14 + o, 3 + o, D);
  // arms reaching forward
  rect(b, 14 + o, 10 + o, 3, 1, D);
  return finish(b);
}

/** งูเห่า (cobra): coiled olive body, raised hood with eye marks. Head = hood, tail = tail tip. */
function buildCobra(f: number, hb: boolean, tb: boolean): HTMLCanvasElement {
  const b = createBuffer(25, 21);
  const o = 1;
  const B = '#4a6a3a';
  const D = '#33502a';
  const L = '#d8d0a0';
  const sway = Math.round(Math.sin((f * Math.PI) / 2));
  if (!tb) {
    ([[1, 16], [2, 16], [3, 15], [4, 15], [5, 15]] as const).forEach(([x, y]) => sp(b, x + o, y + o, D));
  }
  // coils
  ell(b, 10 + o, 15 + o, 6.5, 3, B);
  ell(b, 10 + o, 13 + o, 5, 2.2, D);
  ell(b, 10 + o, 12.2 + o, 3.6, 1.4, B);
  for (let x = 5; x <= 15; x += 3) sp(b, x + o, 16 + o, L);
  // neck rising
  rect(b, 13 + o + sway, 6 + o, 3, 7, B);
  rect(b, 14 + o + sway, 7 + o, 1, 6, L);
  // hood
  const hx = 14.5 + sway;
  if (!hb) {
    ell(b, hx + o, 6 + o, 4.4, 4, B);
    ell(b, hx + o, 6.5 + o, 2.2, 2.6, L);
    sp(b, hx - 2 + o, 5 + o, '#221a2a');
    sp(b, hx + 2 + o, 5 + o, '#221a2a');
  } else {
    ell(b, hx + o, 6 + o, 2.4, 3, B);
  }
  // head + tongue
  ell(b, hx + 1 + o, 2.5 + o, 2.2, 1.6, D);
  sp(b, hx + 2 + o, 2 + o, '#ffd84a');
  if (!hb) {
    sp(b, hx + 4 + o, 3 + o, '#e0302a');
    sp(b, hx + 5 + o, 2 + o, '#e0302a');
  }
  return finish(b);
}

/** Low sprawling legs for lizards: short, splayed, alternating. */
function lizardLegs(b: PixelBuffer, f: number, xs: readonly Leg[], y: number, c: string, claw: string): void {
  xs.forEach(([x, ph]) => {
    const off = Math.round(Math.sin(((f + ph * 2) * Math.PI) / 2) * 1.4);
    rect(b, x + off, y, 3, 2, c);
    rect(b, x + off - 1, y + 2, 2, 1, claw);
    rect(b, x + off + 2, y + 2, 2, 1, claw);
  });
}

/** ตะกวด (water monitor): long dark olive lizard with yellow speckles. Tail part = tail. */
function buildMonitor(f: number, tb: boolean): HTMLCanvasElement {
  const b = createBuffer(33, 15);
  const o = 1;
  const B = '#5a5a3a';
  const D = '#3e3e28';
  const sway = Math.round(Math.sin((f * Math.PI) / 2));
  if (!tb) {
    for (let x = 0; x <= 10; x++) {
      const y = 8 + Math.round(Math.sin(x * 0.5 + f) * 0.8 * (1 - x / 12)) - (x < 3 ? 0 : 0);
      rect(b, x + o, y + o, 1, x < 4 ? 1 : 2, x < 3 ? D : B);
    }
  } else {
    rect(b, 9 + o, 8 + o, 2, 2, B);
  }
  lizardLegs(b, f, [[11 + o, 0], [20 + o, 1]], 10 + o, D, '#c8b890');
  ell(b, 16 + o, 8 + o, 7, 2.6, B);
  ell(b, 16 + o, 9.5 + o, 5, 1, '#7a7a52');
  for (let x = 11; x <= 21; x += 2) sp(b, x + o, 7 + o + (x % 4 === 1 ? 0 : 1), '#e8d070');
  // neck + head, tongue flicks every other frame
  rect(b, 22 + o, 6 + o + sway * 0, 4, 3, B);
  ell(b, 27.5 + o, 7 + o, 3, 1.8, B);
  sp(b, 27 + o, 6 + o, '#221a2a');
  if (f % 2 === 0) {
    sp(b, 30 + o, 7 + o, '#e0302a');
    sp(b, 31 + o, 6 + o, '#e0302a');
    sp(b, 31 + o, 8 + o, '#e0302a');
  }
  return finish(b);
}

/** จระเข้ (crocodile): long, dark green, ridged back, toothy jaws. Head = jaws, tail = tail. */
function buildCrocodile(f: number, hb: boolean, tb: boolean): HTMLCanvasElement {
  const b = createBuffer(47, 19);
  const o = 1;
  const B = '#3e5a3a';
  const D = '#2a4028';
  const L = '#a8b880';
  const len = tb ? 6 : 15;
  for (let i = 0; i < len; i++) {
    const x = 15 - i;
    const h = Math.max(1, Math.round(3.5 - i * 0.22));
    const y = 9 + Math.round(Math.sin(i * 0.45 + f * 0.8) * (i / 10));
    rect(b, x + o, y - Math.floor(h / 2) + o, 1, h, i % 3 === 0 ? D : B);
    if (i % 3 === 1) sp(b, x + o, y - Math.floor(h / 2) - 1 + o, D);
  }
  lizardLegs(b, f, [[16 + o, 0], [19 + o, 1], [28 + o, 0], [31 + o, 1]], 12 + o, D, '#c8c0a0');
  ell(b, 24 + o, 9.5 + o, 10, 3.6, B);
  ell(b, 24 + o, 11.5 + o, 7.5, 1.2, L);
  // ridge scutes along the back
  for (let x = 15; x <= 33; x += 2) sp(b, x + o, 5 + o + (x % 4 === 1 ? 0 : 1), D);
  // head and long snout
  ell(b, 36 + o, 9 + o, 3.4, 2.6, B);
  rect(b, 37 + o, 8 + o, 8, 3, B);
  rect(b, 37 + o, 10 + o, 8, 1, D);
  sp(b, 36 + o, 7 + o, '#ffd84a');
  sp(b, 44 + o, 8 + o, D);
  if (!hb) {
    for (let x = 38; x <= 44; x += 2) {
      sp(b, x + o, 10 + o, '#f4eed4');
      sp(b, x + 1 + o, 11 + o, '#f4eed4');
    }
  } else {
    sp(b, 41 + o, 10 + o, '#8a6a5a');
  }
  return finish(b);
}

/** เลียงผา (serow): dark grey goat-antelope, pale mane, short back-swept horns. Head = horns. */
function buildSerow(f: number, hb: boolean): HTMLCanvasElement {
  const b = createBuffer(25, 20);
  const o = 1;
  const B = '#4a4a50';
  const D = '#34343a';
  sp(b, 3 + o, 8 + o, D);
  sp(b, 2 + o, 9 + o, D);
  legs(b, f, [[6 + o, 0], [8 + o, 1], [14 + o, 0], [16 + o, 1]], 12 + o, 2, 4, B, D, '#16100f');
  ell(b, 11 + o, 10 + o, 7, 3.6, B);
  ell(b, 11 + o, 12 + o, 5, 1.2, '#5e5e66');
  // pale mane over the shoulders
  for (let x = 12; x <= 17; x++) rect(b, x + o, 6 + o + (x % 2), 1, 2, '#c8c0b0');
  ell(b, 19 + o, 7 + o, 3.2, 2.8, B);
  rect(b, 20 + o, 8 + o, 3, 2, D);
  sp(b, 22 + o, 8 + o, '#16100f');
  sp(b, 19 + o, 6 + o, '#ffd84a');
  sp(b, 17 + o, 4 + o, D);
  if (!hb) {
    ([[18, 4], [17, 3], [16, 2], [15, 2]] as const).forEach(([x, y]) => sp(b, x + o, y + o, '#22222a'));
    ([[20, 4], [19, 3], [18, 2]] as const).forEach(([x, y]) => sp(b, x + o, y + o, '#3a3a44'));
  }
  return finish(b);
}

/** หมีควาย (Asiatic black bear): black, white V on the chest, short snout. Head = fangs (no tail part). */
function buildBear(f: number, hb: boolean): HTMLCanvasElement {
  const b = createBuffer(37, 26);
  const o = 1;
  const B = '#24242a';
  const D = '#16161c';
  legs(b, f, [[8 + o, 0], [12 + o, 1], [21 + o, 0], [25 + o, 1]], 16 + o, 4, 4, B, D, '#0e0e12');
  ell(b, 17 + o, 12 + o, 12, 6.4, B);
  ell(b, 14 + o, 9 + o, 6, 2, '#34343c');
  // white crescent on the chest
  ([[25, 13], [26, 14], [27, 15], [28, 14], [29, 13]] as const).forEach(([x, y]) => sp(b, x + o, y + o, '#f4eed4'));
  // head, round ears, tan snout
  ell(b, 30 + o, 9 + o, 4.6, 4.2, B);
  ell(b, 27 + o, 5 + o, 1.6, 1.6, B);
  ell(b, 32 + o, 5 + o, 1.6, 1.6, B);
  rect(b, 33 + o, 9 + o, 3, 3, '#a88a6a');
  sp(b, 35 + o, 9 + o, D);
  sp(b, 31 + o, 8 + o, '#e8d070');
  if (!hb) {
    sp(b, 34 + o, 12 + o, '#ffffff');
    sp(b, 35 + o, 12 + o, '#ffffff');
  }
  return finish(b);
}

/** เก้ง (barking deer): small reddish deer, short antlers. Head = antlers. */
function buildMuntjac(f: number, hb: boolean): HTMLCanvasElement {
  const b = createBuffer(21, 19);
  const o = 1;
  const B = '#b8693a';
  const D = '#8a4a26';
  sp(b, 3 + o, 7 + o, '#f4eed4');
  sp(b, 4 + o, 7 + o, B);
  legs(b, f, [[5 + o, 0], [7 + o, 1], [12 + o, 0], [14 + o, 1]], 11 + o, 1, 5, D, '#6a3a1c', '#16100f');
  ell(b, 10 + o, 9 + o, 5.6, 2.8, B);
  ell(b, 10 + o, 10.6 + o, 3.6, 0.9, '#e8c8a0');
  rect(b, 14 + o, 5 + o, 2, 4, B);
  ell(b, 16.5 + o, 4.5 + o, 2.4, 1.8, B);
  rect(b, 18 + o, 4 + o, 2, 2, D);
  sp(b, 16 + o, 4 + o, '#221a2a');
  sp(b, 15 + o, 2 + o, D);
  if (!hb) {
    ([[16, 2], [16, 1], [17, 0], [15, 1]] as const).forEach(([x, y]) => sp(b, x + o, y + o, '#e8d0a0'));
  }
  return finish(b);
}

/** ช้างป่า (wild elephant): grey giant, big ear, curled trunk, tail tuft. Head = trunk, tail = tail. */
function buildElephant(f: number, hb: boolean, tb: boolean): HTMLCanvasElement {
  const b = createBuffer(47, 33);
  const o = 1;
  const B = '#8a8a90';
  const D = '#6a6a72';
  const L = '#a8a8ae';
  if (!tb) {
    line(b, 4 + o, 13 + o, 1 + o, 20 + o, D);
    rect(b, 0 + o, 20 + o, 2, 3, '#2a2a2a');
  } else {
    sp(b, 4 + o, 13 + o, D);
  }
  // four pillar legs
  ([[8, 0], [13, 1], [26, 0], [31, 1]] as const).forEach(([x, ph], i) => {
    const off = Math.round(Math.sin(((f + ph * 2) * Math.PI) / 2) * 1);
    rect(b, x + off + o, 21 + o, 5, 8, i % 2 ? D : B);
    rect(b, x + off + o, 29 + o, 5, 1, '#e8e2d0');
  });
  ell(b, 20 + o, 14 + o, 16, 9, B);
  ell(b, 17 + o, 9 + o, 10, 3, L);
  ell(b, 20 + o, 20 + o, 12, 2, D);
  // head and large ear
  ell(b, 37 + o, 11 + o, 6, 6.5, B);
  ell(b, 33 + o, 12 + o, 4, 6, D);
  ell(b, 33 + o, 11 + o, 3, 4.6, '#c89a9a');
  sp(b, 39 + o, 9 + o, '#221a2a');
  if (!hb) {
    // trunk curling down and forward
    ([[41, 13], [41, 15], [42, 17], [42, 19], [42, 21], [43, 23], [44, 24]] as const).forEach(([x, y], i) => rect(b, x + o, y + o, i < 5 ? 3 : 2, 2, i % 2 ? L : B));
    sp(b, 41 + o, 15 + o, '#f4eed4');
  } else {
    rect(b, 41 + o, 13 + o, 2, 4, D);
  }
  return finish(b);
}

/** ค้างคาวแม่ไก่ (flying fox): dark leathery wings that flap, golden mantle, fox face. Head part = fangs. */
function buildFlyingfox(f: number, hb: boolean): HTMLCanvasElement {
  const b = createBuffer(27, 19);
  const o = 1;
  const W = '#4a3238';
  const WD = '#2e1e24';
  const B = '#3a2a2a';
  const M = '#d89a3a';
  // wings: four flap poses, membrane with finger ribs
  const lift = [-4, -1, 3, -1][f % 4] ?? 0;
  for (const side of [-1, 1] as const) {
    const sx = 12 + side * 2;
    for (let k = 1; k <= 9; k++) {
      const x = sx + side * k;
      const top = 8 + Math.round((lift * k) / 9) - (k < 5 ? 1 : 0);
      const bot = 11 + Math.round((lift * k) / 18) - Math.floor(k / 4);
      for (let y = top; y <= bot; y++) sp(b, x + o, y + o, y === top ? WD : (k % 3 === 0 ? WD : W));
    }
  }
  // body, golden mantle, small feet
  ell(b, 12 + o, 10 + o, 3.4, 3, B);
  ell(b, 13 + o, 8.5 + o, 2.6, 1.8, M);
  sp(b, 11 + o, 13 + o, WD);
  sp(b, 13 + o, 13 + o, WD);
  // fox-like head with pointed ears
  ell(b, 16 + o, 7.5 + o, 2.4, 2, '#5a3a2a');
  sp(b, 15 + o, 5 + o, WD);
  sp(b, 17 + o, 5 + o, WD);
  rect(b, 18 + o, 7 + o, 2, 2, '#6a4a34');
  sp(b, 20 + o, 7 + o, '#221a2a');
  sp(b, 17 + o, 7 + o, '#ffd84a');
  if (!hb) sp(b, 19 + o, 9 + o, '#ffffff');
  return finish(b);
}

/** เม่นใหญ่ (porcupine): stocky brown body under a fan of long black-and-white quills. Tail part = quill crest. */
function buildPorcupine(f: number, tb: boolean): HTMLCanvasElement {
  const b = createBuffer(29, 21);
  const o = 1;
  const B = '#5a4636';
  const D = '#3a2c22';
  legs(b, f, [[9 + o, 0], [11 + o, 1], [17 + o, 0], [19 + o, 1]], 15 + o, 2, 2, B, D, '#2a1e16');
  ell(b, 14 + o, 12 + o, 7.4, 4, B);
  // quills fan up and back (toward -x); broken crest leaves short stubs
  const len = tb ? 3 : 9;
  for (let i = 0; i < 9; i++) {
    const ang = Math.PI * (0.55 + i * 0.07);
    const bx = 9 + i * 1.3;
    const by = 9 + Math.abs(i - 4) * 0.3;
    const l = len - Math.abs(i - 3) * (tb ? 0.2 : 0.5);
    for (let k = 0; k < l; k++) {
      const x = Math.round(bx + Math.cos(ang) * k);
      const y = Math.round(by - Math.sin(ang) * k * 0.9);
      sp(b, x + o, y + o, k > l - 3 ? '#f4efe0' : k % 3 === 1 ? '#2a2420' : '#e8e0cc');
    }
  }
  // blunt head, small round ear, dark snout
  ell(b, 22 + o, 12 + o, 3.2, 2.6, B);
  sp(b, 21 + o, 9 + o, D);
  rect(b, 24 + o, 12 + o, 2, 2, '#7a6450');
  sp(b, 26 + o, 12 + o, '#221a2a');
  sp(b, 22 + o, 11 + o, '#221a2a');
  return finish(b);
}

/** งูจงอาง (king cobra): big olive coils with pale bands, tall neck, long narrow hood, long tail. Head part = hood. */
function buildKingcobra(f: number, hb: boolean, tb: boolean): HTMLCanvasElement {
  const b = createBuffer(41, 33);
  const o = 1;
  const B = '#5a6a3a';
  const D = '#3e4a28';
  const L = '#e8d890';
  const sway = Math.round(Math.sin((f * Math.PI) / 2) * 1.4);
  // tail trailing behind the coils; broken = cut short
  const tail: [number, number][] = tb
    ? [[8, 27], [9, 27], [10, 26]]
    : [[1, 28], [2, 28], [3, 28], [4, 27], [5, 27], [6, 27], [7, 27], [8, 27], [9, 27], [10, 26]];
  for (const [x, y] of tail) {
    sp(b, x + o, y + o, D);
    sp(b, x + o, y - 1 + o, B);
  }
  // two stacked coil loops (rings with a gap in the middle, so they read as a body, not a shell)
  const coil = (cx: number, cy: number, rx: number, ry: number, th: number): void => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const q = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
        const qi = ((x + 0.5 - cx) / (rx - th)) ** 2 + ((y + 0.5 - cy) / Math.max(0.8, ry - th * 0.55)) ** 2;
        if (q > 1 || qi <= 1) continue;
        // pale bands across the body, lit from above
        const band = Math.floor(x - cx + 40) % 5 === 0;
        sp(b, x + o, y + o, band ? L : y < cy ? B : D);
      }
    }
  };
  coil(16, 25.5, 10.5, 4.6, 3);
  coil(19, 21.5, 6.8, 3.2, 2.6);
  // neck rising from the top coil, banded belly
  rect(b, 22 + o + sway, 9 + o, 4, 11, B);
  for (let y = 10; y < 22; y += 3) rect(b, 23 + o + sway, y + o, 2, 1, L);
  // long narrow hood with pale chevrons
  const hx = 24 + sway;
  if (!hb) {
    ell(b, hx + o, 9 + o, 4.6, 6, B);
    ell(b, hx + o, 9.5 + o, 2.4, 4.4, '#8a9a5a');
    for (let y = 6; y <= 13; y += 3) {
      sp(b, hx - 1 + o, y + o, L);
      sp(b, hx + 1 + o, y + o, L);
    }
  } else {
    ell(b, hx + o, 9 + o, 2.6, 4, B);
  }
  // head with yellow throat, eye and forked tongue
  ell(b, hx + 2 + o, 3 + o, 3.2, 2.2, D);
  rect(b, hx + 2 + o, 4 + o, 3, 1, '#d8c060');
  sp(b, hx + 3 + o, 2 + o, '#ffd84a');
  if (!hb) {
    sp(b, hx + 6 + o, 3 + o, '#e0302a');
    sp(b, hx + 7 + o, 2 + o, '#e0302a');
    sp(b, hx + 7 + o, 4 + o, '#e0302a');
  }
  return finish(b);
}

export const MONSTER_SPRITES: Record<MonsterId, MonsterSpriteBuilder> = {
  flyingfox: (f, hb) => buildFlyingfox(f, hb),
  porcupine: (f, _hb, tb) => buildPorcupine(f, tb),
  kingcobra: (f, hb, tb) => buildKingcobra(f, hb, tb),
  muntjac: (f, hb) => buildMuntjac(f, hb),
  elephant: (f, hb, tb) => buildElephant(f, hb, tb),
  serow: (f, hb) => buildSerow(f, hb),
  bear: (f, hb) => buildBear(f, hb),
  monitor: (f, _hb, tb) => buildMonitor(f, tb),
  crocodile: (f, hb, tb) => buildCrocodile(f, hb, tb),
  macaque: (f, _hb, tb) => buildMacaque(f, tb),
  cobra: (f, hb, tb) => buildCobra(f, hb, tb),
  junglefowl: (f, hb) => buildJunglefowl(f, hb),
  dhole: (f, hb) => buildDhole(f, hb),
  boar: (f, hb, tb) => buildBoar(f, hb, tb),
  gaur: (f, hb, tb) => buildGaur(f, hb, tb),
  tiger: (f, hb, tb) => buildTiger(f, hb, tb),
};

export const MONSTER_FRAMES = 4;

// ---------- weapons ----------
export function buildWeapon(w: WeaponDef): HTMLCanvasElement {
  if (w.type === 'spear') {
    // long shaft, leaf-shaped tip; origin is the left end
    const b = createBuffer(25, 5);
    rect(b, 1, 2, 17, 1, '#8a6a3a');
    rect(b, 1, 2, 17, 1, '#b08a50', 0.5);
    sp(b, 6, 2, '#6b4a2e');
    sp(b, 12, 2, '#6b4a2e');
    rect(b, 18, 1, 1, 3, '#c9a24a');
    rect(b, 19, 1, 4, 3, w.color);
    sp(b, 23, 2, w.color);
    rect(b, 19, 1, 4, 1, '#ffffff', 0.5);
    return finish(b, false);
  }
  if (w.type === 'bow' && w.look === 'crossbow') {
    // stock pointing right with the bow limbs across the front
    const b = createBuffer(16, 13);
    rect(b, 1, 6, 11, 2, '#6b4a2e');
    rect(b, 1, 6, 11, 1, '#9a7048');
    line(b, 11, 1, 13, 6, w.color);
    line(b, 13, 7, 11, 11, w.color);
    sp(b, 13, 6, w.color);
    line(b, 11, 1, 9, 6, '#f4eed4');
    line(b, 9, 7, 11, 11, '#f4eed4');
    rect(b, 12, 6, 3, 1, '#dfe6ee');
    return finish(b, false);
  }
  if (w.type === 'bow') {
    // limbs bow out to the right (the firing direction); string on the left
    const b = createBuffer(10, 19);
    ([[3, 1], [4, 2], [5, 3], [6, 4], [6, 5], [7, 6], [7, 7], [7, 8], [7, 9], [7, 10], [7, 11], [7, 12], [6, 13], [6, 14], [5, 15], [4, 16], [3, 17]] as const).forEach(([x, y]) => sp(b, x, y, w.color));
    rect(b, 7, 8, 1, 3, '#6b4a2e');
    line(b, 3, 2, 3, 16, '#f4eed4');
    return finish(b, false);
  }
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
