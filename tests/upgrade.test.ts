import { describe, expect, it } from 'vitest';
import { WEAPONS, WEAPONS_DATA } from '../src/data';
import { upgradeCost, upgradeWeapon, weaponLevel, weaponPower } from '../src/core/inventory';
import { hitMonster } from '../src/core/combat';
import { parseSave, serialize } from '../src/core/save';
import { createGame } from '../src/core/sim';
import { itemUses } from '../src/ui/itemInfo';
import { addMonster, game, MAP, NOW } from './helpers';

function village() {
  const s = game();
  s.player.inVillage = true;
  return s;
}

describe('weapon upgrades', () => {
  it('cost scales with the target level and adds ore', () => {
    const s = village();
    expect(upgradeCost(s, 'bone')).toEqual({ hide: 1, fang: 1, ore: 1 });
    s.weaponLevels.bone = 2;
    expect(upgradeCost(s, 'bone')).toEqual({ hide: 3, fang: 3, ore: 3 });
  });

  it('the last level also needs the rare material; nothing past max', () => {
    const s = village();
    s.weaponLevels.cleaver = WEAPONS_DATA.upgrade.maxLevel - 1;
    expect(upgradeCost(s, 'cleaver')).toMatchObject({ core: 1 });
    s.weaponLevels.cleaver = WEAPONS_DATA.upgrade.maxLevel;
    expect(upgradeCost(s, 'cleaver')).toBeNull();
    s.owned.add('cleaver');
    expect(upgradeWeapon(s, 'cleaver')).toEqual({ ok: false, reason: 'maxLevel' });
  });

  it('spends materials, raises the level, and needs the village and ownership', () => {
    const s = village();
    Object.assign(s.inv, { hide: 1, fang: 1, ore: 1 });
    expect(upgradeWeapon(s, 'fangblade')).toEqual({ ok: false, reason: 'notOwned' });
    s.player.inVillage = false;
    expect(upgradeWeapon(s, 'bone')).toEqual({ ok: false, reason: 'notInVillage' });
    s.player.inVillage = true;
    expect(upgradeWeapon(s, 'bone').ok).toBe(true);
    expect(weaponLevel(s, 'bone')).toBe(1);
    expect([s.inv.hide, s.inv.fang, s.inv.ore]).toEqual([0, 0, 0]);
    expect(upgradeWeapon(s, 'bone')).toEqual({ ok: false, reason: 'cannotAfford' });
  });

  it('upgraded weapons hit harder (basic attacks, skills and shots all go through hitMonster)', () => {
    const s = village();
    expect(weaponPower(s, 'bone')).toBe(WEAPONS.bone.damage);
    s.weaponLevels.bone = 5;
    expect(weaponPower(s, 'bone')).toBeCloseTo(WEAPONS.bone.damage * 1.5);
    const m = addMonster(s, 'dhole', s.player.x + 5, s.player.y);
    m.hp = 9999;
    hitMonster(s, m, 1);
    expect(9999 - m.hp).toBeGreaterThanOrEqual(Math.round(WEAPONS.bone.damage * 1.5 * 0.9));
  });

  it('round-trips levels and drops levels for weapons not owned', () => {
    const s = village();
    s.owned.add('fangblade');
    s.weaponLevels = { bone: 3, fangblade: 1 };
    const t = createGame({ rngSeed: 1, now: NOW, map: MAP, save: parseSave(serialize(s)), noMonsters: true });
    expect(t.weaponLevels).toEqual({ bone: 3, fangblade: 1 });
    expect(parseSave(JSON.stringify({ inv: {}, owned: ['bone'], weaponLevels: { bone: 99, cleaver: 2 } }))?.weaponLevels).toEqual({ bone: 5 });
    expect(parseSave(JSON.stringify({ inv: {} }))?.weaponLevels).toEqual({});
  });

  it('the bag lists upgrade uses for materials', () => {
    expect(itemUses('core')).toContainEqual({ kind: 'upgrade', weapon: 'cleaver' });
  });
});
