// Rice paddy and fish pond art. The ground pass paints them pixel by pixel (soft,
// natural edges); crops on top are small pre-built textures swapped by growth stage.
import { COOP, COOP_GATE, FIELD_HUT, HENHOUSE, JETTY, NEST, PADDY, POND_AREA, POND_SHAPE, POND_SLOTS, pondDepth, T, TROUGH } from '../core/mapgen';
import { hash, vnoise } from '../core/rng';
import { createBuffer, ell, rect, sp, toCanvas, type PixelBuffer } from './pixelBuffer';

const pick = (a: readonly string[], v: number): string => a[Math.max(0, Math.min(a.length - 1, Math.floor(v * a.length)))] ?? a[0] ?? '#ff00ff';

// ---------------------------------------------------------------- paddy

/** Section borders inside the paddy, wobbling a pixel so bunds look hand-built, not ruled. */
function bundDistance(u: number, v: number, W: number, H: number): number {
  const wob = (k: number, s: number): number => Math.round(Math.sin(k * 0.31 + s) * 0.9 + (hash(k >> 2, s * 13) - 0.5) * 0.8);
  // the outer edge wobbles too, so the field has no ruled border
  let d = Math.min(u + wob(v, 3), W - 1 - u + wob(v, 5), v + wob(u, 11), H - 1 - v + wob(u, 13)) - 1;
  for (const cx of [32, 64]) d = Math.min(d, Math.abs(u - cx - wob(v, cx)));
  d = Math.min(d, Math.abs(v - 32 - wob(u, 7)));
  return d;
}

/** Earth bunds topped with grass between flooded sections of sky-reflecting water. */
export function drawPaddy(b: PixelBuffer): void {
  const X0 = PADDY.x0 * T;
  const Y0 = PADDY.y0 * T;
  const W = (PADDY.x1 - PADDY.x0 + 1) * T;
  const H = (PADDY.y1 - PADDY.y0 + 1) * T;
  // soft shadow of the outer bund on the surrounding grass
  for (let py = Y0 - 4; py < Y0 + H + 5; py++) {
    for (let px = X0 - 4; px < X0 + W + 5; px++) {
      const u = px - X0;
      const v = py - Y0;
      const inside = u >= 0 && v >= 0 && u < W && v < H;
      if (!inside) continue;
      const d = bundDistance(u, v, W, H);
      // outside the wobbly outer bund: leave the surrounding grass as painted
      if (d < -1) continue;
      let c: string;
      if (d <= 1) {
        // raised grassy bund, lit from the top-left
        const n = hash(px, py);
        c = d < 0 ? (n < 0.5 ? '#5ba03b' : '#68ad43') : n < 0.25 ? '#9ad460' : n < 0.6 ? '#86c25a' : '#76b94c';
        if (d === 1 && (v % 32 > 16 || u % 32 > 16)) c = '#4a8a2c';
      } else if (d === 2) c = '#5a4a2c'; // the bund's earthen side dropping into the water
      else if (d === 3) c = '#3e6a6a'; // its shadow on the water
      else {
        // clear paddy water reflecting the sky
        const n = vnoise(px, py, 9) * 0.8 + hash(px, py) * 0.25;
        c = Math.sin(px * 0.45 - py * 0.9 + vnoise(px, py, 7) * 4) > 0.88 ? '#cdeef0' : pick(['#4e98a4', '#5aa6b0', '#68b2ba', '#78bec4'], n);
        if (hash(px * 3, py * 5) < 0.02) c = '#6a7a50';
        // last season's stubble in faint rows, so even an empty field reads as a rice paddy
        else if (u % 5 === 2 && v % 6 === 3 && hash(u, v * 3) < 0.7) c = '#8aa868';
      }
      sp(b, px, py, c);
    }
  }
}

