import type materialsJson from './materials.json';
import type monstersJson from './monsters.json';
import type weaponsJson from './weapons.json';
import type cropsJson from './crops.json';
import type mealsJson from './meals.json';

// Ids are derived from the JSON keys so adding an entry to the JSON extends the union.
export type MaterialId = keyof typeof materialsJson;
export type MonsterId = keyof typeof monstersJson;
export type WeaponId = keyof (typeof weaponsJson)['weapons'];
export type WeaponType = keyof (typeof weaponsJson)['types'];
export type CropId = keyof (typeof cropsJson)['crops'];
export type MealId = keyof (typeof mealsJson)['meals'];
export type SkillId = 'whirl' | 'dash' | 'slam';
export type PartId = 'head' | 'tail';
export type ZoneId = 'village' | 'forest' | 'bridge' | 'canyon';

export type ItemBag = Partial<Record<MaterialId, number>>;

/** Procedural icon shape drawn by art/icons.ts; `color` tints it. */
export const ICON_SHAPES = ['pelt', 'fang', 'ore', 'leaf', 'scale', 'horn', 'tail', 'orb', 'root', 'chili', 'seed', 'bulb', 'sack'] as const;
export type IconShape = (typeof ICON_SHAPES)[number];

export interface MaterialDef {
  color: string;
  category: 'material' | 'seed';
  icon: IconShape;
  /** 1 = rare, 2 = very rare */
  rarity?: 1 | 2;
}

export interface CircleAttackDef {
  id: string;
  shape: 'circle';
  radius: number;
  /** distance of the circle centre from the monster, along its facing */
  offset: number;
  telegraph: number;
  damage: number;
  range: number;
  minRange?: number;
  weight: number;
}

export interface LineAttackDef {
  id: string;
  shape: 'line';
  length: number;
  width: number;
  telegraph: number;
  damage: number;
  range: number;
  minRange?: number;
  /** the monster travels along the line instead of striking in place */
  dash: boolean;
  weight: number;
}

export type AttackDef = CircleAttackDef | LineAttackDef;

export interface RageDef {
  /** enrage when hp / maxHp drops below this */
  below: number;
  speedMul: number;
  /** telegraph timer runs this many times faster */
  telegraphRate: number;
  damageMul: number;
}

export interface PartDef {
  hp: number;
  drop: ItemBag;
  /** sprite-space offset (x along facing, y) used for hit numbers and effects */
  offset: [number, number];
}

export interface CarveDef {
  item: MaterialId;
  min: number;
  max: number;
}

export interface MonsterDef {
  hp: number;
  speed: number;
  size: number;
  aggroRadius: number;
  zone: 'forest' | 'canyon';
  huntTime: number;
  turnTime: number;
  recover: number;
  respawn: number;
  count: number;
  rage: RageDef | null;
  parts: Partial<Record<PartId, PartDef>>;
  carve: CarveDef[];
  /** extra item with a chance, e.g. seeds */
  bonus: Partial<Record<MaterialId, number>>;
  /** rare drop with a chance; announced to the player */
  rare: Partial<Record<MaterialId, number>>;
  attacks: AttackDef[];
}

export interface WeaponTypeDef {
  hitstop: number;
  shake: number;
}

export interface WeaponDef {
  type: WeaponType;
  damage: number;
  /** seconds between basic attacks */
  rate: number;
  range: number;
  partMul: Record<PartId, number>;
  stun: number;
  color: string;
  recipe: ItemBag | null;
}

export interface WeaponsData {
  types: Record<WeaponType, WeaponTypeDef>;
  weapons: Record<WeaponId, WeaponDef>;
}

export interface WhirlDef {
  cooldown: number;
  multiplier: number;
  /** hits monsters within radius + monster size */
  radius: number;
  duration: number;
  hitstop: number;
  shake: number;
}

export interface DashDef {
  cooldown: number;
  multiplier: number;
  speed: number;
  duration: number;
  iframe: number;
  /** hits monsters within hitRadius + size * hitRadiusSizeMul, once each */
  hitRadius: number;
  hitRadiusSizeMul: number;
  hitstop: number;
}

export interface SlamDef {
  cooldown: number;
  multiplier: number;
  radius: number;
  windup: number;
  stun: number;
  partMul: number;
  hitstop: number;
  shake: number;
}

export interface SkillsData {
  order: [SkillId, SkillId, SkillId];
  whirl: WhirlDef;
  dash: DashDef;
  slam: SlamDef;
}

export interface CropDef {
  seed: MaterialId;
  growSeconds: number;
  yield: { item: MaterialId; min: number; max: number };
  /** chance to get one seed back on harvest */
  seedBack: number;
  color: string;
}

export interface CropsData {
  /** grow time multiplier when fertilised */
  fertilizerTimeMul: number;
  crops: Record<CropId, CropDef>;
}

export interface MealEffect {
  maxHpBonus?: number;
  attackMul?: number;
  staminaRegenMul?: number;
  dodgeCost?: number;
}

export interface MealDef {
  recipe: ItemBag;
  color: string;
  effect: MealEffect;
}

export interface MealsData {
  durationSeconds: number;
  meals: Record<MealId, MealDef>;
}

export interface Tuning {
  player: {
    maxHp: number;
    maxStamina: number;
    staminaRegen: number;
    staminaDelay: number;
    walkSpeed: number;
    radius: number;
    roll: { duration: number; speed: number; iframe: number; cooldown: number; staminaCost: number };
    hurt: { iframe: number; flash: number; knockback: number };
    potion: { heal: number; herbCost: number; startCount: number; cooldown: number };
    villageRegen: number;
    knockoutTime: number;
    startInventory: ItemBag;
  };
  combat: {
    attackHoldRange: number;
    lockKeepRange: number;
    approachDirectRange: number;
    damageJitter: { min: number; max: number };
    stunThreshold: number;
    stunDuration: number;
    partTipCooldown: number;
    goldPartMul: number;
    partBreakHitstop: number;
    killHitstop: number;
    monsterLeashVillage: number;
    monsterLeashFar: number;
    monsterLeashFarDistance: number;
    monsterVillageChaseDistance: number;
    monsterWanderSpeedMul: number;
    monsterWanderRadius: number;
    monsterDashSpeed: number;
    monsterAggroAtkDelay: number;
    monsterSpawnMinPlayerDist: number;
    monsterSpawnMinSpacing: number;
  };
  auto: {
    searchRange: number;
    potionBelow: number;
    dashMin: number;
    dashMax: number;
    gatherRange: number;
    huntRange: number;
    manualOverride: number;
    repathInterval: number;
  };
  gather: {
    holdTime: number;
    pickupRadius: number;
    regen: number;
    amountMin: number;
    amountMax: number;
    herbSeedChance: number;
    nodeSeed: number;
    nodes: { forestHerb: number; forestOre: number; canyonOre: number };
  };
  village: {
    contextMonsterClear: number;
    stationRadius: number;
    plotRadius: number;
    farmRadius: number;
    harvestRadius: number;
  };
  input: { joystickRadius: number; joystickDeadzone: number; joystickArea: number };
  save: { key: string; legacyKey: string; intervalSeconds: number };
  world: { seed: number; tile: number; width: number; height: number };
}
