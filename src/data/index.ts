// Single entry point for game content. Everything is validated once at import
// time so a typo in a JSON file fails loudly at boot (and in `npm run test`).
import materialsJson from './materials.json';
import monstersJson from './monsters.json';
import weaponsJson from './weapons.json';
import skillsJson from './skills.json';
import cropsJson from './crops.json';
import mealsJson from './meals.json';
import tuningJson from './tuning.json';
import { DataError, loadCrops, loadMaterials, loadMonsters, loadSkills, loadWeapons } from './validate';
import type { MaterialId, MealsData, MonsterDef, MonsterId, SkillId, Tuning } from './types';

export type * from './types';

export const MATERIALS = loadMaterials(materialsJson);
export const MATERIAL_IDS = Object.keys(MATERIALS) as MaterialId[];

export const MONSTERS = loadMonsters(monstersJson, MATERIAL_IDS) as Record<MonsterId, MonsterDef>;
export const MONSTER_IDS = Object.keys(MONSTERS) as MonsterId[];

export const SKILLS = loadSkills(skillsJson);
export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];

export const WEAPONS_DATA = loadWeapons(weaponsJson, MATERIAL_IDS, SKILL_IDS);
export const WEAPONS = WEAPONS_DATA.weapons;
export const WEAPON_TYPES = WEAPONS_DATA.types;

export const CROPS_DATA = loadCrops(cropsJson, MATERIAL_IDS);
export const CROPS = CROPS_DATA.crops;

// meals.json and tuning.json contain no string unions, so the compiler can check them directly.
export const MEALS_DATA: MealsData = mealsJson satisfies MealsData;
export const MEALS = MEALS_DATA.meals;
export const TUNING: Tuning = tuningJson satisfies Tuning;

// Non-fresh JSON objects skip excess-property checks, so item keys are verified here.
for (const [id, meal] of Object.entries(MEALS)) {
  for (const k of Object.keys(meal.recipe)) {
    if (!(k in MATERIALS)) throw new DataError(`meals.meals.${id}.recipe.${k}`, 'unknown material');
  }
}
for (const k of Object.keys(TUNING.player.startInventory)) {
  if (!(k in MATERIALS)) throw new DataError(`tuning.player.startInventory.${k}`, 'unknown material');
}
