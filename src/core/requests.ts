// Hunt requests from the village elder. One request is active at a time: the first
// unlocked one not yet done. Progress counts automatically from game events; the
// reward is claimed by talking to the elder, which gives a reason to come home.
import { REQUESTS, TUNING } from '../data';
import type { ItemBag, RequestDef } from '../data/types';
import { give, goalIndex } from './inventory';
import type { GameState, RequestState } from './state';

export const createRequests = (): RequestState => ({ done: new Set(), progress: 0 });

/** The active request, or null when everything unlocked so far is done. */
export function currentRequest(s: GameState): RequestDef | null {
  const g = goalIndex(s);
  return REQUESTS.find((r) => !s.requests.done.has(r.id) && r.unlockGoal <= g) ?? null;
}

export function allRequestsDone(s: GameState): boolean {
  return REQUESTS.every((r) => s.requests.done.has(r.id));
}

export function requestReady(s: GameState): boolean {
  const r = currentRequest(s);
  return !!r && s.requests.progress >= r.goal.count;
}

function advance(s: GameState, amount: number): void {
  const r = currentRequest(s);
  if (!r || amount <= 0 || s.requests.progress >= r.goal.count) return;
  s.requests.progress = Math.min(r.goal.count, s.requests.progress + amount);
  s.events.emit('request:progress', { id: r.id, progress: s.requests.progress, count: r.goal.count });
  if (s.requests.progress >= r.goal.count) s.events.emit('request:ready', { id: r.id });
}

/** Subscribes request tracking to the game's own events. Call once per GameState. */
export function trackRequests(s: GameState): void {
  const ev = s.events;
  ev.on('monster:killed', (e) => {
    const g = currentRequest(s)?.goal;
    if (!g || (g.type !== 'kill' && g.type !== 'flawless') || g.monster !== e.kind) return;
    if (g.type === 'flawless' && !e.flawless) return;
    advance(s, 1);
  });
  ev.on('monster:killed', (e) => {
    const g = currentRequest(s)?.goal;
    if (g?.type === 'veteran' && e.vet && (g.monster === undefined || g.monster === e.kind)) advance(s, 1);
    if (g?.type === 'alpha' && e.alpha && (g.monster === undefined || g.monster === e.kind)) advance(s, 1);
    if (g?.type === 'swift' && g.monster === e.kind && e.huntLeft >= TUNING.medals.swiftHuntLeft) advance(s, 1);
  });
  ev.on('part:broken', (e) => {
    const g = currentRequest(s)?.goal;
    if (g?.type === 'break' && g.monster === e.kind && g.part === e.part) advance(s, 1);
  });
  ev.on('item:gathered', (e) => {
    const g = currentRequest(s)?.goal;
    if (g?.type === 'collect' && g.item === e.item) advance(s, e.amount);
  });
  ev.on('crop:harvested', (e) => {
    const g = currentRequest(s)?.goal;
    if (g?.type === 'collect') advance(s, e.drops[g.item] ?? 0);
  });
}

/** Hands in a finished request. Only in the village (the elder lives there). */
export function claimRequest(s: GameState): boolean {
  const r = currentRequest(s);
  if (!r || !s.player.inVillage || s.requests.progress < r.goal.count) return false;
  const items: ItemBag = { ...r.reward.items };
  give(s, items);
  const potions = r.reward.potions ?? 0;
  s.player.potions += potions;
  s.requests.done.add(r.id);
  s.requests.progress = 0;
  s.events.emit('request:claimed', { id: r.id, items, potions });
  return true;
}
