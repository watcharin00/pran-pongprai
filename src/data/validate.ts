// Runtime validation for the JSON content files.
// JSON imports widen string literals (e.g. "circle" becomes string), so the
// discriminated unions in types.ts cannot be checked by `satisfies` alone.
// Every loader here takes `unknown`, checks it, and returns the typed value.
import type {
  AttackDef,
  CarveDef,
  CropDef,
  CropsData,
  ItemBag,
  MaterialDef,
  MaterialId,
  MonsterDef,
  PartDef,
  PartId,
  RageDef,
  SkillId,
  SkillsData,
  WeaponDef,
  WeaponType,
  WeaponsData,
} from './types';
import { ICON_SHAPES } from './types';

export class DataError extends Error {
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'DataError';
  }
}

type Obj = Record<string, unknown>;

function obj(v: unknown, path: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new DataError(path, 'expected an object');
  return v as Obj;
}

function num(v: unknown, path: string, min = -Infinity, max = Infinity): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new DataError(path, 'expected a number');
  if (v < min || v > max) throw new DataError(path, `expected ${min}..${max}, got ${v}`);
  return v;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) throw new DataError(path, 'expected a non-empty string');
  return v;
}

function color(v: unknown, path: string): string {
  const s = str(v, path);
  if (!/^#[0-9a-f]{6}$/i.test(s)) throw new DataError(path, `expected #rrggbb, got ${s}`);
  return s;
}

function oneOf<T extends string>(v: unknown, path: string, options: readonly T[]): T {
  if (typeof v !== 'string' || !(options as readonly string[]).includes(v)) {
    throw new DataError(path, `expected one of ${options.join(', ')}, got ${String(v)}`);
  }
  return v as T;
}

function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) throw new DataError(path, 'expected an array');
  return v;
}

function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') throw new DataError(path, 'expected a boolean');
  return v;
}

function optional<T>(o: Obj, key: string, read: (v: unknown) => T): T | undefined {
  return o[key] === undefined ? undefined : read(o[key]);
}

const PART_IDS: readonly PartId[] = ['head', 'tail'];
const SKILL_IDS: readonly SkillId[] = ['whirl', 'dash', 'slam'];

/** Validates map keys/values against a known id list (material ids). */
function itemBag(v: unknown, path: string, materials: readonly string[], valueMax = Infinity): ItemBag {
  const o = obj(v, path);
  const out: ItemBag = {};
  for (const [k, n] of Object.entries(o)) {
    const id = oneOf(k, `${path}.${k}`, materials) as MaterialId;
    out[id] = num(n, `${path}.${k}`, 0, valueMax);
  }
  return out;
}

export function loadMaterials(v: unknown): Record<MaterialId, MaterialDef> {
  const o = obj(v, 'materials');
  const out: Record<string, MaterialDef> = {};
  for (const [k, raw] of Object.entries(o)) {
    const p = `materials.${k}`;
    const m = obj(raw, p);
    const def: MaterialDef = {
      color: color(m.color, `${p}.color`),
      category: oneOf(m.category, `${p}.category`, ['material', 'seed'] as const),
      icon: oneOf(m.icon, `${p}.icon`, ICON_SHAPES),
    };
    const rarity = optional(m, 'rarity', (r) => num(r, `${p}.rarity`, 1, 2));
    if (rarity !== undefined) def.rarity = rarity as 1 | 2;
    out[k] = def;
  }
  return out as Record<MaterialId, MaterialDef>;
}

function loadAttack(v: unknown, path: string): AttackDef {
  const a = obj(v, path);
  const shape = oneOf(a.shape, `${path}.shape`, ['circle', 'line'] as const);
  const common = {
    id: str(a.id, `${path}.id`),
    telegraph: num(a.telegraph, `${path}.telegraph`, 0.05),
    damage: num(a.damage, `${path}.damage`, 0),
    range: num(a.range, `${path}.range`, 0),
    weight: num(a.weight, `${path}.weight`, 0),
  };
  const minRange = optional(a, 'minRange', (r) => num(r, `${path}.minRange`, 0));
  const extra = minRange === undefined ? {} : { minRange };
  if (shape === 'circle') {
    return {
      ...common,
      ...extra,
      shape,
      radius: num(a.radius, `${path}.radius`, 1),
      offset: num(a.offset, `${path}.offset`, 0),
    };
  }
  return {
    ...common,
    ...extra,
    shape,
    length: num(a.length, `${path}.length`, 1),
    width: num(a.width, `${path}.width`, 1),
    dash: bool(a.dash, `${path}.dash`),
  };
}

