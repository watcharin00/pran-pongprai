// Balance simulation (not part of the normal test run): `npm run balance`.
// For every progress stage it equips the gear a player would have by then, lets AUTO fight the
// monsters that stage farms, and dodges with a simple bot standing in for the player's skill.
// Prints TTK, damage taken, potions, deaths, part breaks and how many hunts the next weapon costs.
import { describe, it } from 'vitest';
import { ARMOR, MONSTERS, WEAPONS } from '../src/data';
import type { ArmorId, ItemBag, MaterialId, MonsterId, WeaponId } from '../src/data/types';
import { createAutoPilot, autoIntent } from '../src/core/autoPilot';
import { createMonster } from '../src/core/monsterAI';
import { refreshStats } from '../src/core/inventory';
import { Rng } from '../src/core/rng';
import { step } from '../src/core/sim';
import type { GameState, MonsterState } from '../src/core/state';
import { game, openSpot } from './helpers';

interface Stage {
  goal: number;
  weapon: WeaponId;
  level: number;
  armor: ArmorId[];
  targets: MonsterId[];
  /** what this stage is farming for */
  next: WeaponId[];
  vet?: boolean;
}

const STAGES: Stage[] = [
  { goal: 0, weapon: 'bone', level: 0, armor: [], targets: ['junglefowl', 'dhole'], next: ['fangblade'] },
  { goal: 0, weapon: 'bamboobow', level: 0, armor: [], targets: ['dhole'], next: ['fangblade'] },
  { goal: 1, weapon: 'fangblade', level: 1, armor: ['mosshood', 'mossvest', 'fangcharm'], targets: ['boar', 'gaur'], next: ['cleaver'] },
  { goal: 2, weapon: 'cleaver', level: 1, armor: ['boarhelm', 'boarvest', 'feathercharm'], targets: ['gaur'], next: ['coreblade'] },
  { goal: 3, weapon: 'coreblade', level: 2, armor: ['cinderhelm', 'cindermail', 'emberamulet'], targets: ['tiger'], next: ['tigerspear', 'stripeblade'] },
  { goal: 4, weapon: 'stripeblade', level: 2, armor: ['tigerhood', 'tigercoat', 'tigereyecharm'], targets: ['macaque', 'cobra'], next: ['cobrafang'] },
  { goal: 5, weapon: 'cobrafang', level: 2, armor: ['tigerhood', 'tigercoat', 'tigereyecharm'], targets: ['monitor', 'crocodile'], next: ['crocmaul', 'lizardbow'] },
  { goal: 6, weapon: 'crocmaul', level: 2, armor: ['crochelm', 'crocmail', 'tigereyecharm'], targets: ['serow', 'bear'], next: ['serowspear', 'bearblade'] },
  { goal: 7, weapon: 'bearblade', level: 2, armor: ['bearhood', 'bearcoat', 'serowcharm'], targets: ['muntjac', 'elephant'], next: ['kingblade', 'kingbow'] },
  { goal: 8, weapon: 'kingblade', level: 3, armor: ['elehelm', 'elecoat', 'spiritcharm'], targets: ['flyingfox', 'porcupine', 'kingcobra'], next: ['nagamaul', 'batbow', 'nagablade'] },
  { goal: 9, weapon: 'nagablade', level: 3, armor: ['nagahelm', 'nagamail', 'nagacharm'], targets: ['otter', 'mudcrab', 'saltcroc'], next: ['tidespear', 'crabsword', 'pearlbow'] },
  { goal: 10, weapon: 'kingblade', level: 3, armor: ['elehelm', 'elecoat', 'spiritcharm'], targets: ['tiger', 'crocodile', 'bear', 'elephant'], next: [], vet: true },
];

/** How often the stand-in player reacts to a telegraph in time. */
const SKILLS = { average: 0.6, good: 0.9 } as const;
const RUNS = 16;
/** Seconds spent finding the next monster between hunts. */
const SEARCH_OVERHEAD = 20;
const GATHERED = new Set<MaterialId>(['ore', 'herb']);

interface FightResult {
  won: boolean;
  died: boolean;
  fled: boolean;
  time: number;
  damage: number;
  potions: number;
  drops: ItemBag;
}

function inShape(s: GameState, m: MonsterState): boolean {
  const p = s.player;
  const sh = m.shape;
  if (!sh) return false;
  if (sh.kind === 'circle') return Math.hypot(p.x - sh.cx, p.y - sh.cy) <= sh.r + 8;
  const rx = p.x - sh.sx;
  const ry = p.y - sh.sy;
  const along = rx * sh.ux + ry * sh.uy;
  const across = Math.abs(rx * -sh.uy + ry * sh.ux);
  return along >= -8 && along <= sh.len + 12 && across <= sh.wd / 2 + 10;
}

