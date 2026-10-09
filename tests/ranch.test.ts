import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/data';
import { createGame, step } from '../src/core/sim';
import { basketCount, canLove, feedTrough, FEED_ITEMS, hatchEgg, isGrown, petHen, updateRanch } from '../src/core/ranch';
import { contextAction } from '../src/core/village';
import { HEN_ROAM, NEST, TROUGH, tileAt, Tile, COOP, COOP_GATE, walkable } from '../src/core/mapgen';
import { parseSave, serialize } from '../src/core/save';
import { MATERIALS } from '../src/data';
import { emptyIntent, type GameState, type Intent } from '../src/core/state';

const R = TUNING.ranch;

function must<T>(v: T | null | undefined): T {
  if (v === null || v === undefined) throw new Error('missing');
  return v;
}
const NOW = 1_700_000_000_000;
const game = (): GameState => createGame({ rngSeed: 3, now: NOW, noMonsters: true });
const idle: Intent = emptyIntent();

/** Advance wall-clock time by `sec` in one jump (like reopening the game later). */
function later(s: GameState, sec: number): void {
  s.now += sec * 1000;
  updateRanch(s, 0.016);
}

function hatchHen(s: GameState): void {
  s.inv.jfegg = 1;
  expect(hatchEgg(s)).toBe(true);
  later(s, R.hatchSec + 1);
  expect(s.ranch.hens).toHaveLength(1);
}

describe('coop layout', () => {
  it('fenced pen with a gate, henhouse, open ground for hens, trough and nest', () => {
    const s = game();
    const m = s.map;
    expect(tileAt(m, COOP.x, COOP.y + 2)).toBe(Tile.FENCE);
    expect(walkable(m, COOP_GATE.x, COOP_GATE.y)).toBe(true);
    for (const p of [TROUGH, NEST, { x: HEN_ROAM.x0, y: HEN_ROAM.y0 }, { x: HEN_ROAM.x1, y: HEN_ROAM.y1 }]) {
      expect([Tile.GRASS, Tile.SAND]).toContain(tileAt(m, Math.floor(p.x / 16), Math.floor(p.y / 16)));
    }
    // the gate is reachable on foot from the village
    expect(m.reach[COOP_GATE.y * 64 + COOP_GATE.x]).toBe(1);
  });

  it('feed items are real materials', () => {
    expect(FEED_ITEMS.length).toBe(R.feed.length);
    for (const k of FEED_ITEMS) expect(k in MATERIALS).toBe(true);
  });
});

