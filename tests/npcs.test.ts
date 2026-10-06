import { describe, expect, it } from 'vitest';
import { areaMap } from '../src/core/areas';
import { areaBoss, createNpcs, nextBoss, npcActive, npcLine, npcNear } from '../src/core/npc';
import { walkable, T } from '../src/core/mapgen';
import { changeArea } from '../src/core/travel';
import { contextAction } from '../src/core/village';
import { createGame } from '../src/core/sim';
import { AREA_IDS } from '../src/core/areas';
import { NPCS, MONSTERS } from '../src/data';
import { NOW } from './helpers';

const fresh = () => createGame({ rngSeed: 4, now: NOW, noMonsters: true });

describe('new villagers', () => {
  it('every home villager stands on walkable ground in the village', () => {
    const home = areaMap('home');
    for (const n of createNpcs()) {
      if (NPCS[n.id].area !== 'home') continue;
      expect(walkable(home, Math.floor(n.x / T), Math.floor(n.y / T)), n.id).toBe(true);
    }
  });

  it('the healer offers to brew when potions run low, else points at the farm', () => {
    const s = fresh();
    s.player.potions = 0;
    s.inv.herb = 4;
    expect(npcLine(s, 'healer').key).toBe('healer.brew');
    s.player.potions = 3;
    s.inv.herb = 0;
    s.inv.seed_yam = 2;
    s.inv.yam = 0;
    const l = npcLine(s, 'healer');
    expect(['healer.plant', 'healer.seed']).toContain(l.key);
  });

  it('the farmer reports ripe plots first', () => {
    const s = fresh();
    const pl = s.plots.find((p) => p.bed === 'soil');
    if (!pl) throw new Error();
    Object.assign(pl, { crop: 'herb', at: NOW - 999999, dur: 1000 });
    expect(npcLine(s, 'farmer')).toEqual({ key: 'farmer.ripe', n: s.plots.filter((p) => p.crop && NOW - p.at >= p.dur).length });
  });

  it('the old hunter points at the next unhunted boss', () => {
    const s = fresh();
    expect(nextBoss(s)).toBe('gaur');
    s.kills.gaur = 1;
    expect(npcLine(s, 'hunter')).toEqual({ key: 'hunter.boss', monster: 'tiger' });
    for (const [k, d] of Object.entries(MONSTERS)) if (d.rage) s.kills[k as keyof typeof s.kills] = 1;
    expect(npcLine(s, 'hunter').key).toBe('hunter.done');
  });
});

describe('the forest ranger', () => {
  it('is out in every wild area, never at home, on open ground by the camp fire', () => {
    const s = fresh();
    expect(npcActive(s, 'ranger')).toBe(false);
    for (const a of AREA_IDS) {
      if (a === 'home') continue;
      changeArea(s, a, undefined, false);
      expect(npcActive(s, 'ranger')).toBe(true);
      const r = s.npcs.find((n) => n.id === 'ranger');
      if (!r) throw new Error();
      expect(walkable(s.map, Math.floor(r.x / T), Math.floor(r.y / T)), a).toBe(true);
      const camp = s.map.camp;
      if (!camp) throw new Error(`no camp in ${a}`);
      expect(Math.hypot(r.x - camp.fire.x, r.y - camp.fire.y), a).toBeLessThan(3 * T);
    }
  });

  it('can be talked to away from home and tells about the area boss', () => {
    const s = fresh();
    changeArea(s, 'swamp', undefined, false);
    const r = s.npcs.find((n) => n.id === 'ranger');
    if (!r) throw new Error();
    Object.assign(s.player, { x: r.x + 10, y: r.y });
    expect(npcNear(s, 30)?.id).toBe('ranger');
    expect(contextAction(s)).toEqual({ kind: 'npc', npc: 'ranger' });
    expect(areaBoss(s)).toBe('crocodile');
    expect(npcLine(s, 'ranger')).toEqual({ key: 'ranger.boss', monster: 'crocodile', hunted: false });
  });
});

describe('ranger in an area without a raging boss', () => {
  it('talks about its toughest monster (the bamboo cobra)', () => {
    const s = fresh();
    changeArea(s, 'bamboo', undefined, false);
    expect(areaBoss(s)).toBe('cobra');
  });
});
