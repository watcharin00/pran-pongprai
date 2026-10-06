import { describe, expect, it } from 'vitest';
import { MONSTERS, TUNING } from '../src/data';
import { hitMonster, killMonster, resolveMonsterHit } from '../src/core/combat';
import { medalCount, medalsForKill } from '../src/core/medals';
import { createMonster, spawnMonster, veteransUnlocked } from '../src/core/monsterAI';
import { currentRequest } from '../src/core/requests';
import { parseSave, serialize, applySave } from '../src/core/save';
import type { GameEvents } from '../src/core/events';
import type { WeaponId } from '../src/data/types';
import { addMonster, game, openSpot } from './helpers';

const V = TUNING.veteran;
const endgame = (): ReturnType<typeof game> => {
  const s = game();
  (['bamboobow', 'cleaver', 'coreblade', 'tigerspear', 'cobrafang', 'lizardbow', 'bearblade', 'kingbow'] as WeaponId[]).forEach((w) => s.owned.add(w));
  return s;
};

const killed = (o: Partial<GameEvents['monster:killed']>): GameEvents['monster:killed'] => ({
  id: 1, kind: 'dhole', at: { x: 0, y: 0 }, drops: {}, rare: null, corpse: { dirX: 1, frame: 0, headBroken: false, tailBroken: false },
  flawless: false, vet: false, allParts: false, huntLeft: 0.2, ...o,
});

describe('veterans', () => {
  it('only appear after the last weapon goal', () => {
    const early = game();
    expect(veteransUnlocked(early)).toBe(false);
    for (let i = 0; i < 40; i++) {
      const m = spawnMonster(early, 'dhole');
      if (m) early.monsters = [];
      expect(m?.vet ?? false).toBe(false);
    }
    const late = endgame();
    expect(veteransUnlocked(late)).toBe(true);
    let vets = 0;
    for (let i = 0; i < 200; i++) {
      const m = spawnMonster(late, 'dhole');
      if (m?.vet) vets++;
      late.monsters = [];
    }
    expect(vets).toBeGreaterThan(200 * V.chance * 0.5);
    expect(vets).toBeLessThan(200 * V.chance * 1.6);
  });

  it('are tougher: more HP and part HP, harder hits', () => {
    const def = MONSTERS.tiger;
    const m = createMonster(1, 'tiger', 0, 0, 1, true);
    expect(m.hp).toBe(Math.round(def.hp * V.hpMul));
    expect(m.maxHp).toBe(m.hp);
    expect(m.parts.head?.hp).toBe(Math.round((def.parts.head?.hp ?? 0) * V.partHpMul));

    const hurt = (vet: boolean): number => {
      const s = game();
      const spot = openSpot(s);
      s.player.x = spot.x;
      s.player.y = spot.y;
      const mm = addMonster(s, 'dhole', spot.x + 20, spot.y);
      mm.vet = vet;
      const atk = MONSTERS.dhole.attacks[0];
      if (!atk) throw new Error('no attack');
      const before = s.player.hp;
      resolveMonsterHit(s, mm, atk);
      return before - s.player.hp;
    };
    expect(hurt(true)).toBeGreaterThan(hurt(false));
  });

  it('drop a hunter seal, their rare item and doubled carcass', () => {
    const s = game();
    const m = addMonster(s, 'tiger', 100, 100);
    m.vet = true;
    let ev: GameEvents['monster:killed'] | null = null;
    s.events.on('monster:killed', (e) => (ev = e));
    killMonster(s, m);
    expect(ev).not.toBeNull();
    const e = ev as unknown as GameEvents['monster:killed'];
    expect(e.vet).toBe(true);
    expect(e.drops.seal).toBe(V.seals);
    expect(e.rare).not.toBeNull();
    const pelt = MONSTERS.tiger.carve.find((c) => c.item === 'tigerpelt');
    expect(e.drops.tigerpelt ?? 0).toBeGreaterThanOrEqual((pelt?.min ?? 0) * V.carveMul);
  });

  it('rage threshold measures against the veteran HP', () => {
    const s = game();
    const m = addMonster(s, 'tiger', 100, 100);
    m.vet = true;
    m.maxHp = m.hp = MONSTERS.tiger.hp * 2;
    // half of the normal HP is still well above half of the veteran HP
    m.hp = MONSTERS.tiger.hp * 1.2;
    hitMonster(s, m, 0.01);
    expect(m.rage).toBe(false);
  });

  it('count for veteran hunt requests', () => {
    const s = endgame();
    for (const id of ['fowl', 'herbs', 'dholehead', 'boars', 'fishes', 'ricecrop', 'dholeclean', 'gaurtail', 'boarclean', 'tiger', 'cobrahood', 'croctail', 'serows', 'tigerclean', 'trunk', 'bats', 'quills', 'kingcobra']) s.requests.done.add(id);
    expect(currentRequest(s)?.id).toBe('vetfirst');
    const normal = addMonster(s, 'dhole', 100, 100);
    killMonster(s, normal);
    expect(s.requests.progress).toBe(0);
    const vet = addMonster(s, 'dhole', 100, 100);
    vet.vet = true;
    killMonster(s, vet);
    expect(s.requests.progress).toBe(1);
  });
});

describe('medals', () => {
  it('each feat earns its medal', () => {
    expect(medalsForKill(killed({}))).toEqual([]);
    expect(medalsForKill(killed({ flawless: true, allParts: true, huntLeft: 0.9, vet: true }))).toEqual(['flawless', 'parts', 'swift', 'veteran']);
    expect(medalsForKill(killed({ huntLeft: TUNING.medals.swiftHuntLeft }))).toEqual(['swift']);
  });

  it('are awarded once, in canonical order, and announced', () => {
    const s = game();
    const got: string[] = [];
    s.events.on('medal:earned', (e) => got.push(`${e.kind}:${e.medal}`));
    // a flawless kill straight away: also swift (full hunt timer)
    const a = addMonster(s, 'junglefowl', 100, 100);
    a.huntT = MONSTERS.junglefowl.huntTime;
    killMonster(s, a);
    const b = addMonster(s, 'junglefowl', 100, 100);
    b.huntT = MONSTERS.junglefowl.huntTime;
    killMonster(s, b);
    expect(got).toEqual(['junglefowl:flawless', 'junglefowl:swift']);
    // breaking the comb before the kill adds "parts" in front of "swift"
    const c = addMonster(s, 'junglefowl', 100, 100);
    for (const ps of Object.values(c.parts)) ps.broken = true;
    c.hitPlayer = true;
    killMonster(s, c);
    expect(s.medals.junglefowl).toEqual(['flawless', 'parts', 'swift']);
    expect(medalCount(s)).toBe(3);
  });

  it('survive a save round-trip and drop junk', () => {
    const s = game();
    s.medals = { tiger: ['flawless', 'veteran'], dhole: ['swift'] };
    const d = parseSave(serialize(s));
    expect(d?.medals).toEqual({ tiger: ['flawless', 'veteran'], dhole: ['swift'] });
    const junk = parseSave(JSON.stringify({ inv: {}, medals: { tiger: ['nope', 'parts'], dragon: ['flawless'], dhole: 'x' } }));
    expect(junk?.medals).toEqual({ tiger: ['parts'] });
    const t = game();
    if (d) applySave(t, d);
    expect(t.medals.tiger).toEqual(['flawless', 'veteran']);
    // old saves without medals load fine
    expect(parseSave(JSON.stringify({ inv: {} }))?.medals).toEqual({});
  });
});
