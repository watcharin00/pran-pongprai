// Typed event bus. Game logic emits; rendering, audio and UI subscribe.
// Pure TypeScript so the same logic can later run on a server.
import type { AreaId, CropId, MaterialId, MealId, MedalId, MonsterId, PartId, SkillId, WeaponId, ZoneId } from '../data/types';

export interface Vec2 {
  x: number;
  y: number;
}

type Drops = Partial<Record<MaterialId, number>>;

export interface CorpseInfo {
  dirX: 1 | -1;
  frame: number;
  headBroken: boolean;
  tailBroken: boolean;
}

export interface GameEvents {
  'monster:spawned': { id: number; kind: MonsterId; at: Vec2; vet: boolean; alpha: boolean };
  /** `tip` = first hit on this part recently: show the part name */
  'monster:hit': { id: number; kind: MonsterId; part: PartId | 'body'; damage: number; at: Vec2; gold: boolean; big: boolean; tip: boolean; color: string };
  'part:broken': { id: number; kind: MonsterId; part: PartId; at: Vec2; drops: Drops };
  'monster:stunned': { id: number; kind: MonsterId; at: Vec2 };
  'monster:enraged': { id: number; kind: MonsterId; at: Vec2 };
  'monster:telegraph': { id: number; kind: MonsterId; attackId: string };
  /** a circle attack resolved (hit or miss) */
  'monster:strike': { id: number; kind: MonsterId; at: Vec2; radius: number };
  'monster:dashEnd': { id: number; kind: MonsterId; at: Vec2 };
  /** dug in for a burrow attack / burst back out of the ground */
  'monster:burrow': { id: number; kind: MonsterId; at: Vec2 };
  'monster:emerge': { id: number; kind: MonsterId; at: Vec2 };
  'monster:killed': { id: number; kind: MonsterId; at: Vec2; drops: Drops; rare: MaterialId | null; corpse: CorpseInfo;
    /** it never hit the player */
    flawless: boolean;
    vet: boolean;
    alpha: boolean;
    /** every part it has was broken */
    allParts: boolean;
    /** share of the hunt timer left (0..1) */
    huntLeft: number;
  };
  'monster:fled': { id: number; kind: MonsterId; at: Vec2 };
  'player:attack': { weapon: WeaponId; at: Vec2 };
  'player:hurt': { damage: number; at: Vec2; heavy: boolean };
  /** an attack connected during i-frames */
  'player:dodged': { at: Vec2 };
  'player:roll': { at: Vec2 };
  'player:tired': { at: Vec2 };
  /** `auto`: the auto-drink setting did it, not a button */
  'player:drink': { heal: number; at: Vec2; auto: boolean };
  'player:noPotion': { auto: boolean };
  'player:knockedOut': Record<string, never>;
  /** `camp`: woke at the area's hunter camp instead of the village */
  'player:revived': { at: Vec2; camp: boolean };
  'skill:cast': { skill: SkillId; at: Vec2 };
  /** `line` is set for strikes along a direction (thrust, cleave) */
  'skill:impact': { skill: SkillId; at: Vec2; radius: number; line?: { ux: number; uy: number; len: number; wd: number; from: Vec2 } };
  /** a projectile hit a tree, rock or wall */
  'shot:blocked': { at: Vec2 };
  'crop:planted': { plot: number; crop: CropId; at: Vec2 };
  'crop:harvested': { plot: number; crop: CropId; at: Vec2; drops: Drops };
  'farm:noSeed': { crop: CropId };
  'item:gathered': { item: MaterialId; amount: number; at: Vec2; bonusSeed: boolean };
  'zone:entered': { zone: ZoneId };
  /** the player walked through an exit, fast-travelled or was carried home */
  'area:changed': { area: AreaId; from: AreaId };
  'meal:expired': { meal: MealId };
  'request:progress': { id: string; progress: number; count: number };
  'request:ready': { id: string };
  'request:claimed': { id: string; items: Drops; potions: number };
  'medal:earned': { kind: MonsterId; medal: MedalId };
  /** a jungle-fowl egg went into the nest */
  'ranch:incubate': { at: Vec2 };
  'ranch:hatched': { id: number; at: Vec2 };
  /** a chick grew into a laying hen */
  'ranch:grown': { id: number; at: Vec2 };
  'ranch:fed': { item: MaterialId; trough: number; at: Vec2 };
  /** `loved`: the pet raised a heart (otherwise it was just a happy cluck) */
  'ranch:petted': { id: number; love: number; loved: boolean; at: Vec2 };
  'ranch:laid': { id: number; at: Vec2 };
  'ranch:collected': { items: Drops; at: Vec2 };
}

type Handler<T> = (payload: T) => void;

export class EventBus<E extends object = GameEvents> {
  private readonly handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(type, handler);
  }

  off<K extends keyof E>(type: K, handler: Handler<E[K]>): void {
    this.handlers.get(type)?.delete(handler as Handler<never>);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    // Copy so handlers may unsubscribe while being called.
    for (const h of [...set]) (h as Handler<E[K]>)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}
