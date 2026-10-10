// Vegetable plot and fish pond: beds, planting rules, harvest from the bank, save compatibility.
import { describe, expect, it } from 'vitest';
import { areaMap } from '../src/core/areas';
import { cropFor, harvest, plant, plantAll, plotReach } from '../src/core/farm';
import { cookMeal } from '../src/core/inventory';
import { inVillageTile, JETTY, MW, POND_AREA, POND_SLOTS, pondDepth, T, Tile, tileAt, walkable } from '../src/core/mapgen';
import { parseSave, serialize } from '../src/core/save';
import { createGame, step } from '../src/core/sim';
import { contextAction } from '../src/core/village';
import { CROPS, TUNING } from '../src/data';
import { intent, NOW } from './helpers';

const HOME = areaMap('home');
const newGame = () => createGame({ rngSeed: 9, now: NOW, map: HOME, noMonsters: true });

describe('fish pond on the map', () => {
  it('the pond is solid water inside the village, and the village has no rice paddy any more', () => {
    for (let y = 0; y < 48; y++) for (let x = 0; x < MW; x++) expect(tileAt(HOME, x, y)).not.toBe(Tile.PADDY);
    let water = 0;
    for (let y: number = POND_AREA.y0; y <= POND_AREA.y1; y++) {
      for (let x: number = POND_AREA.x0; x <= POND_AREA.x1; x++) {
        const inWater = pondDepth(x * T + 8, y * T + 8) < 1;
        const jetty = JETTY.some(([jx, jy]) => jx === x && jy === y);
        if (inWater && !jetty) {
          water++;
          expect(walkable(HOME, x, y), `${x},${y}`).toBe(false);
          expect(inVillageTile(x, y)).toBe(true);
        }
      }
    }
    expect(water).toBeGreaterThanOrEqual(12);
  });

  it('the jetty is walkable and reachable from the village', () => {
    for (const [x, y] of JETTY) {
      expect(walkable(HOME, x, y)).toBe(true);
      expect(HOME.reach[y * MW + x]).toBe(1);
    }
  });

  it('every pond slot is in the water and within reach of walkable, reachable ground', () => {
    for (const slot of POND_SLOTS) {
      expect(pondDepth(slot.x, slot.y)).toBeLessThan(1);
      let reachable = false;
      for (let y = 0; y < 48; y++) {
        for (let x = 0; x < MW; x++) {
          if (!walkable(HOME, x, y) || HOME.reach[y * MW + x] !== 1) continue;
          if (Math.hypot(x * T + 8 - slot.x, y * T + 8 - slot.y) < TUNING.village.pondReach - 4) reachable = true;
        }
      }
      expect(reachable, `${slot.x},${slot.y}`).toBe(true);
    }
  });
});

