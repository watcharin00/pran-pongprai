// Save format + migration. Storage access (localStorage) lives outside core.
import { ARMOR, CROPS, MATERIALS, MEALS, MONSTERS, REQUESTS, TUNING, WEAPONS, WEAPONS_DATA } from '../data';
import { ARMOR_SLOTS, MEDALS, type ArmorId, type ArmorSlot, type CropId, type MaterialId, type MealId, type MedalId, type MonsterId, type WeaponId, type AreaId } from '../data/types';
import { refreshStats, startingInventory } from './inventory';
import { AREA_IDS } from './areas';
import type { GameState, Inventory, Meal } from './state';

export const SAVE_VERSION = 2;

export interface SavedPlot {
  crop: CropId | null;
  at: number;
  dur: number;
  fert: boolean;
}

export interface SaveData {
  version: 2;
  inv: Inventory;
  owned: WeaponId[];
  weapon: WeaponId;
  weaponLevels: Partial<Record<WeaponId, number>>;
  ownedArmor: ArmorId[];
  armor: Record<ArmorSlot, ArmorId | null>;
  potions: number;
  meal: Meal | null;
  selCrop: CropId;
  autoOn: boolean;
  /** auto-drink HP threshold (0 = off) */
  autoPotion: number;
  kills: Partial<Record<MonsterId, number>>;
  visited: AreaId[];
  plots: SavedPlot[];
  /** finished hunt requests and progress on the current one */
  requestsDone: string[];
  requestProgress: number;
  /** bestiary medals per monster kind */
  medals: Partial<Record<MonsterId, MedalId[]>>;
}

export function snapshot(s: GameState): SaveData {
  return {
    version: SAVE_VERSION,
    inv: { ...s.inv },
    owned: [...s.owned],
    weapon: s.player.weapon,
    weaponLevels: { ...s.weaponLevels },
    ownedArmor: [...s.ownedArmor],
    armor: { ...s.armor },
    potions: s.player.potions,
    meal: s.player.meal ? { ...s.player.meal } : null,
    selCrop: s.selCrop,
    autoOn: s.autoOn,
    autoPotion: s.autoPotion,
    kills: { ...s.kills },
    visited: [...s.visited],
    plots: s.plots.map((p) => ({ crop: p.crop, at: p.at, dur: p.dur, fert: p.fert })),
    requestsDone: [...s.requests.done],
    requestProgress: s.requests.progress,
    medals: Object.fromEntries(Object.entries(s.medals).map(([k, v]) => [k, [...(v ?? [])]])),
  };
}

