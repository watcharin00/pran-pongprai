// Damage, position-based part targeting, stun, rage, drops and player damage.
import { MONSTERS, TUNING, WEAPONS } from '../data';
import type { AttackDef, ItemBag, MaterialId, PartId } from '../data/types';
import type { Vec2 } from './events';
import { attackMul, damageReduction, gearPerk, give, weaponPower } from './inventory';
import { canStand, moveBody } from './collision';
import { inVillagePx } from './mapgen';
import { MONSTER_FRAME_COUNT, type GameState, type MonsterState } from './state';

const C = TUNING.combat;

export type HitPart = PartId | 'body';

export function findMonster(s: GameState, id: number | null): MonsterState | null {
  if (id === null) return null;
  return s.monsters.find((m) => m.id === id) ?? null;
}

/**
 * Which part a hit lands on, decided purely by where the player stands:
 * in front of the head → head, behind the tail → tail, otherwise body.
 */
export function partFor(m: MonsterState, playerX: number): HitPart {
  const size = MONSTERS[m.kind].size;
  const rel = (playerX - m.x) * m.dirX;
  const s = size * 0.25;
  if (rel > s && m.parts.head && !m.parts.head.broken) return 'head';
  if (rel < -s && m.parts.tail && !m.parts.tail.broken) return 'tail';
  return 'body';
}

export function partPoint(m: MonsterState, part: HitPart): Vec2 {
  if (part === 'body') return { x: m.x, y: m.y };
  const off = MONSTERS[m.kind].parts[part]?.offset;
  if (!off) return { x: m.x, y: m.y };
  return { x: m.x + off[0] * m.dirX, y: m.y + off[1] };
}

export function reachOf(s: GameState, m: MonsterState): number {
  return WEAPONS[s.player.weapon].range + MONSTERS[m.kind].size;
}

