// Builds a game and advances it. The only entry points the renderer needs.
import { TUNING } from '../data';
import { EventBus } from './events';
import { createPlots } from './farm';
import { startingInventory } from './inventory';
import { areaMap } from './areas';
import { SPAWN, zoneAtPx, type WorldMap } from './mapgen';
import { spawnMonster, updateMonster } from './monsterAI';
import { createNodes, populateArea } from './travel';
import { processActions, updatePlayer } from './player';
import { updateShots } from './shots';
import { Rng } from './rng';
import { createNpcs, updateNpcs } from './npc';
import { createRequests, trackRequests } from './requests';
import { trackMedals } from './medals';
import { applySave, type SaveData } from './save';
import type { GameState, Intent, PlayerState } from './state';

export interface CreateOptions {
  /** gameplay randomness seed (not the map seed) */
  rngSeed: number;
  /** epoch ms */
  now: number;
  save?: SaveData | null;
  map?: WorldMap;
  /** skip initial monster spawns (tests) */
  noMonsters?: boolean;
}

export function createPlayer(): PlayerState {
  const P = TUNING.player;
  return {
    x: SPAWN.x, y: SPAWN.y, hp: P.maxHp, maxHp: P.maxHp, st: P.maxStamina, maxSt: P.maxStamina, face: 1, fx: 1, fy: 0, weapon: 'bone',
    potions: P.potion.startCount, meal: null, path: [], repath: 0, lockId: null, gatherT: 0, gatherNode: null,
    cds: [0, 0, 0], cast: null, dash: null, spin: 0, atkCd: 0, swing: 0, swingAng: 0, roll: 0, rdx: 1, rdy: 0,
    rollIF: 0, hurtIF: 0, hurt: 0, dodgeCd: 0, dodgeBuf: 0, dodgeBufMove: null, stDelay: 0, potCd: 0, dead: false, deadT: 0, moving: false, walkT: 0,
    inVillage: true, inCamp: false, zone: null,
  };
}

/** Herb and ore nodes are placed by a fixed seed so they are always in the same spots. */
export function createGame(o: CreateOptions): GameState {
  const map = o.map ?? areaMap('home');
  const s: GameState = {
    map,
    area: 'home',
    homeMap: map,
    rng: new Rng(o.rngSeed),
    events: new EventBus(),
    time: 0,
    now: o.now,
    nextId: 1,
    player: createPlayer(),
    monsters: [],
    shots: [],
    respawnQueue: [],
    nodes: createNodes(map),
    plots: createPlots(),
    inv: startingInventory(),
    owned: new Set(['bone']),
    weaponLevels: {},
    ownedArmor: new Set(),
    armor: { head: null, body: null, charm: null },
    selCrop: 'herb',
    useFert: false,
    autoOn: false,
    kills: {},
    visited: new Set(['home']),
    npcs: createNpcs(),
    npcRng: new Rng((o.rngSeed ^ 0x2545f491) >>> 0 || 7),
    requests: createRequests(),
    medals: {},
  };
  trackRequests(s);
  trackMedals(s);
  s.player.zone = zoneAtPx(map, s.player.x, s.player.y);
  if (o.save) applySave(s, o.save);
  else {
    // a fresh game starts with something nearly ready to harvest, to teach the farm
    const seed = (i: number, crop: 'yam' | 'herb', ago: number, dur: number): void => {
      const p = s.plots[i];
      if (p) Object.assign(p, { crop, at: o.now - ago, dur, fert: false });
    };
    seed(0, 'yam', 72000, 75000);
    seed(1, 'herb', 41000, 40000);
    seed(5, 'herb', 15000, 40000);
  }
  if (!o.noMonsters) populateArea(s);
  return s;
}

/**
 * Advances the world. `dt` = 0 (hitstop) still applies button presses.
 * `now` is wall-clock epoch ms for crops and meals.
 */
export function step(s: GameState, intent: Intent, dt: number, now: number): void {
  s.now = now;
  processActions(s, intent);
  if (dt <= 0) return;
  s.time += dt;

  const meal = s.player.meal;
  if (meal && meal.until <= now) {
    s.player.meal = null;
    s.events.emit('meal:expired', { meal: meal.id });
  }

  updatePlayer(s, intent, dt);
  updateNpcs(s, dt);
  updateShots(s, dt);
  for (const m of s.monsters.slice()) updateMonster(s, m, dt);

  for (const q of s.respawnQueue) q.t -= dt;
  const ready = s.respawnQueue.filter((q) => q.t <= 0);
  s.respawnQueue = s.respawnQueue.filter((q) => q.t > 0);
  // if no free spot was found, try again shortly instead of losing the monster
  for (const q of ready) if (!spawnMonster(s, q.kind)) s.respawnQueue.push({ kind: q.kind, t: 2 });

  for (const n of s.nodes) {
    if (n.ready) continue;
    n.regen -= dt;
    if (n.regen <= 0) n.ready = true;
  }
}
