import { describe, expect, it } from 'vitest';
import { createGame } from '../src/core/sim';
import { exportCode, parseCode, serialize, snapshot } from '../src/core/save';

describe('save transfer code', () => {
  it('round-trips the game through a copyable code', () => {
    const s = createGame({ rngSeed: 1, now: 1000, noMonsters: true });
    s.inv.hide = 7;
    s.player.potions = 5;
    s.kills.dhole = 3;
    const code = exportCode(s);
    expect(code.startsWith('PRAN2:')).toBe(true);
    expect(code).not.toMatch(/\s/);
    expect(parseCode(code)).toEqual(snapshot(s));
  });

  it('survives line breaks and spaces added by chat apps', () => {
    const s = createGame({ rngSeed: 1, now: 1000, noMonsters: true });
    const code = exportCode(s);
    const mangled = `  ${code.slice(0, 20)}\n${code.slice(20, 50)} \r\n${code.slice(50)}  `;
    expect(parseCode(mangled)).toEqual(snapshot(s));
  });

  it('accepts raw save JSON too', () => {
    const s = createGame({ rngSeed: 1, now: 1000, noMonsters: true });
    expect(parseCode(serialize(s))).toEqual(snapshot(s));
  });

  it('rejects junk', () => {
    expect(parseCode('')).toBeNull();
    expect(parseCode('hello')).toBeNull();
    expect(parseCode('PRAN2:@@@')).toBeNull();
    expect(parseCode('PRAN2:' + btoa('not json'))).toBeNull();
  });
});
