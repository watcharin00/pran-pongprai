// Typed event bus. Game logic emits; rendering, audio and UI subscribe.
// Pure TypeScript so the same logic can later run on a server.
import type { CropId, MaterialId, MonsterId, PartId, SkillId, ZoneId } from '../data/types';

export interface Vec2 {
  x: number;
  y: number;
}

export interface GameEvents {
  'monster:hit': { monsterId: number; kind: MonsterId; part: PartId | 'body'; damage: number; at: Vec2; gold: boolean };
  'part:broken': { monsterId: number; kind: MonsterId; part: PartId; at: Vec2; drops: Partial<Record<MaterialId, number>> };
  'monster:stunned': { monsterId: number; at: Vec2 };
  'monster:enraged': { monsterId: number; at: Vec2 };
  'monster:telegraph': { monsterId: number; attackId: string };
  'monster:killed': { monsterId: number; kind: MonsterId; at: Vec2; drops: Partial<Record<MaterialId, number>>; rare: MaterialId | null };
  'monster:fled': { monsterId: number; kind: MonsterId; at: Vec2 };
  'player:hurt': { damage: number; at: Vec2; heavy: boolean };
  'player:dodged': { at: Vec2 };
  'player:knockedOut': Record<string, never>;
  'skill:cast': { skill: SkillId; at: Vec2 };
  'crop:planted': { plot: number; crop: CropId };
  'crop:harvested': { plot: number; crop: CropId; drops: Partial<Record<MaterialId, number>> };
  'item:gathered': { item: MaterialId; amount: number; at: Vec2 };
  'zone:entered': { zone: ZoneId };
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
