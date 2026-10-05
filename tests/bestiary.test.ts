import { describe, expect, it } from 'vitest';
import { killMonster } from '../src/core/combat';
import { parseSave, serialize } from '../src/core/save';
import { createGame } from '../src/core/sim';
import { addMonster, game, MAP, NOW } from './helpers';

describe('bestiary progress', () => {
  it('counts successful hunts per monster kind', () => {
    const s = game();
    killMonster(s, addMonster(s, 'dhole', 100, 100));
    killMonster(s, addMonster(s, 'dhole', 100, 100));
    killMonster(s, addMonster(s, 'junglefowl', 100, 100));
    expect(s.kills).toEqual({ dhole: 2, junglefowl: 1 });
  });

  it('round-trips hunt counts and ignores junk in the save', () => {
    const s = game();
    s.kills = { tiger: 3, boar: 1 };
    const t = createGame({ rngSeed: 1, now: NOW, map: MAP, save: parseSave(serialize(s)), noMonsters: true });
    expect(t.kills).toEqual({ tiger: 3, boar: 1 });
    expect(parseSave(JSON.stringify({ inv: {}, kills: { dragon: 5, dhole: -1, boar: 'x', gaur: 2.7 } }))?.kills).toEqual({ gaur: 2 });
    expect(parseSave(JSON.stringify({ inv: {} }))?.kills).toEqual({});
  });
});
