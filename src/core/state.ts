// Plain-data game state. Everything the simulation needs lives here so that a
// server could own it and clients could render it.
import type { AreaId, ArmorId, ArmorSlot, AttackDef, CropBed, CropId, MaterialId, MealId, MonsterId, NpcId, PartId, SkillId, WeaponId, ZoneId } from '../data/types';
import type { EventBus, Vec2 } from './events';
import type { WorldMap } from './mapgen';
import type { TilePath } from './pathfinding';
import type { Rng } from './rng';

/**
 * One frame of player input. Touch, keyboard and AUTO all produce this same shape;
 * the simulation never knows where it came from.
 */
export interface Intent {
  /** unit vector, or null when not steering */
  move: Vec2 | null;
  /** attack button held: approach the target and keep swinging */
  attack: boolean;
  /** explicit target for `attack` (AUTO); otherwise the nearest monster in hold range */
  targetId: number | null;
  /** edge-triggered presses */
  skills: [boolean, boolean, boolean];
  dodge: boolean;
  potion: boolean;
  /** player tapped a monster */
  lockId: number | null;
}

export const emptyIntent = (): Intent => ({
  move: null,
  attack: false,
  targetId: null,
  skills: [false, false, false],
  dodge: false,
  potion: false,
  lockId: null,
});

export interface Meal {
  id: MealId;
  /** epoch ms */
  until: number;
}

export interface PlayerState {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  st: number;
  maxSt: number;
  face: 1 | -1;
  /** last movement direction */
  fx: number;
  fy: number;
  weapon: WeaponId;
  potions: number;
  meal: Meal | null;

  path: TilePath;
  repath: number;
  lockId: number | null;
  gatherT: number;
  gatherNode: number | null;

  cds: [number, number, number];
  /** skill wind-up in progress (cancelled by rolling or getting hit) */
  cast: {
    skill: SkillId;
    t: number;
    total: number;
    /** area skills land between the player and (tx, ty) */
    tx: number;
    ty: number;
    /** line skills strike along (ux, uy) */
    ux: number;
    uy: number;
    /** strikes left, including the pending one */
    hits: number;
  } | null;
  /** skill lunge in progress */
  dash: { skill: SkillId; t: number; dx: number; dy: number; hit: Set<number> } | null;
  spin: number;
  atkCd: number;
  swing: number;
  swingAng: number;
  roll: number;
  rdx: number;
  rdy: number;
  /** invulnerable while > 0 (roll, dash) */
  rollIF: number;
  hurtIF: number;
  hurt: number;
  dodgeCd: number;
  /** a roll pressed during the previous roll/cooldown waits this long to fire */
  dodgeBuf: number;
  dodgeBufMove: Vec2 | null;
  stDelay: number;
  potCd: number;
  dead: boolean;
  deadT: number;
  moving: boolean;
  walkT: number;
  inVillage: boolean;
  zone: ZoneId | null;
}

export type Shape =
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'line'; sx: number; sy: number; ux: number; uy: number; len: number; wd: number };

/** Leg animation frames per monster sprite. */
export const MONSTER_FRAME_COUNT = 4;

export type MonsterMode = 'wander' | 'chase' | 'tele' | 'dash' | 'recover' | 'stun';

export interface PartState {
  hp: number;
  broken: boolean;
}

export interface MonsterState {
  id: number;
  kind: MonsterId;
  x: number;
  y: number;
  /** home point for wandering */
  hx: number;
  hy: number;
  hp: number;
  parts: Partial<Record<PartId, PartState>>;
  mode: MonsterMode;
  /** generic countdown for the current mode */
  t: number;
  /** total length of the current telegraph */
  tt: number;
  dirX: 1 | -1;
  /** how long it has wanted to face the other way */
  turnT: number;
  wanderT: number;
  waypoint: Vec2 | null;
  atkCd: number;
  flash: number;
  stunMeter: number;
  stunT: number;
  /** hunt timer; null until the fight starts */
  huntT: number | null;
  aggro: boolean;
  leash: number;
  rage: boolean;
  shape: Shape | null;
  attack: AttackDef | null;
  dashLeft: number;
  dashHit: boolean;
  /** distance walked, drives the leg animation */
  anim: number;
  tipT: number;
  /** this monster has landed a hit on the player (spoils "flawless" requests) */
  hitPlayer: boolean;
}

export interface GatherNode {
  id: number;
  kind: 'herb' | 'ore';
  tx: number;
  ty: number;
  x: number;
  y: number;
  ready: boolean;
  regen: number;
}

export interface Plot {
  tx: number;
  ty: number;
  x: number;
  y: number;
  crop: CropId | null;
  /** epoch ms when planted */
  at: number;
  /** grow duration in ms */
  dur: number;
  fert: boolean;
  /** soil, paddy or pond: which crops it takes */
  bed: CropBed;
}

/** A player projectile in flight (arrow, bolt). */
export interface Shot {
  id: number;
  x: number;
  y: number;
  /** unit direction */
  dx: number;
  dy: number;
  speed: number;
  /** distance left before it drops */
  left: number;
  /** monsters it can still pass through after the next hit */
  pierce: number;
  mult: number;
  stun: number;
  partMul: number;
  big: boolean;
  /** monsters already hit (each shot hits a monster once) */
  hit: Set<number>;
}

/** A villager. Only simulated while the player is in the home area. */
export interface NpcState {
  id: NpcId;
  x: number;
  y: number;
  /** home point (centre of its home tile) */
  hx: number;
  hy: number;
  face: 1 | -1;
  moving: boolean;
  walkT: number;
  /** pause before picking the next stroll target */
  waitT: number;
  waypoint: Vec2 | null;
}

/** Hunt requests: which are done, and progress on the current one. */
export interface RequestState {
  done: Set<string>;
  progress: number;
}

export type Inventory = Record<MaterialId, number>;

export interface GameState {
  /** the area the player is in; swapped by core/travel.ts */
  map: WorldMap;
  area: AreaId;
  /** the home map (village), kept so returning does not rebuild it */
  readonly homeMap: WorldMap;
  readonly rng: Rng;
  readonly events: EventBus;
  /** simulation seconds */
  time: number;
  /** wall clock (epoch ms); crops and meals use real time */
  now: number;
  nextId: number;
  player: PlayerState;
  monsters: MonsterState[];
  shots: Shot[];
  respawnQueue: { kind: MonsterId; t: number }[];
  nodes: GatherNode[];
  plots: Plot[];
  inv: Inventory;
  owned: Set<WeaponId>;
  /** upgrade level per weapon (+0 when missing) */
  weaponLevels: Partial<Record<WeaponId, number>>;
  ownedArmor: Set<ArmorId>;
  /** equipped armor per slot */
  armor: Record<ArmorSlot, ArmorId | null>;
  selCrop: CropId;
  useFert: boolean;
  autoOn: boolean;
  /** successful hunts per monster kind (unlocks bestiary entries) */
  kills: Partial<Record<MonsterId, number>>;
  /** areas the player has been to (shown on the world map) */
  visited: Set<AreaId>;
  npcs: NpcState[];
  /** separate stream so villagers strolling never shifts combat randomness */
  readonly npcRng: Rng;
  requests: RequestState;
}
