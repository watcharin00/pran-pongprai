// Runtime validation for the JSON content files.
// JSON imports widen string literals (e.g. "circle" becomes string), so the
// discriminated unions in types.ts cannot be checked by `satisfies` alone.
// Every loader here takes `unknown`, checks it, and returns the typed value.
import type {
  ArmorDef,
  ArmorPerk,
  PerkId,
  ArmorId,
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
  SkillDef,
  SkillId,
  SkillsData,
  WeaponDef,
  WeaponType,
  WeaponsData,
  NpcDef,
  NpcId,
  NpcRole,
  RequestDef,
  RequestGoal,
  MonsterId,
} from './types';
import { ARMOR_SLOTS, ICON_SHAPES } from './types';

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
    const offset = num(a.offset, `${path}.offset`, -100);
    const burrow = optional(a, 'burrow', (b) => bool(b, `${path}.burrow`));
    if (burrow && offset !== 0) throw new DataError(`${path}.offset`, 'a burrow attack is centred on the player: offset must be 0');
    return {
      ...common,
      ...extra,
      shape,
      radius: num(a.radius, `${path}.radius`, 1),
      // negative = a rear attack (tail whip) centred behind the monster
      offset,
      ...(burrow ? { burrow } : {}),
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
      area: optional(m, 'area', (x) => oneOf(x, `${p}.area`, ['home', 'bamboo', 'swamp', 'limestone', 'deepwild', 'cave', 'mangrove', 'peat', 'savanna'] as const)) ?? 'home',
      zone: oneOf(m.zone, `${p}.zone`, ['forest', 'canyon'] as const),
      spawnMinVillageDist: optional(m, 'spawnMinVillageDist', (x) => num(x, `${p}.spawnMinVillageDist`, 0)) ?? 0,
      spawnEastOfRiver: optional(m, 'spawnEastOfRiver', (x) => bool(x, `${p}.spawnEastOfRiver`)) ?? false,
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
      // the type itself is checked against weapons.json in data/index.ts (loaded after monsters)
      weakTo: optional(m, 'weakTo', (x) => str(x, `${p}.weakTo`) as WeaponType) ?? null,
      attacks,
    };
  }
  return out;
}

export function loadWeapons(v: unknown, materials: readonly string[], skills: readonly string[]): WeaponsData {
  const o = obj(v, 'weapons');
  const typesRaw = obj(o.types, 'weapons.types');
  const typeIds = Object.keys(typesRaw);
  const types: Record<string, WeaponsData['types'][WeaponType]> = {};
  for (const [k, t] of Object.entries(typesRaw)) {
    const tp = obj(t, `weapons.types.${k}`);
    types[k] = {
      hitstop: num(tp.hitstop, `weapons.types.${k}.hitstop`, 0, 0.5),
      shake: num(tp.shake, `weapons.types.${k}.shake`, 0, 1),
      skills: skillPair(tp.skills, `weapons.types.${k}.skills`, skills),
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
      signature: oneOf(w.signature, `${p}.signature`, skills) as SkillId,
      recipe,
      upgrade: {
        per: itemBag(obj(w.upgrade, `${p}.upgrade`).per, `${p}.upgrade.per`, materials),
        final: itemBag(obj(w.upgrade, `${p}.upgrade`).final, `${p}.upgrade.final`, materials),
      },
    };
    const shot = optional(w, 'projectile', (x) => {
      const so = obj(x, `${p}.projectile`);
      return { speed: num(so.speed, `${p}.projectile.speed`, 1), range: num(so.range, `${p}.projectile.range`, 1), pierce: num(so.pierce, `${p}.projectile.pierce`, 0) };
    });
    const def = weapons[k] as WeaponDef;
    if (shot) def.projectile = shot;
    if (w.look !== undefined) def.look = oneOf(w.look, `${p}.look`, ['crossbow'] as const);
  }
  if (starters !== 1) throw new DataError('weapons.weapons', `expected exactly one starter (recipe: null), got ${starters}`);
  const u = obj(o.upgrade, 'weapons.upgrade');
  const maxLevel = num(u.maxLevel, 'weapons.upgrade.maxLevel', 0, 20);
  const damageMul = arr(u.damageMul, 'weapons.upgrade.damageMul').map((x, i) => num(x, `weapons.upgrade.damageMul[${i}]`, 0));
  if (damageMul.length !== maxLevel + 1) throw new DataError('weapons.upgrade.damageMul', `expected ${maxLevel + 1} entries (+0..+${maxLevel})`);
  const finalLevel = num(u.finalLevel, 'weapons.upgrade.finalLevel', 1, maxLevel);
  const upgrade = { maxLevel, damageMul, orePerLevel: num(u.orePerLevel, 'weapons.upgrade.orePerLevel', 0), finalLevel, sealsPerLevel: num(u.sealsPerLevel, 'weapons.upgrade.sealsPerLevel', 0) };
  return { upgrade, types, weapons } as WeaponsData;
}

