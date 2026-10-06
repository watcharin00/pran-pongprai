// Moving between areas: swaps the active map, gather nodes and monsters.
// Only the current area is simulated, so the mobile frame budget stays flat
// no matter how many areas the world has.
import { MONSTER_IDS, MONSTERS, TUNING } from '../data';
import type { AreaId } from '../data/types';
import { areaMap, arrivalExit } from './areas';
import { SPAWN, T, type WorldMap } from './mapgen';
import { spawnMonster } from './monsterAI';
import { parkMiller } from './rng';
import type { GameState, GatherNode } from './state';
import { placeNpcs } from './npc';

/** Herb / ore nodes for a map. Placement is seeded per area so it never changes. */
export function createNodes(map: WorldMap): GatherNode[] {
  const G = TUNING.gather;
  const r = parkMiller(G.nodeSeed + (map.area === 'home' ? 0 : map.area.length * 131 + map.exits.length));
  const nodes: GatherNode[] = [];
  const place = (cells: WorldMap['forestCells'], n: number, kind: GatherNode['kind']): void => {
    let placed = 0;
    let guard = 0;
    while (placed < n && guard++ < 500 && cells.length) {
      const [tx, ty] = cells[Math.floor(r() * cells.length)] ?? [0, 0];
      if (nodes.some((o) => Math.hypot(o.tx - tx, o.ty - ty) < 4)) continue;
      nodes.push({ id: nodes.length + 1, kind, tx, ty, x: tx * T + 8, y: ty * T + 8, ready: true, regen: 0 });
      placed++;
    }
  };
  place(map.forestCells, G.nodes.forestHerb, 'herb');
  place(map.forestCells, G.nodes.forestOre, 'ore');
  place(map.canyonCells, G.nodes.canyonOre, 'ore');
  return nodes;
}

export type TravelResult = { ok: true } | { ok: false; reason: 'atHome' | 'inFight' | 'dead' };

/** Map-tab fast travel back to the village; refused while a monster is chasing you. */
export function fastTravelHome(s: GameState): TravelResult {
  if (s.player.dead) return { ok: false, reason: 'dead' };
  if (s.area === 'home') return { ok: false, reason: 'atHome' };
  if (inFight(s)) return { ok: false, reason: 'inFight' };
  changeArea(s, 'home', SPAWN);
  return { ok: true };
}

/** A monster is hunting the player (fast travel is not an escape button). */
export function inFight(s: GameState): boolean {
  return s.monsters.some((m) => m.aggro);
}

/** Spawns every monster kind that lives in the current area. */
export function populateArea(s: GameState): void {
  for (const k of MONSTER_IDS) {
    if (MONSTERS[k].area !== s.area) continue;
    for (let i = 0; i < MONSTERS[k].count; i++) spawnMonster(s, k);
  }
}

/**
 * Moves the player to another area. `at` overrides the arrival point
 * (fast travel / knockout land at the village spawn instead of the exit).
 */
export function changeArea(s: GameState, to: AreaId, at?: { x: number; y: number }, populate = true): void {
  const from = s.area;
  const p = s.player;
  s.area = to;
  s.visited.add(to);
  s.map = to === 'home' ? s.homeMap : areaMap(to);
  s.monsters = [];
  s.respawnQueue = [];
  s.shots = [];
  s.nodes = createNodes(s.map);
  const arrive = at ?? arrivalExit(from, to)?.arrive ?? SPAWN;
  Object.assign(p, { x: arrive.x, y: arrive.y, lockId: null, path: [], cast: null, dash: null, roll: 0, gatherNode: null, gatherT: 0 });
  if (populate) populateArea(s);
  placeNpcs(s);
  s.events.emit('area:changed', { area: to, from });
}
