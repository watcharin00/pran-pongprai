// Villagers: they stroll around a home spot, stop to face the player, and pick
// what to say from the game state. Lines are returned as keys + data; the Thai
// text lives in i18n/th.ts.
import { CROPS, MEALS, MONSTER_IDS, MONSTERS, NPC_IDS, NPCS, TUNING, WEAPONS } from '../data';
import type { CropId, ItemBag, MaterialId, MealId, MonsterId, NpcId, WeaponId } from '../data/types';
import { canStand, moveBody } from './collision';
import { activeMeal, canAfford } from './inventory';
import { isRipe } from './farm';
import { T } from './mapgen';
import { allRequestsDone, currentRequest } from './requests';
import type { GameState, Inventory, NpcState } from './state';

const V = TUNING.village;
const NPC_RADIUS = 4;

export function createNpcs(): NpcState[] {
  return NPC_IDS.map((id) => {
    const [tx, ty] = NPCS[id].tile;
    const x = tx * T + 8;
    const y = ty * T + 8;
    return { id, x, y, hx: x, hy: y, face: 1, moving: false, walkT: 0, waitT: 1, waypoint: null };
  });
}

/** Whether a villager is out in the current area (home villagers at home, the ranger everywhere else). */
export function npcActive(s: GameState, id: NpcId): boolean {
  return NPCS[id].area === 'wild' ? s.area !== 'home' : s.area === 'home';
}

/**
 * Puts the wild villagers (the ranger) a few tiles from where the player arrives in this area,
 * on open ground beside the road. Call right after the player is placed.
 */
export function placeNpcs(s: GameState): void {
  if (s.area === 'home') return;
  // the player has just been placed at the way in
  const arrive = { x: s.player.x, y: s.player.y };
  for (const n of s.npcs) {
    if (NPCS[n.id].area !== 'wild') continue;
    let spot = { x: arrive.x, y: arrive.y };
    search: for (let r = 3; r <= 8; r++) {
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const x = arrive.x + dx * r * T;
        const y = arrive.y + dy * r * T;
        if (canStand(s.map, x, y, NPC_RADIUS + 2)) {
          spot = { x, y };
          break search;
        }
      }
    }
    Object.assign(n, { x: spot.x, y: spot.y, hx: spot.x, hy: spot.y, waypoint: null, waitT: 1, moving: false });
  }
}

export function updateNpcs(s: GameState, dt: number): void {
  const p = s.player;
  for (const n of s.npcs) {
    n.moving = false;
    if (!npcActive(s, n.id)) continue;
    const dp = Math.hypot(p.x - n.x, p.y - n.y);
    if (!p.dead && dp < V.npcBubbleRadius) {
      // stop and turn to the player while they are close
      n.face = p.x >= n.x ? 1 : -1;
      continue;
    }
    const wander = NPCS[n.id].wander;
    if (wander <= 0) continue;
    if (n.waitT > 0) {
      n.waitT -= dt;
      continue;
    }
    if (!n.waypoint) {
      const a = s.npcRng.range(0, Math.PI * 2);
      const r = s.npcRng.range(0, wander);
      const tx = n.hx + Math.cos(a) * r;
      const ty = n.hy + Math.sin(a) * r;
      if (canStand(s.map, tx, ty, NPC_RADIUS)) n.waypoint = { x: tx, y: ty };
      else n.waitT = 0.5;
      continue;
    }
    const dx = n.waypoint.x - n.x;
    const dy = n.waypoint.y - n.y;
    const d = Math.hypot(dx, dy);
    const step = Math.min(d, V.npcSpeed * dt);
    if (d < 1 || !moveBody(s.map, n, (dx / d) * step, (dy / d) * step, NPC_RADIUS)) {
      n.waypoint = null;
      n.waitT = s.npcRng.range(V.npcPauseMin, V.npcPauseMax);
      continue;
    }
    n.moving = true;
    n.walkT += dt * 7;
    if (Math.abs(dx) > 0.5) n.face = dx > 0 ? 1 : -1;
  }
}

