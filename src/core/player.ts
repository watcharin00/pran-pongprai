// Player simulation: instant actions (dodge, skills, potion) and per-frame movement/attacks.
import { TUNING, WEAPONS } from '../data';
import { chooseTarget, findMonster, hitMonster, reachOf } from './combat';
import type { Vec2 } from './events';
import { moveBody } from './collision';
import { harvest, isRipe } from './farm';
import { give, dodgeCost, maxHpFor, maxStaminaFor, staminaRegenMul } from './inventory';
import { inVillagePx, SPAWN, T, zoneAtPx } from './mapgen';
import { findPath } from './pathfinding';
import { clearShot, fireShot } from './shots';
import { castSkill, updateDash, updateWindup } from './skills';
import type { GameState, Intent, MonsterState } from './state';

const P = TUNING.player;
const C = TUNING.combat;
const G = TUNING.gather;
const V = TUNING.village;

/** Edge-triggered inputs. Runs even during hitstop (dt = 0), like button presses in the prototype. */
export function processActions(s: GameState, intent: Intent): void {
  const p = s.player;
  if (intent.lockId !== null && findMonster(s, intent.lockId)) p.lockId = intent.lockId;
  if (intent.potion) drink(s);
  if (intent.dodge) dodge(s, intent.move);
  intent.skills.forEach((pressed, i) => {
    if (pressed) castSkill(s, i, intent.move);
  });
}

export function drink(s: GameState): boolean {
  const p = s.player;
  if (p.dead || p.roll > 0 || p.potCd > 0) return false;
  if (p.potions <= 0) {
    s.events.emit('player:noPotion', {});
    return false;
  }
  if (p.hp >= p.maxHp) return false;
  p.potions--;
  p.potCd = P.potion.cooldown;
  p.hp = Math.min(p.maxHp, p.hp + P.potion.heal);
  s.events.emit('player:drink', { heal: P.potion.heal, at: { x: p.x, y: p.y } });
  return true;
}

/**
 * Roll direction when the stick is centred: sideways out of a charge line,
 * outward from a circle attack, away from the locked target, else forward.
 */
export function dodgeDirection(s: GameState, move: Vec2 | null): Vec2 {
  const p = s.player;
  if (move) return move;
  let threat: MonsterState | null = null;
  let bd = Infinity;
  for (const m of s.monsters) {
    if (m.mode !== 'tele' && m.mode !== 'dash') continue;
    const d = Math.hypot(m.x - p.x, m.y - p.y);
    if (d < bd && d < 170) {
      bd = d;
      threat = m;
    }
  }
  const sh = threat?.shape;
  if (sh) {
    if (sh.kind === 'line') {
      const side = (p.x - sh.sx) * -sh.uy + (p.y - sh.sy) * sh.ux >= 0 ? 1 : -1;
      return { x: -sh.uy * side, y: sh.ux * side };
    }
    const dx = p.x - sh.cx;
    const dy = p.y - sh.cy;
    return Math.hypot(dx, dy) > 1 ? { x: dx, y: dy } : { x: p.face, y: 0 };
  }
  const lock = findMonster(s, p.lockId);
  if (lock) return { x: p.x - lock.x, y: p.y - lock.y };
  return { x: p.fx || p.face, y: p.fy || 0 };
}

export function dodge(s: GameState, move: Vec2 | null): boolean {
  const p = s.player;
  if (p.dead || p.roll > 0 || p.dash || p.dodgeCd > 0) return false;
  p.cast = null; // rolling cancels a skill wind-up
  const cost = dodgeCost(s);
  if (p.st < cost) {
    s.events.emit('player:tired', { at: { x: p.x, y: p.y } });
    return false;
  }
  const dir = dodgeDirection(s, move);
  const d = Math.hypot(dir.x, dir.y) || 1;
  p.rdx = dir.x / d;
  p.rdy = dir.y / d;
  p.roll = P.roll.duration;
  p.rollIF = P.roll.iframe;
  p.dodgeCd = P.roll.cooldown;
  p.st -= cost;
  p.stDelay = P.staminaDelay;
  p.path = [];
  if (Math.abs(p.rdx) > 0.1) p.face = p.rdx > 0 ? 1 : -1;
  s.events.emit('player:roll', { at: { x: p.x, y: p.y } });
  return true;
}

export function stepMove(s: GameState, ux: number, uy: number, dt: number): void {
  const p = s.player;
  const sp = P.walkSpeed * dt;
  moveBody(s.map, p, ux * sp, uy * sp, P.radius);
  if (Math.abs(ux) > 0.15) p.face = ux > 0 ? 1 : -1;
  p.fx = ux;
  p.fy = uy;
  p.moving = true;
}

/** Follows an A* path toward (x, y), re-planning every half second. */
export function walkTo(s: GameState, x: number, y: number, dt: number): void {
  const p = s.player;
  p.repath -= dt;
  if (p.repath <= 0 || !p.path.length) {
    p.repath = TUNING.auto.repathInterval;
    p.path = findPath(s.map, Math.floor(p.x / T), Math.floor(p.y / T), Math.floor(x / T), Math.floor(y / T)) ?? [];
  }
  const next = p.path[0];
  if (!next) {
    const dx = x - p.x;
    const dy = y - p.y;
    const d = Math.hypot(dx, dy);
    if (d > 1) stepMove(s, dx / d, dy / d, dt);
    return;
  }
  const gx = next[0] * T + 8;
  const gy = next[1] * T + 8;
  const dx = gx - p.x;
  const dy = gy - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 3) {
    p.path.shift();
    return;
  }
  stepMove(s, dx / d, dy / d, dt);
}

