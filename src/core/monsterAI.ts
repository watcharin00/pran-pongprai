// Monster state machine: wander → chase → tele → (dash) → recover → chase, plus stun.
// Monsters turn slowly and can only start an attack once facing the player,
// which opens a window to circle behind them for the tail.
import { MONSTERS, TUNING } from '../data';
import type { AttackDef, MonsterId, PartId } from '../data/types';
import { aggro, removeMonster, resolveMonsterHit } from './combat';
import { canStand, moveBody } from './collision';
import { inVillagePx, PLAZA, T } from './mapgen';
import type { GameState, MonsterState, PartState, Shape } from './state';

const C = TUNING.combat;
/** Spawn-distance rules measure from the fountain. */
const VILLAGE_CENTER = { x: PLAZA.x * T + 8, y: PLAZA.y * T + 8 } as const;

export function createMonster(id: number, kind: MonsterId, x: number, y: number, dirX: 1 | -1): MonsterState {
  const def = MONSTERS[kind];
  const parts: Partial<Record<PartId, PartState>> = {};
  for (const [k, pd] of Object.entries(def.parts)) if (pd) parts[k as PartId] = { hp: pd.hp, broken: false };
  return {
    id, kind, x, y, hx: x, hy: y, hp: def.hp, parts, mode: 'wander', t: 0, tt: 1, dirX, turnT: 0, wanderT: 0, waypoint: null,
    atkCd: 0, flash: 0, stunMeter: 0, stunT: 0, huntT: null, aggro: false, leash: 0, rage: false, shape: null, attack: null,
    dashLeft: 0, dashHit: false, anim: 0, tipT: 0,
  };
}

/** Places a monster on a random free cell of its zone, away from the player and other monsters. */
export function spawnMonster(s: GameState, kind: MonsterId): MonsterState | null {
  const def = MONSTERS[kind];
  const zoneCells = def.zone === 'forest' ? s.map.forestCells : s.map.canyonCells;
  const cells = def.spawnMinVillageDist > 0 ? zoneCells.filter(([tx, ty]) => Math.hypot(tx * T + 8 - VILLAGE_CENTER.x, ty * T + 8 - VILLAGE_CENTER.y) >= def.spawnMinVillageDist) : zoneCells;
  if (cells.length === 0) return null;
  for (let tries = 0; tries < 80; tries++) {
    const [tx, ty] = s.rng.pick(cells);
    const x = tx * T + 8;
    const y = ty * T + 8;
    if (Math.hypot(x - s.player.x, y - s.player.y) < C.monsterSpawnMinPlayerDist) continue;
    if (!canStand(s.map, x, y, def.size * 0.5)) continue;
    if (s.monsters.some((m) => Math.hypot(m.x - x, m.y - y) < C.monsterSpawnMinSpacing)) continue;
    const m = createMonster(s.nextId++, kind, x, y, s.rng.chance(0.5) ? 1 : -1);
    s.monsters.push(m);
    s.events.emit('monster:spawned', { id: m.id, kind, at: { x, y } });
    return m;
  }
  return null;
}

export function pickWeighted(attacks: readonly AttackDef[], r: number): AttackDef | null {
  let sum = 0;
  for (const a of attacks) sum += a.weight;
  let left = r * sum;
  for (const a of attacks) {
    left -= a.weight;
    if (left <= 0) return a;
  }
  return attacks[0] ?? null;
}

/**
 * Slow turning: the monster only flips after wanting the other direction for
 * longer than `turnTime`. Returns true when it is facing `want`.
 */
export function updateFacing(m: MonsterState, want: 1 | -1, dt: number, turnTime: number): boolean {
  if (want !== m.dirX) {
    m.turnT += dt;
    if (m.turnT > turnTime) {
      m.dirX = want;
      m.turnT = 0;
    }
  } else m.turnT = 0;
  return want === m.dirX;
}

export function startAttack(m: MonsterState, a: AttackDef, ux: number, uy: number): void {
  m.mode = 'tele';
  m.attack = a;
  m.t = a.telegraph;
  m.tt = a.telegraph;
  m.dirX = ux >= 0 ? 1 : -1;
  m.turnT = 0;
  const shape: Shape =
    a.shape === 'circle'
      ? { kind: 'circle', cx: m.x + ux * a.offset, cy: m.y + uy * a.offset, r: a.radius }
      : { kind: 'line', sx: m.x, sy: m.y, ux, uy, len: a.length, wd: a.width };
  m.shape = shape;
}

function calmDown(s: GameState, m: MonsterState): void {
  m.mode = 'wander';
  m.shape = null;
  m.aggro = false;
  m.huntT = null;
  m.leash = 0;
  if (s.player.lockId === m.id) s.player.lockId = null;
}

export function updateMonster(s: GameState, m: MonsterState, dt: number): void {
  const ox = m.x;
  const oy = m.y;
  think(s, m, dt);
  if (s.monsters.includes(m)) m.anim += Math.hypot(m.x - ox, m.y - oy) * 0.2;
  m.tipT -= dt;
}

