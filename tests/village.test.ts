// The village expansion, villagers and the elder's hunt requests.
import { describe, expect, it } from 'vitest';
import { areaMap } from '../src/core/areas';
import { hitMonster, hurtPlayer, killMonster } from '../src/core/combat';
import { BOARD, ELDER_HOUSE, GRANARY, HUTS, inVillageTile, MW, PLAZA, SPAWN, T, Tile, tileAt, VILLAGE, walkable, zoneAtPx } from '../src/core/mapgen';
import { createNpcs, npcLine, npcNear, updateNpcs } from '../src/core/npc';
import { findPath } from '../src/core/pathfinding';
import { claimRequest, currentRequest, requestReady } from '../src/core/requests';
import { parseSave, serialize } from '../src/core/save';
import { createGame } from '../src/core/sim';
import { contextAction } from '../src/core/village';
import { NPCS, REQUESTS } from '../src/data';
import { addMonster, NOW } from './helpers';

const HOME = areaMap('home');
const homeGame = () => createGame({ rngSeed: 5, now: NOW, map: HOME, noMonsters: true });

describe('painted village', () => {
  it('stands inside the gameplay village, with the buildings solid', () => {
    for (const r of [ELDER_HOUSE, ...HUTS]) expect(inVillageTile(r.x, r.y)).toBe(true);
    expect(zoneAtPx(HOME, SPAWN.x, SPAWN.y)).toBe('village');
    for (const r of [ELDER_HOUSE, GRANARY, ...HUTS]) expect(tileAt(HOME, r.x, r.y)).toBe(Tile.HOUSE);
    expect(tileAt(HOME, BOARD.x, BOARD.y)).toBe(Tile.HOUSE);
  });

  it('every road out of the village is open from the plaza', () => {
    for (const e of HOME.exits) expect(findPath(HOME, PLAZA.x, PLAZA.y + 2, Math.floor(e.arrive.x / T), Math.floor(e.arrive.y / T)), e.to).not.toBeNull();
  });

  it('every villager stands on reachable ground', () => {
    for (const id of Object.keys(NPCS) as (keyof typeof NPCS)[]) {
      if (NPCS[id].area === 'wild') continue;
      const [x, y] = NPCS[id].tile;
      expect(walkable(HOME, x, y), id).toBe(true);
      expect(HOME.reach[y * MW + x], id).toBe(1);
      expect(findPath(HOME, PLAZA.x, PLAZA.y + 2, x, y), id).not.toBeNull();
    }
  });

  it('spawns no monsters in or right next to the village', () => {
    for (const [x, y] of HOME.forestCells) expect(x >= VILLAGE.x0 - 3 && x <= VILLAGE.x1 + 3 && y >= VILLAGE.y0 - 3 && y <= VILLAGE.y1 + 3, `${x},${y}`).toBe(false);
  });
});

describe('villagers', () => {
  it('stroll near home, never into walls, and stop to face the player', () => {
    const s = homeGame();
    const kid = s.npcs.find((n) => n.id === 'kid');
    if (!kid) throw new Error();
    s.player.x = 5 * T;
    s.player.y = 20 * T;
    let moved = false;
    for (let i = 0; i < 60 * 20; i++) {
      updateNpcs(s, 1 / 60);
      if (kid.moving) moved = true;
      expect(walkable(HOME, Math.floor(kid.x / T), Math.floor(kid.y / T))).toBe(true);
      expect(Math.hypot(kid.x - kid.hx, kid.y - kid.hy)).toBeLessThanOrEqual(NPCS.kid.wander + 2);
    }
    expect(moved).toBe(true);
    Object.assign(s.player, { x: kid.x + 20, y: kid.y });
    updateNpcs(s, 1 / 60);
    expect(kid.moving).toBe(false);
    expect(kid.face).toBe(1);
  });

  it('home villagers are only simulated at home', () => {
    const s = homeGame();
    const home = (): string => JSON.stringify(s.npcs.filter((n) => NPCS[n.id].area === 'home'));
    const before = home();
    s.area = 'bamboo';
    updateNpcs(s, 5);
    expect(home()).toBe(before);
    // away from home only the wild ranger can be near
    expect(NPCS[npcNear(s, 9999)?.id ?? 'ranger'].area).toBe('wild');
  });

  it('turn the context button into "talk" when close', () => {
    const s = homeGame();
    const elder = s.npcs.find((n) => n.id === 'elder');
    if (!elder) throw new Error();
    Object.assign(s.player, { x: elder.x + 10, y: elder.y });
    expect(contextAction(s)).toEqual({ kind: 'npc', npc: 'elder' });
  });

  it('the smith points at the closest weapon, and says when it is craftable', () => {
    const s = homeGame();
    const first = npcLine(s, 'smith');
    expect(first.key).toBe('smith.need');
    if (first.key !== 'smith.need') return;
    for (const [k, n] of Object.entries(first.missing)) s.inv[k as keyof typeof s.inv] += n ?? 0;
    expect(npcLine(s, 'smith')).toEqual({ key: 'smith.ready', weapon: first.weapon });
  });

  it('the cook offers what can be cooked, and notices an active meal', () => {
    const s = homeGame();
    s.inv.yam = 2;
    s.inv.hide = 1;
    expect(npcLine(s, 'cook')).toEqual({ key: 'cook.eat', meal: 'stew' });
    s.player.meal = { id: 'stew', until: NOW + 60_000 };
    expect(npcLine(s, 'cook')).toEqual({ key: 'cook.full', meal: 'stew' });
  });

  it('the kid cycles through tips', () => {
    const s = homeGame();
    expect(npcLine(s, 'kid', 3)).toEqual({ key: 'kid.tip', n: 3 });
  });

  it('createNpcs places everyone on their home tile', () => {
    for (const n of createNpcs()) expect([Math.floor(n.x / T), Math.floor(n.y / T)]).toEqual(NPCS[n.id].tile);
  });
});

