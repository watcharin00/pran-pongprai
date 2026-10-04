import { describe, expect, it } from 'vitest';
import { SKILLS } from '../src/data';
import { addMonster, game, intent, openSpot, run } from './helpers';
import { step } from '../src/core/sim';

function arena() {
  const s = game();
  const spot = openSpot(s);
  Object.assign(s.player, spot, { inVillage: false });
  return { s, spot };
}

describe('skills', () => {
  it('whirl hits every monster within 32 + size, ×1.5', () => {
    const { s, spot } = arena();
    const near1 = addMonster(s, 'mossfang', spot.x + 30, spot.y);
    const near2 = addMonster(s, 'mossfang', spot.x - 30, spot.y);
    const far = addMonster(s, 'mossfang', spot.x + 50, spot.y);
    const hits: number[] = [];
    s.events.on('monster:hit', (e) => hits.push(e.id));
    step(s, intent({ skills: [true, false, false] }), 0, s.now);
    expect(hits.sort()).toEqual([near1.id, near2.id].sort());
    expect(far.hp).toBe(120);
    expect(s.player.cds[0]).toBe(SKILLS.whirl.cooldown);
  });

  it('cannot be recast during cooldown', () => {
    const { s, spot } = arena();
    addMonster(s, 'mossfang', spot.x + 20, spot.y);
    let casts = 0;
    s.events.on('skill:cast', () => casts++);
    step(s, intent({ skills: [true, false, false] }), 0, s.now);
    step(s, intent({ skills: [true, false, false] }), 0, s.now);
    expect(casts).toBe(1);
  });

  it('dash moves fast toward the stick, grants i-frames and hits each monster once', () => {
    const { s, spot } = arena();
    const m = addMonster(s, 'mossfang', spot.x + 20, spot.y);
    m.hp = 9999;
    let hits = 0;
    s.events.on('monster:hit', () => hits++);
    step(s, intent({ skills: [false, true, false], move: { x: 1, y: 0 } }), 1 / 60, s.now);
    expect(s.player.rollIF).toBeGreaterThan(0.2);
    run(s, 0.3, () => intent({ move: { x: 1, y: 0 } }));
    expect(hits).toBe(1);
    expect(s.player.x).toBeGreaterThan(spot.x + 40);
  });

  it('slam winds up, then hits ×3.2 with +45 stun', () => {
    const { s, spot } = arena();
    const m = addMonster(s, 'mossfang', spot.x + 15, spot.y, -1);
    m.hp = 9999;
    step(s, intent({ skills: [false, false, true] }), 0, s.now);
    expect(s.player.cast).not.toBeNull();
    let impact = false;
    s.events.on('skill:impact', () => (impact = true));
    run(s, 0.2);
    expect(impact).toBe(false);
    run(s, 0.15);
    expect(impact).toBe(true);
    expect(m.stunMeter + (m.mode === 'stun' ? 100 : 0)).toBeGreaterThanOrEqual(45);
    expect(9999 - m.hp).toBeGreaterThanOrEqual(Math.round(10 * 3.2 * 0.9));
  });

  it('rolling cancels the slam wind-up', () => {
    const { s, spot } = arena();
    addMonster(s, 'mossfang', spot.x + 15, spot.y);
    step(s, intent({ skills: [false, false, true] }), 0, s.now);
    step(s, intent({ dodge: true }), 1 / 60, s.now);
    expect(s.player.cast).toBeNull();
    expect(s.player.roll).toBeGreaterThan(0);
  });

  it('getting hit cancels the slam wind-up', () => {
    const { s, spot } = arena();
    const m = addMonster(s, 'mossfang', spot.x + 15, spot.y, -1);
    step(s, intent({ skills: [false, false, true] }), 0, s.now);
    // land a bite before the slam resolves
    Object.assign(m, { mode: 'tele', t: 0.001, tt: 0.65, aggro: true, huntT: 90, attack: m.attack ?? null });
    const bite = { id: 'bite', shape: 'circle', radius: 15, offset: 11, telegraph: 0.65, damage: 10, range: 22, weight: 3 } as const;
    m.attack = bite;
    m.shape = { kind: 'circle', cx: s.player.x, cy: s.player.y, r: 15 };
    step(s, intent(), 1 / 60, s.now);
    expect(s.player.hp).toBeLessThan(100);
    expect(s.player.cast).toBeNull();
  });
});

describe('roll', () => {
  it('costs stamina, grants 0.32s i-frames, and cannot be spammed', () => {
    const { s } = arena();
    step(s, intent({ dodge: true, move: { x: 1, y: 0 } }), 1 / 60, s.now);
    expect(s.player.st).toBeCloseTo(100 - 28, 0);
    expect(s.player.rollIF).toBeGreaterThan(0.29);
    step(s, intent({ dodge: true }), 1 / 60, s.now);
    expect(s.player.st).toBeCloseTo(72, 0);
  });

  it('with no stick input, rolls sideways out of a charge line', () => {
    const { s, spot } = arena();
    const m = addMonster(s, 'cinderhorn', spot.x - 40, spot.y + 1);
    Object.assign(m, { mode: 'tele', t: 1, tt: 1 });
    m.shape = { kind: 'line', sx: m.x, sy: m.y, ux: 1, uy: 0, len: 130, wd: 24 };
    step(s, intent({ dodge: true }), 0, s.now);
    expect(Math.abs(s.player.rdy)).toBeCloseTo(1);
    expect(s.player.rdx).toBeCloseTo(0);
  });
});
