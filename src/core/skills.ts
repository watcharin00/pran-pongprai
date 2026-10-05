// Skills. Slots 1-2 come from the weapon type, slot 3 is the weapon's signature.
// Each skill is one of a few data-driven kinds; damage scales off weapon power.
import { MONSTERS, SKILLS, TUNING, WEAPONS, WEAPON_TYPES } from '../data';
import type { DashSkillDef, SkillDef, SkillId, WeaponId, WindupAreaSkillDef } from '../data/types';
import { chooseTarget, hitMonster } from './combat';
import type { Vec2 } from './events';
import { moveBody } from './collision';
import type { GameState, MonsterState } from './state';

export type SkillSlots = readonly [SkillId, SkillId, SkillId];

/** The three skills the given weapon puts on the action pad. */
export function weaponSkills(weapon: WeaponId): SkillSlots {
  const w = WEAPONS[weapon];
  const [a, b] = WEAPON_TYPES[w.type].skills;
  return [a, b, w.signature];
}

export function skillAt(s: GameState, i: number): SkillId {
  return weaponSkills(s.player.weapon)[i as 0 | 1 | 2];
}

export function canCast(s: GameState, i: number): boolean {
  const p = s.player;
  return !p.dead && p.roll <= 0 && !p.cast && !p.dash && (p.cds[i as 0 | 1 | 2] ?? 1) <= 0;
}

/** True when a skill gives invulnerability frames (AUTO must not use it to dodge). */
export function grantsIframes(def: SkillDef): boolean {
  return def.kind === 'dash' && def.iframe > 0;
}

function hitWith(s: GameState, m: MonsterState, def: SkillDef, big = false): void {
  hitMonster(s, m, def.multiplier, { stun: def.stun, partMul: def.partMul, big });
}

/** Starts the skill in slot `i` (0-2). `move` is the current steering input, used to aim lunges. */
export function castSkill(s: GameState, i: number, move: Vec2 | null): boolean {
  if (!canCast(s, i)) return false;
  const p = s.player;
  const id = skillAt(s, i);
  const def = SKILLS[id];
  const target = chooseTarget(s, TUNING.combat.attackHoldRange);
  p.cds[i as 0 | 1 | 2] = def.cooldown;
  s.events.emit('skill:cast', { skill: id, at: { x: p.x, y: p.y } });

  switch (def.kind) {
    case 'radial':
      p.spin = def.duration;
      for (const m of s.monsters.slice()) {
        if (Math.hypot(m.x - p.x, m.y - p.y) < def.radius + MONSTERS[m.kind].size) hitWith(s, m, def);
      }
      break;
    case 'dash': {
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
      p.dash = { skill: id, t: def.duration, dx: dx / d, dy: dy / d, hit: new Set() };
      p.rollIF = def.iframe;
      if (Math.abs(dx) > 0.1) p.face = dx > 0 ? 1 : -1;
      break;
    }
    case 'windupArea':
      p.cast = { skill: id, t: def.windup, total: def.windup, tx: target ? target.x : p.x + p.face * 18, ty: target ? target.y : p.y };
      if (target) p.face = target.x >= p.x ? 1 : -1;
      break;
  }
  return true;
}

/** Advances a wind-up. Returns true while the player is locked in the cast. */
export function updateWindup(s: GameState, dt: number): boolean {
  const p = s.player;
  if (!p.cast) return false;
  p.cast.t -= dt;
  if (p.cast.t > 0) return true;
  const c = p.cast;
  p.cast = null;
  const def = SKILLS[c.skill] as WindupAreaSkillDef;
  const x = (c.tx + p.x) / 2;
  const y = (c.ty + p.y) / 2;
  s.events.emit('skill:impact', { skill: c.skill, at: { x, y }, radius: def.fxRadius });
  for (const m of s.monsters.slice()) {
    if (Math.hypot(m.x - x, m.y - y) < def.radius + MONSTERS[m.kind].size) hitWith(s, m, def, true);
  }
  return true;
}

/** Advances a lunge. Each monster can be hit once per lunge. Returns true while lunging. */
export function updateDash(s: GameState, dt: number): boolean {
  const p = s.player;
  const D = p.dash;
  if (!D) return false;
  const def = SKILLS[D.skill] as DashSkillDef;
  D.t -= dt;
  moveBody(s.map, p, D.dx * def.speed * dt, D.dy * def.speed * dt, TUNING.player.radius);
  p.moving = true;
  for (const m of s.monsters.slice()) {
    if (!D.hit.has(m.id) && Math.hypot(m.x - p.x, m.y - p.y) < MONSTERS[m.kind].size * def.hitRadiusSizeMul + def.hitRadius) {
      D.hit.add(m.id);
      hitWith(s, m, def);
    }
  }
  if (D.t <= 0) p.dash = null;
  return true;
}
