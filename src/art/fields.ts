// Rice and lotus drawn on the paddy / pond plots: small pre-built textures swapped by growth stage.
import { createBuffer, ell, rect, sp, toCanvas, type PixelBuffer } from './pixelBuffer';

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

function lilyPad(b: PixelBuffer, x: number, y: number, r: number): void {
  ell(b, x, y + 0.6, r, r * 0.7, '#1f5a2a');
  ell(b, x, y, r, r * 0.7, '#3f8f44');
  ell(b, x - 0.6, y - 0.5, r * 0.6, r * 0.4, '#5fb055');
  // the notch
  sp(b, x + r * 0.5, y, '#1f8a84');
  sp(b, x + r * 0.5 - 1, y, '#1f8a84');
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

