import { describe, expect, it } from 'vitest';
import { arrivalExit, areaMap } from '../src/core/areas';
import { hitMonster } from '../src/core/combat';
import { goalIndex } from '../src/core/inventory';
import { alphasUnlocked } from '../src/core/monsterAI';
import { T, Tile } from '../src/core/mapgen';
import { createGame, step } from '../src/core/sim';
import { changeArea } from '../src/core/travel';
import { MONSTERS } from '../src/data';
import { addMonster, intent, NOW } from './helpers';

function onPlains(seed: number) {
  const s = createGame({ rngSeed: seed, now: NOW, noMonsters: true });
  changeArea(s, 'savanna', undefined, false);
  s.player.inVillage = false;
  return s;
}

describe('Huai Kha Khaeng grassland', () => {
  it('lies east of the limestone hills and leads back there', () => {
    expect(areaMap('limestone').exits.find((e) => e.to === 'savanna')?.edge).toBe('e');
    expect(areaMap('savanna').exits.map((e) => [e.edge, e.to])).toEqual([['w', 'limestone']]);
    expect(arrivalExit('limestone', 'savanna')?.edge).toBe('w');
    expect(arrivalExit('savanna', 'limestone')?.edge).toBe('e');
  });

  it('is open country: far fewer trees than the deep wild', () => {
    const trees = (id: 'savanna' | 'deepwild'): number => areaMap(id).tiles.filter((t) => t === Tile.TREE).length;
    expect(trees('savanna')).toBeLessThan(trees('deepwild') / 3);
  });

  it('spawns its three monsters only there', () => {
    const s = createGame({ rngSeed: 9, now: NOW });
    changeArea(s, 'limestone');
    expect(s.monsters.some((m) => MONSTERS[m.kind].area === 'savanna')).toBe(false);
    changeArea(s, 'savanna');
    expect([...new Set(s.monsters.map((m) => m.kind))].sort()).toEqual(['peafowl', 'sambar', 'wildbuffalo']);
  });

  it("a sambar's antlers break from the front", () => {
    const s = onPlains(2);
    s.owned.add('meadowblade');
    s.player.weapon = 'meadowblade';
    const m = addMonster(s, 'sambar', 500, 500, 1);
    Object.assign(s.player, { x: 525, y: 500 });
    for (let i = 0; i < 40 && !m.parts.head?.broken; i++) hitMonster(s, m, 1);
    expect(m.parts.head?.broken).toBe(true);
    expect(s.inv.sambarantler).toBeGreaterThanOrEqual(1);
  });

  it('a sambar kicks back at a player circling behind it', () => {
    const s = onPlains(3);
    const [cx, cy] = s.map.forestCells[60] ?? [30, 23];
    const m = addMonster(s, 'sambar', cx * T + 8, cy * T + 8, 1);
    Object.assign(m, { mode: 'chase', aggro: true, huntT: 100, atkCd: 0 });
    Object.assign(s.player, { x: m.x - 20, y: m.y });
    let picked = '';
    s.events.on('monster:telegraph', (e) => (picked = e.attackId));
    for (let i = 0; i < 5 && !picked; i++) step(s, intent(), 1 / 60, NOW);
    expect(picked).toBe('backkick');
  });

  it('the wild buffalo is the toughest regular boss', () => {
    const bosses = Object.values(MONSTERS).filter((d) => d.count === 1 && d.rage);
    expect(Math.max(...bosses.map((d) => d.hp))).toBe(MONSTERS.wildbuffalo.hp);
  });

  it('is the goal after the peat swamp; alphas still unlock after the peat swamp', () => {
    const s = createGame({ rngSeed: 1, now: NOW, noMonsters: true });
    for (const w of ['bamboobow', 'cleaver', 'coreblade', 'tigerspear', 'cobrafang', 'lizardbow', 'bearblade', 'kingbow', 'nagamaul', 'pearlbow', 'catbow'] as const) s.owned.add(w);
    expect(goalIndex(s)).toBe(11);
    expect(alphasUnlocked(s)).toBe(true);
    s.owned.add('hornspear');
    expect(goalIndex(s)).toBe(12);
  });
});
