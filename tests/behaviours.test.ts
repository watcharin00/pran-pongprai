import { describe, expect, it } from 'vitest';
import { MONSTERS, TUNING } from '../src/data';
import { hitMonster, resolveMonsterHit } from '../src/core/combat';
import { startAttack, updateMonster } from '../src/core/monsterAI';
import type { AttackDef } from '../src/data/types';
import type { MonsterState } from '../src/core/state';
import { addMonster, game, intent, openSpot, run } from './helpers';

const atk = (kind: keyof typeof MONSTERS, id: string): AttackDef => {
  const a = MONSTERS[kind].attacks.find((x) => x.id === id);
  if (!a) throw new Error(`${kind}.${id}`);
  return a;
};
const chase = (m: MonsterState): void => {
  m.aggro = true;
  m.mode = 'chase';
  m.huntT = 100;
};

describe('softshell turtle: shell in front', () => {
  it('hits from the front deal only the frontGuard share; from behind, full', () => {
    const s = game();
    const o = openSpot(s);
    const m = addMonster(s, 'softshell', o.x, o.y, 1);
    s.player.x = o.x + 14;
    s.player.y = o.y;
    let guarded = 0;
    s.events.on('monster:guarded', () => guarded++);
    const hp0 = m.hp;
    hitMonster(s, m, 10);
    const front = hp0 - m.hp;
    s.player.x = o.x - 14;
    const hp1 = m.hp;
    hitMonster(s, m, 10);
    const back = hp1 - m.hp;
    expect(guarded).toBe(1);
    expect(front).toBeLessThan(back * 0.35);
  });
});

describe('eagle: flies while hunting', () => {
  it('melee cannot reach it in the air, arrows can; it lands after a dive', () => {
    const s = game();
    const o = openSpot(s);
    s.player.x = o.x + 40;
    s.player.y = o.y;
    const m = addMonster(s, 'eagle', o.x, o.y);
    chase(m);
    m.atkCd = 5;
    updateMonster(s, m, 1 / 60);
    expect(m.air).toBe(true);
    const hp = m.hp;
    hitMonster(s, m, 5);
    expect(m.hp).toBe(hp);
    hitMonster(s, m, 1, { ranged: true });
    expect(m.hp).toBeLessThan(hp);
    // dive: lands at the circle and stays down while recovering
    startAttack(m, atk('eagle', 'dive'), 1, 0, s.player);
    run(s, 3, () => intent(), () => m.mode === 'recover');
    expect(m.mode).toBe('recover');
    expect(m.air).toBe(false);
    const hp2 = m.hp;
    hitMonster(s, m, 1);
    expect(m.hp).toBeLessThan(hp2);
  });
});

describe('mouse deer: runs away', () => {
  it('moves away from a nearby hunter', () => {
    const s = game();
    const o = openSpot(s);
    s.player.x = o.x + 30;
    s.player.y = o.y;
    const m = addMonster(s, 'mousedeer', o.x, o.y);
    chase(m);
    const d0 = Math.hypot(m.x - s.player.x, m.y - s.player.y);
    for (let i = 0; i < 30; i++) updateMonster(s, m, 1 / 60);
    expect(Math.hypot(m.x - s.player.x, m.y - s.player.y)).toBeGreaterThan(d0);
  });
});

describe('jackal: pack', () => {
  it('waking one calls the packmates nearby, not the far ones', () => {
    const s = game();
    const o = openSpot(s);
    s.player.x = o.x + 300;
    s.player.y = o.y;
    const a = addMonster(s, 'jackal', o.x, o.y);
    const b = addMonster(s, 'jackal', o.x + 40, o.y);
    const far = addMonster(s, 'jackal', o.x - (MONSTERS.jackal.pack ?? 0) - 40, o.y);
    let howls = 0;
    s.events.on('monster:howl', () => howls++);
    hitMonster(s, a, 1);
    expect(b.aggro).toBe(true);
    expect(far.aggro).toBe(false);
    expect(howls).toBe(1);
  });
});

