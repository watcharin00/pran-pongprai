import type materialsJson from './materials.json';
import type npcsJson from './npcs.json';
import type monstersJson from './monsters.json';
import type weaponsJson from './weapons.json';
import type skillsJson from './skills.json';
import type armorJson from './armor.json';
import type cropsJson from './crops.json';
import type mealsJson from './meals.json';

// Ids are derived from the JSON keys so adding an entry to the JSON extends the union.
export type MaterialId = keyof typeof materialsJson;
export type NpcId = keyof typeof npcsJson;
export type MonsterId = keyof typeof monstersJson;
export type WeaponId = keyof (typeof weaponsJson)['weapons'];
export type WeaponType = keyof (typeof weaponsJson)['types'];
export type CropId = keyof (typeof cropsJson)['crops'];
export type ArmorId = keyof (typeof armorJson)['armor'];
export type PerkId = keyof (typeof armorJson)['perks'];
export const ARMOR_SLOTS = ['head', 'body', 'charm'] as const;
export type ArmorSlot = (typeof ARMOR_SLOTS)[number];
export type MealId = keyof (typeof mealsJson)['meals'];
export type SkillId = keyof (typeof skillsJson)['skills'];
export type PartId = 'head' | 'tail';
export type AreaId = 'home' | 'bamboo' | 'swamp' | 'limestone' | 'deepwild' | 'cave' | 'mangrove' | 'peat' | 'savanna';
export type ZoneId = 'village' | 'forest' | 'bridge' | 'canyon' | 'bamboo' | 'swamp' | 'limestone' | 'deepwild' | 'cave' | 'mangrove' | 'peat' | 'savanna';

export type ItemBag = Partial<Record<MaterialId, number>>;

/** Bestiary medals: hunted without a scratch, every part broken, with half the hunt timer left, a veteran. */
export const MEDALS = ['flawless', 'parts', 'swift', 'veteran'] as const;
export type MedalId = (typeof MEDALS)[number];

/** Procedural icon shape drawn by art/icons.ts; `color` tints it. */
export const ICON_SHAPES = ['pelt', 'fang', 'ore', 'leaf', 'scale', 'horn', 'tail', 'orb', 'root', 'chili', 'seed', 'bulb', 'sack', 'feather', 'meat', 'stalk', 'grain', 'fish', 'egg'] as const;
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
  /**
   * the monster digs in and the circle follows the player for the first part of the telegraph,
   * then it bursts out under it (centred on the player, so `offset` must be 0)
   */
  burrow?: boolean;
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
  /** which area this monster lives in (default home) */
  area: AreaId;
  zone: 'forest' | 'canyon';
  /** only spawn this far (px) or more from the village centre; keeps bosses off the early route */
  spawnMinVillageDist: number;
  /** only spawn on the far (east) bank of the river */
  spawnEastOfRiver: boolean;
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
  /** weapon type that deals `combat.weakMul` extra damage to this monster */
  weakTo: WeaponType | null;
  attacks: AttackDef[];
}

export interface WeaponTypeDef {
  hitstop: number;
  shake: number;
  /** skill slots 1 and 2, shared by every weapon of this type */
  skills: [SkillId, SkillId];
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
  /** skill slot 3, unique to this weapon */
  signature: SkillId;
  recipe: ItemBag | null;
  /** upgrade to +n costs `per` × n plus ore; the last level also needs `final` */
  upgrade: { per: ItemBag; final: ItemBag };
  /** ranged weapons: basic attacks fire a projectile instead of striking */
  projectile?: ShotDef;
  /** alternative art for the same weapon type */
  look?: 'crossbow';
}

export interface ShotDef {
  speed: number;
  /** max travel distance in px */
  range: number;
  /** extra monsters each shot passes through */
  pierce: number;
}

export interface UpgradeRules {
  maxLevel: number;
  /** damage multiplier per level, index 0 = +0 */
  damageMul: number[];
  /** iron ore per level step (× target level) */
  orePerLevel: number;
  /** the level that also needs the weapon's `final` rare material */
  finalLevel: number;
  /** endgame levels past `finalLevel` also need hunter seals: this many × (level − finalLevel) */
  sealsPerLevel: number;
}

export interface WeaponsData {
  upgrade: UpgradeRules;
  types: Record<WeaponType, WeaponTypeDef>;
  weapons: Record<WeaponId, WeaponDef>;
}

/**
 * How AUTO may use a skill. AUTO never uses a skill to dodge:
 * - burst: in reach, only while the target is not winding up
 * - filler: in reach, whenever ready
 * - gapClose: when the target is just out of reach (auto.dashMin..dashMax)
 * - never: AUTO leaves it to the player
 */
export type SkillAutoRole = 'burst' | 'filler' | 'gapClose' | 'never';

