// What the attack button turns into when no monster is near.
import { TUNING } from '../data';
import { ANVIL, FARM_CENTER, NEST, POND_CENTER, POT, TROUGH } from './mapgen';
import { canHatch, henNear } from './ranch';
import type { NpcId } from '../data/types';
import { plotReach } from './farm';
import { npcNear } from './npc';
import type { GameState } from './state';

const V = TUNING.village;

export type ContextAction =
  | { kind: 'forge' }
  | { kind: 'kitchen' }
  | { kind: 'plant'; plot: number }
  | { kind: 'farm' }
  /** brew a potion at a hunter camp's fire */
  | { kind: 'brew' }
  /** chicken coop: put a jungle-fowl egg in the nest / a crop in the trough / pet a hen */
  | { kind: 'hatch' }
  | { kind: 'feed' }
  | { kind: 'pet'; hen: number }
  /** talk to a villager; what that does depends on their role */
  | { kind: 'npc'; npc: NpcId };

/** The nearest coop thing in reach: a hen to pet, the trough, the nest (only with an egg to hatch). */
function coopAction(s: GameState): ContextAction | null {
  const p = s.player;
  const R = TUNING.ranch;
  const opts: { d: number; a: ContextAction }[] = [];
  const hen = henNear(s, R.petRadius);
  if (hen) opts.push({ d: Math.hypot(hen.x - p.x, hen.y - p.y), a: { kind: 'pet', hen: hen.id } });
  const dt = Math.hypot(TROUGH.x - p.x, TROUGH.y - p.y);
  if (dt < R.feedRadius) opts.push({ d: dt, a: { kind: 'feed' } });
  const dn = Math.hypot(NEST.x - p.x, NEST.y - p.y);
  if (dn < R.hatchRadius && canHatch(s)) opts.push({ d: dn, a: { kind: 'hatch' } });
  opts.sort((a, b) => a.d - b.d);
  return opts[0]?.a ?? null;
}

export function contextAction(s: GameState): ContextAction | null {
  const p = s.player;
  if (p.dead) return null;
  if (s.monsters.some((m) => Math.hypot(m.x - p.x, m.y - p.y) < V.contextMonsterClear)) return null;
  const near = (o: { x: number; y: number }, r: number): boolean => Math.hypot(o.x - p.x, o.y - p.y) < r;
  const npc = npcNear(s, V.npcTalkRadius);
  if (npc) return { kind: 'npc', npc: npc.id };
  const camp = s.map.camp;
  if (camp && near(camp.fire, TUNING.camp.fireRadius)) return { kind: 'brew' };
  if (s.area !== 'home') return null;
  if (near(ANVIL, V.stationRadius)) return { kind: 'forge' };
  const coop = coopAction(s);
  if (coop) return coop;
  if (near(POT, V.stationRadius)) return { kind: 'kitchen' };
  // pond slots are water, so they are planted from the bank
  const plot = s.plots.findIndex((q) => near(q, q.bed === 'soil' ? V.plotRadius : plotReach(q)));
  if (plot >= 0 && !s.plots[plot]?.crop) return { kind: 'plant', plot };
  if (near(FARM_CENTER, V.farmRadius) || near(POND_CENTER, V.farmRadius)) return { kind: 'farm' };
  return null;
}