describe('python: coil', () => {
  it('a landed coil holds the player, squeezes, and a roll breaks free', () => {
    const s = game();
    const o = openSpot(s);
    const m = addMonster(s, 'python', o.x, o.y, 1);
    chase(m);
    s.player.x = o.x + 12;
    s.player.y = o.y;
    startAttack(m, atk('python', 'coil'), 1, 0, s.player);
    run(s, 2, () => intent(), () => s.player.grab !== null);
    expect(s.player.grab).not.toBeNull();
    expect(m.mode).toBe('hold');
    // pinned: the stick does nothing
    const x0 = s.player.x;
    const hp0 = s.player.hp;
    run(s, 0.8, () => intent({ move: { x: -1, y: 0 } }));
    expect(Math.abs(s.player.x - x0)).toBeLessThan(1);
    expect(s.player.hp).toBeLessThan(hp0);
    run(s, 1 / 60, () => intent({ dodge: true, move: { x: -1, y: 0 } }));
    expect(s.player.grab).toBeNull();
    run(s, 0.1);
    expect(m.mode).toBe('recover');
  });

  it('lets go by itself after the grab time', () => {
    const s = game();
    const o = openSpot(s);
    const m = addMonster(s, 'python', o.x, o.y, 1);
    chase(m);
    s.player.x = o.x + 12;
    s.player.y = o.y;
    s.player.hp = 9999;
    s.player.maxHp = 9999;
    const a = atk('python', 'coil');
    startAttack(m, a, 1, 0, s.player);
    run(s, 2, () => intent(), () => s.player.grab !== null);
    run(s, (a.shape === 'circle' ? (a.grab ?? 0) : 0) + 0.2, () => intent(), () => s.player.grab === null);
    expect(s.player.grab).toBeNull();
  });
});

describe('bamboo rat: tunnels away', () => {
  it('after enough hits it digs in and comes up somewhere else', () => {
    const s = game();
    const o = openSpot(s);
    const m = addMonster(s, 'bamboorat', o.x, o.y);
    chase(m);
    m.hp = 1e6;
    s.player.x = o.x + 14;
    s.player.y = o.y;
    for (let i = 0; i < (MONSTERS.bamboorat.tunnelAfterHits ?? 0); i++) hitMonster(s, m, 0.1);
    expect(m.mode).toBe('tunnel');
    expect(m.burrow).toBe(true);
    const hp = m.hp;
    hitMonster(s, m, 5);
    expect(m.hp).toBe(hp);
    let up = false;
    s.events.on('monster:emerge', () => (up = true));
    run(s, 2.5, () => intent(), () => up);
    expect(up).toBe(true);
    expect(m.burrow).toBe(false);
    expect(Math.hypot(m.x - o.x, m.y - o.y)).toBeGreaterThan(20);
  });
});

describe('crab-eating macaque: thief', () => {
  it('a landed snatch steals a potion and it runs; hunting it gives it back', () => {
    const s = game();
    const o = openSpot(s);
    const m = addMonster(s, 'crabmacaque', o.x, o.y);
    chase(m);
    s.player.x = o.x + 10;
    s.player.y = o.y;
    s.player.potions = 2;
    s.player.hp = 9999;
    s.player.maxHp = 9999;
    expect(resolveMonsterHit(s, m, atk('crabmacaque', 'snatch'))).toBe(true);
    expect(s.player.potions).toBe(1);
    expect(m.stolen).toBe(1);
    expect(m.fleeT).toBeGreaterThan(0);
    m.mode = 'chase';
    const d0 = Math.hypot(m.x - s.player.x, m.y - s.player.y);
    for (let i = 0; i < 30; i++) updateMonster(s, m, 1 / 60);
    expect(Math.hypot(m.x - s.player.x, m.y - s.player.y)).toBeGreaterThan(d0);
    m.hp = 1;
    hitMonster(s, m, 5);
    expect(s.player.potions).toBe(2);
  });

  it('nothing to steal: just a hit', () => {
    const s = game();
    const o = openSpot(s);
    const m = addMonster(s, 'crabmacaque', o.x, o.y);
    s.player.potions = 0;
    s.player.hp = 9999;
    resolveMonsterHit(s, m, atk('crabmacaque', 'snatch'));
    expect(m.stolen).toBe(0);
    expect(m.fleeT).toBe(0);
  });
});

it('telegraphs stay within the global multiplier rules', () => {
  for (const k of ['softshell', 'eagle', 'mousedeer', 'jackal', 'python', 'bamboorat', 'crabmacaque'] as const) {
    for (const a of MONSTERS[k].attacks) expect(a.telegraph * TUNING.combat.telegraphMul).toBeGreaterThanOrEqual(0.5);
  }
});
