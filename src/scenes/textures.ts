// Texture keys shared between BootScene (which builds them) and the views.
import type { MonsterId, NpcId, WeaponId } from '../data/types';

export const TEX = {
  ground: 'ground',
  canopy: 'canopy',
  glow: 'glow',
  ore: 'ore',
  herb: 'herb',
  player: (frame: number) => `player${frame}`,
  monster: (kind: MonsterId, frame: number, headBroken: boolean, tailBroken: boolean) => `mon:${kind}:${frame}${headBroken ? 1 : 0}${tailBroken ? 1 : 0}`,
  weapon: (id: WeaponId) => `wpn:${id}`,
  npc: (id: NpcId, frame: number) => `npc:${id}:${frame}`,
  rice: (stage: number, sway: boolean) => `rice:${stage}${sway ? 'b' : ''}`,
  lotus: (stage: number) => `lotus:${stage}`,
} as const;

export const PLAYER_FRAMES = 3;
