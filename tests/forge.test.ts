import { describe, expect, it } from 'vitest';
import { ARMOR, WEAPONS } from '../src/data';
import type { WeaponId } from '../src/data/types';
import { gearTier } from '../src/ui/itemInfo';

const w = (id: WeaponId): number => gearTier(WEAPONS[id].recipe);

describe('forge gear tiers', () => {
  it('rank gear from the starting sword up to the last areas', () => {
    expect(w('bone')).toBe(0);
    expect(w('fangblade')).toBe(0);
    expect(w('coreblade')).toBe(1); // gaur gear + a rare core
    expect(w('tigerspear')).toBe(1);
    expect(w('stripeblade')).toBe(2); // + tiger eye
    expect(w('kingblade')).toBe(3);
    expect(w('batbow')).toBe(3); // cave gear, even though bats are weak
    expect(w('nagablade')).toBe(4);
    expect(w('meadowblade')).toBe(4);
  });

  it('a material counts from its easiest source (venom: cobra, not the king cobra)', () => {
    expect(w('cobrafang')).toBe(1);
  });

  it('every weapon and armor piece gets a tier in range', () => {
    for (const k of Object.keys(WEAPONS) as WeaponId[]) expect(w(k)).toBeGreaterThanOrEqual(0);
    for (const a of Object.values(ARMOR)) {
      const t = gearTier(a.recipe);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(4);
    }
  });
});