describe('beds', () => {
  it('keeps the 8 vegetable plots first so old save indices still line up', () => {
    const s = newGame();
    expect(s.plots.slice(0, 8).every((p) => p.bed === 'soil')).toBe(true);
    expect(s.plots.filter((p) => p.bed === 'soil')).toHaveLength(8);
    expect(s.plots.filter((p) => p.bed === 'pond')).toHaveLength(4);
  });

  it('rice grows in the vegetable plot, lotus and fish only in the pond', () => {
    expect(CROPS.rice.bed).toBe('soil');
    expect(CROPS.lotus.bed).toBe('pond');
    expect(CROPS.fish.bed).toBe('pond');
    expect(CROPS.herb.bed).toBe('soil');
    const s = newGame();
    s.plots.forEach((p) => (p.crop = null));
    s.inv.seed_rice = 5;
    const soil = s.plots.findIndex((p) => p.bed === 'soil');
    const pond = s.plots.findIndex((p) => p.bed === 'pond');
    expect(plant(s, pond, 'rice')).toBe(false);
    expect(plant(s, soil, 'rice')).toBe(true);
  });

  it('tapping a pond plot picks a crop that fits', () => {
    const s = newGame();
    s.selCrop = 'herb';
    s.inv.seed_rice = 1;
    s.inv.seed_lotus = 0;
    s.inv.fry = 2;
    expect(cropFor(s, 'pond')).toBe('fish');
    s.inv.seed_lotus = 1;
    expect(cropFor(s, 'pond')).toBe('lotus');
    s.selCrop = 'fish';
    expect(cropFor(s, 'pond')).toBe('fish');
  });

  it("plant-all fills only the selected crop's bed", () => {
    const s = newGame();
    s.plots.forEach((p) => (p.crop = null));
    s.selCrop = 'fish';
    s.inv.fry = 10;
    s.inv.seed_herb = 10;
    expect(plantAll(s)).toBe(4);
    expect(s.plots.filter((p) => p.crop === 'fish').every((p) => p.bed === 'pond')).toBe(true);
    expect(s.plots.some((p) => p.bed !== 'pond' && p.crop)).toBe(false);
  });

  it('fish grow, get harvested from the bank and can give fry back', () => {
    const s = newGame();
    s.plots.forEach((p) => (p.crop = null));
    const i = s.plots.findIndex((p) => p.bed === 'pond');
    const slot = s.plots[i];
    if (!slot) throw new Error();
    s.inv.fry = 1;
    expect(plant(s, i, 'fish')).toBe(true);
    Object.assign(s.player, { ...nearestBank(slot), inVillage: true });
    expect(Math.hypot(slot.x - s.player.x, slot.y - s.player.y)).toBeLessThan(plotReach(slot));
    step(s, intent(), 1 / 60, NOW + CROPS.fish.growSeconds * 1000 + 1);
    expect(slot.crop).toBeNull();
    expect(s.inv.fish).toBeGreaterThanOrEqual(2);
  });

  it('the context button plants the pond from the bank', () => {
    const s = newGame();
    const i = s.plots.findIndex((p) => p.bed === 'pond');
    const slot = s.plots[i];
    if (!slot) throw new Error();
    Object.assign(s.player, nearestBank(slot));
    expect(contextAction(s)).toEqual({ kind: 'plant', plot: i });
  });

  it('rice growing in a vegetable plot survives a save round trip and can be harvested', () => {
    const s = newGame();
    Object.assign(s.plots[2] ?? {}, { crop: 'rice', at: NOW - 200_000, dur: 90_000, fert: false });
    const t = createGame({ rngSeed: 1, now: NOW, map: HOME, save: parseSave(serialize(s)), noMonsters: true });
    expect(t.plots[2]?.bed).toBe('soil');
    expect(harvest(t, 2)).toBe(true);
    expect(t.inv.rice).toBeGreaterThanOrEqual(2);
  });

  it('fish meals cook in the village', () => {
    const s = newGame();
    Object.assign(s.inv, { fish: 2, lemongrass: 1 });
    s.player.inVillage = true;
    expect(cookMeal(s, 'plaphao').ok).toBe(true);
    expect(s.player.meal?.id).toBe('plaphao');
  });

  it('saves from the paddy days: paddy plots are dropped, their crops come back as seeds, the pond lines up', () => {
    const s = newGame();
    s.plots.forEach((p) => (p.crop = null));
    const d = JSON.parse(serialize(s)) as { plots: { crop: string | null; at: number; dur: number; fert: boolean }[]; inv: Record<string, number> };
    const empty = { crop: null, at: 0, dur: 0, fert: false };
    const paddy = [{ crop: 'rice', at: NOW, dur: 90_000, fert: false }, empty, { crop: 'rice', at: NOW, dur: 90_000, fert: true }, empty, empty, empty];
    const pond = [{ crop: 'lotus', at: NOW, dur: 100_000, fert: false }, empty, empty, empty];
    d.plots = [...d.plots.slice(0, 8), ...paddy, ...pond];
    d.inv.seed_rice = 0;
    const save = parseSave(JSON.stringify(d));
    expect(save?.plots).toHaveLength(12);
    expect(save?.inv.seed_rice).toBe(2);
    const t = createGame({ rngSeed: 1, now: NOW, map: HOME, save, noMonsters: true });
    const firstPond = t.plots.findIndex((p) => p.bed === 'pond');
    expect(t.plots[firstPond]?.crop).toBe('lotus');
  });

  it('new games start with one fry', () => {
    expect(newGame().inv.fry).toBe(1);
  });
});

/** Centre of the closest walkable tile to a pond slot (where a player would stand). */
function nearestBank(p: { x: number; y: number }): { x: number; y: number } {
  let best = { x: 0, y: 0 };
  let bd = Infinity;
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < MW; x++) {
      if (!walkable(HOME, x, y)) continue;
      const d = Math.hypot(x * T + 8 - p.x, y * T + 8 - p.y);
      if (d < bd) {
        bd = d;
        best = { x: x * T + 8, y: y * T + 8 };
      }
    }
  }
  return best;
}