/** One paddy section's rice (32x32, transparent where the water shows). */
export function buildRiceSection(stage: number, sway: boolean): HTMLCanvasElement {
  const b = createBuffer(32, 32);
  const tall = [2, 4, 7, 8][stage] ?? 2;
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 7; col++) {
      const x = 4 + col * 4 + (row % 2) * 2;
      const y = 8 + row * 4;
      if (x > 28 || y > 29) continue;
      if (stage === 0) {
        if ((row + col) % 2) continue;
        sp(b, x, y, '#7ad866');
        sp(b, x + 1, y - 1, '#5fb84e');
        continue;
      }
      const golden = stage === 3;
      const dark = golden ? '#a88a30' : '#3f8a3a';
      const mid = golden ? '#d0b048' : '#5fb84e';
      const light = golden ? '#f0d470' : '#8ee070';
      for (let k = 0; k < tall; k++) {
        sp(b, x, y - k, k > tall - 3 ? light : mid);
        if (k < tall - 1) sp(b, x - 1, y - k + 1, dark);
        if (k < tall - 2) sp(b, x + 1, y - k + 1, mid);
      }
      if (golden) {
        // drooping grain heads
        const dx = sway ? 1 : 0;
        sp(b, x + 1 + dx, y - tall, '#ffd35c');
        sp(b, x + 2 + dx, y - tall + 1, '#ffd35c');
        sp(b, x + 2 + dx, y - tall + 2, '#e0a830');
      }
    }
  }
  return toCanvas(b);
}

// ---------------------------------------------------------------- pond

/** Water darkening towards the middle, a muddy bank, reeds and lily pads along the rim. */
export function drawPond(b: PixelBuffer): void {
  const x0 = POND_AREA.x0 * T - 8;
  const y0 = POND_AREA.y0 * T - 8;
  const x1 = (POND_AREA.x1 + 1) * T + 8;
  const y1 = (POND_AREA.y1 + 1) * T + 8;
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const d = pondDepth(px, py) + (vnoise(px, py, 5) - 0.5) * 0.05;
      let c: string | null = null;
      if (d < 1) {
        const n = vnoise(px, py, 11) * 0.7 + hash(px, py) * 0.2;
        if (d < 0.5) c = pick(['#146a68', '#16706e', '#1a7874'], n);
        else if (d < 0.76) c = pick(['#1b827c', '#1f8a84', '#22928a'], n);
        else if (d < 0.92) c = pick(['#279e94', '#2ba69a'], n);
        else c = '#46bba8';
        if (d < 0.9 && Math.sin(px * 0.33 + py * 0.95 + vnoise(px, py, 9) * 5) > 0.93) c = '#7ad6c4';
      } else if (d < 1.07) c = hash(px, py) < 0.3 ? '#4e3820' : '#5a4026';
      else if (d < 1.15) c = hash(px * 7, py) < 0.4 ? '#8a6a40' : '#7a5a34';
      else if (d < 1.19) c = '#3f7a2c';
      if (c) sp(b, px, py, c);
    }
  }
  // reeds and cattails in clumps on the rim (not next to the slots, the jetty or the sala)
  for (const a of [2.35, 2.75, 3.6, 4.2, 5.6]) {
    const rx = POND_SHAPE.cx + Math.cos(a) * POND_SHAPE.rx * 1.02;
    const ry = POND_SHAPE.cy + Math.sin(a) * POND_SHAPE.ry * 1.02;
    for (let i = 0; i < 6; i++) {
      const x = Math.round(rx + (hash(Math.round(a * 10), i) - 0.5) * 10);
      const y = Math.round(ry + (hash(i, Math.round(a * 10)) - 0.5) * 4);
      const h = 6 + Math.floor(hash(x, y) * 5);
      for (let k = 0; k < h; k++) sp(b, x + (k > h - 3 && i % 2 ? 1 : 0), y - k, k < 2 ? '#2f6a2e' : i % 2 ? '#4f9a44' : '#3f8a3a');
      if (i % 3 === 0) rect(b, x, y - h - 2, 2, 3, '#7a4a24');
    }
  }
  // drifting lily pads away from the planting spots
  for (const a of [0.9, 1.5, 3.1, 5.0]) {
    const lx = POND_SHAPE.cx + Math.cos(a) * POND_SHAPE.rx * 0.55;
    const ly = POND_SHAPE.cy + Math.sin(a) * POND_SHAPE.ry * 0.5;
    if (POND_SLOTS.some((s) => Math.hypot(s.x - lx, s.y - ly) < 12)) continue;
    lilyPad(b, lx, ly, 3);
    lilyPad(b, lx + 5, ly + 3, 2.2);
  }
}

function lilyPad(b: PixelBuffer, x: number, y: number, r: number): void {
  ell(b, x, y + 0.6, r, r * 0.7, '#1f5a2a');
  ell(b, x, y, r, r * 0.7, '#3f8f44');
  ell(b, x - 0.6, y - 0.5, r * 0.6, r * 0.4, '#5fb055');
  // the notch
  sp(b, x + r * 0.5, y, '#1f8a84');
  sp(b, x + r * 0.5 - 1, y, '#1f8a84');
}

