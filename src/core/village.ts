// What the attack button turns into when no monster is near.
import { TUNING } from '../data';
import { ANVIL, FARM_CENTER, POT } from './mapgen';
import type { NpcId } from '../data/types';
import { npcNear } from './npc';
import type { GameState } from './state';

const V = TUNING.village;

export type ContextAction =
  | { kind: 'forge' }
  | { kind: 'kitchen' }
  | { kind: 'plant'; plot: number }
  | { kind: 'farm' }
  /** talk to a villager; what that does depends on their role */
  | { kind: 'npc'; npc: NpcId };

export function contextAction(s: GameState): ContextAction | null {
  const p = s.player;
  if (p.dead || s.area !== 'home') return null;
  if (s.monsters.some((m) => Math.hypot(m.x - p.x, m.y - p.y) < V.contextMonsterClear)) return null;
  const near = (o: { x: number; y: number }, r: number): boolean => Math.hypot(o.x - p.x, o.y - p.y) < r;
  const npc = npcNear(s, V.npcTalkRadius);
  if (npc) return { kind: 'npc', npc: npc.id };
  if (near(ANVIL, V.stationRadius)) return { kind: 'forge' };
  if (near(POT, V.stationRadius)) return { kind: 'kitchen' };
  const plot = s.plots.findIndex((q) => near(q, V.plotRadius));
  if (plot >= 0 && !s.plots[plot]?.crop) return { kind: 'plant', plot };
  if (near(FARM_CENTER, V.farmRadius)) return { kind: 'farm' };
  return null;
}
