// Crops grow on wall-clock time, so they keep growing while the tab is closed.
import { CROPS, CROPS_DATA } from '../data';
import type { CropId, ItemBag } from '../data/types';
import { farmPlots } from './mapgen';
import { give } from './inventory';
import type { GameState, Plot } from './state';

export function createPlots(): Plot[] {
  return farmPlots().map((p) => ({ ...p, crop: null, at: 0, dur: 0, fert: false }));
}

export function growDuration(crop: CropId, fert: boolean): number {
  return CROPS[crop].growSeconds * 1000 * (fert ? CROPS_DATA.fertilizerTimeMul : 1);
}

/** 0..1 */
export function plotProgress(plot: Plot, now: number): number {
  if (!plot.crop || plot.dur <= 0) return 0;
  return Math.max(0, Math.min(1, (now - plot.at) / plot.dur));
}

export function isRipe(plot: Plot, now: number): boolean {
  return !!plot.crop && plotProgress(plot, now) >= 1;
}

/** Plants the selected seed. Uses fertiliser when `useFert` is on and some is left. */
export function plant(s: GameState, index: number, crop: CropId = s.selCrop): boolean {
  const plot = s.plots[index];
  if (!plot || plot.crop) return false;
  const def = CROPS[crop];
  if (s.inv[def.seed] <= 0) {
    s.events.emit('farm:noSeed', { crop });
    return false;
  }
  s.inv[def.seed]--;
  const fert = s.useFert && s.inv.fert > 0;
  if (fert) s.inv.fert--;
  Object.assign(plot, { crop, at: s.now, dur: growDuration(crop, fert), fert });
  s.events.emit('crop:planted', { plot: index, crop, at: { x: plot.x, y: plot.y } });
  return true;
}

export function harvest(s: GameState, index: number): boolean {
  const plot = s.plots[index];
  if (!plot?.crop || !isRipe(plot, s.now)) return false;
  const crop = plot.crop;
  const def = CROPS[crop];
  const drops: ItemBag = { [def.yield.item]: s.rng.int(def.yield.min, def.yield.max) };
  if (s.rng.next() < def.seedBack) drops[def.seed] = (drops[def.seed] ?? 0) + 1;
  give(s, drops);
  plot.crop = null;
  plot.fert = false;
  s.events.emit('crop:harvested', { plot: index, crop, at: { x: plot.x, y: plot.y }, drops });
  return true;
}

/** Tap on a plot: plant if empty, harvest if ripe. */
export function tapPlot(s: GameState, index: number): boolean {
  const plot = s.plots[index];
  if (!plot) return false;
  if (!plot.crop) return plant(s, index);
  return harvest(s, index);
}

/** Plants the selected crop in every empty plot while seeds last. Returns how many. */
export function plantAll(s: GameState): number {
  let n = 0;
  for (let i = 0; i < s.plots.length; i++) {
    if (s.plots[i]?.crop || s.inv[CROPS[s.selCrop].seed] <= 0) continue;
    if (plant(s, i)) n++;
  }
  return n;
}
