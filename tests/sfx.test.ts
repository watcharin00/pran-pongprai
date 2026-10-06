import { describe, expect, it } from 'vitest';
import { DEFAULT_SOUND, distanceGain, parseSoundSettings } from '../src/audio/sfx';

describe('sound settings', () => {
  it('falls back to defaults when nothing or garbage is stored', () => {
    expect(parseSoundSettings(null)).toEqual(DEFAULT_SOUND);
    expect(parseSoundSettings('not json')).toEqual(DEFAULT_SOUND);
    expect(parseSoundSettings('{"on":"yes","volume":"loud"}')).toEqual(DEFAULT_SOUND);
  });

  it('round-trips and clamps the volume', () => {
    expect(parseSoundSettings(JSON.stringify({ on: false, volume: 0.3 }))).toEqual({ on: false, volume: 0.3, music: 0.5 });
    expect(parseSoundSettings(JSON.stringify({ on: true, volume: 5 })).volume).toBe(1);
    expect(parseSoundSettings(JSON.stringify({ on: true, volume: -1 })).volume).toBe(0);
  });
});

describe('distance falloff', () => {
  it('is full volume up close and never fully silent', () => {
    expect(distanceGain(0)).toBe(1);
    expect(distanceGain(80)).toBe(1);
    expect(distanceGain(200)).toBeLessThan(1);
    expect(distanceGain(200)).toBeGreaterThan(distanceGain(300));
    expect(distanceGain(5000)).toBe(0.15);
  });
});
