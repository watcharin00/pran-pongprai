import { describe, expect, it } from 'vitest';
import { ARMOR_PERKS, MONSTERS, TUNING } from '../src/data';
import type { ArmorId, AttackDef, WeaponId } from '../src/data/types';
import { hitMonster, hurtPlayer, resolveMonsterHit } from '../src/core/combat';
import { activePerks, attackMul, dodgeCost, rollIframe, staminaRegenMul, walkSpeed } from '../src/core/inventory';
import type { GameState } from '../src/core/state';
import { loadArmor, loadArmorPerks } from '../src/data/validate';
import { MATERIAL_IDS } from '../src/data';
import { addMonster, game } from './helpers';

function wear(s: GameState, ...ids: ArmorId[]): GameState {
  for (const id of ids) {
    s.ownedArmor.add(id);
    s.armor[id === 'tigereyecharm' ? 'charm' : id.match(/hood|helm/) ? 'head' : 'body'] = id;
  }
  return s;
}

/** HP a monster loses from one basic hit, with the player standing on the given side (seeded RNG → same jitter). */
function hitLoss(weapon: WeaponId, kind: 'tiger' | 'gaur' | 'elephant', side: 'body' | 'tail' | 'head', ...armor: ArmorId[]): { hp: number; part: number; stun: number } {
  const s = wear(game(), ...armor);
  s.owned.add(weapon);
  s.player.weapon = weapon;
  const m = addMonster(s, kind, 500, 500, 1);
  s.player.x = side === 'body' ? 501 : side === 'head' ? 530 : 470;
  s.player.y = 500;
  const before = { hp: m.hp, part: side === 'body' ? 0 : (m.parts[side]?.hp ?? 0) };
  hitMonster(s, m, 1);
  return { hp: before.hp - m.hp, part: side === 'body' ? 0 : before.part - (m.parts[side]?.hp ?? 0), stun: m.stunMeter };
}

describe('monster weakness', () => {
  it('a weapon of the monster\'s weakTo type deals combat.weakMul more damage', () => {
    expect(MONSTERS.tiger.weakTo).toBe('spear');
    expect(MONSTERS.gaur.weakTo).toBeNull();
    // same spear, same seeded jitter: tiger (weak to spear) vs gaur (no weakness)
    const weak = hitLoss('tigerspear', 'tiger', 'body');
    const plain = hitLoss('tigerspear', 'gaur', 'body');
    expect(weak.hp / plain.hp).toBeCloseTo(TUNING.combat.weakMul, 1);
  });

  it('the first four monsters keep the prototype values (no weakness)', () => {
    for (const k of ['junglefowl', 'dhole', 'boar', 'gaur'] as const) expect(MONSTERS[k].weakTo).toBeNull();
  });
});

