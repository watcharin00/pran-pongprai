// Thai-wildlife content: spawning, parts, progression sanity.
import { describe, expect, it } from 'vitest';
import { ARMOR, ARMOR_IDS, CROPS, MEALS, MONSTERS, MONSTER_IDS, WEAPONS } from '../src/data';
import type { ItemBag, MaterialId, WeaponId } from '../src/data/types';
import { spawnMonster } from '../src/core/monsterAI';
import { goalIndex } from '../src/core/inventory';
import { PLAZA, T } from '../src/core/mapgen';
import { itemSources } from '../src/ui/itemInfo';
import * as th from '../src/i18n/th';
import { addMonster, game, intent, openSpot, run } from './helpers';

const recipeItems = (r: ItemBag | null): MaterialId[] => (r ? (Object.keys(r) as MaterialId[]) : []);

describe('wildlife content', () => {
  it('has the five Thai animals', () => {
    expect(MONSTER_IDS).toEqual(['junglefowl', 'dhole', 'boar', 'gaur', 'tiger']);
    expect(th.monsters.tiger.name).toBe('เสือโคร่ง');
  });

  it('the tiger only spawns deep in the forest, far from the village', () => {
    const s = game();
    const cx = PLAZA.x * T + 8;
    const cy = PLAZA.y * T + 8;
    for (let i = 0; i < 20; i++) {
      const m = spawnMonster(s, 'tiger');
      expect(m).not.toBeNull();
      if (!m) continue;
      expect(Math.hypot(m.x - cx, m.y - cy)).toBeGreaterThanOrEqual(MONSTERS.tiger.spawnMinVillageDist);
      s.monsters = [];
    }
  });

  it('every recipe ingredient can actually be obtained', () => {
    const needed = new Set<MaterialId>();
    for (const w of Object.values(WEAPONS)) recipeItems(w.recipe).forEach((k) => needed.add(k));
    for (const id of ARMOR_IDS) recipeItems(ARMOR[id].recipe).forEach((k) => needed.add(k));
    for (const m of Object.values(MEALS)) recipeItems(m.recipe).forEach((k) => needed.add(k));
    for (const c of Object.values(CROPS)) needed.add(c.seed);
    for (const k of needed) expect(itemSources(k).length, k).toBeGreaterThan(0);
  });

  it('has a goal line for every progress step', () => {
    const s = game();
    const steps: WeaponId[][] = [[], ['bamboobow'], ['cleaver'], ['coreblade'], ['tigerspear']];
    const seen: number[] = [];
    for (const add of steps) {
      add.forEach((w) => s.owned.add(w));
      seen.push(goalIndex(s));
    }
    expect(seen).toEqual([0, 1, 2, 3, 4]);
    expect(th.goals).toHaveLength(5);
  });

  it('breaks the boar mane from behind and the tusks from the front', () => {
    const s = game();
    s.player.weapon = 'cleaver';
    const spot = openSpot(s);
    const m = addMonster(s, 'boar', spot.x, spot.y, 1);
    m.hp = 99999;
    Object.assign(m, { mode: 'stun', stunT: 999 });
    Object.assign(s.player, { x: spot.x - 24, y: spot.y });
    run(s, 10, () => intent({ attack: true }), () => !!m.parts.tail?.broken);
    expect(m.parts.tail?.broken).toBe(true);
    expect(m.parts.head?.broken).toBe(false);
    expect(s.inv.bristle).toBe(1);
  });

  it('a junglefowl can be hunted with the starter sword by holding attack', () => {
    const s = game();
    const spot = openSpot(s);
    Object.assign(s.player, spot);
    addMonster(s, 'junglefowl', spot.x + 30, spot.y);
    let killed = false;
    s.events.on('monster:killed', () => (killed = true));
    run(s, 40, () => intent({ attack: true }), () => killed);
    expect(killed).toBe(true);
    expect(s.inv.fowlmeat).toBe(1);
  });
});
