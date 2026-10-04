// 8-way A* on the tile grid. Diagonal steps may not cut wall corners.
import { MH, MW, walkable, type WorldMap } from './mapgen';

export type TilePath = [number, number][];

const DIRS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const MAX_EXPANSIONS = 4000;

/**
 * Returns the tiles to walk through (excluding the start), [] if already there,
 * or null if unreachable. An unwalkable goal snaps to the nearest walkable tile within 2.
 */
export function findPath(map: WorldMap, sx: number, sy: number, gx: number, gy: number): TilePath | null {
  if (!walkable(map, gx, gy)) {
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = gx + dx;
        const y = gy + dy;
        if (!walkable(map, x, y)) continue;
        const d = Math.hypot(dx, dy) + Math.hypot(x - sx, y - sy) * 0.01;
        if (d < bd) {
          bd = d;
          best = [x, y];
        }
      }
    }
    if (!best) return null;
    [gx, gy] = best;
  }
  if (sx < 0 || sy < 0 || sx >= MW || sy >= MH) return null;
  const start = sy * MW + sx;
  const goal = gy * MW + gx;
  if (start === goal) return [];

  const N = MW * MH;
  const g = new Float32Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heur = (x: number, y: number): number => {
    const dx = Math.abs(x - gx);
    const dy = Math.abs(y - gy);
    return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
  };
  const open = new MinHeap();
  g[start] = 0;
  open.push(start, heur(sx, sy));

  let expansions = 0;
  while (open.size > 0 && expansions++ < MAX_EXPANSIONS) {
    const cur = open.pop();
    if (cur === goal) {
      const path: TilePath = [];
      for (let c = cur; c !== start; c = from[c] ?? start) path.push([c % MW, (c / MW) | 0]);
      return path.reverse();
    }
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % MW;
    const cy = (cur / MW) | 0;
    const gc = g[cur] ?? Infinity;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!walkable(map, nx, ny)) continue;
      if (dx && dy && (!walkable(map, cx + dx, cy) || !walkable(map, cx, cy + dy))) continue;
      const n = ny * MW + nx;
      if (closed[n]) continue;
      const ng = gc + (dx && dy ? Math.SQRT2 : 1);
      if (ng < (g[n] ?? Infinity)) {
        g[n] = ng;
        from[n] = cur;
        open.push(n, ng + heur(nx, ny));
      }
    }
  }
  return null;
}

/** Binary min-heap of (node, priority); duplicates are skipped via `closed`. */
class MinHeap {
  private nodes: number[] = [];
  private prio: number[] = [];

  get size(): number {
    return this.nodes.length;
  }

  push(node: number, p: number): void {
    const { nodes, prio } = this;
    let i = nodes.length;
    nodes.push(node);
    prio.push(p);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((prio[parent] as number) <= p) break;
      nodes[i] = nodes[parent] as number;
      prio[i] = prio[parent] as number;
      i = parent;
    }
    nodes[i] = node;
    prio[i] = p;
  }

  pop(): number {
    const { nodes, prio } = this;
    const top = nodes[0] as number;
    const lastN = nodes.pop() as number;
    const lastP = prio.pop() as number;
    const n = nodes.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && (prio[r] as number) < (prio[l] as number) ? r : l;
        if ((prio[c] as number) >= lastP) break;
        nodes[i] = nodes[c] as number;
        prio[i] = prio[c] as number;
        i = c;
      }
      nodes[i] = lastN;
      prio[i] = lastP;
    }
    return top;
  }
}
