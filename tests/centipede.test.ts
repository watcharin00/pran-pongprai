import { describe, expect, it } from 'vitest';
import { MATERIAL_IDS, MONSTERS, TUNING } from '../src/data';
import { BURROW_TRACK, startAttack, updateMonster } from '../src/core/monsterAI';
import { chooseTarget, hitMonster, nearestMonster } from '../src/core/combat';
import { loadMonsters } from '../src/data/validate';
import monstersJson from '../src/data/monsters.json';
import type { CircleAttackDef } from '../src/data/types';
import { addMonster, game, intent, openSpot, run } from './helpers';

const burrowAtk = (): CircleAttackDef => {
  const a = MONSTERS.centipede.attacks.find((x) => x.id === 'burrow');
  if (!a || a.shape !== 'circle') throw new Error('no burrow attack');
  return a;
};
const tele = (a: CircleAttackDef): number => a.telegraph * TUNING.combat.telegraphMul;

describe('giant centipede burrow attack', () => {
  it('lives in the cave, with a head and a tail part and a burrow attack', () => {
    const d = MONSTERS.centipede;
    expect(d.area).toBe('cave');
    expect(d.parts.head && d.parts.tail).toBeTruthy();
    expect(burrowAtk().burrow).toBe(true);
    expect(burrowAtk().offset).toBe(0);
  });

  it('digs in: hidden from targeting and immune while underground', () => {
    const s = game();
    const o = openSpot(s);
    s.player.x = o.x + 60;
    s.player.y = o.y;
    const m = addMonster(s, 'centipede', o.x, o.y);
    m.aggro = true;
    m.mode = 'chase';
    startAttack(m, burrowAtk(), 1, 0, s.player);
    expect(m.burrow).toBe(true);
    expect(nearestMonster(s, 200, false)).toBeNull();
    s.player.lockId = m.id;
    expect(chooseTarget(s, 200)).toBeNull();
    // another monster nearby is still fair game while the lock is underground
    const other = addMonster(s, 'flyingfox', o.x + 50, o.y + 10);
    expect(chooseTarget(s, 200)).toBe(other);
    const hp = m.hp;
    hitMonster(s, m, 5);
    expect(m.hp).toBe(hp);
  });

  it('the circle follows the player for the first part, then stays where it locked', () => {
    const s = game();
    const o = openSpot(s);
    s.player.x = o.x + 50;
    s.player.y = o.y;
    const m = addMonster(s, 'centipede', o.x, o.y);
    m.aggro = true;
    startAttack(m, burrowAtk(), 1, 0, s.player);
    const T = tele(burrowAtk());
    const dt = 1 / 60;
    // early on: the player sidesteps and the circle comes along
    s.player.y += 10;
    updateMonster(s, m, dt);
    const sh1 = m.shape;
    expect(sh1?.kind === 'circle' && sh1.cy).toBe(s.player.y);
    // past the tracking share the circle no longer moves
    for (let t = 0; t < T * BURROW_TRACK + 0.05; t += dt) updateMonster(s, m, dt);
    const sh2 = m.shape;
    if (!sh2 || sh2.kind !== 'circle') throw new Error('no circle');
    const lockedY = sh2.cy;
    s.player.y += 20;
    updateMonster(s, m, dt);
    expect(sh2.cy).toBe(lockedY);
  });

  it('bursts out at the circle and hits a player still standing in it', () => {
    const s = game();
    const o = openSpot(s);
    s.player.x = o.x + 40;
    s.player.y = o.y;
    const m = addMonster(s, 'centipede', o.x, o.y);
    m.aggro = true;
    startAttack(m, burrowAtk(), 1, 0, s.player);
    const hp = s.player.hp;
    let emerged = false;
    s.events.on('monster:emerge', () => (emerged = true));
    run(s, tele(burrowAtk()) + 0.1, () => intent(), () => emerged);
    expect(emerged).toBe(true);
    expect(m.burrow).toBe(false);
    expect(Math.hypot(m.x - s.player.x, m.y - s.player.y)).toBeLessThan(burrowAtk().radius);
    expect(s.player.hp).toBeLessThan(hp);
  });

  it('can be dodged by rolling out once the circle stops following', () => {
    const s = game();
    const o = openSpot(s);
    s.player.x = o.x + 40;
    s.player.y = o.y;
    const m = addMonster(s, 'centipede', o.x, o.y);
    m.aggro = true;
    startAttack(m, burrowAtk(), 1, 0, s.player);
    const T = tele(burrowAtk());
    const hp = s.player.hp;
    let t = 0;
    run(s, T + 0.3, () => {
      t += 1 / 60;
      // roll sideways just after the circle locks
      return t > T * BURROW_TRACK + 0.05 && t < T * BURROW_TRACK + 0.1 ? intent({ dodge: true, move: { x: 0, y: 1 } }) : intent();
    });
    expect(s.player.hp).toBe(hp);
  });

  it('the validator rejects a burrow attack with an offset', () => {
    const raw = JSON.parse(JSON.stringify(monstersJson)) as Record<string, { attacks: { id: string; offset?: number }[] }>;
    const a = raw.centipede?.attacks.find((x) => x.id === 'burrow');
    if (!a) throw new Error('no burrow');
    a.offset = 6;
    expect(() => loadMonsters(raw, MATERIAL_IDS)).toThrow(/centipede\.attacks\[1\]\.offset/);
  });
});
