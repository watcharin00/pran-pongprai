// Tiny software pixel buffer used to paint every sprite and tile procedurally.

export interface PixelBuffer {
  readonly w: number;
  readonly h: number;
  readonly image: ImageData;
  readonly d: Uint8ClampedArray;
}

const colorCache = new Map<string, readonly [number, number, number]>();

export function rgb(hex: string): readonly [number, number, number] {
  let c = colorCache.get(hex);
  if (!c) {
    c = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    colorCache.set(hex, c);
  }
  return c;
}

export function createBuffer(w: number, h: number): PixelBuffer {
  const image = new ImageData(w, h);
  return { w, h, image, d: image.data };
}

/** Sets one pixel; `a` < 1 blends over what is there. */
export function sp(b: PixelBuffer, x: number, y: number, c: string, a?: number): void {
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return;
  const i = (y * b.w + x) * 4;
  const [r, g, bl] = rgb(c);
  const d = b.d;
  if (a === undefined || a >= 1) {
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = bl;
    d[i + 3] = 255;
  } else {
    const ia = 1 - a;
    d[i] = (d[i] ?? 0) * ia + r * a;
    d[i + 1] = (d[i + 1] ?? 0) * ia + g * a;
    d[i + 2] = (d[i + 2] ?? 0) * ia + bl * a;
    d[i + 3] = Math.min(255, (d[i + 3] ?? 0) + a * 255);
  }
}

export function rect(b: PixelBuffer, x: number, y: number, w: number, h: number, c: string, a?: number): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) sp(b, x + i, y + j, c, a);
}

export function ell(b: PixelBuffer, cx: number, cy: number, rx: number, ry: number, c: string, a?: number): void {
  for (let y = Math.floor(cy - ry) - 1; y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx) - 1; x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) sp(b, x, y, c, a);
    }
  }
}

export function line(b: PixelBuffer, x0: number, y0: number, x1: number, y1: number, c: string): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
  for (let i = 0; i <= n; i++) sp(b, Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
}

export function toCanvas(b: PixelBuffer): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = b.w;
  c.height = b.h;
  c.getContext('2d')?.putImageData(b.image, 0, 0);
  return c;
}

/** Sprite outline colour: deep navy, never pure black. */
export const OUTLINE = '#16202e';

/**
 * Adds a 1px outline around opaque pixels, brightens top edges and darkens bottom
 * edges, then returns a canvas. Every sprite goes through this.
 */
export function finish(b: PixelBuffer, shade = true, outline = OUTLINE): HTMLCanvasElement {
  const { w, h, d } = b;
  const src = new Uint8ClampedArray(d);
  const [or, og, ob] = rgb(outline);
  const A = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && (src[(y * w + x) * 4 + 3] ?? 0) > 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if ((src[i + 3] ?? 0) > 0) {
        if (!shade) continue;
        if (!A(x, y - 1)) for (let k = 0; k < 3; k++) d[i + k] = Math.min(255, (src[i + k] ?? 0) * 1.2 + 18);
        else if (!A(x, y + 1)) for (let k = 0; k < 3; k++) d[i + k] = (src[i + k] ?? 0) * 0.7;
      } else if (A(x - 1, y) || A(x + 1, y) || A(x, y - 1) || A(x, y + 1)) {
        d[i] = or;
        d[i + 1] = og;
        d[i + 2] = ob;
        d[i + 3] = 255;
      }
    }
  }
  return toCanvas(b);
}

/** Builds a buffer (with 1px border for the outline) from ASCII rows + palette. */
export function fromRows(rows: readonly string[], pal: Readonly<Record<string, string>>): PixelBuffer {
  const w = Math.max(...rows.map((r) => r.length)) + 2;
  const h = rows.length + 2;
  const b = createBuffer(w, h);
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) {
      const c = pal[r[x] ?? '.'];
      if (c) sp(b, x + 1, y + 1, c);
    }
  });
  return b;
}