function loadRage(v: unknown, path: string): RageDef | null {
  if (v === null) return null;
  const r = obj(v, path);
  return {
    below: num(r.below, `${path}.below`, 0, 1),
    speedMul: num(r.speedMul, `${path}.speedMul`, 0),
    telegraphRate: num(r.telegraphRate, `${path}.telegraphRate`, 0),
    damageMul: num(r.damageMul, `${path}.damageMul`, 0),
  };
}

export function loadMonsters(v: unknown, materials: readonly string[]): Record<string, MonsterDef> {
  const o = obj(v, 'monsters');
  const out: Record<string, MonsterDef> = {};
  for (const [k, raw] of Object.entries(o)) {
    const p = `monsters.${k}`;
    const m = obj(raw, p);
    const parts: Partial<Record<PartId, PartDef>> = {};
    for (const [pk, pv] of Object.entries(obj(m.parts, `${p}.parts`))) {
      const pp = `${p}.parts.${pk}`;
      const id = oneOf(pk, pp, PART_IDS);
      const part = obj(pv, pp);
      const off = arr(part.offset, `${pp}.offset`);
      if (off.length !== 2) throw new DataError(`${pp}.offset`, 'expected [x, y]');
      parts[id] = {
        hp: num(part.hp, `${pp}.hp`, 1),
        drop: itemBag(part.drop, `${pp}.drop`, materials),
        offset: [num(off[0], `${pp}.offset[0]`), num(off[1], `${pp}.offset[1]`)],
      };
    }
    const carve: CarveDef[] = arr(m.carve, `${p}.carve`).map((c, i) => {
      const cp = `${p}.carve[${i}]`;
      const co = obj(c, cp);
      const min = num(co.min, `${cp}.min`, 0);
      const max = num(co.max, `${cp}.max`, min);
      return { item: oneOf(co.item, `${cp}.item`, materials) as MaterialId, min, max };
    });
    const attacks = arr(m.attacks, `${p}.attacks`).map((a, i) => loadAttack(a, `${p}.attacks[${i}]`));
    if (attacks.length === 0) throw new DataError(`${p}.attacks`, 'needs at least one attack');
    out[k] = {
      hp: num(m.hp, `${p}.hp`, 1),
      speed: num(m.speed, `${p}.speed`, 0),
      size: num(m.size, `${p}.size`, 1),
      aggroRadius: num(m.aggroRadius, `${p}.aggroRadius`, 0),
      zone: oneOf(m.zone, `${p}.zone`, ['forest', 'canyon'] as const),
      huntTime: num(m.huntTime, `${p}.huntTime`, 1),
      turnTime: num(m.turnTime, `${p}.turnTime`, 0),
      recover: num(m.recover, `${p}.recover`, 0),
      respawn: num(m.respawn, `${p}.respawn`, 0),
      count: num(m.count, `${p}.count`, 0),
      rage: loadRage(m.rage, `${p}.rage`),
      parts,
      carve,
      bonus: itemBag(m.bonus, `${p}.bonus`, materials, 1),
      rare: itemBag(m.rare, `${p}.rare`, materials, 1),
      attacks,
    };
  }
  return out;
}