function think(s: GameState, m: MonsterState, dt: number): void {
  const def = MONSTERS[m.kind];
  const p = s.player;
  m.flash -= dt;
  const dx = p.x - m.x;
  const dy = p.y - m.y;
  const d = Math.hypot(dx, dy) || 0.01;

  if (m.aggro && m.huntT !== null) {
    m.huntT -= dt;
    if (m.huntT <= 0) {
      removeMonster(s, m);
      s.events.emit('monster:fled', { id: m.id, kind: m.kind, at: { x: m.x, y: m.y } });
      return;
    }
  }
  const rage = m.rage ? def.rage : null;
  const spd = def.speed * (rage ? rage.speedMul : 1);
  const r = def.size * 0.5;
  const playerInVillage = inVillagePx(p.x, p.y);

  switch (m.mode) {
    case 'stun':
      m.stunT -= dt;
      if (m.stunT <= 0) {
        m.mode = 'chase';
        m.atkCd = 0.4;
      }
      return;

    case 'wander': {
      m.wanderT -= dt;
      if (m.wanderT <= 0) {
        m.wanderT = s.rng.range(2, 4);
        const a = s.rng.range(0, Math.PI * 2);
        const rad = s.rng.range(0, C.monsterWanderRadius);
        const tx = m.hx + Math.cos(a) * rad;
        const ty = m.hy + Math.sin(a) * rad;
        m.waypoint = canStand(s.map, tx, ty, r) ? { x: tx, y: ty } : null;
      }
      if (m.waypoint) {
        const wx = m.waypoint.x - m.x;
        const wy = m.waypoint.y - m.y;
        const wd = Math.hypot(wx, wy);
        if (wd > 2) {
          const sp = spd * C.monsterWanderSpeedMul * dt;
          moveBody(s.map, m, (wx / wd) * sp, (wy / wd) * sp, r);
          m.dirX = wx > 0 ? 1 : -1;
        }
      }
      if (!p.dead && d < def.aggroRadius && !playerInVillage) aggro(m);
      return;
    }
    default:
      break;
  }

  // Monsters never follow into the village; they give up after a short wait.
  if (p.dead || (playerInVillage && m.mode === 'chase' && d > C.monsterVillageChaseDistance)) {
    m.leash += dt;
    if (m.leash > C.monsterLeashVillage || p.dead) calmDown(s, m);
    return;
  }

  switch (m.mode) {
    case 'chase': {
      const want: 1 | -1 = dx >= 0 ? 1 : -1;
      const facing = updateFacing(m, want, dt, def.turnTime);
      m.atkCd -= dt;
      if (d > C.monsterLeashFarDistance) {
        m.leash += dt;
        if (m.leash > C.monsterLeashFar) {
          calmDown(s, m);
          return;
        }
      } else m.leash = 0;
      if (m.atkCd <= 0 && facing) {
        const opts = def.attacks.filter((a) => d <= a.range && (a.minRange === undefined || d >= a.minRange));
        const a = pickWeighted(opts, s.rng.next());
        if (a) {
          startAttack(m, a, dx / d, dy / d);
          s.events.emit('monster:telegraph', { id: m.id, kind: m.kind, attackId: a.id });
          return;
        }
      }
      if (d > def.size + 10) moveBody(s.map, m, (dx / d) * spd * dt, (dy / d) * spd * dt, r);
      return;
    }

    case 'tele': {
      m.t -= dt * (rage ? rage.telegraphRate : 1);
      if (m.t > 0) return;
      const a = m.attack;
      const sh = m.shape;
      if (!a || !sh) {
        m.mode = 'recover';
        m.t = def.recover;
        return;
      }
      if (a.shape === 'line' && a.dash) {
        m.mode = 'dash';
        m.dashLeft = a.length;
        m.dashHit = false;
        return;
      }
      if (sh.kind === 'circle') {
        if (Math.hypot(p.x - sh.cx, p.y - sh.cy) <= sh.r + 3) resolveMonsterHit(s, m, a);
        s.events.emit('monster:strike', { id: m.id, kind: m.kind, at: { x: sh.cx, y: sh.cy }, radius: sh.r });
      }
      m.mode = 'recover';
      m.t = def.recover;
      m.shape = null;
      return;
    }

    case 'dash': {
      const sh = m.shape;
      const a = m.attack;
      if (!sh || sh.kind !== 'line' || !a) {
        m.mode = 'recover';
        m.t = def.recover;
        return;
      }
      const step = Math.min(m.dashLeft, C.monsterDashSpeed * dt);
      const moved = moveBody(s.map, m, sh.ux * step, sh.uy * step, r);
      m.dashLeft -= step;
      if (!m.dashHit && Math.hypot(p.x - m.x, p.y - m.y) < def.size * 0.6 + 5) {
        m.dashHit = true;
        resolveMonsterHit(s, m, a);
      }
      if (m.dashLeft <= 0 || !moved) {
        m.mode = 'recover';
        m.t = def.recover;
        m.shape = null;
        s.events.emit('monster:dashEnd', { id: m.id, kind: m.kind, at: { x: m.x, y: m.y } });
      }
      return;
    }

    case 'recover':
      m.t -= dt;
      if (m.t <= 0) {
        m.mode = 'chase';
        m.atkCd = s.rng.range(0.4, 1.0);
      }
      return;

    default:
      return;
  }
}
