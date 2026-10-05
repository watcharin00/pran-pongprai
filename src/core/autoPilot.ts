// AUTO: walks and fights for the player by producing an ordinary Intent.
// It never rolls: dodging attacks is always the player's job.
import { SKILLS, TUNING } from '../data';
import type { SkillAutoRole } from '../data/types';
import { chooseTarget, nearestMonster, reachOf } from './combat';
import type { Vec2 } from './events';
import { T } from './mapgen';
import { findPath, type TilePath } from './pathfinding';
import { grantsIframes, weaponSkills } from './skills';
import { emptyIntent, type GameState, type Intent } from './state';

const A = TUNING.auto;

export interface AutoPilotState {
  path: TilePath;
  repath: number;
  goal: Vec2 | null;
}

export const createAutoPilot = (): AutoPilotState => ({ path: [], repath: 0, goal: null });

/**
 * Decision order:
 * 1. HP below threshold and a potion is ready → drink
 * 2. monster within search range → attack it. Skills are picked by their `auto` role in skills.json:
 *    in reach → a ready `burst` skill if the target isn't winding up, else a ready `filler`;
 *    36–85px away → a ready `gapClose` skill. Skills with i-frames are skipped while any
 *    nearby monster is winding up or charging, so AUTO never dodges for the player.
 * 3. otherwise walk to a ready herb/ore node nearby
 * 4. otherwise walk toward the nearest monster anywhere
 */
export function autoIntent(s: GameState, ap: AutoPilotState, dt: number): Intent {
  const intent = emptyIntent();
  const p = s.player;
  if (p.dead) return intent;

  if (p.hp < p.maxHp * A.potionBelow && p.potions > 0 && p.potCd <= 0) intent.potion = true;

  const target = chooseTarget(s, A.searchRange);
  if (target) {
    ap.path = [];
    ap.goal = null;
    intent.attack = true;
    intent.targetId = target.id;
    const d = Math.hypot(target.x - p.x, target.y - p.y);
    const slot = (role: SkillAutoRole): number => pickSkill(s, role);
    if (d <= reachOf(s, target)) {
      if (!p.cast) {
        const burst = target.mode !== 'tele' ? slot('burst') : -1;
        const pick = burst >= 0 ? burst : slot('filler');
        if (pick >= 0) intent.skills[pick as 0 | 1 | 2] = true;
      }
    } else if (d > A.dashMin && d < A.dashMax) {
      const pick = slot('gapClose');
      if (pick >= 0) intent.skills[pick as 0 | 1 | 2] = true;
    }
    return intent;
  }

  let node: Vec2 | null = null;
  let nd = A.gatherRange;
  for (const n of s.nodes) {
    if (!n.ready) continue;
    const d = Math.hypot(n.x - p.x, n.y - p.y);
    if (d < nd) {
      nd = d;
      node = n;
    }
  }
  if (node) {
    // stand still on the node so gathering can finish
    if (nd > 6) intent.move = steer(s, ap, node, dt);
    return intent;
  }
  const far = nearestMonster(s, A.huntRange, false);
  if (far) intent.move = steer(s, ap, far, dt);
  return intent;
}

/** First ready skill slot with the given AUTO role, or -1. */
function pickSkill(s: GameState, role: SkillAutoRole): number {
  const p = s.player;
  const ids = weaponSkills(p.weapon);
  const threat = s.monsters.some((m) => (m.mode === 'tele' || m.mode === 'dash') && Math.hypot(m.x - p.x, m.y - p.y) < A.searchRange);
  for (let i = 0; i < ids.length; i++) {
    const def = SKILLS[ids[i] as (typeof ids)[number]];
    if (def.auto !== role || p.cds[i as 0 | 1 | 2] > 0) continue;
    if (threat && grantsIframes(def)) continue;
    return i;
  }
  return -1;
}

/** A* path following that returns a unit move vector. */
function steer(s: GameState, ap: AutoPilotState, goal: Vec2, dt: number): Vec2 | null {
  const p = s.player;
  ap.repath -= dt;
  const goalMoved = !ap.goal || Math.hypot(ap.goal.x - goal.x, ap.goal.y - goal.y) > T;
  if (ap.repath <= 0 || !ap.path.length || goalMoved) {
    ap.repath = A.repathInterval;
    ap.goal = { x: goal.x, y: goal.y };
    ap.path = findPath(s.map, Math.floor(p.x / T), Math.floor(p.y / T), Math.floor(goal.x / T), Math.floor(goal.y / T)) ?? [];
  }
  while (ap.path.length) {
    const [tx, ty] = ap.path[0] ?? [0, 0];
    const dx = tx * T + 8 - p.x;
    const dy = ty * T + 8 - p.y;
    const d = Math.hypot(dx, dy);
    if (d >= 3) return { x: dx / d, y: dy / d };
    ap.path.shift();
  }
  const dx = goal.x - p.x;
  const dy = goal.y - p.y;
  const d = Math.hypot(dx, dy);
  return d > 1 ? { x: dx / d, y: dy / d } : null;
}
