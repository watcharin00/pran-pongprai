// The village chicken coop. Jungle-fowl eggs from the hunt hatch in the nest into hens; hens
// eat crops from the trough and lay eggs into the nest basket (walk past to collect); petting
// raises their love, which brings double eggs and feathers. Real-time like crops, so hens
// keep laying while the game is closed as long as the trough has feed.
// No hunger penalty, no deaths: an empty trough only pauses laying.
import { MATERIALS, TUNING } from '../data';
import type { MaterialId } from '../data/types';
import { HEN_ROAM, NEST, TROUGH } from './mapgen';
import type { GameState, Hen, RanchState } from './state';

const R = TUNING.ranch;

/** Crops that fill the trough, in the order they are used when amounts tie. */
export const FEED_ITEMS: readonly MaterialId[] = R.feed.filter((k): k is MaterialId => k in MATERIALS);

export function createRanch(): RanchState {
  return { hens: [], nest: [], trough: 0, basket: {} };
}

export const isGrown = (h: Pick<Hen, 'born'>, now: number): boolean => now - h.born >= R.growSec * 1000;

export const basketCount = (r: RanchState): number => Object.values(r.basket).reduce((a, n) => a + (n ?? 0), 0);

/** Hens plus eggs still hatching: the coop's head count. */
export const ranchHeads = (r: RanchState): number => r.hens.length + r.nest.length;

/** A hen standing at a random spot in the pen. */
export function makeHen(s: GameState, born: number, saved?: Partial<Pick<Hen, 'love' | 'pettedAt' | 'nextLay'>>): Hen {
  const x = s.npcRng.range(HEN_ROAM.x0, HEN_ROAM.x1);
  const y = s.npcRng.range(HEN_ROAM.y0, HEN_ROAM.y1);
  return {
    id: s.nextId++,
    born,
    love: saved?.love ?? 0,
    pettedAt: saved?.pettedAt ?? 0,
    nextLay: saved?.nextLay ?? 0,
    x,
    y,
    tx: x,
    ty: y,
    wait: s.npcRng.range(0.3, 2),
    face: s.npcRng.chance(0.5) ? 1 : -1,
    moving: false,
    walkT: 0,
    peck: 0,
  };
}

/** Can a jungle-fowl egg go into the nest now? */
export function canHatch(s: GameState): boolean {
  return s.inv.jfegg > 0 && ranchHeads(s.ranch) < R.maxHens;
}

export function hatchEgg(s: GameState): boolean {
  if (!canHatch(s)) return false;
  s.inv.jfegg--;
  s.ranch.nest.push(s.now + R.hatchSec * 1000);
  s.events.emit('ranch:incubate', { at: { x: NEST.x, y: NEST.y } });
  return true;
}

/** The feed crop the trough would take next: the one the player has most of. */
export function nextFeed(s: GameState): MaterialId | null {
  let best: MaterialId | null = null;
  for (const k of FEED_ITEMS) if (s.inv[k] > 0 && (!best || s.inv[k] > s.inv[best])) best = k;
  return best;
}

export type FeedResult = { ok: true; item: MaterialId } | { ok: false; reason: 'full' | 'noFeed' };

/** Puts one crop into the trough (one tap = one crop). */
export function feedTrough(s: GameState): FeedResult {
  const r = s.ranch;
  if (r.trough + R.feedPerItem > R.troughMax) return { ok: false, reason: 'full' };
  const item = nextFeed(s);
  if (!item) return { ok: false, reason: 'noFeed' };
  s.inv[item]--;
  r.trough += R.feedPerItem;
  s.events.emit('ranch:fed', { item, trough: r.trough, at: { x: TROUGH.x, y: TROUGH.y } });
  return { ok: true, item };
}

/** Pets a hen: always a happy cluck, a heart at most once per `petCooldownSec`. */
export function petHen(s: GameState, id: number): boolean {
  const h = s.ranch.hens.find((q) => q.id === id);
  if (!h) return false;
  const loved = h.love < R.maxLove && s.now - h.pettedAt >= R.petCooldownSec * 1000;
  if (loved) {
    h.love++;
    h.pettedAt = s.now;
  }
  // it stops to enjoy it
  h.tx = h.x;
  h.ty = h.y;
  h.moving = false;
  h.wait = Math.max(h.wait, 1.2);
  h.face = s.player.x >= h.x ? 1 : -1;
  s.events.emit('ranch:petted', { id, love: h.love, loved, at: { x: h.x, y: h.y } });
  return true;
}

/** Can this hen take another heart now? (for the context button and the heart icon) */
export const canLove = (h: Hen, now: number): boolean => h.love < R.maxLove && now - h.pettedAt >= R.petCooldownSec * 1000;

