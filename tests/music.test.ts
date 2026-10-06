import { describe, expect, it } from 'vitest';
import { BATTLE_LINGER, nextMood, parseBar, SONG_BARS, type MoodInput } from '../src/audio/music';

const calm: MoodInput = { dead: false, inVillage: false, hunted: false, bossHunted: false };

describe('music mood', () => {
  it('village inside, wild outside', () => {
    expect(nextMood('silent', { ...calm, inVillage: true }, 99)).toBe('village');
    expect(nextMood('village', calm, 99)).toBe('wild');
  });

  it('battle while chased, boss when a boss chases, silent when down', () => {
    expect(nextMood('wild', { ...calm, hunted: true }, 0)).toBe('battle');
    expect(nextMood('battle', { ...calm, hunted: true, bossHunted: true }, 0)).toBe('boss');
    expect(nextMood('battle', { ...calm, dead: true }, 0)).toBe('silent');
  });

  it('battle music lingers through a short break, then calms down', () => {
    expect(nextMood('battle', calm, BATTLE_LINGER - 1)).toBe('battle');
    expect(nextMood('boss', calm, 1)).toBe('boss');
    expect(nextMood('battle', calm, BATTLE_LINGER + 0.1)).toBe('wild');
    // walking into the village ends it at once
    expect(nextMood('battle', { ...calm, inVillage: true }, 0.5)).toBe('village');
  });

  it('a boss fight keeps boss music while small fry join in', () => {
    expect(nextMood('boss', { ...calm, hunted: true }, 0)).toBe('boss');
  });
});

describe('score', () => {
  it('every bar is 16 valid steps', () => {
    for (const { mood, bar } of SONG_BARS) {
      const toks = bar.trim().split(/\s+/);
      expect(toks, `${mood}: ${bar}`).toHaveLength(16);
      for (const t of toks) expect(t, `${mood}: ${bar}`).toMatch(/^(\.|_|\d[+-]*)$/);
    }
  });

  it('parses degrees, octave marks and held notes', () => {
    const notes = parseBar('0 _ 2+ . 4- . . . . . . . . . . 5', [0, 2, 4, 7, 9]);
    expect(notes).toEqual([
      { step: 0, pitch: 0, len: 2 },
      { step: 2, pitch: 16, len: 1 },
      { step: 4, pitch: -3, len: 1 },
      { step: 15, pitch: 12, len: 1 },
    ]);
  });
});
