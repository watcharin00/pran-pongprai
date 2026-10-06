import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/data';
import { AREA_IDS, areaMap } from '../src/core/areas';
import { hurtPlayer } from '../src/core/combat';
import { inCampPx, T, Tile, tileAt, walkable } from '../src/core/mapgen';
import { addMonster, game, run } from './helpers';
import { createMonster } from '../src/core/monsterAI';
import { brewPotion } from '../src/core/inventory';
import { changeArea, fastTravelCamp, knownCamps } from '../src/core/travel';
import { contextAction } from '../src/core/village';
import { npcActive } from '../src/core/npc';

const C = TUNING.camp;

describe('hunter camp', () => {
  it('the bamboo forest has one; the village does not', () => {
    expect(areaMap('bamboo').camp).toBeDefined();
    expect(areaMap('home').camp).toBeUndefined();
    // only areas flagged in SPECS: rolled out one at a time
    expect(AREA_IDS.filter((a) => areaMap(a).camp)).toEqual(['bamboo']);
  });

  it('sits off the road in from the village, reachable, with a solid tent and fire', () => {
    const map = areaMap('bamboo');
    const camp = map.camp;
    if (!camp) throw new Error('no camp');
    const back = map.exits[0];
    expect(back?.to).toBe('home');
    if (!back) return;
    expect(Math.hypot(camp.x - back.arrive.x, camp.y - back.arrive.y)).toBeLessThan(12 * T);
    for (let y = camp.tent.y; y < camp.tent.y + 2; y++) for (let x = camp.tent.x; x < camp.tent.x + 2; x++) expect(tileAt(map, x, y)).toBe(Tile.HOUSE);
    expect(walkable(map, Math.floor(camp.fire.x / T), Math.floor(camp.fire.y / T))).toBe(false);
    const rx = Math.floor(camp.rest.x / T);
    const ry = Math.floor(camp.rest.y / T);
    expect(walkable(map, rx, ry)).toBe(true);
    expect(map.reach[ry * 64 + rx]).toBe(1);
    expect(inCampPx(map, camp.rest.x, camp.rest.y, C.safeRadius)).toBe(true);
    // monsters never spawn on the camp
    for (const [x, y] of map.forestCells) expect(Math.hypot(x * T + 8 - camp.x, y * T + 8 - camp.y)).toBeGreaterThan(C.safeRadius);
  });

  it('heals, keeps monsters out, and the fire brews potions', () => {
    const s = game();
    changeArea(s, 'bamboo');
    s.monsters = [];
    const camp = s.map.camp;
    if (!camp) throw new Error('no camp');
    s.player.x = camp.rest.x;
    s.player.y = camp.rest.y;
    s.player.hp = 20;
    run(s, 1);
    expect(s.player.inCamp).toBe(true);
    expect(s.player.hp).toBeGreaterThan(20);
    // a monster that was chasing gives up at the edge of camp
    const m = createMonster(s.nextId++, 'macaque', camp.rest.x + 70, camp.rest.y, -1);
    m.aggro = true;
    m.mode = 'chase';
    s.monsters.push(m);
    s.respawnQueue = [];
    run(s, 8);
    expect(m.aggro).toBe(false);
    // brew at the fire
    s.player.x = camp.fire.x - T;
    s.player.y = camp.fire.y + 4;
    s.monsters = [];
    run(s, 0.1);
    expect(contextAction(s)).toEqual({ kind: 'brew' });
    s.inv.herb = 4;
    const before = s.player.potions;
    expect(brewPotion(s).ok).toBe(true);
    expect(s.player.potions).toBe(before + 1);
    // the ranger keeps the camp
    expect(npcActive(s, 'ranger')).toBe(true);
    const ranger = s.npcs.find((n) => n.id === 'ranger');
    expect(Math.hypot((ranger?.x ?? 0) - camp.fire.x, (ranger?.y ?? 0) - camp.fire.y)).toBeLessThan(3 * T);
  });

  it('a knockout in a camp area wakes the hunter at the camp', () => {
    const s = game();
    changeArea(s, 'bamboo');
    const camp = s.map.camp;
    if (!camp) throw new Error('no camp');
    const m = addMonster(s, 'macaque', 100, 100);
    let revivedAtCamp = false;
    s.events.on('player:revived', (e) => (revivedAtCamp = e.camp));
    hurtPlayer(s, 9999, m);
    run(s, TUNING.player.knockoutTime + 0.5);
    expect(s.area).toBe('bamboo');
    expect(revivedAtCamp).toBe(true);
    expect(Math.hypot(s.player.x - camp.rest.x, s.player.y - camp.rest.y)).toBeLessThan(T);
  });

  it('fast travel goes to camps already found, never mid-fight', () => {
    const s = game();
    expect(knownCamps(s)).toEqual([]);
    expect(fastTravelCamp(s, 'bamboo')).toEqual({ ok: false, reason: 'noCamp' });
    expect(fastTravelCamp(s, 'swamp')).toEqual({ ok: false, reason: 'noCamp' });
    s.visited.add('bamboo');
    expect(knownCamps(s)).toEqual(['bamboo']);
    const m = addMonster(s, 'dhole', s.player.x + 30, s.player.y);
    m.aggro = true;
    expect(fastTravelCamp(s, 'bamboo')).toEqual({ ok: false, reason: 'inFight' });
    m.aggro = false;
    expect(fastTravelCamp(s, 'bamboo')).toEqual({ ok: true });
    expect(s.area).toBe('bamboo');
    const camp = areaMap('bamboo').camp;
    expect(s.player.x).toBe(camp?.rest.x);
  });
});
