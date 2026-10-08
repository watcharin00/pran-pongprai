// Where an item comes from and what it is used for, derived from the content
// JSON so new monsters/recipes show up in the bag without extra wiring.
import { ARMOR, CROPS, MATERIALS, MEALS, MONSTERS, MONSTER_IDS, REQUESTS, TUNING, WEAPONS, WEAPONS_DATA } from '../data';
import * as th from '../i18n/th';
import type { AreaId, ArmorId, CropId, ItemBag, MaterialId, MealId, MonsterId, PartId, WeaponId } from '../data/types';
import { FEED_ITEMS } from '../core/ranch';

export type ItemSource =
  | { kind: 'part'; monster: MonsterId; part: PartId }
  | { kind: 'carve'; monster: MonsterId }
  | { kind: 'bonus'; monster: MonsterId; chance: number }
  | { kind: 'rare'; monster: MonsterId; chance: number }
  | { kind: 'crop'; crop: CropId }
  | { kind: 'gather'; node: 'herb' | 'ore'; chance: number }
  /** any veteran (endgame) */
  | { kind: 'veteran' }
  /** reward from an elder's hunt request */
  | { kind: 'request' }
  /** laid by hens in the village coop (feathers only from much-loved hens) */
  | { kind: 'coop'; feather: boolean };

export type ItemUse =
  | { kind: 'weapon'; weapon: WeaponId }
  | { kind: 'armor'; armor: ArmorId }
  | { kind: 'upgrade'; weapon: WeaponId }
  /** hunter seals: every weapon's endgame levels */
  | { kind: 'masterUpgrade'; from: number; to: number }
  | { kind: 'meal'; meal: MealId }
  | { kind: 'potion' }
  | { kind: 'hatch' }
  | { kind: 'feed' }
  | { kind: 'plant'; crop: CropId }
  | { kind: 'fertilizer' };

/** Gather nodes yield the material of the same name (see core/player.ts). */
const NODE_ITEMS: Readonly<Record<'herb' | 'ore', MaterialId>> = { herb: 'herb', ore: 'ore' };

export function itemSources(id: MaterialId): ItemSource[] {
  const out: ItemSource[] = [];
  for (const monster of MONSTER_IDS) {
    const def = MONSTERS[monster];
    for (const [part, pd] of Object.entries(def.parts) as [PartId, NonNullable<(typeof def.parts)[PartId]>][]) {
      if ((pd.drop[id] ?? 0) > 0) out.push({ kind: 'part', monster, part });
    }
    if (def.carve.some((c) => c.item === id && c.max > 0)) out.push({ kind: 'carve', monster });
    const bonus = def.bonus[id];
    if (bonus) out.push({ kind: 'bonus', monster, chance: bonus });
    const rare = def.rare[id];
    if (rare) out.push({ kind: 'rare', monster, chance: rare });
  }
  for (const crop of Object.keys(CROPS) as CropId[]) if (CROPS[crop].yield.item === id) out.push({ kind: 'crop', crop });
  for (const node of ['herb', 'ore'] as const) if (NODE_ITEMS[node] === id) out.push({ kind: 'gather', node, chance: 1 });
  if (id === 'seed_herb') out.push({ kind: 'gather', node: 'herb', chance: TUNING.gather.herbSeedChance });
  if (id === 'seal' && TUNING.veteran.seals > 0) out.push({ kind: 'veteran' });
  if (id === 'egg') out.push({ kind: 'coop', feather: false });
  if (id === 'feather') out.push({ kind: 'coop', feather: true });
  // request rewards only count for items nothing else gives (ore etc. would just add noise)
  if (out.length === 0 || id === 'seal') if (REQUESTS.some((r) => (r.reward.items[id] ?? 0) > 0)) out.push({ kind: 'request' });
  return out;
}

export function itemUses(id: MaterialId): ItemUse[] {
  const out: ItemUse[] = [];
  for (const weapon of Object.keys(WEAPONS) as WeaponId[]) if ((WEAPONS[weapon].recipe?.[id] ?? 0) > 0) out.push({ kind: 'weapon', weapon });
  for (const armor of Object.keys(ARMOR) as ArmorId[]) if ((ARMOR[armor].recipe[id] ?? 0) > 0) out.push({ kind: 'armor', armor });
  for (const weapon of Object.keys(WEAPONS) as WeaponId[]) {
    const { per, final } = WEAPONS[weapon].upgrade;
    if ((per[id] ?? 0) > 0 || (final[id] ?? 0) > 0) out.push({ kind: 'upgrade', weapon });
  }
  const UP = WEAPONS_DATA.upgrade;
  if (id === 'seal' && UP.sealsPerLevel > 0 && UP.maxLevel > UP.finalLevel) out.push({ kind: 'masterUpgrade', from: UP.finalLevel + 1, to: UP.maxLevel });
  for (const meal of Object.keys(MEALS) as MealId[]) if ((MEALS[meal].recipe[id] ?? 0) > 0) out.push({ kind: 'meal', meal });
  if (id === 'herb') out.push({ kind: 'potion' });
  if (id === 'jfegg') out.push({ kind: 'hatch' });
  if (FEED_ITEMS.includes(id)) out.push({ kind: 'feed' });
  for (const crop of Object.keys(CROPS) as CropId[]) if (CROPS[crop].seed === id) out.push({ kind: 'plant', crop });
  if (id === 'fert') out.push({ kind: 'fertilizer' });
  return out;
}

/** Where a monster lives, for the bestiary ("พบที่ ..."). */
export function monsterWhere(k: MonsterId): string {
  const def = MONSTERS[k];
  if (def.area !== 'home') return th.areas[def.area];
  if (def.spawnEastOfRiver) return th.menu.book.eastBank;
  return th.zones[def.zone];
}

/** How far into the world each area is, for gear tiers (a compile error here when an area is added). */
const AREA_RANK: Readonly<Record<AreaId, number>> = { home: 0, bamboo: 1, swamp: 1, limestone: 2, deepwild: 2, cave: 3, mangrove: 3, peat: 4, savanna: 4 };
/** Monster HP bands: the tiger, bear and boss tiers stand out even inside early areas. */
const hpBand = (hp: number): number => (hp <= 600 ? 0 : hp <= 3600 ? 1 : hp <= 8000 ? 2 : hp <= 13000 ? 3 : 4);

/**
 * Display tier 0..4 (common → legendary) of a craftable piece, derived from data: each material
 * counts as its easiest source (area depth or monster toughness, whichever is higher), the
 * hardest material sets the tier, and a rare (rarity 2) material lifts it one more step.
 */
export function gearTier(recipe: ItemBag | null): number {
  if (!recipe) return 0;
  let tier = 0;
  let rare = false;
  for (const [k, n] of Object.entries(recipe)) {
    if (!n) continue;
    const id = k as MaterialId;
    if ((MATERIALS[id].rarity ?? 0) >= 2) rare = true;
    let easiest = Infinity;
    for (const src of itemSources(id)) {
      if (!('monster' in src)) continue;
      const def = MONSTERS[src.monster];
      easiest = Math.min(easiest, Math.max(AREA_RANK[def.area] ?? 0, hpBand(def.hp)));
    }
    if (Number.isFinite(easiest)) tier = Math.max(tier, easiest);
  }
  return Math.min(4, tier + (rare ? 1 : 0));
}