interface SkillBase {
  auto: SkillAutoRole;
  cooldown: number;
  /** × weapon damage */
  multiplier: number;
  /** extra stun added on every hit */
  stun: number;
  /** × weapon part multiplier */
  partMul: number;
  hitstop: number;
  shake: number;
}

/** Instant hit on every monster within radius + monster size. */
export interface RadialSkillDef extends SkillBase {
  kind: 'radial';
  radius: number;
  /** spin animation length */
  duration: number;
}

/** Lunge along the stick / target / facing with i-frames; hits each monster once. */
export interface DashSkillDef extends SkillBase {
  kind: 'dash';
  speed: number;
  duration: number;
  iframe: number;
  /** hits monsters within hitRadius + size * hitRadiusSizeMul */
  hitRadius: number;
  hitRadiusSizeMul: number;
}

/** Wind-up, then an area hit between the player and the target. A roll or a hit cancels it. */
export interface WindupAreaSkillDef extends SkillBase {
  kind: 'windupArea';
  radius: number;
  windup: number;
  fxRadius: number;
}

/** Wind-up, then a strike along the aim direction. `hits` > 1 repeats it every `interval`. */
export interface WindupLineSkillDef extends SkillBase {
  kind: 'windupLine';
  windup: number;
  length: number;
  width: number;
  hits: number;
  interval: number;
}

/** Fires `count` projectiles fanned across `spread` degrees toward the target / stick / facing. */
export interface ProjectileSkillDef extends SkillBase {
  kind: 'projectile';
  count: number;
  spread: number;
  speed: number;
  range: number;
  /** extra monsters each shot passes through */
  pierce: number;
}

export type SkillDef = RadialSkillDef | DashSkillDef | WindupAreaSkillDef | WindupLineSkillDef | ProjectileSkillDef;
export type SkillKind = SkillDef['kind'];
export type SkillsData = Record<SkillId, SkillDef>;

export interface ArmorDef {
  slot: ArmorSlot;
  /** damage reduction = defense / (defense + combat.defenseK) */
  defense: number;
  maxHp: number;
  /** added to max stamina */
  stamina: number;
  color: string;
  /** set bonus: active while the head and body pieces of the same set are both worn */
  set: PerkId | null;
  /** bonus this piece gives on its own */
  perk: PerkId | null;
  recipe: ItemBag;
}

/** Gear bonuses from armor sets / single pieces. Missing fields mean "no effect". */
export interface ArmorPerk {
  /** multiplies stamina regeneration */
  staminaRegenMul?: number;
  /** getting hit does not push the player back */
  noKnockback?: boolean;
  /** multiplies damage taken from monster dash (charging line) attacks */
  dashDamageMul?: number;
  /** attack multiplier while HP is below half */
  lowHpAttackMul?: number;
  /** multiplies damage of hits that land on the tail */
  tailDamageMul?: number;
  /** getting hit no longer cancels a skill wind-up */
  castSuperArmor?: boolean;
  /** multiplies stun build-up */
  stunMul?: number;
  /** multiplies damage dealt to breakable parts */
  partDamageMul?: number;
  /** seconds added to the roll's i-frames */
  rollIframeBonus?: number;
  /** added to the roll's stamina cost (negative = cheaper) */
  dodgeCostDelta?: number;
  /** multiplies walking speed */
  walkSpeedMul?: number;
}

export interface CropDef {
  seed: MaterialId;
  growSeconds: number;
  yield: { item: MaterialId; min: number; max: number };
  /** chance to get one seed back on harvest */
  seedBack: number;
  color: string;
  /** where it grows: farm soil (default), the rice paddy, or the fish pond */
  bed: CropBed;
}

