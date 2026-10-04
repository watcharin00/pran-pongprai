// End-to-end: CLAUDE.md DoD #4 — a full mossfang hunt with only the attack button held, and with AUTO.
import { describe, expect, it } from 'vitest';
import { autoIntent, createAutoPilot } from '../src/core/autoPilot';
import { createGame } from '../src/core/sim';
import { addMonster, game, intent, MAP, NOW, openSpot, run } from './helpers';

describe('full hunts', () => {
  it('kills a mossfang by holding attack only', () => {
    const s = game();
    const spot = openSpot(s);
    Object.assign(s.player, spot);
    addMonster(s, 'mossfang', spot.x + 40, spot.y);
    let killed = false;
    s.events.on('monster:killed', () => (killed = true));
    run(s, 60, () => intent({ attack: true }), () => killed);
    expect(killed).toBe(true);
    expect(s.inv.hide).toBeGreaterThanOrEqual(2);
  });

  it('AUTO leaves the village, finds and kills a mossfang', () => {
    const s = createGame({ rngSeed: 3, now: NOW, map: MAP });
    s.autoOn = true;
    const ap = createAutoPilot();
    let kills = 0;
    s.events.on('monster:killed', (e) => {
      if (e.kind === 'mossfang') kills++;
    });
    run(s, 180, () => autoIntent(s, ap, 1 / 60), () => kills >= 1);
    expect(kills).toBeGreaterThanOrEqual(1);
  });

  it('cuts the cinderhorn tail by standing behind it', () => {
    const s = game();
    s.player.weapon = 'cleaver';
    const spot = openSpot(s);
    const m = addMonster(s, 'cinderhorn', spot.x, spot.y, 1);
    m.hp = 99999;
    Object.assign(s.player, { x: spot.x - 26, y: spot.y });
    m.mode = 'stun';
    m.stunT = 999;
    run(s, 10, () => intent({ attack: true }), () => !!m.parts.tail?.broken);
    expect(m.parts.tail?.broken).toBe(true);
    expect(m.parts.head?.broken).toBe(false);
    expect(s.inv.etail).toBe(1);
  });
});
