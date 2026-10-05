// Spear, bow/crossbow and the per-weapon skills added with them.
import { describe, expect, it } from 'vitest';
import { SKILLS, WEAPONS } from '../src/data';
import type { WeaponId } from '../src/data/types';
import { autoIntent, createAutoPilot } from '../src/core/autoPilot';
import { fireShot } from '../src/core/shots';
import { weaponSkills } from '../src/core/skills';
import { step } from '../src/core/sim';
import { Tile, T } from '../src/core/mapgen';
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
    const m = addMonster(s, 'dhole', spot.x + 70, spot.y);
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
    const m = addMonster(s, 'dhole', spot.x + 70, spot.y, -1); // facing the player
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

  it('arrows stop at trees', () => {
    const s = game();
    const i = s.map.tiles.findIndex((t, k) => t === Tile.TREE && s.map.tiles[k - 1] !== Tile.TREE && s.map.tiles[k - 2] !== Tile.TREE);
    const tx = i % 64;
    const ty = Math.floor(i / 64);
    fireShot(s, (tx - 2) * T + 8, ty * T + 8, { x: 1, y: 0 }, { speed: 300, range: 200, pierce: 0, mult: 1 });
    let blocked = false;
    s.events.on('shot:blocked', () => (blocked = true));
    run(s, 0.3);
    expect(blocked).toBe(true);
    expect(s.shots.length).toBe(0);
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
    const m = addMonster(s, 'dhole', spot.x + 70, spot.y);
    expect(autoIntent(s, createAutoPilot(), 1 / 60).skills).toEqual(slotOf('bamboobow', 'pin'));
    m.mode = 'tele';
    expect(autoIntent(s, createAutoPilot(), 1 / 60).skills).toEqual(slotOf('bamboobow', 'volley'));
  });
});
