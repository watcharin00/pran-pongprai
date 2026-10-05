import { describe, expect, it } from 'vitest';
import { autoIntent, createAutoPilot } from '../src/core/autoPilot';
import { createGame, step } from '../src/core/sim';
import { emptyHuman, IntentMixer } from '../src/input/intent';
import { addMonster, game, intent, MAP, NOW, openSpot } from './helpers';

describe('AUTO decisions', () => {
  it('targets the nearest monster within 340px and ignores ones further away', () => {
    const s = game();
    const spot = openSpot(s);
    Object.assign(s.player, spot);
    const far = addMonster(s, 'mossfang', spot.x + 400, spot.y);
    let i = autoIntent(s, createAutoPilot(), 1 / 60);
    expect(i.attack).toBe(false);
    const near = addMonster(s, 'mossfang', spot.x + 200, spot.y);
    i = autoIntent(s, createAutoPilot(), 1 / 60);
    expect(i.attack).toBe(true);
    expect(i.targetId).toBe(near.id);
    expect(i.targetId).not.toBe(far.id);
  });

  it('drinks a potion below 35% HP, not above', () => {
    const s = game();
    s.player.hp = 36;
    expect(autoIntent(s, createAutoPilot(), 1 / 60).potion).toBe(false);
    s.player.hp = 34;
    expect(autoIntent(s, createAutoPilot(), 1 / 60).potion).toBe(true);
    s.player.potions = 0;
    expect(autoIntent(s, createAutoPilot(), 1 / 60).potion).toBe(false);
  });

  it('slams when in reach and the monster is not winding up; whirls otherwise', () => {
    const s = game();
    const spot = openSpot(s);
    Object.assign(s.player, spot);
    const m = addMonster(s, 'mossfang', spot.x + 10, spot.y);
    expect(autoIntent(s, createAutoPilot(), 1 / 60).skills).toEqual([false, false, true]);
    m.mode = 'tele';
    expect(autoIntent(s, createAutoPilot(), 1 / 60).skills).toEqual([true, false, false]);
  });

  it('dashes to close a 36–85px gap', () => {
    const s = game();
    const spot = openSpot(s);
    Object.assign(s.player, spot);
    addMonster(s, 'mossfang', spot.x + 60, spot.y);
    expect(autoIntent(s, createAutoPilot(), 1 / 60).skills[1]).toBe(true);
  });

  it('never uses an i-frame skill to close distance while a monster is winding up (no dodging for the player)', () => {
    const s = game();
    const spot = openSpot(s);
    Object.assign(s.player, spot);
    const m = addMonster(s, 'mossfang', spot.x + 60, spot.y);
    m.mode = 'tele';
    expect(autoIntent(s, createAutoPilot(), 1 / 60).skills).toEqual([false, false, false]);
    m.mode = 'dash';
    expect(autoIntent(s, createAutoPilot(), 1 / 60).skills).toEqual([false, false, false]);
  });

  it('walks to a nearby herb/ore node when no monster is around', () => {
    const s = game();
    const node = s.nodes[0];
    if (!node) throw new Error('no nodes');
    Object.assign(s.player, { x: node.x + 60, y: node.y });
    const i = autoIntent(s, createAutoPilot(), 1 / 60);
    expect(i.move).not.toBeNull();
    expect(i.attack).toBe(false);
  });

  it('never produces a roll, in any situation', () => {
    const s = createGame({ rngSeed: 7, now: NOW, map: MAP });
    s.autoOn = true;
    const ap = createAutoPilot();
    let rolls = 0;
    s.events.on('player:roll', () => rolls++);
    for (let f = 0; f < 60 * 120; f++) {
      const i = autoIntent(s, ap, 1 / 60);
      expect(i.dodge).toBe(false);
      step(s, i, 1 / 60, NOW + f * 16);
    }
    expect(rolls).toBe(0);
  });
});

describe('IntentMixer', () => {
  const autoMove = () => intent({ move: { x: 1, y: 0 }, attack: true, targetId: 5 });

  it('uses AUTO when the player is not steering', () => {
    const mix = new IntentMixer();
    const i = mix.mix(emptyHuman(), autoMove, 1 / 60);
    expect(i.move).toEqual({ x: 1, y: 0 });
    expect(i.targetId).toBe(5);
  });

  it('stops AUTO the moment the stick moves, and waits 1.2s after release', () => {
    const mix = new IntentMixer();
    const steer = { ...emptyHuman(), move: { x: 0, y: -1 } };
    expect(mix.mix(steer, autoMove, 1 / 60).move).toEqual({ x: 0, y: -1 });
    let i = mix.mix(emptyHuman(), autoMove, 1.0);
    expect(i.move).toBeNull();
    expect(i.attack).toBe(false);
    i = mix.mix(emptyHuman(), autoMove, 0.3);
    expect(i.move).toEqual({ x: 1, y: 0 });
  });

  it('passes the player\'s own roll through even while AUTO drives', () => {
    const mix = new IntentMixer();
    const i = mix.mix({ ...emptyHuman(), dodge: true }, autoMove, 1 / 60);
    expect(i.dodge).toBe(true);
    expect(mix.mix(emptyHuman(), () => ({ ...autoMove(), dodge: true }), 1 / 60).dodge).toBe(false);
  });
});