export function loadWeapons(v: unknown, materials: readonly string[]): WeaponsData {
  const o = obj(v, 'weapons');
  const typesRaw = obj(o.types, 'weapons.types');
  const typeIds = Object.keys(typesRaw);
  const types: Record<string, WeaponsData['types'][WeaponType]> = {};
  for (const [k, t] of Object.entries(typesRaw)) {
    const tp = obj(t, `weapons.types.${k}`);
    types[k] = {
      hitstop: num(tp.hitstop, `weapons.types.${k}.hitstop`, 0, 0.5),
      shake: num(tp.shake, `weapons.types.${k}.shake`, 0, 1),
    };
  }
  const weapons: Record<string, WeaponDef> = {};
  let starters = 0;
  for (const [k, raw] of Object.entries(obj(o.weapons, 'weapons.weapons'))) {
    const p = `weapons.weapons.${k}`;
    const w = obj(raw, p);
    const pm = obj(w.partMul, `${p}.partMul`);
    const recipe = w.recipe === null ? null : itemBag(w.recipe, `${p}.recipe`, materials);
    if (recipe === null) starters++;
    weapons[k] = {
      type: oneOf(w.type, `${p}.type`, typeIds) as WeaponType,
      damage: num(w.damage, `${p}.damage`, 0),
      rate: num(w.rate, `${p}.rate`, 0.05),
      range: num(w.range, `${p}.range`, 1),
      partMul: { head: num(pm.head, `${p}.partMul.head`, 0), tail: num(pm.tail, `${p}.partMul.tail`, 0) },
      stun: num(w.stun, `${p}.stun`, 0),
      color: color(w.color, `${p}.color`),
      recipe,
    };
  }
  if (starters !== 1) throw new DataError('weapons.weapons', `expected exactly one starter (recipe: null), got ${starters}`);
  return { types, weapons } as WeaponsData;
}

export function loadSkills(v: unknown): SkillsData {
  const o = obj(v, 'skills');
  const order = arr(o.order, 'skills.order').map((s, i) => oneOf(s, `skills.order[${i}]`, SKILL_IDS));
  if (order.length !== 3 || new Set(order).size !== 3) throw new DataError('skills.order', 'expected the 3 skill ids once each');
  const n = (id: SkillId, key: string, min = 0): number => num(obj(o[id], `skills.${id}`)[key], `skills.${id}.${key}`, min);
  return {
    order: order as SkillsData['order'],
    whirl: {
      cooldown: n('whirl', 'cooldown'), multiplier: n('whirl', 'multiplier'), radius: n('whirl', 'radius'),
      duration: n('whirl', 'duration'), hitstop: n('whirl', 'hitstop'), shake: n('whirl', 'shake'),
    },
    dash: {
      cooldown: n('dash', 'cooldown'), multiplier: n('dash', 'multiplier'), speed: n('dash', 'speed'),
      duration: n('dash', 'duration'), iframe: n('dash', 'iframe'), hitRadius: n('dash', 'hitRadius'),
      hitRadiusSizeMul: n('dash', 'hitRadiusSizeMul'), hitstop: n('dash', 'hitstop'),
    },
    slam: {
      cooldown: n('slam', 'cooldown'), multiplier: n('slam', 'multiplier'), radius: n('slam', 'radius'),
      windup: n('slam', 'windup'), stun: n('slam', 'stun'), partMul: n('slam', 'partMul'),
      hitstop: n('slam', 'hitstop'), shake: n('slam', 'shake'),
    },
  };
}

export function loadCrops(v: unknown, materials: readonly string[]): CropsData {
  const o = obj(v, 'crops');
  const crops: Record<string, CropDef> = {};
  for (const [k, raw] of Object.entries(obj(o.crops, 'crops.crops'))) {
    const p = `crops.crops.${k}`;
    const c = obj(raw, p);
    const y = obj(c.yield, `${p}.yield`);
    const min = num(y.min, `${p}.yield.min`, 0);
    crops[k] = {
      seed: oneOf(c.seed, `${p}.seed`, materials) as MaterialId,
      growSeconds: num(c.growSeconds, `${p}.growSeconds`, 1),
      yield: { item: oneOf(y.item, `${p}.yield.item`, materials) as MaterialId, min, max: num(y.max, `${p}.yield.max`, min) },
      seedBack: num(c.seedBack, `${p}.seedBack`, 0, 1),
      color: color(c.color, `${p}.color`),
    };
  }
  return {
    fertilizerTimeMul: num(o.fertilizerTimeMul, 'crops.fertilizerTimeMul', 0.01, 1),
    crops: crops as CropsData['crops'],
  };
}