/** Plank jetty from the bank out over the water, on posts. */
export function drawJetty(b: PixelBuffer): void {
  const xs = JETTY.map(([x]) => x);
  const y = (JETTY[0]?.[1] ?? 0) * T;
  const x0 = Math.min(...xs) * T + 2;
  const x1 = (Math.max(...xs) + 1) * T + 4;
  rect(b, x0 + 2, y + 13, x1 - x0, 3, '#000000', 0.18);
  for (const px of [x0 + 1, x0 + 14, x1 - 6]) {
    rect(b, px, y + 9, 2, 6, '#4a2e14');
    sp(b, px - 1, y + 15, '#7ad6c4');
    sp(b, px + 2, y + 15, '#7ad6c4');
  }
  for (let x = x0; x < x1; x++) {
    for (let yy = y + 3; yy < y + 11; yy++) {
      const seam = (x - x0) % 5 === 0;
      sp(b, x, yy, yy === y + 3 ? '#e0b070' : seam ? '#7a4a24' : yy > y + 8 ? '#9a6434' : '#b87c44');
    }
  }
  rect(b, x0, y + 11, x1 - x0, 1, '#5a3418');
}

/** Field hut on stilts (ห้างนา): bamboo platform under a thatched roof. */
export function drawFieldHut(b: PixelBuffer): void {
  const X = FIELD_HUT.x * T;
  const Y = FIELD_HUT.y * T;
  const W = FIELD_HUT.w * T;
  const H = FIELD_HUT.h * T;
  ell(b, X + W / 2 + 2, Y + H - 2, W / 2, 3, '#000000', 0.2);
  for (const px of [X + 3, X + W - 5]) {
    rect(b, px, Y + 10, 2, H - 12, '#6a4020');
    rect(b, px, Y + 10, 1, H - 12, '#9a6a3a');
  }
  // ladder
  for (let y = Y + 20; y < Y + H - 2; y += 3) rect(b, X + 8, y, 5, 1, '#8a5a30');
  // bamboo floor
  for (let x = X + 1; x < X + W - 1; x++) for (let y = Y + 15; y < Y + 19; y++) sp(b, x, y, (x + y) % 3 === 0 ? '#c8a870' : y === Y + 15 ? '#f0d494' : '#dcc088');
  rect(b, X + 1, Y + 19, W - 2, 1, '#8a6a30');
  // thatch, wider than the platform
  for (let r = 0; r < 12; r++) {
    const y = Y + 13 - r;
    const half = W / 2 + 4 - Math.floor(r * 0.9);
    for (let x = X + W / 2 - half; x < X + W / 2 + half; x++) {
      const edge = x === X + W / 2 - half || x === X + W / 2 + half - 1 || r === 0 || r === 11;
      sp(b, x, y, edge ? '#5a3a10' : r < 2 ? '#a87828' : (x + r * 2) % 5 === 0 ? '#c8983c' : x < X + W / 2 ? '#f0d080' : '#d8b058');
    }
  }
}

/** Lotus in a pond slot by growth stage (26x22, transparent). */
export function buildLotus(stage: number): HTMLCanvasElement {
  const b = createBuffer(26, 22);
  const pads: readonly [number, number, number][] = [
    [7, 15, 4],
    [17, 16, 3.4],
    [12, 18, 3],
    [20, 11, 2.6],
  ];
  pads.slice(0, stage === 0 ? 2 : 4).forEach(([x, y, r]) => lilyPad(b, x, y, r));
  if (stage >= 1) rect(b, 12, 9, 1, 7, '#3f8a3a');
  if (stage === 2) {
    ell(b, 12.5, 8, 2, 3, '#e888a8');
    sp(b, 12, 6, '#ffd0e0');
  }
  if (stage === 3) {
    // open flower: outer petals, inner petals, golden seed pod
    ell(b, 12.5, 9, 5.5, 2.6, '#e86a98');
    ell(b, 12.5, 7.5, 4, 3, '#f2a0c0');
    ell(b, 12.5, 6, 2.4, 2.4, '#ffd0e0');
    rect(b, 11, 6, 3, 2, '#ffd35c');
    sp(b, 12, 5, '#fff0a0');
    // a second bud
    rect(b, 19, 6, 1, 5, '#3f8a3a');
    ell(b, 19.5, 5, 1.4, 2, '#e888a8');
  }
  return toCanvas(b);
}

// ---------------------------------------------------------------- chicken coop

/**
 * The coop's static parts: scratched dirt inside the pen, a henhouse on stilts with a thatched
 * roof and a ladder, the empty feed trough and the straw nest basket. Feed, eggs and hens are
 * drawn live by WorldScene.
 */