export type CropBed = 'soil' | 'paddy' | 'pond';

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
  /** added to armor defense */
  defense?: number;
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
    roll: { duration: number; speed: number; iframe: number; cooldown: number; staminaCost: number; buffer: number };
    hurt: { iframe: number; flash: number; knockback: number };
    /** autoOptions: HP shares the auto-drink setting can take (0 = off); autoDefault is the starting choice */
    potion: { heal: number; herbCost: number; startCount: number; cooldown: number; autoOptions: number[]; autoDefault: number };
    villageRegen: number;
    knockoutTime: number;
    startInventory: ItemBag;
  };
  combat: {
    attackHoldRange: number;
    /** armor: reduction = defense / (defense + defenseK) */
    defenseK: number;
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
    /** every monster telegraph lasts this many times its JSON value (global dodge-difficulty knob) */
    telegraphMul: number;
    monsterAggroAtkDelay: number;
    monsterSpawnMinPlayerDist: number;
    monsterSpawnMinSpacing: number;
    /** damage multiplier against a monster's `weakTo` weapon type */
    weakMul: number;
  };
  auto: {
    searchRange: number;
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
  /** hunter camps in the wild areas (which areas have one: `camp` in core/areas.ts SPECS) */
  camp: {
    /** tiles in from the map edge along the road back home */
    inset: number;
    /** tiles to the side of that road */
    side: number;
    /** px around the camp centre where monsters give up and HP regenerates */
    safeRadius: number;
    /** px from the campfire for the brew button */
    fireRadius: number;
  };
  /** chicken coop in the village (core/ranch.ts); times are real seconds */
  ranch: {
    maxHens: number;
    /** a jungle-fowl egg in the nest hatches after this long */
    hatchSec: number;
    /** a chick grows into a laying hen after this long */
    growSec: number;
    /** a fed hen lays one egg per this long */
    laySec: number;
    /** crops (harvest items) that fill the trough, and how many feed portions each gives */
    feed: string[];
    feedPerItem: number;
    troughMax: number;
    /** eggs and feathers waiting in the nest basket stop piling up here */
    basketMax: number;
    maxLove: number;
    /** petting raises love at most once per hen per this long */
    petCooldownSec: number;
    /** chance per heart that a laid egg comes with a second one */
    doubleEggPerLove: number;
    /** from this love up, a lay may also leave a feather */
    featherLove: number;
    featherChance: number;
    hatchRadius: number;
    feedRadius: number;
    petRadius: number;
    collectRadius: number;
    henSpeed: number;
  };
  village: {
    contextMonsterClear: number;
    stationRadius: number;
    plotRadius: number;
    farmRadius: number;
    harvestRadius: number;
    /** pond slots are water: reach them from the bank within this many px */
    pondReach: number;
    /** paddy plots are 2x2-tile sections: wading anywhere in one reaches it */
    paddyReach: number;
    /** close enough for the context button to talk to an NPC */
    npcTalkRadius: number;
    /** close enough for an NPC's speech bubble to show */
    npcBubbleRadius: number;
    npcSpeed: number;
    npcPauseMin: number;
    npcPauseMax: number;
  };
  input: { joystickRadius: number; joystickDeadzone: number; joystickArea: number };
  /** endgame: tougher "veteran" variants that spawn once the last weapon goal is reached */
  veteran: {
    unlockGoal: number;
    /** chance each spawn is a veteran */
    chance: number;
    hpMul: number;
    partHpMul: number;
    damageMul: number;
    speedMul: number;
    /** telegraphs count down this much faster */
    telegraphRate: number;
    /** carcass amounts multiplier; the rare drop is guaranteed */
    carveMul: number;
    /** hunter seals per veteran */
    seals: number;
  };
  /**
   * post-game "alpha" (pack leader): a veteran made tougher again once the last area's weapon is
   * forged. Multipliers stack on top of the veteran ones.
   */
  alpha: {
    unlockGoal: number;
    /** chance each spawn is an alpha (rolled before the veteran roll) */
    chance: number;
    hpMul: number;
    partHpMul: number;
    damageMul: number;
    speedMul: number;
    telegraphRate: number;
    carveMul: number;
    /** extra hunter seals on top of the veteran ones */
    seals: number;
  };
  medals: {
    /** "swift" medal: killed with at least this share of the hunt timer left */
    swiftHuntLeft: number;
  };
  save: { key: string; legacyKey: string; intervalSeconds: number };
  world: { seed: number; tile: number; width: number; height: number };
}

/** What an NPC does when the player talks to them. */
export type NpcRole = 'forge' | 'kitchen' | 'requests' | 'tips' | 'herbs' | 'farm' | 'hunter' | 'ranger';

export interface NpcDef {
  /** home tile (stands / wanders around its centre) */
  tile: [number, number];
  /** wander radius in px (0 = stands still) */
  wander: number;
  role: NpcRole;
  /** where this villager lives: the home map, or 'wild' = every area except home (placed near the way in) */
  area: 'home' | 'wild';
}

/** A hunt request from the village elder. Progress counts only while it is the current request. */
export type RequestGoal =
  | { type: 'kill'; monster: MonsterId; count: number }
  /** kill without the monster ever landing a hit on the player */
  | { type: 'flawless'; monster: MonsterId; count: number }
  | { type: 'break'; monster: MonsterId; part: PartId; count: number }
  /** gather from nodes or harvest from the farm */
  | { type: 'collect'; item: MaterialId; count: number }
  /** hunt veterans (endgame); any kind when `monster` is left out */
  | { type: 'veteran'; monster?: MonsterId; count: number }
  /** hunt alphas (post-game); any kind when `monster` is left out */
  | { type: 'alpha'; monster?: MonsterId; count: number }
  /** kill with at least `medals.swiftHuntLeft` of the hunt timer left */
  | { type: 'swift'; monster: MonsterId; count: number };

export interface RequestDef {
  id: string;
  /** shown once goalIndex (weapon progress) reaches this */
  unlockGoal: number;
  goal: RequestGoal;
  reward: { items: ItemBag; potions?: number };
}
