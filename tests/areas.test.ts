import { describe, expect, it } from 'vitest';
import { AREA_IDS, areaMap, exitAt } from '../src/core/areas';
import { generateMap, MW, SPAWN, T, walkable, zoneAtPx } from '../src/core/mapgen';
import { findPath } from '../src/core/pathfinding';
import { createGame, step } from '../src/core/sim';
import { hurtPlayer } from '../src/core/combat';
import { changeArea } from '../src/core/travel';
import { intent, NOW, run } from './helpers';

describe('area maps', () => {
  it('are deterministic', () => {
    for (const id of AREA_IDS) {
      const a = areaMap(id);
      expect(a.area).toBe(id);
      expect(a.tiles.length).toBe(64 * 48);
    }
  });

  it('home keeps the prototype world and only opens its border for exits', () => {
    const base = generateMap();
    const home = areaMap('home');
    let changed = 0;
    for (let i = 0; i < base.tiles.length; i++) if (base.tiles[i] !== home.tiles[i]) changed++;
    expect(changed).toBeGreaterThan(0);
    expect(changed).toBeLessThan(120);
  });

  it('every exit leads to an area with an exit back, and arrival points are walkable', () => {
    for (const id of AREA_IDS) {
      const a = areaMap(id);
      expect(a.exits.length, id).toBeGreaterThan(0);
      for (const e of a.exits) {
        const back = areaMap(e.to).exits.find((x) => x.to === id);
        expect(back, `${id} -> ${e.to}`).toBeDefined();
        expect(walkable(a, Math.floor(e.arrive.x / T), Math.floor(e.arrive.y / T)), `${id} arrive ${e.edge}`).toBe(true);
      }
    }
  });

  it('from each arrival point the player can walk to every other exit and to the monsters', () => {
    for (const id of AREA_IDS) {
      const a = areaMap(id);
      for (const e of a.exits) {
        const from: [number, number] = [Math.floor(e.arrive.x / T), Math.floor(e.arrive.y / T)];
        for (const o of a.exits) {
          const to: [number, number] = [Math.floor(o.arrive.x / T), Math.floor(o.arrive.y / T)];
          expect(findPath(a, from[0], from[1], to[0], to[1]), `${id} ${e.edge}->${o.edge}`).not.toBeNull();
        }
        const cell = a.forestCells[Math.floor(a.forestCells.length / 2)];
        if (!cell) throw new Error(`${id} has no spawn cells`);
        expect(findPath(a, from[0], from[1], cell[0], cell[1]), `${id} to spawn`).not.toBeNull();
      }
      if (id !== 'home') expect(a.forestCells.length, id).toBeGreaterThan(100);
    }
  });

  it('names the zone after the area outside home', () => {
    const b = areaMap('bamboo');
    const [x, y] = b.forestCells[0] ?? [0, 0];
    expect(zoneAtPx(b, x * T + 8, y * T + 8)).toBe('bamboo');
  });
});

describe('travel', () => {
  function home() {
    return createGame({ rngSeed: 5, now: NOW });
  }

  it('walking out of the north road enters the bamboo forest, and walking back returns home', () => {
    const s = home();
    const north = s.map.exits.find((e) => e.edge === 'n');
    if (!north) throw new Error('no north exit');
    const changes: string[] = [];
    s.events.on('area:changed', (e) => changes.push(e.area));
    Object.assign(s.player, { x: (north.at + 0.5) * T + 8, y: 3 * T + 8 });
    run(s, 2, () => intent({ move: { x: 0, y: -1 } }), () => s.area !== 'home');
    expect(s.area).toBe('bamboo');
    expect(changes).toEqual(['bamboo']);
    // arrived just inside the bamboo forest's south opening, not on its trigger
    expect(exitAt(s.map, Math.floor(s.player.x / T), Math.floor(s.player.y / T))).toBeNull();
    run(s, 3, () => intent({ move: { x: 0, y: 1 } }), () => s.area === 'home');
    expect(s.area).toBe('home');
    expect(s.player.y).toBeLessThan(8 * T);
  });

  it('only the current area has monsters, gather nodes are rebuilt, shots are dropped', () => {
    const s = home();
    expect(s.monsters.every((m) => m.kind !== undefined)).toBe(true);
    const homeCount = s.monsters.length;
    expect(homeCount).toBeGreaterThan(0);
    s.shots.push({ id: 999, x: 0, y: 0, dx: 1, dy: 0, speed: 1, left: 10, pierce: 0, mult: 1, stun: 0, partMul: 1, big: false, hit: new Set() });
    changeArea(s, 'swamp');
    expect(s.shots).toHaveLength(0);
    expect(s.monsters.some((m) => m.kind === 'dhole')).toBe(false);
    expect(s.nodes.length).toBeGreaterThan(0);
    changeArea(s, 'home');
    expect(s.monsters.length).toBe(homeCount);
  });

  it('village actions only work at home', () => {
    const s = home();
    changeArea(s, 'limestone');
    step(s, intent(), 1 / 60, NOW);
    expect(s.player.inVillage).toBe(false);
  });

  it('getting knocked out in another area carries the hunter back to the village', () => {
    const s = home();
    changeArea(s, 'bamboo');
    const fake = { x: s.player.x + 10, y: s.player.y, kind: 'dhole' } as Parameters<typeof hurtPlayer>[2];
    hurtPlayer(s, 9999, fake);
    expect(s.player.dead).toBe(true);
    run(s, 4);
    expect(s.area).toBe('home');
    expect([s.player.x, s.player.y]).toEqual([SPAWN.x, SPAWN.y]);
  });

  it('home exit openings are inside the map border', () => {
    for (const e of areaMap('home').exits) expect(e.at + e.width).toBeLessThanOrEqual(MW);
  });
});

