// Materials, crafting, potions and meals.
import { ARMOR, MATERIAL_IDS, MEALS, MEALS_DATA, TUNING, WEAPONS, WEAPONS_DATA } from '../data';
import { ARMOR_SLOTS, type ArmorId, type ItemBag, type MealEffect, type MealId, type WeaponId } from '../data/types';
import type { GameState, Inventory } from './state';

export function startingInventory(): Inventory {
  const inv = Object.fromEntries(MATERIAL_IDS.map((k) => [k, 0])) as Inventory;
  for (const [k, n] of Object.entries(TUNING.player.startInventory)) inv[k as keyof Inventory] = n ?? 0;
  return inv;
}

export function give(s: GameState, bag: ItemBag): void {
  for (const [k, n] of Object.entries(bag)) if (n && n > 0) s.inv[k as keyof Inventory] += n;
}

export function canAfford(inv: Inventory, recipe: ItemBag): boolean {
  return Object.entries(recipe).every(([k, n]) => inv[k as keyof Inventory] >= (n ?? 0));
}

function spend(inv: Inventory, recipe: ItemBag): void {
  for (const [k, n] of Object.entries(recipe)) inv[k as keyof Inventory] -= n ?? 0;
}

// ----- meals -----

export function activeMeal(s: GameState): MealId | null {
  const m = s.player.meal;
  return m && m.until > s.now ? m.id : null;
}

export function mealEffect(s: GameState): MealEffect {
  const id = activeMeal(s);
  return id ? MEALS[id].effect : {};
}

export function attackMul(s: GameState): number {
  return mealEffect(s).attackMul ?? 1;
}

export function dodgeCost(s: GameState): number {
  return mealEffect(s).dodgeCost ?? TUNING.player.roll.staminaCost;
}

export function staminaRegenMul(s: GameState): number {
  return mealEffect(s).staminaRegenMul ?? 1;
}

// ----- armor -----

/** Sum of a stat over the equipped armor pieces. */
function armorSum(s: GameState, stat: 'defense' | 'maxHp' | 'stamina'): number {
  let n = 0;
  for (const slot of ARMOR_SLOTS) {
    const id = s.armor[slot];
    if (id) n += ARMOR[id][stat];
  }
  return n;
}

export function defenseOf(s: GameState): number {
  return armorSum(s, 'defense') + (mealEffect(s).defense ?? 0);
}

/** Fraction of incoming damage removed by armor (0..1). */
export function damageReduction(s: GameState): number {
  const d = defenseOf(s);
  return d / (d + TUNING.combat.defenseK);
}

export function maxHpFor(s: GameState): number {
  return TUNING.player.maxHp + (mealEffect(s).maxHpBonus ?? 0) + armorSum(s, 'maxHp');
}

export function maxStaminaFor(s: GameState): number {
  return TUNING.player.maxStamina + armorSum(s, 'stamina');
}

/** Re-applies max HP / stamina after gear or meals change, keeping current values in range. */
export function refreshStats(s: GameState): void {
  const p = s.player;
  p.maxHp = maxHpFor(s);
  p.maxSt = maxStaminaFor(s);
  p.hp = Math.min(p.hp, p.maxHp);
  p.st = Math.min(p.st, p.maxSt);
}

// ----- village actions (all require being in the village) -----

export type ActionResult = { ok: true } | { ok: false; reason: 'notInVillage' | 'cannotAfford' | 'alreadyOwned' | 'notOwned' | 'alreadyActive' | 'maxLevel' };

// ----- weapon upgrades -----

const UP = WEAPONS_DATA.upgrade;

export function weaponLevel(s: GameState, id: WeaponId): number {
  return s.weaponLevels[id] ?? 0;
}

/** Base damage of a weapon at its current upgrade level (before meals and skill multipliers). */
export function weaponPower(s: GameState, id: WeaponId): number {
  return WEAPONS[id].damage * (UP.damageMul[weaponLevel(s, id)] ?? 1);
}

/** Materials to go from the current level to the next, or null at max level. */
export function upgradeCost(s: GameState, id: WeaponId): ItemBag | null {
  const next = weaponLevel(s, id) + 1;
  if (next > UP.maxLevel) return null;
  const { per, final } = WEAPONS[id].upgrade;
  const cost: ItemBag = {};
  for (const [k, n] of Object.entries(per)) cost[k as keyof Inventory] = (n ?? 0) * next;
  if (UP.orePerLevel > 0) cost.ore = (cost.ore ?? 0) + UP.orePerLevel * next;
  if (next === UP.maxLevel) for (const [k, n] of Object.entries(final)) cost[k as keyof Inventory] = (cost[k as keyof Inventory] ?? 0) + (n ?? 0);
  return cost;
}

