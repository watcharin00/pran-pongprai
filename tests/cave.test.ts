import { describe, expect, it } from 'vitest';
import { arrivalExit, areaMap } from '../src/core/areas';
import { killMonster } from '../src/core/combat';
import { goalIndex } from '../src/core/inventory';
import { T } from '../src/core/mapgen';
import { createGame, step } from '../src/core/sim';
import { changeArea } from '../src/core/travel';
import { MONSTERS } from '../src/data';
import { addMonster, intent, NOW } from './helpers';

function inCave(seed: number) {
  const s = createGame({ rngSeed: seed, now: NOW, noMonsters: true });
  changeArea(s, 'cave', undefined, false);
  s.player.inVillage = false;
  return s;
}

describe('limestone cave', () => {
  it('is entered from the north edge of the limestone hills, and leads back there', () => {
    expect(areaMap('limestone').exits.find((e) => e.to === 'cave')?.edge).toBe('n');
    expect(areaMap('cave').exits.map((e) => [e.edge, e.to])).toEqual([['s', 'limestone']]);
    expect(arrivalExit('limestone', 'cave')?.edge).toBe('s');
    expect(arrivalExit('cave', 'limestone')?.edge).toBe('n');
  });

  it('spawns its three monsters only there', () => {
    const s = createGame({ rngSeed: 9, now: NOW });
    changeArea(s, 'limestone');
    expect(s.monsters.some((m) => MONSTERS[m.kind].area === 'cave')).toBe(false);
    changeArea(s, 'cave');
    expect([...new Set(s.monsters.map((m) => m.kind))].sort()).toEqual(['flyingfox', 'kingcobra', 'porcupine']);
  });

  it('a porcupine stabs its quills back at a player behind it, without turning', () => {
    const s = inCave(3);
    const [cx, cy] = s.map.forestCells[60] ?? [30, 23];
    const m = addMonster(s, 'porcupine', cx * T + 8, cy * T + 8, 1);
    Object.assign(m, { mode: 'chase', aggro: true, huntT: 100, atkCd: 0 });
    Object.assign(s.player, { x: m.x - 18, y: m.y });
    let picked = '';
    s.events.on('monster:telegraph', (e) => (picked = e.attackId));
    for (let i = 0; i < 5 && !picked; i++) step(s, intent(), 1 / 60, NOW);
    expect(picked).toBe('quillback');
    expect(m.dirX).toBe(1);
  });

  it('the front of a porcupine is the safe side: never a quill stab there', () => {
    const s = inCave(4);
    const [cx, cy] = s.map.forestCells[60] ?? [30, 23];
    const m = addMonster(s, 'porcupine', cx * T + 8, cy * T + 8, 1);
    Object.assign(m, { mode: 'chase', aggro: true, huntT: 100, atkCd: 0 });
    const picked: string[] = [];
    s.events.on('monster:telegraph', (e) => picked.push(e.attackId));
    for (let i = 0; i < 400; i++) {
      Object.assign(s.player, { x: m.x + 18 * m.dirX, y: m.y, hp: 100 });
      step(s, intent(), 1 / 60, NOW);
    }
    expect(picked.length).toBeGreaterThan(0);
    expect(picked).not.toContain('quillback');
  });

  it('flying foxes drop guano as fertiliser for the farm', () => {
    const s = inCave(5);
    const fert = s.inv.fert;
    killMonster(s, addMonster(s, 'flyingfox', 100, 100));
    expect(s.inv.fert).toBe(fert + 2);
  });

  it('the king cobra is the cave boss: weak to hammers, rages, has a rear tail whip', () => {
    const k = MONSTERS.kingcobra;
    expect(k.weakTo).toBe('hammer');
    expect(k.rage).not.toBeNull();
    expect(k.attacks.some((a) => a.shape === 'circle' && a.offset < 0)).toBe(true);
    expect(k.rare.nagagem).toBeGreaterThan(0);
  });

  it('is the goal after the king weapons, and a cave weapon completes it', () => {
    const s = createGame({ rngSeed: 1, now: NOW, noMonsters: true });
    for (const w of ['bamboobow', 'cleaver', 'coreblade', 'tigerspear', 'cobrafang', 'lizardbow', 'bearblade', 'kingbow'] as const) s.owned.add(w);
    expect(goalIndex(s)).toBe(8);
    s.owned.add('batbow');
    expect(goalIndex(s)).toBe(9);
  });
});
