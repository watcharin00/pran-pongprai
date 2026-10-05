import { describe, expect, it } from 'vitest';
import { CROPS, MATERIALS, MATERIAL_IDS, MEALS, MONSTERS, MONSTER_IDS, SKILLS, SKILL_IDS, TUNING, WEAPONS, WEAPON_TYPES } from '../src/data';
import { weaponSkills } from '../src/core/skills';
import { DataError, loadMonsters, loadSkills, loadWeapons } from '../src/data/validate';
import skillsJson from '../src/data/skills.json';
import monstersJson from '../src/data/monsters.json';
import weaponsJson from '../src/data/weapons.json';
import * as th from '../src/i18n/th';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('content data', () => {
  it('matches the monster table in CLAUDE.md', () => {
    const m = MONSTERS.dhole;
    expect([m.hp, m.speed, m.size, m.aggroRadius, m.turnTime, m.huntTime, m.recover, m.count, m.respawn]).toEqual([120, 48, 8, 60, 0.35, 90, 0.8, 6, 14]);
    expect(m.parts.head?.hp).toBe(45);
    expect(m.rage).toBeNull();

    const c = MONSTERS.gaur;
    expect([c.hp, c.speed, c.size, c.aggroRadius, c.turnTime, c.huntTime, c.recover, c.count, c.respawn]).toEqual([560, 40, 14, 56, 0.75, 150, 1.0, 1, 25]);
    expect(c.parts.head?.hp).toBe(150);
    expect(c.parts.tail?.hp).toBe(110);
    expect(c.rage).toEqual({ below: 0.5, speedMul: 1.2, telegraphRate: 1.35, damageMul: 1.15 });
    expect(c.rare.core).toBe(0.25);
  });

  it('keeps attack shapes as discriminated unions', () => {
    const charge = MONSTERS.gaur.attacks.find((a) => a.id === 'charge');
    expect(charge?.shape).toBe('line');
    if (charge?.shape === 'line') {
      expect([charge.length, charge.width, charge.telegraph, charge.damage, charge.minRange, charge.dash]).toEqual([130, 24, 1.0, 32, 40, true]);
    }
    const bite = MONSTERS.dhole.attacks.find((a) => a.id === 'bite');
    expect(bite?.shape === 'circle' && [bite.radius, bite.offset, bite.telegraph, bite.damage]).toEqual([15, 11, 0.65, 10]);
  });

  it('matches the weapon table', () => {
    expect(Object.keys(WEAPONS)).toEqual(['bone', 'fangblade', 'mossmaul', 'cleaver', 'coreblade', 'bamboospear', 'bamboobow', 'redcrossbow', 'tuskaxe', 'tigerspear', 'stripeblade']);
    expect(WEAPONS.mossmaul).toMatchObject({ type: 'hammer', damage: 28, rate: 0.9, stun: 34, partMul: { head: 1.8, tail: 0.7 } });
    expect(WEAPONS.bone.recipe).toBeNull();
    expect(WEAPON_TYPES.hammer.hitstop).toBe(0.085);
  });

  it('matches skills, crops, meals and player tuning', () => {
    expect(weaponSkills('bone')).toEqual(['whirl', 'dash', 'slam']);
    expect([SKILLS.whirl.cooldown, SKILLS.dash.cooldown, SKILLS.slam.cooldown]).toEqual([6, 7, 11]);
    expect([CROPS.herb.growSeconds, CROPS.yam.growSeconds, CROPS.pepper.growSeconds]).toEqual([40, 75, 120]);
    expect(MEALS.tea.effect).toEqual({ staminaRegenMul: 1.6, dodgeCost: 20 });
    expect(TUNING.player.roll).toEqual({ duration: 0.26, speed: 170, iframe: 0.32, cooldown: 0.5, staminaCost: 28 });
    expect(TUNING.world.seed).toBe(20261004);
  });

  it('every crop seed is a seed-category material', () => {
    for (const c of Object.values(CROPS)) expect(MATERIALS[c.seed].category).toBe('seed');
  });

  it('has a Thai name for every material, part and attack', () => {
    for (const id of MATERIAL_IDS) expect(th.materials[id]).toBeTruthy();
    for (const id of MONSTER_IDS) {
      const names = th.monsters[id] as { parts: Record<string, string>; attacks: Record<string, string> };
      for (const part of Object.keys(MONSTERS[id].parts)) expect(names.parts[part], `${id}.${part}`).toBeTruthy();
      for (const a of MONSTERS[id].attacks) expect(names.attacks[a.id], `${id}.${a.id}`).toBeTruthy();
    }
  });
});

describe('data validation', () => {
  it('rejects an unknown attack shape', () => {
    const bad = clone(monstersJson) as unknown as { dhole: { attacks: [{ shape: string }] } };
    bad.dhole.attacks[0].shape = 'cone';
    expect(() => loadMonsters(bad, MATERIAL_IDS)).toThrow(/monsters\.dhole\.attacks\[0\]\.shape/);
  });

  it('rejects drops that reference unknown materials', () => {
    const bad = clone(monstersJson) as unknown as { gaur: { carve: [{ item: string }] } };
    bad.gaur.carve[0].item = 'dragonscale';
    expect(() => loadMonsters(bad, MATERIAL_IDS)).toThrow(DataError);
  });

  it('rejects chances above 1', () => {
    const bad = clone(monstersJson) as unknown as { gaur: { rare: Record<string, number> } };
    bad.gaur.rare.core = 25;
    expect(() => loadMonsters(bad, MATERIAL_IDS)).toThrow(/rare\.core/);
  });

  it('requires exactly one starter weapon', () => {
    const bad = clone(weaponsJson) as unknown as { weapons: { fangblade: { recipe: unknown } } };
    bad.weapons.fangblade.recipe = null;
    expect(() => loadWeapons(bad, MATERIAL_IDS, SKILL_IDS)).toThrow(/starter/);
  });

  it('rejects a weapon with an unknown type', () => {
    const bad = clone(weaponsJson) as unknown as { weapons: { bone: { type: string } } };
    bad.weapons.bone.type = 'trident';
    expect(() => loadWeapons(bad, MATERIAL_IDS, SKILL_IDS)).toThrow(/bone\.type/);
  });

  it('rejects a weapon whose signature skill does not exist', () => {
    const bad = clone(weaponsJson) as unknown as { weapons: { bone: { signature: string } } };
    bad.weapons.bone.signature = 'meteor';
    expect(() => loadWeapons(bad, MATERIAL_IDS, SKILL_IDS)).toThrow(/bone\.signature/);
  });

  it('refuses to let AUTO use an i-frame skill for anything but closing distance', () => {
    const bad = clone(skillsJson) as unknown as { skills: { dash: { auto: string } } };
    bad.skills.dash.auto = 'filler';
    expect(() => loadSkills(bad)).toThrow(/dash\.auto/);
  });
});
