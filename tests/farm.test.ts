import { describe, expect, it } from 'vitest';
import { growDuration, harvest, plant, plantAll, plotProgress } from '../src/core/farm';
import { step } from '../src/core/sim';
import { game, intent, NOW } from './helpers';

describe('crops', () => {
  it('grows on wall-clock time', () => {
    const s = game();
    s.plots.forEach((p) => (p.crop = null));
    expect(plant(s, 3, 'herb')).toBe(true);
    const p = s.plots[3];
    if (!p) throw new Error();
    expect(plotProgress(p, NOW)).toBe(0);
    expect(plotProgress(p, NOW + 20_000)).toBeCloseTo(0.5);
    expect(plotProgress(p, NOW + 60_000)).toBe(1);
  });

  it('fertiliser halves the grow time and is consumed', () => {
    const s = game();
    s.plots.forEach((p) => (p.crop = null));
    s.useFert = true;
    expect(s.inv.fert).toBe(1);
    plant(s, 2, 'yam');
    expect(s.plots[2]?.dur).toBe(growDuration('yam', true));
    expect(growDuration('yam', true)).toBe(37_500);
    expect(s.inv.fert).toBe(0);
    plant(s, 3, 'yam');
    expect(s.plots[3]?.fert).toBe(false);
  });

  it('needs a seed, and says where to find one', () => {
    const s = game();
    s.plots.forEach((p) => (p.crop = null));
    let missing = '';
    s.events.on('farm:noSeed', (e) => (missing = e.crop));
    expect(plant(s, 0, 'pepper')).toBe(false);
    expect(missing).toBe('pepper');
  });

  it('harvest gives yield and only works when ripe', () => {
    const s = game();
    s.plots.forEach((p) => (p.crop = null));
    plant(s, 0, 'herb');
    expect(harvest(s, 0)).toBe(false);
    s.now = NOW + 40_000;
    expect(harvest(s, 0)).toBe(true);
    expect(s.inv.herb).toBeGreaterThanOrEqual(2);
    expect(s.plots[0]?.crop).toBeNull();
  });

  it('plant-all fills every empty plot while seeds last', () => {
    const s = game();
    s.plots.forEach((p) => (p.crop = null));
    s.selCrop = 'herb';
    expect(plantAll(s)).toBe(3); // starts with 3 herb seeds
    expect(s.inv.seed_herb).toBe(0);
  });

  it('walking over a ripe plot harvests it automatically', () => {
    const s = game();
    const p = s.plots[1]; // fresh games start with a ripe herb here
    if (!p) throw new Error();
    expect(p.crop).toBe('herb');
    Object.assign(s.player, { x: p.x, y: p.y });
    step(s, intent(), 1 / 60, NOW);
    expect(p.crop).toBeNull();
    expect(s.inv.herb).toBeGreaterThan(0);
  });
});
