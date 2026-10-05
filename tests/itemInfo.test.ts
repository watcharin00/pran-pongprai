import { describe, expect, it } from 'vitest';
import { MATERIAL_IDS } from '../src/data';
import { itemSources, itemUses } from '../src/ui/itemInfo';

describe('item info (bag detail card)', () => {
  it('derives sources from monster parts, carves, rares and crops', () => {
    expect(itemSources('fang')).toEqual(expect.arrayContaining([{ kind: 'part', monster: 'dhole', part: 'head' }, { kind: 'carve', monster: 'dhole' }]));
    expect(itemSources('core')).toContainEqual({ kind: 'rare', monster: 'gaur', chance: 0.25 });
    expect(itemSources('seed_yam')).toContainEqual({ kind: 'bonus', monster: 'dhole', chance: 0.5 });
    expect(itemSources('pepper')).toContainEqual({ kind: 'crop', crop: 'pepper' });
    expect(itemSources('ore').some((x) => x.kind === 'gather')).toBe(true);
  });

  it('derives uses from weapon and meal recipes, potions and planting', () => {
    expect(itemUses('fang')).toContainEqual({ kind: 'weapon', weapon: 'fangblade' });
    expect(itemUses('yam')).toContainEqual({ kind: 'meal', meal: 'stew' });
    expect(itemUses('herb')).toContainEqual({ kind: 'potion' });
    expect(itemUses('seed_pepper')).toContainEqual({ kind: 'plant', crop: 'pepper' });
    expect(itemUses('fert')).toContainEqual({ kind: 'fertilizer' });
  });

  it('every material has at least one way to obtain it', () => {
    for (const id of MATERIAL_IDS) expect(itemSources(id).length, id).toBeGreaterThan(0);
  });
});