function skillPair(v: unknown, path: string, skills: readonly string[]): [SkillId, SkillId] {
  const a = arr(v, path);
  if (a.length !== 2) throw new DataError(path, 'expected exactly 2 skill ids');
  return [oneOf(a[0], `${path}[0]`, skills) as SkillId, oneOf(a[1], `${path}[1]`, skills) as SkillId];
}

const SKILL_KINDS = ['radial', 'dash', 'windupArea', 'windupLine', 'projectile'] as const;
const AUTO_ROLES = ['burst', 'filler', 'gapClose', 'never'] as const;

export function loadSkills(v: unknown): SkillsData {
  const o = obj(obj(v, 'skills').skills, 'skills.skills');
  const out: Record<string, SkillDef> = {};
  for (const [k, raw] of Object.entries(o)) {
    const p = `skills.skills.${k}`;
    const d = obj(raw, p);
    const n = (key: string, min = 0): number => num(d[key], `${p}.${key}`, min);
    const base = {
      auto: oneOf(d.auto, `${p}.auto`, AUTO_ROLES),
      cooldown: n('cooldown', 0.1),
      multiplier: n('multiplier'),
      stun: optional(d, 'stun', (x) => num(x, `${p}.stun`, 0)) ?? 0,
      partMul: optional(d, 'partMul', (x) => num(x, `${p}.partMul`, 0)) ?? 1,
      hitstop: n('hitstop'),
      shake: n('shake'),
    };
    const kind = oneOf(d.kind, `${p}.kind`, SKILL_KINDS);
    if (kind === 'radial') out[k] = { ...base, kind, radius: n('radius'), duration: n('duration') };
    else if (kind === 'dash') {
      out[k] = { ...base, kind, speed: n('speed'), duration: n('duration'), iframe: n('iframe'), hitRadius: n('hitRadius'), hitRadiusSizeMul: n('hitRadiusSizeMul') };
      // pillar 2: AUTO must never get i-frames out of a skill except to close distance
      if (base.auto !== 'gapClose' && base.auto !== 'never') throw new DataError(`${p}.auto`, 'skills with i-frames must be gapClose or never');
    } else if (kind === 'windupArea') out[k] = { ...base, kind, radius: n('radius'), windup: n('windup', 0.01), fxRadius: n('fxRadius') };
    else if (kind === 'windupLine') {
      const hits = optional(d, 'hits', (x) => num(x, `${p}.hits`, 1, 10)) ?? 1;
      if (!Number.isInteger(hits)) throw new DataError(`${p}.hits`, 'expected a whole number');
      out[k] = { ...base, kind, windup: n('windup', 0.01), length: n('length', 1), width: n('width', 1), hits, interval: optional(d, 'interval', (x) => num(x, `${p}.interval`, 0.01)) ?? 0.12 };
    } else {
      const count = n('count', 1);
      if (!Number.isInteger(count)) throw new DataError(`${p}.count`, 'expected a whole number');
      out[k] = { ...base, kind, count, spread: num(d.spread, `${p}.spread`, 0, 180), speed: n('speed', 1), range: n('range', 1), pierce: n('pierce') };
    }
  }
  if (Object.keys(out).length === 0) throw new DataError('skills.skills', 'needs at least one skill');
  return out as SkillsData;
}

const PERK_NUMBERS = ['staminaRegenMul', 'dashDamageMul', 'lowHpAttackMul', 'tailDamageMul', 'stunMul', 'partDamageMul', 'walkSpeedMul'] as const;

export function loadArmorPerks(v: unknown): Record<PerkId, ArmorPerk> {
  const o = obj(obj(v, 'armor').perks, 'armor.perks');
  const out: Record<string, ArmorPerk> = {};
  for (const [k, raw] of Object.entries(o)) {
    const p = `armor.perks.${k}`;
    const d = obj(raw, p);
    const perk: ArmorPerk = {};
    for (const [field, val] of Object.entries(d)) {
      const fp = `${p}.${field}`;
      if ((PERK_NUMBERS as readonly string[]).includes(field)) perk[field as (typeof PERK_NUMBERS)[number]] = num(val, fp, 0.1, 3);
      else if (field === 'noKnockback' || field === 'castSuperArmor') perk[field] = bool(val, fp);
      else if (field === 'rollIframeBonus') perk.rollIframeBonus = num(val, fp, 0, 0.3);
      else if (field === 'dodgeCostDelta') perk.dodgeCostDelta = num(val, fp, -15, 15);
      else throw new DataError(fp, 'unknown perk field');
    }
    if (Object.keys(perk).length === 0) throw new DataError(p, 'needs at least one effect');
    out[k] = perk;
  }
  return out as Record<PerkId, ArmorPerk>;
}

