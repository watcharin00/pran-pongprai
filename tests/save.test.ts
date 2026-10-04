import { describe, expect, it } from 'vitest';
import { loadFromStorage, parseSave, serialize } from '../src/core/save';
import { createGame } from '../src/core/sim';
import { game, MAP, NOW } from './helpers';

describe('save', () => {
  it('round-trips everything that must persist', () => {
    const s = game();
    s.inv.fang = 7;
    s.inv.core = 1;
    s.owned.add('fangblade');
    s.player.weapon = 'fangblade';
    s.player.potions = 5;
    s.player.meal = { id: 'tea', until: NOW + 1000 };
    s.selCrop = 'yam';
    s.autoOn = true;
    Object.assign(s.plots[4] ?? {}, { crop: 'pepper', at: NOW - 5, dur: 120_000, fert: true });

    const data = parseSave(serialize(s));
    expect(data).not.toBeNull();
    const t = createGame({ rngSeed: 1, now: NOW, map: MAP, save: data, noMonsters: true });
    expect(t.inv.fang).toBe(7);
    expect(t.inv.core).toBe(1);
    expect([...t.owned].sort()).toEqual(['bone', 'fangblade']);
    expect(t.player.weapon).toBe('fangblade');
    expect(t.player.potions).toBe(5);
    expect(t.player.meal).toEqual({ id: 'tea', until: NOW + 1000 });
    expect(t.selCrop).toBe('yam');
    expect(t.autoOn).toBe(true);
    expect(t.plots[4]).toMatchObject({ crop: 'pepper', at: NOW - 5, dur: 120_000, fert: true });
    expect(t.plots).toHaveLength(8);
  });

  it('migrates a v1 save from the old prototype', () => {
    // exact shape written by reference/prototype-v1-dark.html
    const v1 = JSON.stringify({
      inv: { hide: 3, fang: 2, ore: 1, herb: 4, scale: 0, horn: 0, etail: 0, core: 0, yam: 1, pepper: 0, seed_herb: 2, seed_yam: 1, seed_pepper: 0, fert: 2 },
      owned: ['bone', 'mossmaul'],
      weapon: 'mossmaul',
      potions: 3,
      meal: null,
      selCrop: 'yam',
      plots: [{ crop: 'yam', at: NOW, dur: 75000, fert: false }, { crop: null, at: 0, dur: 0, fert: false }],
    });
    const store: Record<string, string> = { 'pranpongprai-v1': v1 };
    const data = loadFromStorage((k) => store[k] ?? null, 'pranpongprai-v2', 'pranpongprai-v1');
    expect(data?.version).toBe(2);
    expect(data?.weapon).toBe('mossmaul');
    expect(data?.inv.hide).toBe(3);
    expect(data?.autoOn).toBe(false);
    expect(data?.plots[0]?.crop).toBe('yam');
  });

  it('prefers v2 over v1', () => {
    const s = game();
    s.player.potions = 9;
    const store: Record<string, string> = { 'pranpongprai-v2': serialize(s), 'pranpongprai-v1': JSON.stringify({ inv: {}, potions: 1 }) };
    expect(loadFromStorage((k) => store[k] ?? null, 'pranpongprai-v2', 'pranpongprai-v1')?.potions).toBe(9);
  });

  it('survives corrupt or hostile data', () => {
    expect(parseSave(null)).toBeNull();
    expect(parseSave('{not json')).toBeNull();
    expect(parseSave('[]')).toBeNull();
    const d = parseSave(JSON.stringify({ inv: { hide: -5, dragon: 9, fang: 'x' }, owned: ['bone', 'excalibur'], weapon: 'excalibur', potions: -1, selCrop: 'tomato', plots: [{ crop: 'tomato' }] }));
    expect(d?.inv.hide).toBe(0);
    expect(d?.owned).toEqual(['bone']);
    expect(d?.weapon).toBe('bone');
    expect(d?.potions).toBe(2);
    expect(d?.selCrop).toBe('herb');
    expect(d?.plots[0]?.crop).toBeNull();
  });
});
