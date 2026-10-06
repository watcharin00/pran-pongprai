import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/data';
import { autoDrink } from '../src/core/player';
import { parseSave, serialize } from '../src/core/save';
import { game, intent, run } from './helpers';

describe('auto-drink setting', () => {
  it('drinks below the chosen HP share, also without AUTO', () => {
    const s = game();
    expect(s.autoPotion).toBe(TUNING.player.potion.autoDefault);
    s.autoOn = false;
    s.player.potions = 2;
    s.player.hp = s.player.maxHp * 0.5;
    run(s, 0.1, () => intent());
    expect(s.player.potions).toBe(2);
    s.player.hp = s.player.maxHp * 0.3;
    let auto = false;
    s.events.on('player:drink', (e) => (auto = e.auto));
    run(s, 0.1, () => intent());
    expect(s.player.potions).toBe(1);
    expect(auto).toBe(true);
  });

  it('off means off; a higher setting drinks earlier', () => {
    const s = game();
    s.player.potions = 2;
    s.player.hp = s.player.maxHp * 0.2;
    s.autoPotion = 0;
    run(s, 0.1, () => intent());
    expect(s.player.potions).toBe(2);
    s.autoPotion = 0.5;
    s.player.hp = s.player.maxHp * 0.45;
    run(s, 0.1, () => intent());
    expect(s.player.potions).toBe(1);
  });

  it('never drinks mid-roll or mid-wind-up', () => {
    const s = game();
    s.player.potions = 2;
    s.player.hp = 10;
    s.player.roll = 0.2;
    expect(autoDrink(s)).toBe(false);
    s.player.roll = 0;
    s.player.cast = { slot: 0, t: 0.2 } as unknown as typeof s.player.cast;
    expect(autoDrink(s)).toBe(false);
    s.player.cast = null;
    expect(autoDrink(s)).toBe(true);
  });

  it('warns once when out of potions, again after restocking', () => {
    const s = game();
    s.player.potions = 0;
    s.player.hp = 10;
    let warned = 0;
    s.events.on('player:noPotion', (e) => {
      if (e.auto) warned++;
    });
    for (let i = 0; i < 5; i++) autoDrink(s);
    expect(warned).toBe(1);
    s.player.potions = 1;
    autoDrink(s);
    s.player.potions = 0;
    s.player.potCd = 0;
    s.player.hp = 10;
    autoDrink(s);
    expect(warned).toBe(2);
  });

  it('is saved, and junk falls back to the default', () => {
    const s = game();
    s.autoPotion = 0.5;
    expect(parseSave(serialize(s))?.autoPotion).toBe(0.5);
    expect(parseSave(JSON.stringify({ inv: {}, autoPotion: 0.42 }))?.autoPotion).toBe(TUNING.player.potion.autoDefault);
    expect(parseSave(JSON.stringify({ inv: {} }))?.autoPotion).toBe(TUNING.player.potion.autoDefault);
  });
});
