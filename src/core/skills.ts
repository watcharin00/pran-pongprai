// Skills. Slots 1-2 come from the weapon type, slot 3 is the weapon's signature.
// Each skill is one of a few data-driven kinds; damage scales off weapon power.
import { MONSTERS, SKILLS, TUNING, WEAPONS, WEAPON_TYPES } from '../data';
import type { DashSkillDef, SkillDef, SkillId, WeaponId, WindupAreaSkillDef, WindupLineSkillDef } from '../data/types';
import { chooseTarget, hitMonster } from './combat';
import type { Vec2 } from './events';
import { moveBody } from './collision';
import { fireFan } from './shots';
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

/** Aim for line strikes and shots: the target, else the stick, else where the player faces. */
function aimAt(s: GameState, target: MonsterState | null, move: Vec2 | null): Vec2 {
  const p = s.player;
  let x: number;
  let y: number;
  if (target) ({ x, y } = { x: target.x - p.x, y: target.y - p.y });
  else if (move) ({ x, y } = move);
  else ({ x, y } = { x: p.fx || p.face, y: p.fy || 0 });
  const d = Math.hypot(x, y) || 1;
  return { x: x / d, y: y / d };
}

/** Is monster `m` inside the strip of length `len` and width `wd` starting at `from` along (ux, uy)? */
export function inLine(m: MonsterState, from: Vec2, ux: number, uy: number, len: number, wd: number): boolean {
  const size = MONSTERS[m.kind].size;
  const rx = m.x - from.x;
  const ry = m.y - from.y;
  const along = rx * ux + ry * uy;
  const across = Math.abs(rx * -uy + ry * ux);
  return along > -size * 0.5 && along < len + size * 0.5 && across < wd / 2 + size * 0.5;
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
    case 'windupLine': {
      const aim = aimAt(s, target, move);
      const hits = def.kind === 'windupLine' ? def.hits : 1;
      p.cast = { skill: id, t: def.windup, total: def.windup, tx: target ? target.x : p.x + p.face * 18, ty: target ? target.y : p.y, ux: aim.x, uy: aim.y, hits };
      if (Math.abs(aim.x) > 0.1) p.face = aim.x > 0 ? 1 : -1;
      break;
    }
    case 'projectile': {
      const aim = aimAt(s, target, move);
      p.swing = 0.2;
      p.swingAng = Math.atan2(aim.y, aim.x);
      if (Math.abs(aim.x) > 0.1) p.face = aim.x > 0 ? 1 : -1;
      fireFan(s, p.x, p.y, aim, def.count, def.spread, {
        speed: def.speed,
        range: def.range,
        pierce: def.pierce,
        mult: def.multiplier,
        stun: def.stun,
        partMul: def.partMul,
      });
      break;
    }
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
  const def = SKILLS[c.skill];
  if (def.kind === 'windupLine') {
    strikeLine(s, c.skill, def, c.ux, c.uy);
    if (c.hits > 1) p.cast = { ...c, hits: c.hits - 1, t: def.interval, total: def.interval };
    return true;
  }
  const area = def as WindupAreaSkillDef;
  const x = (c.tx + p.x) / 2;
  const y = (c.ty + p.y) / 2;
  s.events.emit('skill:impact', { skill: c.skill, at: { x, y }, radius: area.fxRadius });
  for (const m of s.monsters.slice()) {
    if (Math.hypot(m.x - x, m.y - y) < area.radius + MONSTERS[m.kind].size) hitWith(s, m, area, true);
  }
  return true;
}

function strikeLine(s: GameState, id: SkillId, def: WindupLineSkillDef, ux: number, uy: number): void {
  const p = s.player;
  const from = { x: p.x, y: p.y };
  s.events.emit('skill:impact', {
    skill: id,
    at: { x: p.x + (ux * def.length) / 2, y: p.y + (uy * def.length) / 2 },
    radius: def.length / 2,
    line: { ux, uy, len: def.length, wd: def.width, from },
  });
  for (const m of s.monsters.slice()) if (inLine(m, from, ux, uy, def.length, def.width)) hitWith(s, m, def, def.hits === 1);
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
