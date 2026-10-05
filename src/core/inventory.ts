// Materials, crafting, potions and meals.
import { MATERIAL_IDS, MEALS, MEALS_DATA, TUNING, WEAPONS } from '../data';
import type { ItemBag, MealEffect, MealId, WeaponId } from '../data/types';
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

export function maxHpFor(s: GameState): number {
  return TUNING.player.maxHp + (mealEffect(s).maxHpBonus ?? 0);
}

// ----- village actions (all require being in the village) -----

export type ActionResult = { ok: true } | { ok: false; reason: 'notInVillage' | 'cannotAfford' | 'alreadyOwned' | 'notOwned' | 'alreadyActive' };

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
  if (!s.owned.has('fangblade') && !s.owned.has('mossmaul')) return 0;
  if (!s.owned.has('cleaver')) return 1;
  if (!s.owned.has('coreblade')) return 2;
  return 3;
}
