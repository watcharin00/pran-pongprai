// Spear, bow/crossbow and the per-weapon skills added with them.
import { describe, expect, it } from 'vitest';
import { SKILLS, WEAPONS } from '../src/data';
import type { WeaponId } from '../src/data/types';
import { autoIntent, createAutoPilot } from '../src/core/autoPilot';
import { clearShot, fireShot } from '../src/core/shots';
import { reachOf } from '../src/core/combat';
import { weaponSkills } from '../src/core/skills';
import { step } from '../src/core/sim';
import { Tile, T, walkable } from '../src/core/mapgen';
import { addMonster, game, intent, openSpot, run } from './helpers';

function arena(weapon: WeaponId) {
  const s = game();
  const spot = openSpot(s);
  Object.assign(s.player, spot, { inVillage: false, weapon });
  return { s, spot };
}

const slotOf = (weapon: WeaponId, skill: string): [boolean, boolean, boolean] => {
  const i = weaponSkills(weapon).indexOf(skill as never);
  if (i < 0) throw new Error(`${weapon} has no ${skill}`);
  return [i === 0, i === 1, i === 2];
};

describe('weapon skill sets', () => {
  it('every weapon has a skill AUTO can use in reach', () => {
    for (const id of Object.keys(WEAPONS) as WeaponId[]) {
      const roles = weaponSkills(id).map((k) => SKILLS[k].auto);
      expect(roles.some((r) => r === 'burst' || r === 'filler'), id).toBe(true);
    }
  });

  it('weapon types have different skill sets', () => {
    expect(weaponSkills('bamboospear').slice(0, 2)).toEqual(['thrust', 'dash']);
    expect(weaponSkills('bamboobow').slice(0, 2)).toEqual(['volley', 'pin']);
    expect(weaponSkills('mossmaul')).toEqual(['slam', 'sweep', 'quake']);
  });
});

describe('line strikes', () => {
  it('thrust strikes three times along the aim, then ends', () => {
    const { s, spot } = arena('bamboospear');
    const m = addMonster(s, 'dhole', spot.x + 30, spot.y, -1);
    m.hp = 9999;
    let hits = 0;
    s.events.on('monster:hit', () => hits++);
    step(s, intent({ skills: slotOf('bamboospear', 'thrust') }), 0, s.now);
    run(s, 0.6);
    expect(hits).toBe(3);
    expect(s.player.cast).toBeNull();
  });

  it('only hits monsters inside the strip, not beside it', () => {
    const { s, spot } = arena('bamboospear');
    const front = addMonster(s, 'dhole', spot.x + 30, spot.y);
    const side = addMonster(s, 'dhole', spot.x, spot.y + 30);
    front.hp = side.hp = 9999;
    s.player.lockId = front.id;
    step(s, intent({ skills: slotOf('bamboospear', 'pierce') }), 0, s.now);
    run(s, 0.5);
    expect(front.hp).toBeLessThan(9999);
    expect(side.hp).toBe(9999);
  });

  it('rolling cancels the remaining thrusts', () => {
    const { s, spot } = arena('bamboospear');
    const m = addMonster(s, 'dhole', spot.x + 30, spot.y);
    m.hp = 9999;
    let hits = 0;
    s.events.on('monster:hit', () => hits++);
    step(s, intent({ skills: slotOf('bamboospear', 'thrust') }), 0, s.now);
    run(s, 0.15);
    step(s, intent({ dodge: true }), 1 / 60, s.now);
    run(s, 0.5);
    expect(hits).toBe(1);
  });
});

