import { describe, expect, it } from 'vitest';
import { hitMonster, partFor, resolveMonsterHit } from '../src/core/combat';
import { MONSTERS } from '../src/data';
import { addMonster, game, openSpot } from './helpers';

describe('position-based parts', () => {
  it('front hits the head, behind hits the tail, the middle hits the body', () => {
    const s = game();
    const m = addMonster(s, 'cinderhorn', 500, 500, 1); // facing right, size 14 → threshold 3.5
    expect(partFor(m, 520)).toBe('head');
    expect(partFor(m, 480)).toBe('tail');
    expect(partFor(m, 502)).toBe('body');
    m.dirX = -1;
    expect(partFor(m, 520)).toBe('tail');
    expect(partFor(m, 480)).toBe('head');
  });

  it('falls back to body once a part is broken, and mossfang has no tail', () => {
    const s = game();
    const c = addMonster(s, 'cinderhorn', 500, 500, 1);
    if (c.parts.head) c.parts.head.broken = true;
    expect(partFor(c, 520)).toBe('body');
    const m = addMonster(s, 'mossfang', 300, 300, 1);
    expect(partFor(m, 280)).toBe('body');
  });

  it('breaking a part drops its material and removes it from the sprite state', () => {
    const s = game();
    const m = addMonster(s, 'cinderhorn', 500, 500, 1);
    s.player.x = 480; // behind → tail
    s.player.y = 500;
    const broken: string[] = [];
    s.events.on('part:broken', (e) => broken.push(e.part));
    for (let i = 0; i < 30 && !m.parts.tail?.broken; i++) hitMonster(s, m, 1);
    expect(m.parts.tail?.broken).toBe(true);
    expect(broken).toEqual(['tail']);
    expect(s.inv.etail).toBe(1);
  });

  it('marks part hits with multiplier ≥ 1.4 as gold numbers', () => {
    const s = game();
    const m = addMonster(s, 'cinderhorn', 500, 500, 1);
    s.player.x = 480;
    s.player.y = 500;
    let gold = false;
    s.events.on('monster:hit', (e) => (gold = e.gold));
    hitMonster(s, m, 1); // bone tail multiplier 1.4
    expect(gold).toBe(true);
  });
});

describe('stun and rage', () => {
  it('hammer hits to the head build stun until the monster is dazed', () => {
    const s = game();
    s.player.weapon = 'mossmaul'; // stun 34 per head hit
    const m = addMonster(s, 'cinderhorn', 500, 500, 1);
    m.hp = 99999;
    s.player.x = 520;
    s.player.y = 500;
    hitMonster(s, m, 1);
    hitMonster(s, m, 1);
    expect(m.mode).not.toBe('stun');
    hitMonster(s, m, 1);
    expect(m.mode).toBe('stun');
    expect(m.stunT).toBeCloseTo(2.6);
  });

  it('cinderhorn enrages below 50% HP; mossfang never does', () => {
    const s = game();
    const c = addMonster(s, 'cinderhorn', 500, 500, 1);
    c.hp = MONSTERS.cinderhorn.hp * 0.5 + 1;
    s.player.x = 502;
    s.player.y = 500;
    hitMonster(s, c, 1);
    expect(c.rage).toBe(true);
    const m = addMonster(s, 'mossfang', 300, 300, 1);
    m.hp = 10;
    hitMonster(s, m, 0.5);
    expect(m.rage).toBe(false);
  });
});

describe('i-frames', () => {
  it('a hit during a roll is dodged and deals no damage', () => {
    const s = game();
    const spot = openSpot(s);
    Object.assign(s.player, spot);
    const m = addMonster(s, 'mossfang', spot.x + 10, spot.y);
    const attack = MONSTERS.mossfang.attacks[0];
    if (!attack) throw new Error('no attack');
    let dodged = 0;
    s.events.on('player:dodged', () => dodged++);
    s.player.rollIF = 0.2;
    resolveMonsterHit(s, m, attack);
    expect(s.player.hp).toBe(100);
    expect(dodged).toBe(1);
    s.player.rollIF = 0;
    resolveMonsterHit(s, m, attack);
    expect(s.player.hp).toBe(90);
  });

  it('rage adds 15% damage', () => {
    const s = game();
    const m = addMonster(s, 'cinderhorn', 500, 500);
    m.rage = true;
    const charge = MONSTERS.cinderhorn.attacks.find((a) => a.id === 'charge');
    if (!charge) throw new Error('no charge');
    resolveMonsterHit(s, m, charge);
    expect(s.player.hp).toBe(100 - Math.round(32 * 1.15));
  });
});

describe('knockout', () => {
  it('a lethal hit knocks the player out, calms monsters, then revives at the village', async () => {
    const { run } = await import('./helpers');
    const s = game();
    const spot = openSpot(s);
    Object.assign(s.player, spot, { hp: 5 });
    const m = addMonster(s, 'mossfang', spot.x + 10, spot.y);
    Object.assign(m, { aggro: true, huntT: 90, mode: 'chase' });
    const attack = MONSTERS.mossfang.attacks[0];
    if (!attack) throw new Error();
    let ko = 0;
    s.events.on('player:knockedOut', () => ko++);
    resolveMonsterHit(s, m, attack);
    expect(s.player.dead).toBe(true);
    expect(ko).toBe(1);
    expect(m.aggro).toBe(false);
    expect(m.mode).toBe('wander');
    run(s, 3);
    expect(s.player.dead).toBe(false);
    expect(s.player.hp).toBe(s.player.maxHp);
    expect(s.player.zone).toBe('village');
  });
});