export function collectBasket(s: GameState): boolean {
  const r = s.ranch;
  if (basketCount(r) <= 0) return false;
  const items = { ...r.basket };
  for (const [k, n] of Object.entries(items)) s.inv[k as MaterialId] += n ?? 0;
  r.basket = {};
  s.events.emit('ranch:collected', { items, at: { x: NEST.x, y: NEST.y } });
  return true;
}

function lay(s: GameState, h: Hen): void {
  const b = s.ranch.basket;
  const eggs = 1 + (s.npcRng.chance(h.love * R.doubleEggPerLove) ? 1 : 0);
  b.egg = (b.egg ?? 0) + eggs;
  if (h.love >= R.featherLove && s.npcRng.chance(R.featherChance)) b.feather = (b.feather ?? 0) + 1;
  s.events.emit('ranch:laid', { id: h.id, at: { x: h.x, y: h.y } });
}

/**
 * Hatching, growing and laying by the wall clock (catches up after the game was closed),
 * strolling in the pen, and collecting the basket when the player walks by it.
 */
export function updateRanch(s: GameState, dt: number): void {
  const r = s.ranch;
  const now = s.now;
  // eggs in the nest hatch
  if (r.nest.some((t) => t <= now)) {
    const hatched = r.nest.filter((t) => t <= now);
    r.nest = r.nest.filter((t) => t > now);
    for (const t of hatched) {
      const h = makeHen(s, t);
      // chicks tumble out around the nest
      h.x = Math.max(HEN_ROAM.x0, NEST.x - s.npcRng.range(6, 22));
      h.y = Math.max(HEN_ROAM.y0, Math.min(HEN_ROAM.y1, NEST.y - s.npcRng.range(0, 10)));
      h.tx = h.x;
      h.ty = h.y;
      r.hens.push(h);
      s.events.emit('ranch:hatched', { id: h.id, at: { x: h.x, y: h.y } });
    }
  }
  for (const h of r.hens) {
    if (!isGrown(h, now)) continue;
    if (h.nextLay === 0) {
      // waits for feed; the first egg comes a full cycle after the trough has some
      if (r.trough > 0) h.nextLay = Math.max(now, h.born + R.growSec * 1000) + R.laySec * 1000;
      if (h.born + R.growSec * 1000 > now - dt * 1000) s.events.emit('ranch:grown', { id: h.id, at: { x: h.x, y: h.y } });
      continue;
    }
    while (h.nextLay > 0 && now >= h.nextLay) {
      // a full basket just waits for the player (the egg is laid when there is room)
      if (basketCount(r) >= R.basketMax) break;
      if (r.trough <= 0) {
        h.nextLay = 0;
        break;
      }
      r.trough--;
      lay(s, h);
      h.nextLay += R.laySec * 1000;
    }
  }
  if (s.area !== 'home') return;
  for (const h of r.hens) strollHen(s, h, dt);
  const p = s.player;
  if (!p.dead && basketCount(r) > 0 && Math.hypot(p.x - NEST.x, p.y - NEST.y) < R.collectRadius) collectBasket(s);
}

/** Wanders between random spots in the pen, now and then to the trough when it has feed; pecks while waiting. */
function strollHen(s: GameState, h: Hen, dt: number): void {
  const rng = s.npcRng;
  h.moving = false;
  if (h.peck > 0) h.peck -= dt;
  if (h.wait > 0) {
    h.wait -= dt;
    if (h.peck <= 0 && rng.chance(dt * 0.8)) h.peck = rng.range(0.25, 0.6);
    return;
  }
  const dx = h.tx - h.x;
  const dy = h.ty - h.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.8) {
    h.wait = rng.range(0.8, 3.2);
    const toTrough = s.ranch.trough > 0 && rng.chance(0.35);
    h.tx = toTrough ? TROUGH.x + rng.range(-4, 6) : rng.range(HEN_ROAM.x0, HEN_ROAM.x1);
    h.ty = toTrough ? TROUGH.y - 5 + rng.range(-2, 2) : rng.range(HEN_ROAM.y0, HEN_ROAM.y1);
    return;
  }
  const step = Math.min(d, R.henSpeed * (isGrown(h, s.now) ? 1 : 0.8) * dt);
  h.x += (dx / d) * step;
  h.y += (dy / d) * step;
  h.moving = true;
  h.walkT += dt * 9;
  if (Math.abs(dx) > 0.3) h.face = dx > 0 ? 1 : -1;
}

/** The hen nearest the player within reach, if any. */
export function henNear(s: GameState, radius: number): Hen | null {
  const p = s.player;
  let best: Hen | null = null;
  let bd = radius;
  for (const h of s.ranch.hens) {
    const d = Math.hypot(h.x - p.x, h.y - p.y);
    if (d < bd) {
      bd = d;
      best = h;
    }
  }
  return best;
}