describe('armor perks', () => {
  it('a set bonus needs both the head and body piece of that set', () => {
    expect(activePerks(wear(game(), 'tigerhood'))).toEqual([]);
    expect(activePerks(wear(game(), 'tigerhood', 'crocmail'))).toEqual([]);
    expect(activePerks(wear(game(), 'tigerhood', 'tigercoat'))).toEqual(['stalker']);
  });

  it('single-piece perks work on their own and stack with a set', () => {
    expect(activePerks(wear(game(), 'monkeyhood'))).toEqual(['nimble']);
    expect(activePerks(wear(game(), 'monkeyhood', 'snakevest'))).toEqual(['nimble', 'slither']);
  });

  it('stalker (tiger set): tail hits deal 20% more', () => {
    const bare = hitLoss('tigerspear', 'gaur', 'tail');
    const set = hitLoss('tigerspear', 'gaur', 'tail', 'tigerhood', 'tigercoat');
    expect(set.hp / bare.hp).toBeCloseTo(ARMOR_PERKS.stalker.tailDamageMul ?? 0, 1);
    // head hits are unaffected
    expect(hitLoss('tigerspear', 'gaur', 'head', 'tigerhood', 'tigercoat').hp).toBe(hitLoss('tigerspear', 'gaur', 'head').hp);
  });

  it('forestking (elephant set): parts take 20% more, the body does not', () => {
    const bare = hitLoss('stripeblade', 'gaur', 'head');
    const set = hitLoss('stripeblade', 'gaur', 'head', 'elehelm', 'elecoat');
    expect(set.hp).toBe(bare.hp);
    expect(set.part / bare.part).toBeCloseTo(1.2, 1);
  });

  it('bearmight (bear set): stun builds 30% faster', () => {
    const bare = hitLoss('crocmaul', 'gaur', 'head');
    const set = hitLoss('crocmaul', 'gaur', 'head', 'bearhood', 'bearcoat');
    expect(bare.stun).toBeGreaterThan(0);
    expect(set.stun / bare.stun).toBeCloseTo(1.3, 5);
  });

  it('emberheart (gaur set): +15% attack only below half HP', () => {
    const s = wear(game(), 'cinderhelm', 'cindermail');
    s.player.hp = s.player.maxHp;
    expect(attackMul(s)).toBe(1);
    s.player.hp = s.player.maxHp * 0.4;
    expect(attackMul(s)).toBeCloseTo(1.15, 5);
  });

  it('thickhide (boar set): no knockback and 15% less damage from dash attacks', () => {
    const dash: AttackDef = { id: 't', shape: 'line', length: 80, width: 20, telegraph: 1, damage: 40, range: 80, dash: true, weight: 1 };
    const still: AttackDef = { ...dash, dash: false };
    const loss = (a: AttackDef): number => {
      const s = wear(game(), 'boarhelm', 'boarvest');
      s.player.hp = s.player.maxHp;
      const before = { hp: s.player.hp, x: s.player.x, y: s.player.y };
      resolveMonsterHit(s, addMonster(s, 'gaur', s.player.x + 20, s.player.y), a);
      expect([s.player.x, s.player.y]).toEqual([before.x, before.y]);
      return before.hp - s.player.hp;
    };
    expect(loss(dash) / loss(still)).toBeCloseTo(0.85, 1);
  });

  it('scaleguard (croc set): getting hit keeps the skill wind-up', () => {
    const cast = { skill: 'slam' as const, t: 0.2, total: 0.3, tx: 0, ty: 0, ux: 1, uy: 0, hits: 1 };
    const bare = game();
    bare.player.cast = { ...cast };
    hurtPlayer(bare, 10, addMonster(bare, 'gaur', bare.player.x + 20, bare.player.y));
    expect(bare.player.cast).toBeNull();
    const set = wear(game(), 'crochelm', 'crocmail');
    set.player.cast = { ...cast };
    hurtPlayer(set, 10, addMonster(set, 'gaur', set.player.x + 20, set.player.y));
    expect(set.player.cast).not.toBeNull();
  });

  it('movement perks: pack, mastery, nimble, slither', () => {
    const base = game();
    expect(staminaRegenMul(wear(game(), 'mosshood', 'mossvest'))).toBeCloseTo(1.15, 5);
    expect(rollIframe(wear(game(), 'masterhood', 'mastercoat'))).toBeCloseTo(rollIframe(base) + 0.06, 5);
    expect(dodgeCost(wear(game(), 'monkeyhood'))).toBe(dodgeCost(base) - 3);
    expect(walkSpeed(wear(game(), 'snakevest'))).toBeCloseTo(walkSpeed(base) * 1.05, 5);
  });
});

describe('armor perk data', () => {
  const json = (armor: Record<string, unknown>): unknown => ({ perks: { pack: { staminaRegenMul: 1.1 } }, armor });
  const piece = (slot: string, set?: string): Record<string, unknown> => ({ slot, defense: 1, maxHp: 0, stamina: 0, color: '#ffffff', ...(set ? { set } : {}), recipe: { hide: 1 } });

  it('rejects a set without both a head and a body piece', () => {
    const perks = Object.keys(loadArmorPerks(json({})));
    expect(() => loadArmor(json({ a: piece('head', 'pack') }), MATERIAL_IDS, perks)).toThrow(/needs exactly one head and one body/);
    expect(() => loadArmor(json({ a: piece('head', 'pack'), b: piece('body', 'pack') }), MATERIAL_IDS, perks)).not.toThrow();
  });

  it('rejects unknown perks and unknown perk fields', () => {
    expect(() => loadArmor(json({ a: piece('head', 'nope') }), MATERIAL_IDS, ['pack'])).toThrow(/set/);
    expect(() => loadArmorPerks({ perks: { x: { flying: true } } })).toThrow(/unknown perk field/);
  });
});