function fight(stage: Stage, kind: MonsterId, skill: number, seed: number, dummyFor = 0): FightResult & { dealt: number } {
  const s = game();
  const bot = new Rng(seed * 7919 + 13);
  s.owned.add(stage.weapon);
  s.player.weapon = stage.weapon;
  if (stage.level) s.weaponLevels[stage.weapon] = stage.level;
  for (const a of stage.armor) {
    s.ownedArmor.add(a);
    s.armor[ARMOR[a].slot] = a;
  }
  refreshStats(s);
  s.player.hp = s.player.maxHp;
  s.player.potions = 2;
  for (let i = 0; i < seed; i++) s.rng.next();
  const spot = openSpot(s);
  s.player.x = spot.x;
  s.player.y = spot.y;
  const m = createMonster(s.nextId++, kind, spot.x + 70, spot.y, -1, !!stage.vet);
  // a training dummy: same moves, endless HP, to measure sustained damage per second
  if (dummyFor) m.hp = m.maxHp = 1e7;
  s.monsters.push(m);
  let dealt = 0;
  s.events.on('monster:hit', (e) => (dealt += e.damage));
  // the fight ends when this monster is gone; no respawns muddying the numbers
  s.respawnQueue = [];
  const ap = createAutoPilot();
  const drops: ItemBag = {};
  let won = false;
  let fled = false;
  s.events.on('monster:killed', (e) => {
    won = true;
    for (const [k, n] of Object.entries(e.drops)) drops[k as MaterialId] = (drops[k as MaterialId] ?? 0) + (n ?? 0);
  });
  s.events.on('part:broken', (e) => {
    for (const [k, n] of Object.entries(e.drops)) drops[k as MaterialId] = (drops[k as MaterialId] ?? 0) + (n ?? 0);
  });
  s.events.on('monster:fled', () => (fled = true));
  let damage = 0;
  s.events.on('player:hurt', (e) => (damage += e.damage));
  const potions0 = s.player.potions;
  // one decision per telegraph: react in time, or not
  const decided = new Map<string, boolean>();
  const dt = 1 / 60;
  let t = 0;
  while (t < (dummyFor || 400) && !won && !fled && !s.player.dead) {
    if (dummyFor) m.huntT = 999;
    const intent = autoIntent(s, ap, dt);
    for (const mm of s.monsters) {
      const danger = (mm.mode === 'tele' && mm.t < 0.2) || (mm.mode === 'dash' && Math.hypot(mm.x - s.player.x, mm.y - s.player.y) < 40);
      if (!danger || !inShape(s, mm)) continue;
      // shape origin + attack id identify one telegraph
      const sh = mm.shape;
      const k2 = `${mm.id}:${mm.attack?.id ?? ''}:${sh ? (sh.kind === 'circle' ? `${Math.round(sh.cx)},${Math.round(sh.cy)}` : `${Math.round(sh.sx)},${Math.round(sh.sy)}`) : ''}`;
      if (!decided.has(k2)) decided.set(k2, bot.next() < skill);
      if (decided.get(k2) && s.player.dodgeCd <= 0 && s.player.roll <= 0) {
        intent.dodge = true;
        intent.move = null;
        intent.attack = false;
      }
    }
    step(s, intent, dt, s.now + dt * 1000);
    t += dt;
    s.respawnQueue = [];
  }
  return { won, died: s.player.dead, fled, time: t, damage, potions: potions0 - s.player.potions, drops, dealt };
}

const fmt = (n: number, d = 0): string => n.toFixed(d);
const avg = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