export function nearestMonster(s: GameState, maxD: number, preferAggro: boolean): MonsterState | null {
  const p = s.player;
  let best: MonsterState | null = null;
  let bd = maxD;
  for (const m of s.monsters) {
    if (m.burrow) continue;
    let d = Math.hypot(m.x - p.x, m.y - p.y);
    if (preferAggro && m.aggro) d *= 0.7;
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  return best;
}

/** Keeps the current lock if it is still close enough, otherwise picks the nearest monster. Pure. */
export function chooseTarget(s: GameState, maxD: number): MonsterState | null {
  const p = s.player;
  const locked = findMonster(s, p.lockId);
  // a burrowed lock is out of reach: hit whatever else is close until it comes back up
  if (locked && !locked.burrow && Math.hypot(locked.x - p.x, locked.y - p.y) < Math.max(maxD, C.lockKeepRange)) return locked;
  return nearestMonster(s, maxD, true);
}

export function aggro(m: MonsterState): void {
  if (m.mode === 'wander') {
    m.mode = 'chase';
    m.atkCd = C.monsterAggroAtkDelay;
  }
  if (m.huntT === null) m.huntT = MONSTERS[m.kind].huntTime;
  m.aggro = true;
}

export interface HitOptions {
  stun?: number;
  partMul?: number;
  big?: boolean;
  /** arrows and bolts: the only thing that reaches a flier in the air */
  ranged?: boolean;
}

/** A pack animal that turns on the player brings every packmate in earshot along. */
export function packCall(s: GameState, m: MonsterState): void {
  const r = MONSTERS[m.kind].pack;
  if (!r) return;
  let joined = 0;
  for (const o of s.monsters) {
    if (o === m || o.kind !== m.kind || o.aggro || Math.hypot(o.x - m.x, o.y - m.y) > r) continue;
    aggro(o);
    joined++;
  }
  if (joined) s.events.emit('monster:howl', { id: m.id, kind: m.kind, at: { x: m.x, y: m.y }, joined });
}

/** Digs in and heads for a spot 70-110 px from the player, out of reach until it comes up. */
export function startTunnel(s: GameState, m: MonsterState): void {
  const p = s.player;
  const r = MONSTERS[m.kind].size * 0.5;
  for (let i = 0; i < 12; i++) {
    const a = s.rng.range(0, Math.PI * 2);
    const d = s.rng.range(70, 110);
    const x = p.x + Math.cos(a) * d;
    const y = p.y + Math.sin(a) * d;
    if (!canStand(s.map, x, y, r) || (s.area === 'home' && inVillagePx(x, y))) continue;
    m.tunnel = { x, y };
    m.burrow = true;
    m.mode = 'tunnel';
    m.t = 1.6;
    m.shape = null;
    m.hitsTaken = 0;
    if (s.player.lockId === m.id) s.player.lockId = null;
    s.events.emit('monster:burrow', { id: m.id, kind: m.kind, at: { x: m.x, y: m.y } });
    return;
  }
}

/** Player damages a monster. `mult` scales weapon damage (skills). */
export function hitMonster(s: GameState, m: MonsterState, mult: number, o: HitOptions = {}): void {
  // underground (burrow attack): nothing reaches it
  if (!s.monsters.includes(m) || m.burrow) return;
  const def = MONSTERS[m.kind];
  if (m.air && !o.ranged) {
    s.events.emit('monster:airborne', { id: m.id, kind: m.kind, at: { x: m.x, y: m.y } });
    aggro(m);
    return;
  }
  // a shell turns blows from the front: circle round to the back
  const front = (s.player.x - m.x) * m.dirX > def.size * 0.25;
  if (def.frontGuard !== undefined && front) {
    mult *= def.frontGuard;
    s.events.emit('monster:guarded', { id: m.id, kind: m.kind, at: { x: m.x + m.dirX * def.size * 0.5, y: m.y } });
  }
  const w = WEAPONS[s.player.weapon];
  const part = partFor(m, s.player.x);
  const perk = gearPerk(s);
  const weak = def.weakTo === w.type ? C.weakMul : 1;
  const tail = part === 'tail' ? (perk.tailDamageMul ?? 1) : 1;
  const dmg = Math.round(weaponPower(s, s.player.weapon) * mult * s.rng.range(C.damageJitter.min, C.damageJitter.max) * attackMul(s) * weak * tail);
  let gold = false;
  let big = !!o.big;
  let tip = false;
  if (part !== 'body') {
    const ps = m.parts[part];
    const pm = w.partMul[part] * (o.partMul ?? 1);
    if (ps) ps.hp -= dmg * pm * (perk.partDamageMul ?? 1);
    if (pm >= C.goldPartMul) {
      gold = true;
      big = true;
    }
    if (m.tipT <= 0) {
      m.tipT = C.partTipCooldown;
      tip = true;
    }
  }
  s.events.emit('monster:hit', { id: m.id, kind: m.kind, part, damage: dmg, at: partPoint(m, part), gold, big, tip, color: w.color });
  if (part !== 'body' && (m.parts[part]?.hp ?? 1) <= 0) breakPart(s, m, part);

  const stun = ((part === 'head' ? w.stun : 0) + (o.stun ?? 0)) * (perk.stunMul ?? 1);
  if (stun && m.mode !== 'stun') {
    m.stunMeter += stun;
    if (m.stunMeter >= C.stunThreshold) {
      m.stunMeter = 0;
      m.mode = 'stun';
      m.stunT = C.stunDuration;
      m.shape = null;
      s.events.emit('monster:stunned', { id: m.id, kind: m.kind, at: { x: m.x, y: m.y } });
    }
  }
  m.hp -= dmg;
  m.flash = 0.09;
  const wasAggro = m.aggro;
  aggro(m);
  if (!wasAggro) packCall(s, m);
  if (def.tunnelAfterHits && m.hp > 0 && (m.mode === 'chase' || m.mode === 'recover') && ++m.hitsTaken >= def.tunnelAfterHits) startTunnel(s, m);
  if (def.rage && !m.rage && m.hp > 0 && m.hp / m.maxHp < def.rage.below) {
    m.rage = true;
    s.events.emit('monster:enraged', { id: m.id, kind: m.kind, at: { x: m.x, y: m.y } });
  }
  if (m.hp <= 0) killMonster(s, m);
}

export function breakPart(s: GameState, m: MonsterState, part: PartId): void {
  const ps = m.parts[part];
  const pd = MONSTERS[m.kind].parts[part];
  if (!ps || !pd || ps.broken) return;
  ps.broken = true;
  give(s, pd.drop);
  s.events.emit('part:broken', { id: m.id, kind: m.kind, part, at: partPoint(m, part), drops: { ...pd.drop } });
}

export function rollCarve(s: GameState, m: MonsterState): { drops: ItemBag; rare: MaterialId | null } {
  const def = MONSTERS[m.kind];
  const drops: ItemBag = {};
  const add = (k: MaterialId, n: number): void => {
    drops[k] = (drops[k] ?? 0) + n;
  };
  const V = TUNING.veteran;
  const A = TUNING.alpha;
  const mul = (m.vet ? V.carveMul : 1) * (m.alpha ? A.carveMul : 1);
  for (const c of def.carve) add(c.item, Math.round(s.rng.int(c.min, c.max) * mul));
  for (const [k, p] of Object.entries(def.bonus)) if (s.rng.next() < (p ?? 0)) add(k as MaterialId, 1);
  let rare: MaterialId | null = null;
  for (const [k, p] of Object.entries(def.rare)) {
    // a veteran always gives its rare drop
    if (m.vet || s.rng.next() < (p ?? 0)) {
      add(k as MaterialId, 1);
      rare = k as MaterialId;
    }
  }
  if (m.vet && V.seals > 0) add('seal', V.seals);
  if (m.alpha && A.seals > 0) add('seal', A.seals);
  const nonZero: ItemBag = {};
  for (const [k, n] of Object.entries(drops)) if (n) nonZero[k as MaterialId] = n;
  return { drops: nonZero, rare };
}

export function killMonster(s: GameState, m: MonsterState): void {
  const def = MONSTERS[m.kind];
  const { drops, rare } = rollCarve(s, m);
  give(s, drops);
  if (m.stolen > 0) {
    s.player.potions += m.stolen;
    s.events.emit('monster:returned', { kind: m.kind, at: { x: m.x, y: m.y }, potions: m.stolen });
  }
  s.kills[m.kind] = (s.kills[m.kind] ?? 0) + 1;
  removeMonster(s, m);
  s.events.emit('monster:killed', {
    id: m.id,
    kind: m.kind,
    at: { x: m.x, y: m.y },
    drops,
    rare,
    corpse: { dirX: m.dirX, frame: Math.floor(m.anim) % MONSTER_FRAME_COUNT, headBroken: !!m.parts.head?.broken, tailBroken: !!m.parts.tail?.broken },
    flawless: !m.hitPlayer,
    vet: m.vet,
    alpha: m.alpha,
    allParts: Object.values(m.parts).every((ps) => ps.broken),
    huntLeft: m.huntT === null ? 1 : Math.max(0, m.huntT / def.huntTime),
  });
}

/** Takes a monster out of the world and queues its respawn. */
export function removeMonster(s: GameState, m: MonsterState): void {
  s.monsters = s.monsters.filter((o) => o !== m);
  s.respawnQueue.push({ kind: m.kind, t: MONSTERS[m.kind].respawn });
  if (s.player.lockId === m.id) s.player.lockId = null;
}

/** Damage multiplier of a monster's attacks (rage, veteran, alpha). */
export function monsterDamageMul(m: MonsterState): number {
  const rage = MONSTERS[m.kind].rage;
  return (m.rage && rage ? rage.damageMul : 1) * (m.vet ? TUNING.veteran.damageMul : 1) * (m.alpha ? TUNING.alpha.damageMul : 1);
}

/**
 * A monster attack connects with the player's position; i-frames turn it into a dodge.
 * Returns true when it landed (for grabs and thefts).
 */
export function resolveMonsterHit(s: GameState, m: MonsterState, a: AttackDef): boolean {
  const p = s.player;
  if (p.dead) return false;
  if (p.rollIF > 0) {
    s.events.emit('player:dodged', { at: { x: p.x, y: p.y } });
    return false;
  }
  if (p.hurtIF > 0) return false;
  const dash = a.shape === 'line' && a.dash ? (gearPerk(s).dashDamageMul ?? 1) : 1;
  hurtPlayer(s, a.damage * monsterDamageMul(m) * dash, m, !(a.shape === 'circle' && a.grab));
  if (p.dead) return true;
  if (a.steal && p.potions > 0) {
    p.potions--;
    m.stolen++;
    m.fleeT = 6;
    s.events.emit('monster:stole', { id: m.id, kind: m.kind, at: { x: m.x, y: m.y }, potions: p.potions });
  }
  if (a.shape === 'circle' && a.grab) {
    p.grab = { id: m.id, t: a.grab, tick: 0.5, dmg: a.damage * 0.3 * monsterDamageMul(m) };
    p.roll = 0;
    p.cast = null;
    p.dash = null;
    p.x = m.x + m.dirX * 4;
    s.events.emit('player:grabbed', { kind: m.kind, at: { x: p.x, y: p.y } });
  }
  return true;
}

export function hurtPlayer(s: GameState, rawDmg: number, m: MonsterState, knock = true): void {
  const p = s.player;
  const H = TUNING.player.hurt;
  const dmg = Math.max(1, Math.round(rawDmg * (1 - damageReduction(s))));
  p.hp -= dmg;
  m.hitPlayer = true;
  p.hurt = H.flash;
  p.hurtIF = H.iframe;
  const perk = gearPerk(s);
  if (!perk.castSuperArmor) p.cast = null; // getting hit cancels a skill wind-up
  if (!perk.noKnockback && knock) {
    const dx = p.x - m.x;
    const dy = p.y - m.y;
    const d = Math.hypot(dx, dy) || 1;
    moveBody(s.map, p, (dx / d) * H.knockback, (dy / d) * H.knockback, TUNING.player.radius);
  }
  s.events.emit('player:hurt', { damage: dmg, at: { x: p.x, y: p.y }, heavy: MONSTERS[m.kind].size >= 12 });
  if (p.hp <= 0) {
    p.hp = 0;
    p.dead = true;
    p.deadT = TUNING.player.knockoutTime;
    p.lockId = null;
    p.path = [];
    p.dash = null;
    p.grab = null;
    for (const mm of s.monsters) {
      if (mm.mode !== 'wander') {
        mm.mode = 'wander';
        mm.shape = null;
      }
      mm.burrow = false;
      mm.air = false;
      mm.fleeT = 0;
      mm.aggro = false;
      mm.huntT = null;
    }
    s.events.emit('player:knockedOut', {});
  }
}
