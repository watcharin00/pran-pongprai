// Deterministic randomness. Map generation uses its own Park–Miller stream so the
// world is identical on every boot; gameplay uses a separate Rng instance.

/** Park–Miller minimal standard generator, identical to the prototype's `rnd()`. */
export function parkMiller(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export class Rng {
  private readonly nextFn: () => number;

  constructor(seed: number) {
    this.nextFn = parkMiller(seed);
  }

  /** [0, 1) */
  next(): number {
    return this.nextFn();
  }

  /** float in [a, b) */
  range(a: number, b: number): number {
    return a + this.nextFn() * (b - a);
  }

  /** integer in [a, b] */
  int(a: number, b: number): number {
    return a + Math.floor(this.nextFn() * (b - a + 1));
  }

  chance(p: number): boolean {
    return this.nextFn() < p;
  }

  pick<T>(arr: readonly T[]): T {
    const v = arr[Math.floor(this.nextFn() * arr.length)];
    if (v === undefined) throw new Error('Rng.pick on empty array');
    return v;
  }
}

/** Integer lattice hash → [0, 1). Same as the prototype. */
export function hash(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise with cell size `s`. */
export function vnoise(x: number, y: number, s: number): number {
  const gx = x / s;
  const gy = y / s;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const a = hash(x0, y0);
  const b = hash(x0 + 1, y0);
  const c = hash(x0, y0 + 1);
  const d = hash(x0 + 1, y0 + 1);
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
