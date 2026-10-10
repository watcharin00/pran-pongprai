import { describe, expect, it } from 'vitest';
import { CROPS_DATA } from '../src/data';
import { fertilize, plant, plantAllOf, plotAt } from '../src/core/farm';
import { game } from './helpers';

describe('tapping farm plots', () => {
  it('finds the plot under a point, by bed', () => {
    const s = game();
    s.plots.forEach((pl, i) => {
      expect(plotAt(s, pl.x, pl.y)).toBe(i);
      expect(plotAt(s, pl.x + 3, pl.y - 3)).toBe(i);
    });
    expect(plotAt(s, 0, 0)).toBe(-1);
  });

  it('fertilising a growing plot halves the time still to go, once', () => {
    const s = game();
    const i = s.plots.findIndex((p) => p.bed === 'soil' && !p.crop);
    s.inv.seed_herb = 2;
    s.inv.fert = 2;
    s.useFert = false;
    expect(plant(s, i, 'herb')).toBe(true);
    const plot = s.plots[i];
    if (!plot) throw new Error('no plot');
    s.now += plot.dur / 2;
    const before = plot.at + plot.dur - s.now;
    expect(fertilize(s, i)).toBe(true);
    expect(plot.at + plot.dur - s.now).toBeCloseTo(before * CROPS_DATA.fertilizerTimeMul);
    expect(s.inv.fert).toBe(1);
    expect(fertilize(s, i)).toBe(false);
    expect(s.inv.fert).toBe(1);
  });

  it('plants one crop in every empty plot of its bed', () => {
    const s = game();
    for (const p of s.plots) p.crop = null;
    s.inv.fry = 10;
    const ponds = s.plots.filter((p) => p.bed === 'pond').length;
    expect(plantAllOf(s, 'fish')).toBe(ponds);
    expect(s.selCrop).toBe('fish');
    expect(s.plots.filter((p) => p.bed === 'soil' && p.crop).length).toBe(0);
  });
});
