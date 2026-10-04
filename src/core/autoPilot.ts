// AUTO: walks and fights for the player by producing an ordinary Intent.
// It never rolls: dodging attacks is always the player's job.
import { TUNING } from '../data';
import { chooseTarget, nearestMonster, reachOf } from './combat';
import type { Vec2 } from './events';
import { T } from './mapgen';
import { findPath, type TilePath } from './pathfinding';
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
 * 2. monster within search range → attack it (slam when it isn't winding up, else whirl; dash to close 36–85px)
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
    if (d <= reachOf(s, target)) {
      if (!p.cast) {
        if (p.cds[2] <= 0 && target.mode !== 'tele') intent.skills[2] = true;
        else if (p.cds[0] <= 0) intent.skills[0] = true;
      }
    } else if (p.cds[1] <= 0 && d > A.dashMin && d < A.dashMax) {
      intent.skills[1] = true;
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
