// Bestiary medals: small hunting feats per monster kind, tracked from the game's own events.
import { TUNING } from '../data';
import { MEDALS, type MedalId, type MonsterId } from '../data/types';
import type { GameEvents } from './events';
import type { GameState } from './state';

/** Medals a kill earns, before checking which the player already has. Pure. */
export function medalsForKill(e: GameEvents['monster:killed']): MedalId[] {
  const out: MedalId[] = [];
  if (e.flawless) out.push('flawless');
  if (e.allParts) out.push('parts');
  if (e.huntLeft >= TUNING.medals.swiftHuntLeft) out.push('swift');
  if (e.vet) out.push('veteran');
  return out;
}

export function hasMedal(s: GameState, kind: MonsterId, medal: MedalId): boolean {
  return s.medals[kind]?.includes(medal) ?? false;
}

export function medalCount(s: GameState): number {
  return Object.values(s.medals).reduce((n, list) => n + (list?.length ?? 0), 0);
}

/** Subscribes medal tracking to kills. Call once per GameState. */
export function trackMedals(s: GameState): void {
  s.events.on('monster:killed', (e) => {
    for (const medal of medalsForKill(e)) {
      if (hasMedal(s, e.kind, medal)) continue;
      // keep the list in canonical order so the bestiary and saves are stable
      s.medals[e.kind] = MEDALS.filter((m) => m === medal || hasMedal(s, e.kind, m));
      s.events.emit('medal:earned', { kind: e.kind, medal });
    }
  });
}
