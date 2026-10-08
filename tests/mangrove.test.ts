import { describe, expect, it } from 'vitest';
import { arrivalExit, areaMap } from '../src/core/areas';
import { hitMonster } from '../src/core/combat';
import { cookMeal, defenseOf, goalIndex } from '../src/core/inventory';
import { T } from '../src/core/mapgen';
import { createGame, step } from '../src/core/sim';
import { changeArea } from '../src/core/travel';
import { MONSTERS } from '../src/data';
import { addMonster, intent, NOW } from './helpers';

function onCoast(seed: number) {
  const s = createGame({ rngSeed: seed, now: NOW, noMonsters: true });
  changeArea(s, 'mangrove', undefined, false);
  s.player.inVillage = false;
  return s;
}

describe('mangrove coast', () => {
  it('lies south of the crocodile swamp and leads back there', () => {
    expect(areaMap('swamp').exits.find((e) => e.to === 'mangrove')?.edge).toBe('s');
    expect(areaMap('mangrove').exits.map((e) => [e.edge, e.to])).toEqual([['n', 'swamp']]);
    expect(arrivalExit('swamp', 'mangrove')?.edge).toBe('n');
    expect(arrivalExit('mangrove', 'swamp')?.edge).toBe('s');
  });

  it('spawns its monsters only there', () => {
    const s = createGame({ rngSeed: 9, now: NOW });
    changeArea(s, 'swamp');
    expect(s.monsters.some((m) => MONSTERS[m.kind].area === 'mangrove')).toBe(false);
    changeArea(s, 'mangrove');
    expect([...new Set(s.monsters.map((m) => m.kind))].sort()).toEqual(['crabmacaque', 'mudcrab', 'otter', 'saltcroc']);
  });

  it("a mud crab's claws break from the front and drop claws", () => {
    const s = onCoast(2);
    s.owned.add('crabsword');
    s.player.weapon = 'crabsword';
    const m = addMonster(s, 'mudcrab', 500, 500, 1);
    Object.assign(s.player, { x: 520, y: 500 });
    for (let i = 0; i < 40 && !m.parts.head?.broken; i++) hitMonster(s, m, 1);
    expect(m.parts.head?.broken).toBe(true);
    expect(s.inv.crabclaw).toBeGreaterThanOrEqual(2);
  });

  it('the saltwater crocodile sweeps its tail at a player behind it', () => {
    const s = onCoast(3);
    const [cx, cy] = s.map.forestCells[60] ?? [30, 23];
    const m = addMonster(s, 'saltcroc', cx * T + 8, cy * T + 8, 1);
    Object.assign(m, { mode: 'chase', aggro: true, huntT: 200, atkCd: 0 });
    Object.assign(s.player, { x: m.x - 24, y: m.y });
    let picked = '';
    s.events.on('monster:telegraph', (e) => (picked = e.attackId));
    for (let i = 0; i < 5 && !picked; i++) step(s, intent(), 1 / 60, NOW);
    expect(picked).toBe('tailsweep');
    expect(m.dirX).toBe(1);
  });

  it('crab meat cooks into a defence meal (the farm feeds the hunt)', () => {
    const s = createGame({ rngSeed: 1, now: NOW, noMonsters: true });
    s.player.inVillage = true;
    Object.assign(s.inv, { crabmeat: 1, pepper: 1, rice: 1 });
    const before = defenseOf(s);
    expect(cookMeal(s, 'crabcurry').ok).toBe(true);
    expect(defenseOf(s)).toBe(before + 12);
  });

  it('is the goal after the cave, and a coast weapon completes it', () => {
    const s = createGame({ rngSeed: 1, now: NOW, noMonsters: true });
    for (const w of ['bamboobow', 'cleaver', 'coreblade', 'tigerspear', 'cobrafang', 'lizardbow', 'bearblade', 'kingbow', 'nagamaul'] as const) s.owned.add(w);
    expect(goalIndex(s)).toBe(9);
    s.owned.add('pearlbow');
    expect(goalIndex(s)).toBe(10);
  });
});
