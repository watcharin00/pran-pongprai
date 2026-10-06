// Where an item comes from and what it is used for, derived from the content
// JSON so new monsters/recipes show up in the bag without extra wiring.
import { ARMOR, CROPS, MEALS, MONSTERS, MONSTER_IDS, REQUESTS, TUNING, WEAPONS } from '../data';
import * as th from '../i18n/th';
import type { ArmorId, CropId, MaterialId, MealId, MonsterId, PartId, WeaponId } from '../data/types';

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
  | { kind: 'request' };

export type ItemUse =
  | { kind: 'weapon'; weapon: WeaponId }
  | { kind: 'armor'; armor: ArmorId }
  | { kind: 'upgrade'; weapon: WeaponId }
  | { kind: 'meal'; meal: MealId }
  | { kind: 'potion' }
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
  for (const meal of Object.keys(MEALS) as MealId[]) if ((MEALS[meal].recipe[id] ?? 0) > 0) out.push({ kind: 'meal', meal });
  if (id === 'herb') out.push({ kind: 'potion' });
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
