// The three skills. Damage scales off the equipped weapon's power.
import { MONSTERS, SKILLS, TUNING } from '../data';
import type { SkillId } from '../data/types';
import { chooseTarget, hitMonster } from './combat';
import type { Vec2 } from './events';
import { moveBody } from './collision';
import type { GameState } from './state';

export function skillAt(i: number): SkillId {
  return SKILLS.order[i as 0 | 1 | 2];
}

export function canCast(s: GameState, i: number): boolean {
  const p = s.player;
  return !p.dead && p.roll <= 0 && !p.cast && !p.dash && (p.cds[i as 0 | 1 | 2] ?? 1) <= 0;
}

/** Starts skill `i` (0-2). `move` is the current steering input, used to aim the dash. */
export function castSkill(s: GameState, i: number, move: Vec2 | null): boolean {
  if (!canCast(s, i)) return false;
  const p = s.player;
  const id = skillAt(i);
  const target = chooseTarget(s, TUNING.combat.attackHoldRange);
  p.cds[i as 0 | 1 | 2] = SKILLS[id].cooldown;
  s.events.emit('skill:cast', { skill: id, at: { x: p.x, y: p.y } });

  if (id === 'whirl') {
    const W = SKILLS.whirl;
    p.spin = W.duration;
    for (const m of s.monsters.slice()) {
      if (Math.hypot(m.x - p.x, m.y - p.y) < W.radius + MONSTERS[m.kind].size) hitMonster(s, m, W.multiplier);
    }
  } else if (id === 'dash') {
    let dx: number;
    let dy: number;
    if (move) ({ x: dx, y: dy } = move);
    else if (target) {
      dx = target.x - p.x;
      dy = target.y - p.y;
    } else {
      dx = p.fx || p.face;
      dy = p.fy || 0;
    }
    const d = Math.hypot(dx, dy) || 1;
    p.dash = { t: SKILLS.dash.duration, dx: dx / d, dy: dy / d, hit: new Set() };
    p.rollIF = SKILLS.dash.iframe;
    if (Math.abs(dx) > 0.1) p.face = dx > 0 ? 1 : -1;
  } else {
    p.cast = { t: SKILLS.slam.windup, tx: target ? target.x : p.x + p.face * 18, ty: target ? target.y : p.y };
    if (target) p.face = target.x >= p.x ? 1 : -1;
  }
  return true;
}

/** Advances the slam wind-up. Returns true while the player is locked in the cast. */
export function updateSlam(s: GameState, dt: number): boolean {
  const p = s.player;
  if (!p.cast) return false;
  p.cast.t -= dt;
  if (p.cast.t > 0) return true;
  const c = p.cast;
  p.cast = null;
  const S = SKILLS.slam;
  const x = (c.tx + p.x) / 2;
  const y = (c.ty + p.y) / 2;
  s.events.emit('skill:impact', { skill: 'slam', at: { x, y }, radius: 40 });
  for (const m of s.monsters.slice()) {
    if (Math.hypot(m.x - x, m.y - y) < S.radius + MONSTERS[m.kind].size) hitMonster(s, m, S.multiplier, { stun: S.stun, partMul: S.partMul, big: true });
  }
  return true;
}

/** Advances the dash. Each monster can be hit once per dash. Returns true while dashing. */
export function updateDash(s: GameState, dt: number): boolean {
  const p = s.player;
  const D = p.dash;
  if (!D) return false;
  const S = SKILLS.dash;
  D.t -= dt;
  moveBody(s.map, p, D.dx * S.speed * dt, D.dy * S.speed * dt, TUNING.player.radius);
  p.moving = true;
  for (const m of s.monsters.slice()) {
    if (!D.hit.has(m.id) && Math.hypot(m.x - p.x, m.y - p.y) < MONSTERS[m.kind].size * S.hitRadiusSizeMul + S.hitRadius) {
      D.hit.add(m.id);
      hitMonster(s, m, S.multiplier);
    }
  }
  if (D.t <= 0) p.dash = null;
  return true;
}