describe.runIf(import.meta.env.BALANCE === '1')('balance report', () => {
  it('prints the report', () => {
    const lines: string[] = [];
    const perKill = new Map<string, { drops: ItemBag; ttk: number; win: number }>();
    for (const [skillName, skill] of Object.entries(SKILLS)) {
      lines.push(`\n### player skill: ${skillName} (reacts to ${Math.round(skill * 100)}% of telegraphs)\n`);
      lines.push('| stage | weapon | monster | win% | died% | fled% | TTK s | dmg taken | potions | head% | tail% |');
      lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
      for (const st of STAGES) {
        for (const kind of st.targets) {
          const rs: FightResult[] = [];
          for (let i = 0; i < RUNS; i++) rs.push(fight(st, kind, skill, i + 1));
          const wins = rs.filter((r) => r.won);
          const def = MONSTERS[kind];
          const headDrop = def.parts.head ? Object.keys(def.parts.head.drop)[0] : undefined;
          const tailDrop = def.parts.tail ? Object.keys(def.parts.tail.drop)[0] : undefined;
          // part break rate estimated from the part drops (they only come from breaks)
          const partRate = (item: string | undefined, part: 'head' | 'tail'): string => {
            if (!item) return '-';
            const per = def.parts[part]?.drop[item as MaterialId] ?? 1;
            const carveMax = def.carve.find((c) => c.item === item)?.max ?? 0;
            const got = avg(wins.map((r) => Math.min(per, Math.max(0, (r.drops[item as MaterialId] ?? 0) - carveMax))));
            return fmt((got / per) * 100);
          };
          const ttk = avg(wins.map((r) => r.time));
          lines.push(
            `| ${st.goal}${st.vet ? ' vet' : ''} | ${st.weapon}+${st.level} | ${kind} | ${fmt((wins.length / RUNS) * 100)} | ${fmt((rs.filter((r) => r.died).length / RUNS) * 100)} | ${fmt((rs.filter((r) => r.fled).length / RUNS) * 100)} | ${fmt(ttk, 1)} | ${fmt(avg(rs.map((r) => r.damage)))} | ${fmt(avg(rs.map((r) => r.potions)), 1)} | ${partRate(headDrop, 'head')} | ${partRate(tailDrop, 'tail')} |`,
          );
          if (skillName === 'average') {
            const drops: ItemBag = {};
            for (const r of wins) for (const [k, n] of Object.entries(r.drops)) drops[k as MaterialId] = (drops[k as MaterialId] ?? 0) + (n ?? 0) / Math.max(1, wins.length);
            perKill.set(`${st.goal}:${st.weapon}:${kind}`, { drops, ttk, win: wins.length / RUNS });
          }
        }
      }
    }

    lines.push('\n### sustained damage (average player, 60 s against an endless-HP copy of the stage boss)\n');
    lines.push('| stage | weapon | vs | DPS | dmg taken / min | suggested HP for 10 s / 20 s / 40 s / 60 s |');
    lines.push('|---|---|---|---|---|---|');
    for (const st of STAGES) {
      const boss = st.targets[st.targets.length - 1];
      if (!boss) continue;
      const rs = Array.from({ length: 6 }, (_, i) => fight(st, boss, SKILLS.average, i + 1, 60));
      const dps = avg(rs.map((r) => r.dealt / r.time));
      const taken = avg(rs.map((r) => (r.damage / r.time) * 60));
      lines.push(`| ${st.goal}${st.vet ? ' vet' : ''} | ${st.weapon}+${st.level} | ${boss} | ${fmt(dps)} | ${fmt(taken)} | ${[10, 20, 40, 60].map((x) => fmt(dps * x)).join(' / ')} |`);
    }

    // economy: hunts needed for the next weapon with the average player's drop rates
    lines.push('\n### hunts per next weapon (average player)\n');
    lines.push('| stage | next weapon | hunts | est. minutes | missing from targets |');
    lines.push('|---|---|---|---|---|');
    for (const st of STAGES) {
      for (const w of st.next) {
        const recipe = WEAPONS[w].recipe ?? {};
        let hunts = 0;
        let minutes = 0;
        const missing: string[] = [];
        const need = new Map<MonsterId, number>();
        for (const [item, n] of Object.entries(recipe)) {
          // ore and herbs come from gathering nodes and requests, not hunting
          if (GATHERED.has(item as MaterialId)) continue;
          let best: { kind: MonsterId; per: number } | null = null;
          for (const kind of st.targets) {
            const per = perKill.get(`${st.goal}:${st.weapon}:${kind}`)?.drops[item as MaterialId] ?? 0;
            if (per > (best?.per ?? 0)) best = { kind, per };
          }
          if (!best) {
            missing.push(`${item}×${n}`);
            continue;
          }
          need.set(best.kind, Math.max(need.get(best.kind) ?? 0, Math.ceil((n ?? 0) / best.per)));
        }
        for (const [kind, k] of need) {
          const pk = perKill.get(`${st.goal}:${st.weapon}:${kind}`);
          const winRate = Math.max(0.05, pk?.win ?? 1);
          const attempts = k / winRate;
          hunts += k;
          minutes += (attempts * ((pk?.ttk ?? 30) + SEARCH_OVERHEAD)) / 60;
        }
        lines.push(`| ${st.goal} | ${w} | ${hunts} | ${fmt(minutes, 1)} | ${missing.join(' ') || '-'} |`);
      }
    }
    console.log(lines.join('\n'));
  }, 600_000);
});