export function drawCoop(b: PixelBuffer): void {
  // scratched earth and straw inside the fence
  for (let y = (COOP.y + 1) * T; y < (COOP.y + COOP.h - 1) * T; y++) {
    for (let x = (COOP.x + 1) * T; x < (COOP.x + COOP.w - 1) * T; x++) {
      const n = vnoise(x * 0.09, y * 0.09, 41) + (hash(x, y) - 0.5) * 0.12;
      if (n > 0.56) sp(b, x, y, n > 0.72 ? '#b89060' : '#c8a46c', n > 0.64 ? 0.95 : 0.55);
      else if (hash(x, y * 7) > 0.985) sp(b, x, y, '#f0d88a');
    }
  }
  // the gate gap gets trodden earth too
  for (let y = COOP_GATE.y * T; y < (COOP_GATE.y + 1) * T; y++) for (let x = COOP_GATE.x * T + 2; x < (COOP_GATE.x + 1) * T - 2; x++) if (hash(x, y) > 0.35) sp(b, x, y, '#c8a46c', 0.8);

  // henhouse on stilts
  const X = HENHOUSE.x * T;
  const Y = HENHOUSE.y * T;
  const W = HENHOUSE.w * T;
  ell(b, X + W / 2 + 1, Y + 30, W / 2 - 1, 3, '#000000', 0.2);
  for (const px of [X + 4, X + W - 6]) {
    rect(b, px, Y + 20, 2, 10, '#6a4020');
    rect(b, px, Y + 20, 1, 10, '#9a6a3a');
  }
  // plank walls
  for (let y = Y + 9; y < Y + 21; y++) for (let x = X + 3; x < X + W - 3; x++) sp(b, x, y, (x - X) % 5 === 0 ? '#8a5530' : y === Y + 9 ? '#d89a5a' : '#b8743e');
  rect(b, X + 3, Y + 20, W - 6, 1, '#5a3418');
  // door hole and a little ladder down to the nest
  rect(b, X + 6, Y + 13, 6, 7, '#3a2210');
  rect(b, X + 6, Y + 13, 6, 1, '#5a3418');
  for (let y = Y + 21; y < Y + 29; y += 2) rect(b, X + 7, y, 4, 1, '#9a6a3a');
  rect(b, X + 6, Y + 21, 1, 8, '#6a4020');
  rect(b, X + 11, Y + 21, 1, 8, '#6a4020');
  // thatch roof, wider than the walls
  for (let r = 0; r < 10; r++) {
    const y = Y + 10 - r;
    const half = W / 2 + 3 - Math.floor(r * 1.1);
    for (let x = X + W / 2 - half; x < X + W / 2 + half; x++) {
      const edge = x === X + W / 2 - half || x === X + W / 2 + half - 1 || r === 0 || r === 9;
      sp(b, x, y, edge ? '#5a3a10' : r < 2 ? '#a87828' : (x + r * 2) % 5 === 0 ? '#c8983c' : x < X + W / 2 ? '#f0d080' : '#d8b058');
    }
  }

  // feed trough: a hollowed log on two little feet
  const tx = Math.round(TROUGH.x);
  const ty = Math.round(TROUGH.y);
  ell(b, tx, ty + 3, 8, 2, '#000000', 0.18);
  rect(b, tx - 6, ty + 1, 2, 2, '#5a3418');
  rect(b, tx + 4, ty + 1, 2, 2, '#5a3418');
  rect(b, tx - 7, ty - 3, 14, 4, '#9a6434');
  rect(b, tx - 7, ty - 3, 14, 1, '#c88a4a');
  rect(b, tx - 6, ty - 2, 12, 2, '#4a2a12');
  rect(b, tx - 7, ty + 1, 14, 1, '#5a3418');

  // straw nest basket
  const nx = Math.round(NEST.x);
  const ny = Math.round(NEST.y);
  ell(b, nx, ny + 2, 7, 2, '#000000', 0.18);
  ell(b, nx, ny, 6.5, 3.2, '#a8782c');
  ell(b, nx, ny - 1, 5, 2, '#5a3a14');
  for (let x = nx - 6; x <= nx + 6; x++) if ((x + ny) % 2 === 0) sp(b, x, ny + 1, '#d8b058');
  for (const [dx, dy] of [[-6, -2], [5, -2], [-3, -3], [3, -3], [6, 0]] as const) sp(b, nx + dx, ny + dy, '#f0d080');
}
