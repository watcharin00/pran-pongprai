// Crops grow on wall-clock time, so they keep growing while the tab is closed.
import { CROPS, CROPS_DATA, TUNING } from '../data';
import type { CropBed, CropId, ItemBag } from '../data/types';
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

export const cropsForBed = (bed: CropBed): CropId[] => (Object.keys(CROPS) as CropId[]).filter((c) => CROPS[c].bed === bed);

/**
 * What goes into a plot when the player just taps it: the selected crop if it grows there,
 * otherwise the first crop for that bed that has seeds (rice in the paddy, lotus/fish in the pond).
 */
export function cropFor(s: GameState, bed: CropBed): CropId | null {
  if (CROPS[s.selCrop].bed === bed) return s.selCrop;
  const options = cropsForBed(bed);
  return options.find((c) => s.inv[CROPS[c].seed] > 0) ?? options[0] ?? null;
}

/** How close the player must be to a plot to plant or auto-harvest (pond slots are water, reached from the bank). */
export function plotReach(plot: Plot): number {
  return plot.bed === 'pond' ? TUNING.village.pondReach : plot.bed === 'paddy' ? TUNING.village.paddyReach : TUNING.village.harvestRadius;
}

/**
 * Plants a crop (default: what fits this plot, see cropFor). Uses fertiliser when `useFert`
 * is on and some is left. A crop never goes into the wrong bed.
 */
export function plant(s: GameState, index: number, crop?: CropId): boolean {
  const plot = s.plots[index];
  if (!plot || plot.crop) return false;
  const chosen = crop ?? cropFor(s, plot.bed);
  if (!chosen || CROPS[chosen].bed !== plot.bed) return false;
  crop = chosen;
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

/**
 * Plants one `crop` in the first empty plot of its bed (the farm menu's per-crop button).
 * Also makes it the selected crop, so "plant all" continues with the same one.
 */
export function plantOne(s: GameState, crop: CropId): boolean {
  s.selCrop = crop;
  const bed = CROPS[crop].bed;
  const i = s.plots.findIndex((pl) => pl.bed === bed && !pl.crop);
  return i >= 0 && plant(s, i, crop);
}

/** Empty plots that `crop` could go into. */
export function freePlotsFor(s: GameState, crop: CropId): number {
  const bed = CROPS[crop].bed;
  return s.plots.filter((pl) => pl.bed === bed && !pl.crop).length;
}

/** Plants the selected crop in every empty plot of its bed while seeds last. Returns how many. */
export function plantAll(s: GameState): number {
  const def = CROPS[s.selCrop];
  let n = 0;
  for (let i = 0; i < s.plots.length; i++) {
    const pl = s.plots[i];
    if (!pl || pl.crop || pl.bed !== def.bed || s.inv[def.seed] <= 0) continue;
    if (plant(s, i, s.selCrop)) n++;
  }
  return n;
}
