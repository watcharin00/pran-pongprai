import { describe, expect, it } from 'vitest';
import { arrivalExit, areaMap } from '../src/core/areas';
import { hitMonster } from '../src/core/combat';
import { goalIndex } from '../src/core/inventory';
import { T, Tile } from '../src/core/mapgen';
import { createGame, step } from '../src/core/sim';
import { changeArea } from '../src/core/travel';
import { MONSTERS } from '../src/data';
import { addMonster, intent, NOW } from './helpers';

function inPeat(seed: number) {
  const s = createGame({ rngSeed: seed, now: NOW, noMonsters: true });
  changeArea(s, 'peat', undefined, false);
  s.player.inVillage = false;
  return s;
}

describe('peat swamp forest', () => {
  it('lies west of the deep wild and leads back there', () => {
    expect(areaMap('deepwild').exits.find((e) => e.to === 'peat')?.edge).toBe('w');
    expect(areaMap('peat').exits.map((e) => [e.edge, e.to])).toEqual([['e', 'deepwild']]);
    expect(arrivalExit('deepwild', 'peat')?.edge).toBe('e');
    expect(arrivalExit('peat', 'deepwild')?.edge).toBe('w');
  });

  it('has blackwater pools, crossed by trails', () => {
    const tiles = areaMap('peat').tiles;
    const water = tiles.filter((t) => t === Tile.WATER).length;
    expect(water).toBeGreaterThan(50);
  });

  it('spawns its monsters only there', () => {
    const s = createGame({ rngSeed: 9, now: NOW });
    changeArea(s, 'deepwild');
    expect(s.monsters.some((m) => MONSTERS[m.kind].area === 'peat')).toBe(false);
    changeArea(s, 'peat');
    expect([...new Set(s.monsters.map((m) => m.kind))].sort()).toEqual(['marbledcat', 'panther', 'python', 'tapir']);
  });

  it("a tapir's snout breaks from the front", () => {
    const s = inPeat(2);
    s.owned.add('tapirhammer');
    s.player.weapon = 'tapirhammer';
    const m = addMonster(s, 'tapir', 500, 500, 1);
    Object.assign(s.player, { x: 525, y: 500 });
    for (let i = 0; i < 40 && !m.parts.head?.broken; i++) hitMonster(s, m, 1);
    expect(m.parts.head?.broken).toBe(true);
    expect(s.inv.tapirsnout).toBeGreaterThanOrEqual(1);
  });

  it('the black panther swipes at a player behind it, and is the fastest boss', () => {
    const s = inPeat(3);
    const [cx, cy] = s.map.forestCells[60] ?? [30, 23];
    const m = addMonster(s, 'panther', cx * T + 8, cy * T + 8, 1);
    Object.assign(m, { mode: 'chase', aggro: true, huntT: 200, atkCd: 0 });
    Object.assign(s.player, { x: m.x - 22, y: m.y });
    let picked = '';
    s.events.on('monster:telegraph', (e) => (picked = e.attackId));
    for (let i = 0; i < 5 && !picked; i++) step(s, intent(), 1 / 60, NOW);
    expect(picked).toBe('rearswipe');
    const bosses = Object.values(MONSTERS).filter((d) => d.count === 1 && d.rage);
    expect(Math.max(...bosses.map((d) => d.speed))).toBe(MONSTERS.panther.speed);
  });

  it('is the goal after the coast, and a peat weapon completes it', () => {
    const s = createGame({ rngSeed: 1, now: NOW, noMonsters: true });
    for (const w of ['bamboobow', 'cleaver', 'coreblade', 'tigerspear', 'cobrafang', 'lizardbow', 'bearblade', 'kingbow', 'nagamaul', 'pearlbow'] as const) s.owned.add(w);
    expect(goalIndex(s)).toBe(10);
    s.owned.add('catbow');
    expect(goalIndex(s)).toBe(11);
  });
});
