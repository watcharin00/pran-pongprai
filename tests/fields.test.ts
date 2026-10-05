// Rice paddy and fish pond: beds, planting rules, harvest from the bank, save compatibility.
import { describe, expect, it } from 'vitest';
import { areaMap } from '../src/core/areas';
import { cropFor, harvest, plant, plantAll, plotReach } from '../src/core/farm';
import { cookMeal } from '../src/core/inventory';
import { inVillageTile, MW, PADDY, POND, POND_SLOTS, T, Tile, tileAt, walkable } from '../src/core/mapgen';
import { parseSave, serialize } from '../src/core/save';
import { createGame, step } from '../src/core/sim';
import { contextAction } from '../src/core/village';
import { CROPS, TUNING } from '../src/data';
import { intent, NOW } from './helpers';

const HOME = areaMap('home');
const newGame = () => createGame({ rngSeed: 9, now: NOW, map: HOME, noMonsters: true });

describe('east fields on the map', () => {
  it('paddy is walkable, pond is solid, both inside the village', () => {
    for (let y: number = PADDY.y0; y <= PADDY.y1; y++) {
      for (let x: number = PADDY.x0; x <= PADDY.x1; x++) {
        expect(tileAt(HOME, x, y)).toBe(Tile.PADDY);
        expect(walkable(HOME, x, y)).toBe(true);
        expect(inVillageTile(x, y)).toBe(true);
      }
    }
    for (let y: number = POND.y0; y <= POND.y1; y++) for (let x: number = POND.x0; x <= POND.x1; x++) expect(walkable(HOME, x, y)).toBe(false);
  });

  it('every pond slot can be reached from walkable, reachable bank', () => {
    for (const [sx, sy] of POND_SLOTS) {
      const bank = [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([dx, dy]) => {
        const x = sx + (dx ?? 0);
        const y = sy + (dy ?? 0);
        return walkable(HOME, x, y) && HOME.reach[y * MW + x] === 1 && T <= TUNING.village.pondReach;
      });
      expect(bank, `${sx},${sy}`).toBe(true);
    }
  });
});

describe('beds', () => {
  it('keeps the 8 vegetable plots first so old save indices still line up', () => {
    const s = newGame();
    expect(s.plots.slice(0, 8).every((p) => p.bed === 'soil')).toBe(true);
    expect(s.plots.filter((p) => p.bed === 'paddy')).toHaveLength(6);
    expect(s.plots.filter((p) => p.bed === 'pond')).toHaveLength(4);
  });

  it('rice only goes in the paddy, lotus and fish only in the pond', () => {
    expect(CROPS.rice.bed).toBe('paddy');
    expect(CROPS.lotus.bed).toBe('pond');
    expect(CROPS.fish.bed).toBe('pond');
    expect(CROPS.herb.bed).toBe('soil');
    const s = newGame();
    s.plots.forEach((p) => (p.crop = null));
    s.inv.seed_rice = 5;
    const soil = s.plots.findIndex((p) => p.bed === 'soil');
    const paddy = s.plots.findIndex((p) => p.bed === 'paddy');
    expect(plant(s, soil, 'rice')).toBe(false);
    expect(plant(s, paddy, 'herb')).toBe(false);
    expect(plant(s, paddy, 'rice')).toBe(true);
  });

  it('tapping a paddy or pond plot picks a crop that fits', () => {
    const s = newGame();
    s.selCrop = 'herb';
    s.inv.seed_rice = 1;
    s.inv.seed_lotus = 0;
    s.inv.fry = 2;
    expect(cropFor(s, 'paddy')).toBe('rice');
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
    // stand on the bank tile above the slot
    Object.assign(s.player, { x: slot.x, y: slot.y - T, inVillage: true });
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
    Object.assign(s.player, { x: slot.x, y: slot.y - T });
    expect(contextAction(s)).toEqual({ kind: 'plant', plot: i });
  });

  it('rice already growing in a vegetable plot (older saves) can still be harvested', () => {
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

  it('new games start with one fry', () => {
    expect(newGame().inv.fry).toBe(1);
  });
});