describe('map tab rules', () => {
  it('remembers visited areas and saves them', async () => {
    const { parseSave, serialize } = await import('../src/core/save');
    const s = createGame({ rngSeed: 5, now: NOW, noMonsters: true });
    expect([...s.visited]).toEqual(['home']);
    changeArea(s, 'bamboo', undefined, false);
    changeArea(s, 'home', SPAWN, false);
    const t = createGame({ rngSeed: 1, now: NOW, save: parseSave(serialize(s)), noMonsters: true });
    expect([...t.visited].sort()).toEqual(['bamboo', 'home']);
    expect(parseSave(JSON.stringify({ inv: {}, visited: ['moon', 'swamp'] }))?.visited.sort()).toEqual(['home', 'swamp']);
  });

  it('fast travel home works out of a fight and is refused while a monster chases you', async () => {
    const { fastTravelHome } = await import('../src/core/travel');
    const s = createGame({ rngSeed: 5, now: NOW });
    expect(fastTravelHome(s)).toEqual({ ok: false, reason: 'atHome' });
    changeArea(s, 'bamboo', undefined, false);
    s.monsters.push({ aggro: true } as never); // only `aggro` is read by inFight()
    expect(fastTravelHome(s)).toEqual({ ok: false, reason: 'inFight' });
    s.monsters = [];
    expect(fastTravelHome(s)).toEqual({ ok: true });
    expect(s.area).toBe('home');
    expect([s.player.x, s.player.y]).toEqual([SPAWN.x, SPAWN.y]);
  });
});

describe('bamboo forest content', () => {
  it('spawns its monsters only there', () => {
    const s = createGame({ rngSeed: 9, now: NOW });
    expect(s.monsters.some((m) => m.kind === 'macaque' || m.kind === 'cobra')).toBe(false);
    changeArea(s, 'bamboo');
    const kinds = new Set(s.monsters.map((m) => m.kind));
    expect([...kinds].sort()).toEqual(['cobra', 'macaque']);
  });

  it("a cobra's spit hits along its line without the cobra moving", async () => {
    const { addMonster, intent: mk } = await import('./helpers');
    const s = createGame({ rngSeed: 9, now: NOW, noMonsters: true });
    changeArea(s, 'bamboo', undefined, false);
    const [cx, cy] = s.map.forestCells[40] ?? [30, 23];
    const m = addMonster(s, 'cobra', cx * T + 8, cy * T + 8, 1);
    Object.assign(s.player, { x: m.x + 60, y: m.y, inVillage: false });
    const spit = { id: 'spit', shape: 'line', length: 100, width: 14, telegraph: 0.9, damage: 14, range: 100, minRange: 30, dash: false, weight: 2 } as const;
    Object.assign(m, { mode: 'tele', t: 0.001, tt: 0.9, aggro: true, huntT: 120, attack: spit, shape: { kind: 'line', sx: m.x, sy: m.y, ux: 1, uy: 0, len: 100, wd: 14 } });
    const x0 = m.x;
    step(s, mk(), 1 / 60, NOW);
    expect(s.player.hp).toBeLessThan(100);
    expect(m.x).toBe(x0);
  });
});