describe('projectiles', () => {
  it('a bow attacks from range with arrows that fly before landing', () => {
    const { s, spot } = arena('bamboobow');
    const m = addMonster(s, 'dhole', spot.x + 55, spot.y);
    m.hp = 9999;
    step(s, intent({ attack: true }), 1 / 60, s.now);
    expect(s.shots.length).toBe(1);
    expect(m.hp).toBe(9999);
    run(s, 0.4);
    expect(m.hp).toBeLessThan(9999);
    expect(s.shots.length).toBe(0);
    // the player did not need to walk into melee range
    expect(Math.abs(s.player.x - spot.x)).toBeLessThan(2);
  });

  it('part targeting still follows where the player stands', () => {
    const { s, spot } = arena('bamboobow');
    const m = addMonster(s, 'dhole', spot.x + 55, spot.y, -1); // facing the player
    m.hp = 9999;
    const parts: string[] = [];
    s.events.on('monster:hit', (e) => parts.push(e.part));
    step(s, intent({ attack: true }), 1 / 60, s.now);
    run(s, 0.4);
    expect(parts[0]).toBe('head');
  });

  it('volley fans three arrows; pierce passes through monsters in a line', () => {
    const { s, spot } = arena('bamboobow');
    step(s, intent({ skills: slotOf('bamboobow', 'volley'), move: { x: 1, y: 0 } }), 0, s.now);
    expect(s.shots.length).toBe(3);
    const ys = s.shots.map((sh) => Math.sign(Math.round(sh.dy * 100)));
    expect(ys.sort()).toEqual([-1, 0, 1]);

    s.shots = [];
    const a = addMonster(s, 'dhole', spot.x + 30, spot.y);
    const b = addMonster(s, 'dhole', spot.x + 55, spot.y);
    a.hp = b.hp = 9999;
    fireShot(s, spot.x, spot.y, { x: 1, y: 0 }, { speed: 300, range: 120, pierce: 1, mult: 1 });
    run(s, 0.4);
    expect(a.hp).toBeLessThan(9999);
    expect(b.hp).toBeLessThan(9999);
  });

  it('arrows fly over trees but stop at houses', () => {
    const s = game();
    const firstLeftEdge = (tile: number): [number, number] => {
      const i = s.map.tiles.findIndex((t, k) => t === tile && k % 64 > 3 && [1, 2, 3].every((n) => s.map.tiles[k - n] !== Tile.HOUSE && s.map.tiles[k - n] !== tile && s.map.tiles[k - n] !== Tile.ROCK));
      return [i % 64, Math.floor(i / 64)];
    };
    let blocked = 0;
    s.events.on('shot:blocked', () => blocked++);
    const [tx, ty] = firstLeftEdge(Tile.TREE);
    fireShot(s, (tx - 2) * T + 8, ty * T + 8, { x: 1, y: 0 }, { speed: 300, range: 40, pierce: 0, mult: 1 });
    run(s, 0.3);
    expect(blocked).toBe(0);
    const [hx, hy] = firstLeftEdge(Tile.HOUSE);
    fireShot(s, (hx - 2) * T + 8, hy * T + 8, { x: 1, y: 0 }, { speed: 300, range: 80, pierce: 0, mult: 1 });
    run(s, 0.3);
    expect(blocked).toBe(1);
  });

  it('with a rock in the way, holding attack moves for a clear shot instead of hitting the rock', () => {
    const s = game();
    s.player.weapon = 'bamboobow';
    // a lone rock with open ground two tiles either side
    const i = s.map.tiles.findIndex((t, k) => {
      const x = k % 64;
      const y = Math.floor(k / 64);
      return t === Tile.ROCK && x > 3 && x < 60 && [-2, -1, 1, 2].every((dx) => walkable(s.map, x + dx, y)) && walkable(s.map, x - 2, y - 1) && walkable(s.map, x - 2, y + 1);
    });
    expect(i).toBeGreaterThan(0);
    const tx = i % 64;
    const ty = Math.floor(i / 64);
    const start = { x: (tx - 2) * T + 8, y: ty * T + 8 };
    const m = addMonster(s, 'dhole', (tx + 2) * T + 8, ty * T + 8, -1);
    m.hp = 9999;
    Object.assign(m, { mode: 'stun', stunT: 999 });
    Object.assign(s.player, start, { inVillage: false });
    expect(Math.hypot(m.x - s.player.x, m.y - s.player.y)).toBeLessThanOrEqual(reachOf(s, m));
    expect(clearShot(s, s.player.x, s.player.y, m.x, m.y)).toBe(false);
    let blocked = 0;
    s.events.on('shot:blocked', () => blocked++);
    run(s, 3, () => intent({ attack: true, targetId: m.id }), () => m.hp < 9999);
    expect(blocked).toBe(0);
    expect(m.hp).toBeLessThan(9999);
    expect(Math.hypot(s.player.x - start.x, s.player.y - start.y)).toBeGreaterThan(4);
  });

  it('kills a dhole with the bow by holding attack only', () => {
    const { s, spot } = arena('bamboobow');
    addMonster(s, 'dhole', spot.x + 60, spot.y);
    let killed = false;
    s.events.on('monster:killed', () => (killed = true));
    run(s, 60, () => intent({ attack: true }), () => killed);
    expect(killed).toBe(true);
  });

  it('AUTO with a bow shoots from range using its skills', () => {
    const { s, spot } = arena('bamboobow');
    const m = addMonster(s, 'dhole', spot.x + 55, spot.y);
    expect(autoIntent(s, createAutoPilot(), 1 / 60).skills).toEqual(slotOf('bamboobow', 'pin'));
    m.mode = 'tele';
    expect(autoIntent(s, createAutoPilot(), 1 / 60).skills).toEqual(slotOf('bamboobow', 'volley'));
  });
});
