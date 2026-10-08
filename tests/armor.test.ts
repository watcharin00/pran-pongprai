import { describe, expect, it } from 'vitest';
import { ARMOR, TUNING } from '../src/data';
import { craftArmor, damageReduction, equipArmor, unequipArmor } from '../src/core/inventory';
import { hurtPlayer } from '../src/core/combat';
import { parseSave, serialize } from '../src/core/save';
import { createGame } from '../src/core/sim';
import { addMonster, game, MAP, NOW } from './helpers';

function village() {
  const s = game();
  s.player.inVillage = true;
  return s;
}

describe('armor', () => {
  it('crafting spends the recipe, owns the piece and wears it', () => {
    const s = village();
    Object.assign(s.inv, { hide: 3, fang: 1 });
    expect(craftArmor(s, 'mosshood').ok).toBe(true);
    expect(s.inv.hide).toBe(0);
    expect(s.ownedArmor.has('mosshood')).toBe(true);
    expect(s.armor.head).toBe('mosshood');
    expect(s.player.maxHp).toBe(TUNING.player.maxHp + ARMOR.mosshood.maxHp);
  });

  it('only works in the village and when affordable', () => {
    const s = game();
    s.player.inVillage = false;
    Object.assign(s.inv, { hide: 3, fang: 1 });
    expect(craftArmor(s, 'mosshood')).toEqual({ ok: false, reason: 'notInVillage' });
    s.player.inVillage = true;
    s.inv.hide = 0;
    expect(craftArmor(s, 'mosshood')).toEqual({ ok: false, reason: 'cannotAfford' });
  });

  it('one piece per slot; unequipping clamps HP and stamina back down', () => {
    const s = village();
    s.ownedArmor = new Set(['mossvest', 'cindermail', 'fangcharm']);
    equipArmor(s, 'mossvest');
    equipArmor(s, 'cindermail');
    expect(s.armor.body).toBe('cindermail');
    equipArmor(s, 'fangcharm');
    s.player.hp = s.player.maxHp;
    s.player.st = s.player.maxSt;
    expect(s.player.maxSt).toBe(TUNING.player.maxStamina + 15);
    unequipArmor(s, 'cindermail');
    unequipArmor(s, 'fangcharm');
    expect(s.player.maxHp).toBe(TUNING.player.maxHp);
    expect(s.player.hp).toBe(TUNING.player.maxHp);
    expect(s.player.st).toBe(TUNING.player.maxStamina);
  });

  it('defense reduces incoming damage by defense / (defense + K)', () => {
    const s = village();
    const m = addMonster(s, 'dhole', s.player.x + 20, s.player.y);
    hurtPlayer(s, 30, m);
    const bare = 100 - s.player.hp;
    expect(bare).toBe(30);

    const t = village();
    t.ownedArmor = new Set(['cinderhelm', 'cindermail']);
    equipArmor(t, 'cinderhelm');
    equipArmor(t, 'cindermail');
    t.player.hp = t.player.maxHp;
    const before = t.player.hp;
    hurtPlayer(t, 30, addMonster(t, 'dhole', t.player.x + 20, t.player.y));
    const def = ARMOR.cinderhelm.defense + ARMOR.cindermail.defense;
    expect(damageReduction(t)).toBeCloseTo(def / (def + TUNING.combat.defenseK));
    expect(before - t.player.hp).toBe(Math.round(30 * (1 - damageReduction(t))));
  });

  it('round-trips through the save', () => {
    const s = village();
    s.ownedArmor = new Set(['mosshood', 'fangcharm']);
    equipArmor(s, 'mosshood');
    equipArmor(s, 'fangcharm');
    const t = createGame({ rngSeed: 1, now: NOW, map: MAP, save: parseSave(serialize(s)), noMonsters: true });
    expect([...t.ownedArmor].sort()).toEqual(['fangcharm', 'mosshood']);
    expect(t.armor).toEqual({ head: 'mosshood', body: null, feet: null, charm: 'fangcharm' });
    expect(t.player.maxHp).toBe(TUNING.player.maxHp + ARMOR.mosshood.maxHp);
  });

  it('loads a save from before armor existed', () => {
    const old = JSON.stringify({ version: 2, inv: { hide: 2 }, owned: ['bone'], weapon: 'bone', potions: 1, meal: null, selCrop: 'herb', autoOn: false, plots: [] });
    const d = parseSave(old);
    expect(d?.ownedArmor).toEqual([]);
    expect(d?.armor).toEqual({ head: null, body: null, feet: null, charm: null });
  });

  it('drops equipped pieces that are not owned or are in the wrong slot', () => {
    const bad = JSON.stringify({ version: 2, inv: {}, ownedArmor: ['mosshood'], armor: { head: 'mossvest', body: 'mosshood', charm: 'emberamulet' } });
    expect(parseSave(bad)?.armor).toEqual({ head: null, body: null, feet: null, charm: null });
  });
});

describe('boots', () => {
  it('each boot fills the feet slot and brings a movement perk', async () => {
    const { ARMOR, ARMOR_IDS, ARMOR_PERKS } = await import('../src/data');
    const boots = ARMOR_IDS.filter((id) => ARMOR[id].slot === 'feet');
    expect(boots.length).toBeGreaterThanOrEqual(6);
    for (const id of boots) {
      const perk = ARMOR[id].perk;
      expect(perk, id).not.toBeNull();
      if (!perk) continue;
      const k = ARMOR_PERKS[perk];
      expect(k.walkSpeedMul ?? k.dodgeCostDelta ?? k.rollIframeBonus ?? k.staminaRegenMul, id).toBeDefined();
    }
  });

  it('worn boots speed the player up without touching other slots', async () => {
    const { craftArmor, walkSpeed } = await import('../src/core/inventory');
    const { game } = await import('./helpers');
    const s = game();
    const base = walkSpeed(s);
    s.inv.hide = 3;
    s.inv.fang = 1;
    expect(craftArmor(s, 'dholeboots').ok).toBe(true);
    expect(s.armor.feet).toBe('dholeboots');
    expect(s.armor.head).toBeNull();
    expect(walkSpeed(s)).toBeCloseTo(base * 1.05);
  });
});