export function loadArmor(v: unknown, materials: readonly string[], perks: readonly string[]): Record<ArmorId, ArmorDef> {
  const o = obj(obj(v, 'armor').armor, 'armor.armor');
  const out: Record<string, ArmorDef> = {};
  const setSlots = new Map<string, string[]>();
  for (const [k, raw] of Object.entries(o)) {
    const p = `armor.armor.${k}`;
    const a = obj(raw, p);
    const slot = oneOf(a.slot, `${p}.slot`, ARMOR_SLOTS);
    const set = optional(a, 'set', (x) => oneOf(x, `${p}.set`, perks as readonly PerkId[])) ?? null;
    if (set) {
      if (slot === 'charm') throw new DataError(`${p}.set`, 'sets are head + body pieces');
      setSlots.set(set, [...(setSlots.get(set) ?? []), slot]);
    }
    out[k] = {
      slot,
      defense: num(a.defense, `${p}.defense`, 0),
      maxHp: num(a.maxHp, `${p}.maxHp`, 0),
      stamina: num(a.stamina, `${p}.stamina`, 0),
      color: color(a.color, `${p}.color`),
      set,
      perk: optional(a, 'perk', (x) => oneOf(x, `${p}.perk`, perks as readonly PerkId[])) ?? null,
      recipe: itemBag(a.recipe, `${p}.recipe`, materials),
    };
  }
  // a set needs exactly one head and one body piece, or its bonus could never (or too easily) turn on
  for (const [set, slots] of setSlots) {
    if (slots.length !== 2 || !slots.includes('head') || !slots.includes('body')) throw new DataError(`armor set ${set}`, 'needs exactly one head and one body piece');
  }
  return out as Record<ArmorId, ArmorDef>;
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
      bed: c.bed === undefined ? 'soil' : oneOf(c.bed, `${p}.bed`, ['soil', 'paddy', 'pond'] as const),
    };
  }
  return {
    fertilizerTimeMul: num(o.fertilizerTimeMul, 'crops.fertilizerTimeMul', 0.01, 1),
    crops: crops as CropsData['crops'],
  };
}

const NPC_ROLES: readonly NpcRole[] = ['forge', 'kitchen', 'requests', 'tips', 'herbs', 'farm', 'hunter', 'ranger'];

export function loadNpcs(v: unknown): Record<NpcId, NpcDef> {
  const o = obj(v, 'npcs');
  const out: Record<string, NpcDef> = {};
  for (const [k, raw] of Object.entries(o)) {
    const p = `npcs.${k}`;
    const n = obj(raw, p);
    const tile = arr(n.tile, `${p}.tile`);
    if (tile.length !== 2) throw new DataError(`${p}.tile`, 'expected [x, y]');
    out[k] = {
      tile: [num(tile[0], `${p}.tile[0]`, 0, 63), num(tile[1], `${p}.tile[1]`, 0, 47)],
      wander: num(n.wander, `${p}.wander`, 0, 200),
      role: oneOf(n.role, `${p}.role`, NPC_ROLES),
      area: optional(n, 'area', (x) => oneOf(x, `${p}.area`, ['home', 'wild'] as const)) ?? 'home',
    };
  }
  return out as Record<NpcId, NpcDef>;
}

/**
 * Hunt requests. Monster/part/material references are checked against the loaded data
 * so a typo cannot create a request that can never be finished.
 */
export function loadRequests(v: unknown, materials: readonly string[], monsters: Readonly<Record<string, MonsterDef>>): RequestDef[] {
  const list = arr(obj(v, 'requests').requests, 'requests.requests');
  const seen = new Set<string>();
  return list.map((raw, i) => {
    const p = `requests.requests[${i}]`;
    const r = obj(raw, p);
    const id = str(r.id, `${p}.id`);
    if (seen.has(id)) throw new DataError(`${p}.id`, `duplicate id ${id}`);
    seen.add(id);
    const g = obj(r.goal, `${p}.goal`);
    const type = oneOf(g.type, `${p}.goal.type`, ['kill', 'flawless', 'break', 'collect', 'veteran', 'alpha', 'swift'] as const);
    const count = num(g.count, `${p}.goal.count`, 1);
    let goal: RequestGoal;
    if (type === 'collect') goal = { type, item: oneOf(g.item, `${p}.goal.item`, materials) as MaterialId, count };
    else if (type === 'veteran' || type === 'alpha') {
      const monster = g.monster === undefined ? undefined : (oneOf(g.monster, `${p}.goal.monster`, Object.keys(monsters)) as MonsterId);
      if (type === 'veteran') goal = monster ? { type, monster, count } : { type, count };
      else goal = monster ? { type, monster, count } : { type, count };
    } else {
      const monster = oneOf(g.monster, `${p}.goal.monster`, Object.keys(monsters)) as MonsterId;
      if (type === 'break') {
        const part = oneOf(g.part, `${p}.goal.part`, PART_IDS);
        if (!monsters[monster]?.parts[part]) throw new DataError(`${p}.goal.part`, `${monster} has no ${part}`);
        goal = { type, monster, part, count };
      } else if (type === 'kill') goal = { type, monster, count };
      else if (type === 'flawless') goal = { type, monster, count };
      else goal = { type, monster, count };
    }
    const rw = obj(r.reward, `${p}.reward`);
    const potions = optional(rw, 'potions', (x) => num(x, `${p}.reward.potions`, 0, 9));
    return {
      id,
      unlockGoal: num(r.unlockGoal, `${p}.unlockGoal`, 0),
      goal,
      reward: potions === undefined ? { items: itemBag(rw.items, `${p}.reward.items`, materials) } : { items: itemBag(rw.items, `${p}.reward.items`, materials), potions },
    };
  });
}