describe('ranch', () => {
  it('a jungle-fowl egg hatches into a chick that grows into a hen', () => {
    const s = game();
    expect(hatchEgg(s)).toBe(false);
    s.inv.jfegg = 2;
    expect(hatchEgg(s)).toBe(true);
    expect(s.inv.jfegg).toBe(1);
    later(s, R.hatchSec - 1);
    expect(s.ranch.hens).toHaveLength(0);
    later(s, 2);
    const h = must(s.ranch.hens[0]);
    expect(isGrown(h, s.now)).toBe(false);
    later(s, R.growSec);
    expect(isGrown(h, s.now)).toBe(true);
  });

  it('caps the coop at maxHens counting eggs still hatching', () => {
    const s = game();
    s.inv.jfegg = R.maxHens + 3;
    for (let i = 0; i < R.maxHens; i++) expect(hatchEgg(s)).toBe(true);
    expect(hatchEgg(s)).toBe(false);
    expect(s.inv.jfegg).toBe(3);
  });

  it('hens lay only with feed in the trough; an empty trough just pauses', () => {
    const s = game();
    hatchHen(s);
    later(s, R.growSec + R.laySec * 3);
    expect(basketCount(s.ranch)).toBe(0);
    s.inv.rice = 1;
    s.inv.yam = 0;
    s.inv.banana = 0;
    const r = feedTrough(s);
    expect(r.ok).toBe(true);
    expect(s.inv.rice).toBe(0);
    expect(s.ranch.trough).toBe(R.feedPerItem);
    later(s, 1);
    later(s, R.laySec * 10);
    // two portions = two lays, then the hen waits
    expect(s.ranch.trough).toBe(0);
    expect(s.ranch.basket.egg).toBeGreaterThanOrEqual(2);
    expect(must(s.ranch.hens[0]).nextLay).toBe(0);
  });

  it('feeding reports a full trough or nothing to feed', () => {
    const s = game();
    for (const k of FEED_ITEMS) s.inv[k] = 0;
    expect(feedTrough(s)).toEqual({ ok: false, reason: 'noFeed' });
    s.inv.yam = 50;
    while (feedTrough(s).ok);
    expect(feedTrough(s)).toEqual({ ok: false, reason: 'full' });
    expect(s.ranch.trough).toBeLessThanOrEqual(R.troughMax);
  });

  it('walking up to the nest collects the basket', () => {
    const s = game();
    s.ranch.basket = { egg: 3, feather: 1 };
    const egg0 = s.inv.egg;
    const feather0 = s.inv.feather;
    s.player.x = NEST.x;
    s.player.y = NEST.y + 4;
    step(s, idle, 0.016, s.now);
    expect(s.inv.egg).toBe(egg0 + 3);
    expect(s.inv.feather).toBe(feather0 + 1);
    expect(basketCount(s.ranch)).toBe(0);
  });

  it('a full basket stops laying until collected', () => {
    const s = game();
    hatchHen(s);
    later(s, R.growSec);
    s.ranch.trough = R.troughMax;
    s.ranch.basket = { egg: R.basketMax };
    later(s, 1);
    later(s, R.laySec * 3);
    expect(s.ranch.basket.egg).toBe(R.basketMax);
    expect(s.ranch.trough).toBe(R.troughMax);
  });

  it('petting raises love at most once per cooldown, up to the max', () => {
    const s = game();
    hatchHen(s);
    const h = must(s.ranch.hens[0]);
    expect(canLove(h, s.now)).toBe(true);
    petHen(s, h.id);
    expect(h.love).toBe(1);
    petHen(s, h.id);
    expect(h.love).toBe(1);
    for (let i = 0; i < R.maxLove + 2; i++) {
      s.now += R.petCooldownSec * 1000;
      petHen(s, h.id);
    }
    expect(h.love).toBe(R.maxLove);
  });

  it('context button: hatch at the nest, feed at the trough, pet a hen nearby', () => {
    const s = game();
    s.player.x = NEST.x;
    s.player.y = NEST.y + 2;
    expect(contextAction(s)).toBeNull();
    s.inv.jfegg = 1;
    expect(contextAction(s)?.kind).toBe('hatch');
    s.player.x = TROUGH.x;
    s.player.y = TROUGH.y + 4;
    expect(contextAction(s)?.kind).toBe('feed');
    hatchHen(s);
    const h = must(s.ranch.hens[0]);
    s.player.x = h.x + 3;
    s.player.y = h.y + 1;
    expect(contextAction(s)).toEqual({ kind: 'pet', hen: h.id });
  });

  it('hens stay inside the pen while strolling', () => {
    const s = game();
    s.inv.jfegg = 4;
    for (let i = 0; i < 4; i++) hatchEgg(s);
    later(s, R.hatchSec + 1);
    s.ranch.trough = 6;
    for (let i = 0; i < 3000; i++) {
      s.now += 16;
      updateRanch(s, 0.016);
    }
    for (const h of s.ranch.hens) {
      expect(h.x).toBeGreaterThanOrEqual(HEN_ROAM.x0 - 8);
      expect(h.x).toBeLessThanOrEqual(HEN_ROAM.x1 + 8);
      expect(h.y).toBeGreaterThanOrEqual(HEN_ROAM.y0 - 8);
      expect(h.y).toBeLessThanOrEqual(HEN_ROAM.y1 + 8);
    }
  });

  it('save round-trip keeps hens, nest, trough and basket; old saves start empty', () => {
    const s = game();
    hatchHen(s);
    must(s.ranch.hens[0]).love = 2;
    s.inv.jfegg = 1;
    hatchEgg(s);
    s.ranch.trough = 5;
    s.ranch.basket = { egg: 2 };
    const d = must(parseSave(serialize(s)));
    const t = createGame({ rngSeed: 9, now: s.now, noMonsters: true, save: d });
    expect(t.ranch.hens).toHaveLength(1);
    expect(must(t.ranch.hens[0]).love).toBe(2);
    expect(must(t.ranch.hens[0]).born).toBe(must(s.ranch.hens[0]).born);
    expect(t.ranch.nest).toEqual(s.ranch.nest);
    expect(t.ranch.trough).toBe(5);
    expect(t.ranch.basket).toEqual({ egg: 2 });
    const old = JSON.parse(serialize(s)) as Record<string, unknown>;
    delete old.ranch;
    expect(must(parseSave(JSON.stringify(old))).ranch).toEqual({ hens: [], nest: [], trough: 0, basket: {} });
  });

  it('eggs cook into the new meals', async () => {
    const { cookMeal } = await import('../src/core/inventory');
    const s = game();
    s.inv.egg = 3;
    s.inv.lemongrass = 1;
    s.player.x = 18 * 16 + 7;
    expect(cookMeal(s, 'omelet').ok).toBe(true);
    expect(s.inv.egg).toBe(1);
  });
});
