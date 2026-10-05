// Deer trails: 2-tile-wide open lanes through tree cover so the forest never turns into a
// maze of dead ends. Waypoints sit on a jittered grid and every waypoint links to its east and
// south neighbours, so trails form loops across the whole map. Deterministic for a seed.
import { MH, MW, Tile } from './mapgen';
import { parkMiller } from './rng';

const COLS = [7, 22, 38, 54] as const;
const ROWS = [7, 18, 29, 40] as const;
const JITTER = 2;

/** Grid of trail waypoints (tile coordinates) for a seed: `rows[j][i]`. */
export function trailWaypoints(seed: number): [number, number][][] {
  const rnd = parkMiller(seed);
  const j = (): number => Math.floor(rnd() * (JITTER * 2 + 1)) - JITTER;
  return ROWS.map((y) => COLS.map((x): [number, number] => [x + j(), y + j()]));
}

export interface TrailOptions {
  /** tiles a trail may clear to grass (trees and bushes; rocks in the wild areas) */
  clearable: ReadonlySet<number>;
  /** cells a trail must leave alone (e.g. the village) */
  keep?: (x: number, y: number) => boolean;
}

/** Clears trails in place. Only `clearable` tiles change, and only to grass. */
export function openTrails(tiles: Uint8Array, seed: number, opts: TrailOptions): void {
  const rnd = parkMiller(seed ^ 0x5eed);
  const clear = (x: number, y: number): void => {
    if (x < 3 || y < 3 || x >= MW - 3 || y >= MH - 3) return;
    if (opts.keep?.(x, y)) return;
    const k = y * MW + x;
    if (opts.clearable.has(tiles[k] ?? Tile.WALL)) tiles[k] = Tile.GRASS;
  };
  // 2x2 brush: a 2-tile-wide lane in every direction of travel
  const brush = (x: number, y: number): void => {
    clear(x, y);
    clear(x + 1, y);
    clear(x, y + 1);
    clear(x + 1, y + 1);
  };
  const walk = (a: [number, number], b: [number, number]): void => {
    let [x, y] = a;
    const [tx, ty] = b;
    brush(x, y);
    while (x !== tx || y !== ty) {
      const dx = tx - x;
      const dy = ty - y;
      // mostly head along the longer axis, sometimes the other one, so trails wander
      const alongX = dy === 0 || (dx !== 0 && (Math.abs(dx) >= Math.abs(dy) ? rnd() < 0.72 : rnd() < 0.28));
      if (alongX) x += Math.sign(dx);
      else y += Math.sign(dy);
      brush(x, y);
    }
  };
  const grid = trailWaypoints(seed);
  grid.forEach((row, j) =>
    row.forEach((p, i) => {
      const east = row[i + 1];
      const south = grid[j + 1]?.[i];
      // bend each trail through a midpoint pushed sideways, so trails curve instead of running dead straight
      const bend = (q: [number, number], horizontal: boolean): void => {
        const off = Math.floor(rnd() * 7) - 3;
        const mx = Math.round((p[0] + q[0]) / 2) + (horizontal ? 0 : off);
        const my = Math.round((p[1] + q[1]) / 2) + (horizontal ? off : 0);
        const mid: [number, number] = [Math.min(MW - 5, Math.max(4, mx)), Math.min(MH - 5, Math.max(4, my))];
        walk(p, mid);
        walk(mid, q);
      };
      if (east) bend(east, true);
      if (south) bend(south, false);
    }),
  );
}
