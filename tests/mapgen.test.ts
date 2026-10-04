import { describe, expect, it } from 'vitest';
import { generateMap, MH, MW, PLAZA, SPAWN, T, Tile, tileAt, walkable, zoneAtPx } from '../src/core/mapgen';
import { findPath } from '../src/core/pathfinding';
import html from '../reference/prototype.html?raw';

/** Runs the MAP section of reference/prototype.html in isolation and returns its outputs. */
function prototypeMap() {
  const start = html.indexOf('const T=16,MW=64,MH=48;');
  const end = html.indexOf('// ================= PIXEL BUFFERS');
  if (start < 0 || end < 0) throw new Error('prototype map section not found');
  const code = html.slice(start, end);
  const run = new Function(`${code}; return { map, reach, forestCells, canyonCells, BE, BN };`) as () => {
    map: Uint8Array; reach: Uint8Array; forestCells: number[][]; canyonCells: number[][]; BE: number; BN: number;
  };
  return run();
}

describe('mapgen', () => {
  const map = generateMap();

  it('produces the exact same world as the prototype for seed 20261004', () => {
    const ref = prototypeMap();
    expect(Array.from(map.tiles)).toEqual(Array.from(ref.map));
    expect(Array.from(map.reach)).toEqual(Array.from(ref.reach));
    expect(map.forestCells.map((c) => [...c])).toEqual(ref.forestCells);
    expect(map.canyonCells.map((c) => [...c])).toEqual(ref.canyonCells);
    expect([map.bridgeEast, map.bridgeNorth]).toEqual([ref.BE, ref.BN]);
  });

  it('is deterministic', () => {
    expect(Array.from(generateMap().tiles)).toEqual(Array.from(map.tiles));
  });

  it('has two bridges crossing the river', () => {
    const rows = new Set<number>();
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (tileAt(map, x, y) === Tile.BRIDGE) rows.add(y);
    expect([...rows].sort((a, b) => a - b)).toEqual([map.bridgeNorth, map.bridgeNorth + 1, map.bridgeEast, map.bridgeEast + 1].sort((a, b) => a - b));
  });

  it('has spawn cells for every monster zone', () => {
    expect(map.forestCells.length).toBeGreaterThan(50);
    expect(map.canyonCells.length).toBeGreaterThan(20);
  });

  it('classifies zones', () => {
    expect(zoneAtPx(map, SPAWN.x, SPAWN.y)).toBe('village');
    const [cx, cy] = map.canyonCells[0] ?? [0, 0];
    expect(zoneAtPx(map, cx * T + 8, cy * T + 8)).toBe('canyon');
    const [fx, fy] = map.forestCells[0] ?? [0, 0];
    expect(zoneAtPx(map, fx * T + 8, fy * T + 8)).toBe('forest');
  });
});

describe('pathfinding', () => {
  const map = generateMap();
  const from: [number, number] = [PLAZA.x, PLAZA.y + 2];

  it('reaches every zone from the village', () => {
    const targets = [map.forestCells[0], map.forestCells[map.forestCells.length - 1], map.canyonCells[0], map.canyonCells[map.canyonCells.length - 1]];
    for (const t of targets) {
      const [x, y] = t ?? [0, 0];
      const path = findPath(map, from[0], from[1], x, y);
      expect(path, `path to ${x},${y}`).not.toBeNull();
      expect(path?.at(-1)).toEqual([x, y]);
    }
  });

  it('crosses the east bridge to reach the canyon', () => {
    const [x, y] = map.canyonCells[0] ?? [0, 0];
    const path = findPath(map, from[0], from[1], x, y) ?? [];
    expect(path.some(([px, py]) => tileAt(map, px, py) === Tile.BRIDGE)).toBe(true);
  });

  it('never steps diagonally past a blocked corner', () => {
    for (const [x, y] of map.forestCells.filter((_, i) => i % 15 === 0)) {
      const path = findPath(map, from[0], from[1], x, y);
      if (!path) continue;
      let [px, py] = from;
      for (const [nx, ny] of path) {
        const dx = nx - px;
        const dy = ny - py;
        expect(Math.abs(dx) <= 1 && Math.abs(dy) <= 1).toBe(true);
        expect(walkable(map, nx, ny)).toBe(true);
        if (dx && dy) {
          expect(walkable(map, px + dx, py)).toBe(true);
          expect(walkable(map, px, py + dy)).toBe(true);
        }
        [px, py] = [nx, ny];
      }
    }
  });

  it('returns [] when already at the goal and snaps unwalkable goals', () => {
    expect(findPath(map, from[0], from[1], from[0], from[1])).toEqual([]);
    const path = findPath(map, from[0], from[1], PLAZA.x, PLAZA.y);
    expect(path).not.toBeNull();
    const last = path?.at(-1) ?? from;
    expect(walkable(map, last[0], last[1])).toBe(true);
  });
});
