// Player projectiles (arrows, bolts). Pure simulation: shots move in small
// sub-steps so fast bolts cannot skip past a monster or a tree.
import { MONSTERS } from '../data';
import type { Vec2 } from './events';
import { hitMonster } from './combat';
import { shotPassablePx } from './mapgen';
import type { GameState, Shot } from './state';

/** Shots never move more than this many px between collision checks. */
const SUBSTEP = 4;
/** Extra px added to a monster's body radius for shot collision. */
const SHOT_SLOP = 3;
/** Shot-vs-monster radius as a fraction of monster size. */
const BODY_MUL = 0.8;

export interface FireOptions {
  speed: number;
  range: number;
  pierce: number;
  mult: number;
  stun?: number;
  partMul?: number;
  big?: boolean;
}

/** True when nothing blocks a shot from (x0, y0) to (x1, y1). */
export function clearShot(s: GameState, x0: number, y0: number, x1: number, y1: number): boolean {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.ceil(d / SUBSTEP);
  for (let i = 1; i < n; i++) {
    const k = i / n;
    if (!shotPassablePx(s.map, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k)) return false;
  }
  return true;
}

/** Fires one shot from (x, y) along `dir` (need not be normalised). */
export function fireShot(s: GameState, x: number, y: number, dir: Vec2, o: FireOptions): Shot {
  const d = Math.hypot(dir.x, dir.y) || 1;
  const shot: Shot = {
    id: s.nextId++,
    x,
    y,
    dx: dir.x / d,
    dy: dir.y / d,
    speed: o.speed,
    left: o.range,
    pierce: o.pierce,
    mult: o.mult,
    stun: o.stun ?? 0,
    partMul: o.partMul ?? 1,
    big: o.big ?? false,
    hit: new Set(),
  };
  s.shots.push(shot);
  return shot;
}

/** Fires `count` shots fanned evenly across `spreadDeg` degrees around `dir`. */
export function fireFan(s: GameState, x: number, y: number, dir: Vec2, count: number, spreadDeg: number, o: FireOptions): void {
  const base = Math.atan2(dir.y, dir.x);
  const spread = (spreadDeg * Math.PI) / 180;
  for (let i = 0; i < count; i++) {
    const a = count === 1 ? base : base - spread / 2 + (spread * i) / (count - 1);
    fireShot(s, x, y, { x: Math.cos(a), y: Math.sin(a) }, o);
  }
}

export function updateShots(s: GameState, dt: number): void {
  for (const shot of s.shots) {
    let travel = Math.min(shot.speed * dt, shot.left);
    while (travel > 0 && shot.left > 0) {
      const d = Math.min(SUBSTEP, travel);
      travel -= d;
      shot.left -= d;
      shot.x += shot.dx * d;
      shot.y += shot.dy * d;
      if (!shotPassablePx(s.map, shot.x, shot.y)) {
        shot.left = 0;
        s.events.emit('shot:blocked', { at: { x: shot.x, y: shot.y } });
        break;
      }
      const m = s.monsters.find((mm) => !mm.burrow && !shot.hit.has(mm.id) && Math.hypot(mm.x - shot.x, mm.y - shot.y) < MONSTERS[mm.kind].size * BODY_MUL + SHOT_SLOP);
      if (!m) continue;
      shot.hit.add(m.id);
      hitMonster(s, m, shot.mult, { stun: shot.stun, partMul: shot.partMul, big: shot.big, ranged: true });
      if (shot.pierce <= 0) {
        shot.left = 0;
        break;
      }
      shot.pierce--;
    }
  }
  s.shots = s.shots.filter((shot) => shot.left > 0);
}