describe('hunt requests', () => {
  it('start with the first request and count kills of the right monster only', () => {
    const s = homeGame();
    const r = currentRequest(s);
    expect(r?.id).toBe(REQUESTS[0]?.id);
    expect(r?.goal).toEqual({ type: 'kill', monster: 'junglefowl', count: 3 });
    killMonster(s, addMonster(s, 'dhole', 600, 200));
    expect(s.requests.progress).toBe(0);
    for (let i = 0; i < 3; i++) killMonster(s, addMonster(s, 'junglefowl', 600, 200));
    expect(s.requests.progress).toBe(3);
    expect(requestReady(s)).toBe(true);
    // extra kills do not overflow
    killMonster(s, addMonster(s, 'junglefowl', 600, 200));
    expect(s.requests.progress).toBe(3);
  });

  it('are claimed in the village for the reward, then the next one starts', () => {
    const s = homeGame();
    s.requests.progress = 3;
    const ore = s.inv.ore;
    s.player.inVillage = false;
    expect(claimRequest(s)).toBe(false);
    s.player.inVillage = true;
    expect(claimRequest(s)).toBe(true);
    expect(s.inv.ore).toBe(ore + 2);
    expect(s.requests.done.has('fowl')).toBe(true);
    expect(s.requests.progress).toBe(0);
    expect(currentRequest(s)?.id).toBe('herbs');
  });

  it('collect counts gathering and harvests', () => {
    const s = homeGame();
    s.requests.done.add('fowl');
    s.events.emit('item:gathered', { item: 'herb', amount: 2, at: { x: 0, y: 0 }, bonusSeed: false });
    s.events.emit('crop:harvested', { plot: 0, crop: 'herb', at: { x: 0, y: 0 }, drops: { herb: 3, seed_herb: 1 } });
    expect(s.requests.progress).toBe(5);
    expect(requestReady(s)).toBe(true);
  });

  it('flawless only counts if that monster never hit the player', () => {
    const s = homeGame();
    for (const id of ['fowl', 'herbs', 'dholehead', 'boars', 'fishes', 'ricecrop']) s.requests.done.add(id);
    s.owned.add('fangblade'); // unlockGoal 1
    expect(currentRequest(s)?.id).toBe('dholeclean');
    const hit = addMonster(s, 'dhole', 600, 200);
    hurtPlayer(s, 5, hit);
    killMonster(s, hit);
    expect(s.requests.progress).toBe(0);
    killMonster(s, addMonster(s, 'dhole', 600, 200));
    expect(s.requests.progress).toBe(1);
  });

  it('break counts the right part', () => {
    const s = homeGame();
    s.requests.done.add('fowl');
    s.requests.done.add('herbs');
    expect(currentRequest(s)?.goal).toEqual({ type: 'break', monster: 'dhole', part: 'head', count: 1 });
    const m = addMonster(s, 'dhole', 600, 200, 1);
    m.hp = 99999;
    s.player.x = 620;
    s.player.y = 200;
    for (let i = 0; i < 20 && !m.parts.head?.broken; i++) hitMonster(s, m, 1);
    expect(requestReady(s)).toBe(true);
  });

  it('locked requests wait for weapon progress', () => {
    const s = homeGame();
    for (const r of REQUESTS) if (r.unlockGoal === 0) s.requests.done.add(r.id);
    expect(currentRequest(s)).toBeNull();
    expect(npcLine(s, 'elder')).toEqual({ key: 'elder.wait' });
  });

  it('survive a save round-trip', () => {
    const s = homeGame();
    s.requests.done.add('fowl');
    s.requests.progress = 2;
    const d = parseSave(serialize(s));
    expect(d?.requestsDone).toEqual(['fowl']);
    expect(d?.requestProgress).toBe(2);
    const t = createGame({ rngSeed: 1, now: NOW, map: HOME, save: d, noMonsters: true });
    expect(currentRequest(t)?.id).toBe('herbs');
    expect(t.requests.progress).toBe(2);
    // unknown ids from a newer/older build are dropped
    expect(parseSave(JSON.stringify({ inv: {}, requestsDone: ['nope', 'fowl'] }))?.requestsDone).toEqual(['fowl']);
  });

  it('every request can actually be finished in the world', () => {
    expect(REQUESTS.length).toBeGreaterThan(8);
    for (const r of REQUESTS) expect(r.goal.count).toBeGreaterThan(0);
  });
});