export function upgradeWeapon(s: GameState, id: WeaponId): ActionResult {
  if (!s.player.inVillage) return { ok: false, reason: 'notInVillage' };
  if (!s.owned.has(id)) return { ok: false, reason: 'notOwned' };
  const cost = upgradeCost(s, id);
  if (!cost) return { ok: false, reason: 'maxLevel' };
  if (!canAfford(s.inv, cost)) return { ok: false, reason: 'cannotAfford' };
  spend(s.inv, cost);
  s.weaponLevels[id] = weaponLevel(s, id) + 1;
  return { ok: true };
}

export function craftWeapon(s: GameState, id: WeaponId): ActionResult {
  if (!s.player.inVillage) return { ok: false, reason: 'notInVillage' };
  if (s.owned.has(id)) return { ok: false, reason: 'alreadyOwned' };
  const recipe = WEAPONS[id].recipe;
  if (!recipe || !canAfford(s.inv, recipe)) return { ok: false, reason: 'cannotAfford' };
  spend(s.inv, recipe);
  s.owned.add(id);
  setWeapon(s, id);
  return { ok: true };
}

export function equipWeapon(s: GameState, id: WeaponId): ActionResult {
  if (!s.player.inVillage) return { ok: false, reason: 'notInVillage' };
  if (!s.owned.has(id)) return { ok: false, reason: 'notOwned' };
  setWeapon(s, id);
  return { ok: true };
}

/** Switching weapons swaps the skill set, so cooldowns and any skill in progress reset. */
function setWeapon(s: GameState, id: WeaponId): void {
  const p = s.player;
  if (p.weapon === id) return;
  p.weapon = id;
  p.cds = [0, 0, 0];
  p.cast = null;
  p.dash = null;
}

export function craftArmor(s: GameState, id: ArmorId): ActionResult {
  if (!s.player.inVillage) return { ok: false, reason: 'notInVillage' };
  if (s.ownedArmor.has(id)) return { ok: false, reason: 'alreadyOwned' };
  const recipe = ARMOR[id].recipe;
  if (!canAfford(s.inv, recipe)) return { ok: false, reason: 'cannotAfford' };
  spend(s.inv, recipe);
  s.ownedArmor.add(id);
  s.armor[ARMOR[id].slot] = id;
  refreshStats(s);
  return { ok: true };
}

/** Puts an owned piece on (replacing whatever is in its slot). */
export function equipArmor(s: GameState, id: ArmorId): ActionResult {
  if (!s.player.inVillage) return { ok: false, reason: 'notInVillage' };
  if (!s.ownedArmor.has(id)) return { ok: false, reason: 'notOwned' };
  s.armor[ARMOR[id].slot] = id;
  refreshStats(s);
  return { ok: true };
}

export function unequipArmor(s: GameState, id: ArmorId): ActionResult {
  if (!s.player.inVillage) return { ok: false, reason: 'notInVillage' };
  const slot = ARMOR[id].slot;
  if (s.armor[slot] !== id) return { ok: false, reason: 'notOwned' };
  s.armor[slot] = null;
  refreshStats(s);
  return { ok: true };
}

export function brewPotion(s: GameState): ActionResult {
  if (!s.player.inVillage) return { ok: false, reason: 'notInVillage' };
  const recipe = { herb: TUNING.player.potion.herbCost };
  if (!canAfford(s.inv, recipe)) return { ok: false, reason: 'cannotAfford' };
  spend(s.inv, recipe);
  s.player.potions++;
  return { ok: true };
}

export function cookMeal(s: GameState, id: MealId): ActionResult {
  if (!s.player.inVillage) return { ok: false, reason: 'notInVillage' };
  if (activeMeal(s) === id) return { ok: false, reason: 'alreadyActive' };
  const meal = MEALS[id];
  if (!canAfford(s.inv, meal.recipe)) return { ok: false, reason: 'cannotAfford' };
  spend(s.inv, meal.recipe);
  s.player.meal = { id, until: s.now + MEALS_DATA.durationSeconds * 1000 };
  const bonus = meal.effect.maxHpBonus ?? 0;
  if (bonus) {
    s.player.maxHp = maxHpFor(s);
    s.player.hp = Math.min(s.player.maxHp, s.player.hp + bonus);
  }
  return { ok: true };
}

/** Index into the goal list (i18n `goals`), driven by weapon progress. */
export function goalIndex(s: GameState): number {
  const has = (...ids: WeaponId[]): boolean => ids.some((id) => s.owned.has(id));
  if (!has('fangblade', 'mossmaul', 'bamboospear', 'bamboobow')) return 0;
  if (!has('cleaver')) return 1;
  if (!has('coreblade')) return 2;
  if (!has('tigerspear', 'stripeblade')) return 3;
  if (!has('cobrafang')) return 4;
  if (!has('crocmaul', 'lizardbow')) return 5;
  if (!has('serowspear', 'bearblade')) return 6;
  if (!has('kingblade', 'kingbow')) return 7;
  return 8;
}
