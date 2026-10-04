import { describe, expect, it } from 'vitest';
import { updateFacing, updateMonster } from '../src/core/monsterAI';
import { addMonster, game, openSpot, run } from './helpers';

describe('slow turning', () => {
  it('only flips after wanting the other direction longer than turnTime', () => {
    const s = game();
    const m = addMonster(s, 'cinderhorn', 0, 0, 1);
    expect(updateFacing(m, -1, 0.5, 0.75)).toBe(false);
    expect(m.dirX).toBe(1);
    expect(updateFacing(m, -1, 0.3, 0.75)).toBe(true);
    expect(m.dirX).toBe(-1);
  });

  it('resets the turn timer when the player goes back in front', () => {
    const s = game();
    const m = addMonster(s, 'cinderhorn', 0, 0, 1);
    updateFacing(m, -1, 0.5, 0.75);
    updateFacing(m, 1, 0.1, 0.75);
    expect(updateFacing(m, -1, 0.5, 0.75)).toBe(false);
  });

  it('does not attack while the player is behind it — the window to cut the tail', () => {
    const s = game();
    const spot = openSpot(s);
    const m = addMonster(s, 'cinderhorn', spot.x, spot.y, 1);
    m.mode = 'chase';
    m.aggro = true;
    m.huntT = 150;
    m.atkCd = 0;
    s.player.x = spot.x - 20; // behind
    s.player.y = spot.y;
    for (let i = 0; i < 40; i++) updateMonster(s, m, 1 / 60); // 0.67s < 0.75s turn time
    expect(m.mode).toBe('chase');
    expect(m.dirX).toBe(1);
    for (let i = 0; i < 10; i++) updateMonster(s, m, 1 / 60);
    expect(m.dirX).toBe(-1);
  });

  it('mossfang turns faster than cinderhorn', () => {
    const s = game();
    const a = addMonster(s, 'mossfang', 0, 0, 1);
    const b = addMonster(s, 'cinderhorn', 0, 0, 1);
    updateFacing(a, -1, 0.4, 0.35);
    updateFacing(b, -1, 0.4, 0.75);
    expect(a.dirX).toBe(-1);
    expect(b.dirX).toBe(1);
  });
});

describe('monster state machine', () => {
  it('aggroes when the player comes near, telegraphs, then strikes', () => {
    const s = game();
    const spot = openSpot(s);
    const m = addMonster(s, 'mossfang', spot.x, spot.y, -1);
    Object.assign(s.player, { x: spot.x + 18, y: spot.y });
    const modes = new Set<string>();
    run(s, 4, undefined, () => {
      modes.add(m.mode);
      return false;
    });
    expect(m.aggro).toBe(true);
    expect(modes.has('tele')).toBe(true);
    expect(modes.has('recover')).toBe(true);
    expect(s.player.hp).toBeLessThan(100);
  });

  it('rage makes telegraphs 35% faster', () => {
    const s = game();
    const a = addMonster(s, 'cinderhorn', 100, 100);
    const b = addMonster(s, 'cinderhorn', 100, 100);
    for (const m of [a, b]) Object.assign(m, { mode: 'tele', t: 1, tt: 1, aggro: true, huntT: 100 });
    b.rage = true;
    s.player.x = 900;
    s.player.y = 700;
    updateMonster(s, a, 0.5);
    updateMonster(s, b, 0.5);
    expect(a.t).toBeCloseTo(0.5);
    expect(b.t).toBeCloseTo(1 - 0.5 * 1.35);
  });

  it('runs away when the hunt timer expires', () => {
    const s = game();
    const m = addMonster(s, 'mossfang', 100, 100);
    Object.assign(m, { aggro: true, huntT: 0.01, mode: 'chase' });
    let fled = false;
    s.events.on('monster:fled', () => (fled = true));
    updateMonster(s, m, 0.05);
    expect(fled).toBe(true);
    expect(s.monsters).not.toContain(m);
    expect(s.respawnQueue).toHaveLength(1);
  });

  it('does not follow the player into the village', () => {
    const s = game();
    const m = addMonster(s, 'mossfang', 15 * 16, 10 * 16); // north of the village
    Object.assign(m, { aggro: true, huntT: 90, mode: 'chase' });
    // player stays at spawn inside the village, > 90px away
    run(s, 3);
    expect(m.mode).toBe('wander');
    expect(m.aggro).toBe(false);
  });
});