function basicAttack(s: GameState, m: MonsterState): void {
  const p = s.player;
  const w = WEAPONS[p.weapon];
  p.atkCd = w.rate;
  p.swing = 0.2;
  p.swingAng = Math.atan2(m.y - p.y, m.x - p.x);
  p.face = m.x >= p.x ? 1 : -1;
  s.events.emit('player:attack', { weapon: p.weapon, at: { x: p.x, y: p.y } });
  if (w.projectile) fireShot(s, p.x, p.y, { x: m.x - p.x, y: m.y - p.y }, { ...w.projectile, mult: 1 });
  else hitMonster(s, m, 1);
}

function tickTimers(s: GameState, dt: number): void {
  const p = s.player;
  p.atkCd -= dt;
  p.swing -= dt;
  p.rollIF -= dt;
  p.hurtIF -= dt;
  p.hurt -= dt;
  p.dodgeCd -= dt;
  p.stDelay -= dt;
  p.potCd -= dt;
  p.spin -= dt;
  for (let i = 0; i < 3; i++) p.cds[i as 0 | 1 | 2] = Math.max(0, p.cds[i as 0 | 1 | 2] - dt);
}

export function updatePlayer(s: GameState, intent: Intent, dt: number): void {
  const p = s.player;
  if (p.dead) {
    p.deadT -= dt;
    if (p.deadT <= 0) {
      Object.assign(p, { dead: false, x: SPAWN.x, y: SPAWN.y, hp: p.maxHp, st: p.maxSt, roll: 0, hurtIF: 1 });
      s.events.emit('player:revived', { at: { x: p.x, y: p.y } });
    }
    return;
  }
  tickTimers(s, dt);
  p.maxHp = maxHpFor(s);
  if (p.hp > p.maxHp) p.hp = p.maxHp;
  p.maxSt = maxStaminaFor(s);
  if (p.st > p.maxSt) p.st = p.maxSt;
  if (p.stDelay <= 0) p.st = Math.min(p.maxSt, p.st + P.staminaRegen * staminaRegenMul(s) * dt);
  p.inVillage = inVillagePx(p.x, p.y);
  if (p.inVillage && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + P.villageRegen * dt);
  const zone = zoneAtPx(s.map, p.x, p.y);
  if (zone !== p.zone) {
    if (p.zone !== null) s.events.emit('zone:entered', { zone });
    p.zone = zone;
  }
  p.moving = false;

  if (updateWindup(s, dt)) return;
  if (updateDash(s, dt)) return;
  if (p.roll > 0) {
    p.roll -= dt;
    moveBody(s.map, p, p.rdx * P.roll.speed * dt, p.rdy * P.roll.speed * dt, P.radius);
    p.moving = true;
    return;
  }

  const mv = intent.move;
  if (mv) {
    stepMove(s, mv.x, mv.y, dt);
    p.path = [];
  }

  let target: MonsterState | null = null;
  if (intent.attack) target = intent.targetId !== null ? findMonster(s, intent.targetId) : chooseTarget(s, C.attackHoldRange);
  if (target) {
    p.lockId = target.id;
    const d = Math.hypot(target.x - p.x, target.y - p.y);
    // ranged weapons need a clear line; otherwise keep walking in until there is one
    const canHit = d <= reachOf(s, target) && (!WEAPONS[p.weapon].projectile || clearShot(s, p.x, p.y, target.x, target.y));
    if (canHit) {
      if (!mv) p.face = target.x >= p.x ? 1 : -1;
      if (p.atkCd <= 0) basicAttack(s, target);
    } else if (!mv) {
      if (d < C.approachDirectRange) stepMove(s, (target.x - p.x) / d, (target.y - p.y) / d, dt);
      else walkTo(s, target.x, target.y, dt);
    }
  }

  updateGathering(s, dt);
  // walking over a ripe plot harvests it
  s.plots.forEach((pl, i) => {
    if (isRipe(pl, s.now) && Math.hypot(pl.x - p.x, pl.y - p.y) < V.harvestRadius) harvest(s, i);
  });
  if (p.moving) p.walkT += dt * 9;
}

/** Standing still on a herb/ore node for a moment collects it. */
function updateGathering(s: GameState, dt: number): void {
  const p = s.player;
  const node = s.nodes.find((n) => n.ready && Math.hypot(n.x - p.x, n.y - p.y) < G.pickupRadius) ?? null;
  if (!node) {
    p.gatherNode = null;
    p.gatherT = 0;
    return;
  }
  if (p.moving) return;
  if (p.gatherNode !== node.id) {
    p.gatherNode = node.id;
    p.gatherT = 0;
  }
  p.gatherT += dt;
  if (p.gatherT < G.holdTime) return;
  node.ready = false;
  node.regen = G.regen;
  const amount = s.rng.int(G.amountMin, G.amountMax);
  give(s, { [node.kind]: amount });
  const bonusSeed = node.kind === 'herb' && s.rng.next() < G.herbSeedChance;
  if (bonusSeed) give(s, { seed_herb: 1 });
  p.gatherNode = null;
  p.gatherT = 0;
  s.events.emit('item:gathered', { item: node.kind, amount, at: { x: node.x, y: node.y }, bonusSeed });
}
