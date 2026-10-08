import { describe, expect, it } from 'vitest';
import { ARMOR, ARMOR_IDS, ARMOR_UPGRADE, MATERIALS } from '../src/data';
import { armorLevel, armorStat, armorUpgradeCost, defenseOf, equipArmor, upgradeArmor } from '../src/core/inventory';
import { parseSave, serialize } from '../src/core/save';
import { createGame } from '../src/core/sim';
import { game, NOW, MAP } from './helpers';

describe('armor upgrades', () => {
  it('every piece can go to the max level; costs grow and never ask for rare drops or seals', () => {
    const s = game();
    for (const id of ARMOR_IDS) {
      s.ownedArmor.add(id);
      let prevOre = 0;
      for (let lv = 0; lv < ARMOR_UPGRADE.maxLevel; lv++) {
        s.armorLevels[id] = lv;
        const c = armorUpgradeCost(s, id);
        expect(c, `${id} +${lv + 1}`).not.toBeNull();
        if (!c) continue;
        expect(c.ore ?? 0).toBeGreaterThan(prevOre);
        prevOre = c.ore ?? 0;
        for (const k of Object.keys(c)) {
          expect(k).not.toBe('seal');
          expect(MATERIALS[k as keyof typeof MATERIALS].rarity ?? 0).toBeLessThan(2);
        }
      }
      s.armorLevels[id] = ARMOR_UPGRADE.maxLevel;
      expect(armorUpgradeCost(s, id)).toBeNull();
    }
  });

  it('upgrading spends materials, raises the stats and needs the village', () => {
    const s = game();
    s.ownedArmor.add('mosshood');
    equipArmor(s, 'mosshood');
    const def0 = defenseOf(s);
    const hp0 = s.player.maxHp;
    const cost = armorUpgradeCost(s, 'mosshood');
    if (!cost) throw new Error('no cost');
    for (const [k, n] of Object.entries(cost)) s.inv[k as keyof typeof s.inv] = n ?? 0;
    s.player.inVillage = false;
    expect(upgradeArmor(s, 'mosshood')).toEqual({ ok: false, reason: 'notInVillage' });
    s.player.inVillage = true;
    expect(upgradeArmor(s, 'mosshood').ok).toBe(true);
    expect(armorLevel(s, 'mosshood')).toBe(1);
    for (const k of Object.keys(cost)) expect(s.inv[k as keyof typeof s.inv]).toBe(0);
    expect(armorStat(s, 'mosshood', 'defense')).toBe(Math.round(ARMOR.mosshood.defense * (ARMOR_UPGRADE.statMul[1] ?? 1)));
    expect(defenseOf(s)).toBeGreaterThanOrEqual(def0);
    expect(s.player.maxHp).toBeGreaterThan(hp0);
    expect(upgradeArmor(s, 'mosshood')).toEqual({ ok: false, reason: 'cannotAfford' });
    expect(upgradeArmor(s, 'mossvest')).toEqual({ ok: false, reason: 'notOwned' });
  });

  it('levels survive a save round-trip; levels on pieces not owned are dropped', () => {
    const s = game();
    s.ownedArmor.add('tigerhood');
    s.armorLevels.tigerhood = 3;
    const raw = JSON.parse(serialize(s)) as { armorLevels: Record<string, number> };
    raw.armorLevels.elehelm = 4;
    raw.armorLevels.tigerhood = 99;
    const d = parseSave(JSON.stringify(raw));
    const t = createGame({ rngSeed: 1, now: NOW, map: MAP, noMonsters: true, save: d });
    expect(t.armorLevels).toEqual({ tigerhood: ARMOR_UPGRADE.maxLevel });
  });
});