/** The nearest villager out in this area within `maxD` px of the player. */
export function npcNear(s: GameState, maxD: number): NpcState | null {
  let best: NpcState | null = null;
  let bd = maxD;
  for (const n of s.npcs) {
    if (!npcActive(s, n.id)) continue;
    const d = Math.hypot(n.x - s.player.x, n.y - s.player.y);
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return best;
}

export type NpcLine =
  | { key: 'smith.ready'; weapon: WeaponId }
  | { key: 'smith.need'; weapon: WeaponId; missing: ItemBag }
  | { key: 'smith.allOwned' }
  | { key: 'cook.full'; meal: MealId }
  | { key: 'cook.eat'; meal: MealId }
  | { key: 'cook.need'; meal: MealId; missing: ItemBag }
  | { key: 'elder.ready'; request: string }
  | { key: 'elder.progress'; request: string; progress: number; count: number }
  | { key: 'elder.wait' }
  | { key: 'elder.allDone' }
  /** n-th tip; the UI wraps it around its tip list */
  | { key: 'kid.tip'; n: number }
  | { key: 'healer.brew'; potions: number }
  | { key: 'healer.plant'; crop: CropId; meal: MealId }
  | { key: 'healer.seed'; crop: CropId }
  | { key: 'healer.potions'; potions: number }
  | { key: 'farmer.ripe'; n: number }
  | { key: 'farmer.plant'; crop: CropId; free: number }
  | { key: 'farmer.seed'; crop: CropId }
  | { key: 'farmer.happy' }
  | { key: 'hunter.boss'; monster: MonsterId }
  | { key: 'hunter.done' }
  | { key: 'ranger.boss'; monster: MonsterId; hunted: boolean }
  | { key: 'ranger.home' };

/** What a recipe still needs, given the inventory. */
export function missingFor(inv: Inventory, recipe: ItemBag): ItemBag {
  const out: ItemBag = {};
  for (const [k, n] of Object.entries(recipe)) {
    const short = (n ?? 0) - inv[k as MaterialId];
    if (short > 0) out[k as MaterialId] = short;
  }
  return out;
}

const units = (bag: ItemBag): number => Object.values(bag).reduce<number>((a, n) => a + (n ?? 0), 0);

/** Picks the closest-to-done option: craftable first, else the one missing the fewest items. */
function closest<K extends string>(s: GameState, options: readonly [K, ItemBag][]): { id: K; missing: ItemBag } | null {
  let best: { id: K; missing: ItemBag } | null = null;
  for (const [id, recipe] of options) {
    const missing = missingFor(s.inv, recipe);
    if (!best || units(missing) < units(best.missing)) best = { id, missing };
  }
  return best;
}

/** The crop whose harvest is `item`, if any. */
const cropYielding = (item: MaterialId): CropId | null => (Object.keys(CROPS) as CropId[]).find((c) => CROPS[c].yield.item === item) ?? null;

/** The first boss (a monster that can rage) the player has not hunted yet, in content order = progress order. */
export function nextBoss(s: GameState): MonsterId | null {
  return MONSTER_IDS.find((k) => MONSTERS[k].rage !== null && !(s.kills[k] ?? 0)) ?? null;
}

/** The toughest monster of the current area (its boss when it has one). */
export function areaBoss(s: GameState): MonsterId | null {
  const kinds = MONSTER_IDS.filter((k) => MONSTERS[k].area === s.area);
  return kinds.sort((a, b) => MONSTERS[b].hp - MONSTERS[a].hp)[0] ?? null;
}

/** What villager `id` says right now. `n` advances rotating lines (the kid's tips). */
export function npcLine(s: GameState, id: NpcId, n = 0): NpcLine {
  switch (NPCS[id].role) {
    case 'forge': {
      const options = (Object.keys(WEAPONS) as WeaponId[]).filter((w) => !s.owned.has(w)).flatMap((w): [WeaponId, ItemBag][] => {
        const r = WEAPONS[w].recipe;
        return r ? [[w, r]] : [];
      });
      const next = closest(s, options);
      if (!next) return { key: 'smith.allOwned' };
      return units(next.missing) === 0 ? { key: 'smith.ready', weapon: next.id } : { key: 'smith.need', weapon: next.id, missing: next.missing };
    }
    case 'kitchen': {
      const eating = activeMeal(s);
      if (eating) return { key: 'cook.full', meal: eating };
      const options = (Object.keys(MEALS) as MealId[]).map((m): [MealId, ItemBag] => [m, MEALS[m].recipe]);
      const ready = options.find(([, r]) => canAfford(s.inv, r));
      if (ready) return { key: 'cook.eat', meal: ready[0] };
      const next = closest(s, options);
      return next ? { key: 'cook.need', meal: next.id, missing: next.missing } : { key: 'cook.eat', meal: options[0]?.[0] ?? 'stew' };
    }
    case 'requests': {
      const r = currentRequest(s);
      if (!r) return allRequestsDone(s) ? { key: 'elder.allDone' } : { key: 'elder.wait' };
      if (s.requests.progress >= r.goal.count) return { key: 'elder.ready', request: r.id };
      return { key: 'elder.progress', request: r.id, progress: s.requests.progress, count: r.goal.count };
    }
    case 'tips':
      return { key: 'kid.tip', n };
    case 'herbs': {
      const P = TUNING.player.potion;
      if (s.player.potions <= 1 && s.inv.herb >= P.herbCost) return { key: 'healer.brew', potions: s.player.potions };
      // a meal that is short of something the farm grows: plant it (or find its seed)
      for (const m of Object.keys(MEALS) as MealId[]) {
        const missing = missingFor(s.inv, MEALS[m].recipe);
        for (const item of Object.keys(missing) as MaterialId[]) {
          const crop = cropYielding(item);
          if (!crop) continue;
          if (s.inv[CROPS[crop].seed] > 0) return { key: 'healer.plant', crop, meal: m };
        }
      }
      for (const m of Object.keys(MEALS) as MealId[]) {
        for (const item of Object.keys(missingFor(s.inv, MEALS[m].recipe)) as MaterialId[]) {
          const crop = cropYielding(item);
          if (crop) return { key: 'healer.seed', crop };
        }
      }
      return { key: 'healer.potions', potions: s.player.potions };
    }
    case 'farm': {
      const ripe = s.plots.filter((pl) => isRipe(pl, s.now)).length;
      if (ripe) return { key: 'farmer.ripe', n: ripe };
      for (const c of Object.keys(CROPS) as CropId[]) {
        if (s.inv[CROPS[c].seed] <= 0) continue;
        const free = s.plots.filter((pl) => pl.bed === CROPS[c].bed && !pl.crop).length;
        if (free) return { key: 'farmer.plant', crop: c, free };
      }
      const noSeed = (Object.keys(CROPS) as CropId[]).find((c) => s.inv[CROPS[c].seed] <= 0);
      return noSeed ? { key: 'farmer.seed', crop: noSeed } : { key: 'farmer.happy' };
    }
    case 'hunter': {
      const boss = nextBoss(s);
      return boss ? { key: 'hunter.boss', monster: boss } : { key: 'hunter.done' };
    }
    case 'ranger': {
      const boss = areaBoss(s);
      return boss ? { key: 'ranger.boss', monster: boss, hunted: (s.kills[boss] ?? 0) > 0 } : { key: 'ranger.home' };
    }
  }
}