export function serialize(s: GameState): string {
  return JSON.stringify(snapshot(s));
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Parses any known save version into the current format, dropping anything
 * unknown. v1 (the dark prototype) has the same fields minus `autoOn`;
 * saves from before armor existed simply have no armor fields.
 * Returns null for missing/corrupt data.
 */
export function parseSave(raw: string | null): SaveData | null {
  if (!raw) return null;
  let d: unknown;
  try {
    d = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(d) || !isObj(d.inv)) return null;

  const inv = startingInventory();
  for (const [k, v] of Object.entries(d.inv)) if (k in MATERIALS && isNum(v) && v >= 0) inv[k as MaterialId] = Math.floor(v);

  const owned = new Set<WeaponId>(['bone']);
  if (Array.isArray(d.owned)) for (const k of d.owned) if (typeof k === 'string' && k in WEAPONS) owned.add(k as WeaponId);
  const weapon = typeof d.weapon === 'string' && owned.has(d.weapon as WeaponId) ? (d.weapon as WeaponId) : 'bone';

  const weaponLevels: Partial<Record<WeaponId, number>> = {};
  if (isObj(d.weaponLevels)) {
    for (const [k, v] of Object.entries(d.weaponLevels)) {
      if (owned.has(k as WeaponId) && isNum(v) && v >= 1) weaponLevels[k as WeaponId] = Math.min(WEAPONS_DATA.upgrade.maxLevel, Math.floor(v));
    }
  }

  const ownedArmor = new Set<ArmorId>();
  if (Array.isArray(d.ownedArmor)) for (const k of d.ownedArmor) if (typeof k === 'string' && k in ARMOR) ownedArmor.add(k as ArmorId);
  const armor: Record<ArmorSlot, ArmorId | null> = { head: null, body: null, charm: null };
  if (isObj(d.armor)) {
    for (const slot of ARMOR_SLOTS) {
      const id = d.armor[slot];
      // only owned pieces that actually belong in that slot
      if (typeof id === 'string' && ownedArmor.has(id as ArmorId) && ARMOR[id as ArmorId].slot === slot) armor[slot] = id as ArmorId;
    }
  }

  const kills: Partial<Record<MonsterId, number>> = {};
  if (isObj(d.kills)) for (const [k, v] of Object.entries(d.kills)) if (k in MONSTERS && isNum(v) && v > 0) kills[k as MonsterId] = Math.floor(v);

  const visited = new Set<AreaId>(['home']);
  if (Array.isArray(d.visited)) for (const a of d.visited) if (typeof a === 'string' && (AREA_IDS as readonly string[]).includes(a)) visited.add(a as AreaId);

  let meal: Meal | null = null;
  if (isObj(d.meal) && typeof d.meal.id === 'string' && d.meal.id in MEALS && isNum(d.meal.until)) meal = { id: d.meal.id as MealId, until: d.meal.until };

  const plots: SavedPlot[] = [];
  if (Array.isArray(d.plots)) {
    for (const p of d.plots) {
      if (isObj(p) && typeof p.crop === 'string' && p.crop in CROPS && isNum(p.at) && isNum(p.dur)) plots.push({ crop: p.crop as CropId, at: p.at, dur: p.dur, fert: p.fert === true });
      else plots.push({ crop: null, at: 0, dur: 0, fert: false });
    }
  }

  const requestsDone: string[] = [];
  if (Array.isArray(d.requestsDone)) for (const r of d.requestsDone) if (typeof r === 'string' && REQUESTS.some((q) => q.id === r)) requestsDone.push(r);

  const medals: Partial<Record<MonsterId, MedalId[]>> = {};
  if (isObj(d.medals)) {
    for (const [k, v] of Object.entries(d.medals)) {
      if (!(k in MONSTERS) || !Array.isArray(v)) continue;
      const list = MEDALS.filter((m) => v.includes(m));
      if (list.length) medals[k as MonsterId] = list;
    }
  }

  return {
    version: SAVE_VERSION,
    inv,
    owned: [...owned],
    weapon,
    weaponLevels,
    ownedArmor: [...ownedArmor],
    armor,
    potions: isNum(d.potions) && d.potions >= 0 ? Math.floor(d.potions) : 2,
    meal,
    selCrop: typeof d.selCrop === 'string' && d.selCrop in CROPS ? (d.selCrop as CropId) : 'herb',
    autoOn: d.autoOn === true,
    autoPotion: isNum(d.autoPotion) && TUNING.player.potion.autoOptions.includes(d.autoPotion) ? d.autoPotion : TUNING.player.potion.autoDefault,
    kills,
    visited: [...visited],
    plots,
    requestsDone,
    requestProgress: isNum(d.requestProgress) && d.requestProgress > 0 ? Math.floor(d.requestProgress) : 0,
    medals,
  };
}

/** Loads v2 if present, otherwise migrates v1. */
export function loadFromStorage(read: (key: string) => string | null, key: string, legacyKey: string): SaveData | null {
  return parseSave(read(key)) ?? parseSave(read(legacyKey));
}

export function applySave(s: GameState, d: SaveData): void {
  s.inv = { ...d.inv };
  s.owned = new Set(d.owned);
  s.weaponLevels = { ...d.weaponLevels };
  s.player.weapon = d.weapon;
  s.ownedArmor = new Set(d.ownedArmor);
  s.armor = { ...d.armor };
  s.player.potions = d.potions;
  s.player.meal = d.meal;
  s.selCrop = d.selCrop;
  s.autoOn = d.autoOn;
  s.autoPotion = d.autoPotion;
  s.kills = { ...d.kills };
  s.visited = new Set(d.visited);
  s.requests.done = new Set(d.requestsDone);
  s.requests.progress = d.requestProgress;
  s.medals = Object.fromEntries(Object.entries(d.medals).map(([k, v]) => [k, [...(v ?? [])]]));
  d.plots.forEach((sp, i) => {
    const plot = s.plots[i];
    if (plot) Object.assign(plot, sp);
  });
  refreshStats(s);
  s.player.hp = s.player.maxHp;
  s.player.st = s.player.maxSt;
}
