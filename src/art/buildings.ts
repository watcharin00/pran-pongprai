// Signposts and hunter camps painted straight into the ground buffer.
import { T, type Camp, type Edge } from '../core/mapgen';
import { ell, line, rect, sp, type PixelBuffer } from './pixelBuffer';

export interface StaticLight {
  x: number;
  y: number;
  r: number;
  /** "r,g,b" */
  c: string;
  ga: number;
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
