import { describe, expect, it } from 'vitest';
import { MONSTERS, REQUESTS, TUNING } from '../src/data';
import type { WeaponId } from '../src/data/types';
import { killMonster } from '../src/core/combat';
import { alphasUnlocked, createMonster, spawnMonster } from '../src/core/monsterAI';
import { currentRequest } from '../src/core/requests';
import { addMonster, game } from './helpers';

const V = TUNING.veteran;
const A = TUNING.alpha;
const ALL_AREAS: WeaponId[] = ['bamboobow', 'cleaver', 'coreblade', 'tigerspear', 'cobrafang', 'lizardbow', 'bearblade', 'kingbow', 'nagamaul', 'pearlbow', 'catbow'];

const postgame = (): ReturnType<typeof game> => {
  const s = game();
  ALL_AREAS.forEach((w) => s.owned.add(w));
  return s;
};

describe('alphas (post-game)', () => {
  it('only appear once the last area weapon is forged', () => {
    const s = game();
    ALL_AREAS.slice(0, -1).forEach((w) => s.owned.add(w));
    expect(alphasUnlocked(s)).toBe(false);
    for (let i = 0; i < 100; i++) {
      expect(spawnMonster(s, 'dhole')?.alpha ?? false).toBe(false);
      s.monsters = [];
    }
    const late = postgame();
    expect(alphasUnlocked(late)).toBe(true);
    let alphas = 0;
    for (let i = 0; i < 300; i++) {
      const m = spawnMonster(late, 'dhole');
      if (m?.alpha) {
        alphas++;
        expect(m.vet).toBe(true);
      }
      late.monsters = [];
    }
    expect(alphas).toBeGreaterThan(300 * A.chance * 0.5);
    expect(alphas).toBeLessThan(300 * A.chance * 1.6);
  });

  it('are tougher than veterans: their multipliers stack', () => {
    const def = MONSTERS.panther;
    const vet = createMonster(1, 'panther', 0, 0, 1, true);
    const alpha = createMonster(2, 'panther', 0, 0, 1, false, true);
    expect(alpha.vet).toBe(true);
    expect(alpha.hp).toBe(Math.round(def.hp * V.hpMul * A.hpMul));
    expect(alpha.hp).toBeGreaterThan(vet.hp);
    expect(alpha.parts.head?.hp).toBe(Math.round((def.parts.head?.hp ?? 0) * V.partHpMul * A.partHpMul));
  });

  it('drop extra hunter seals', () => {
    const s = postgame();
    const vet = addMonster(s, 'dhole', 100, 100);
    vet.vet = true;
    killMonster(s, vet);
    const afterVet = s.inv.seal;
    expect(afterVet).toBe(V.seals);
    const alpha = addMonster(s, 'dhole', 100, 100);
    Object.assign(alpha, { vet: true, alpha: true });
    killMonster(s, alpha);
    expect(s.inv.seal - afterVet).toBe(V.seals + A.seals);
  });
});

describe('post-game challenge requests', () => {
  const upTo = (s: ReturnType<typeof game>, id: string): void => {
    for (const r of REQUESTS) {
      if (r.id === id) break;
      s.requests.done.add(r.id);
    }
  };

  it('a swift request only counts a kill with half the hunt timer left', () => {
    const s = postgame();
    upTo(s, 'swiftcobra');
    expect(currentRequest(s)?.id).toBe('swiftcobra');
    const slow = addMonster(s, 'kingcobra', 100, 100);
    slow.huntT = MONSTERS.kingcobra.huntTime * 0.3;
    killMonster(s, slow);
    expect(s.requests.progress).toBe(0);
    const fast = addMonster(s, 'kingcobra', 100, 100);
    fast.huntT = MONSTERS.kingcobra.huntTime * 0.8;
    killMonster(s, fast);
    expect(s.requests.progress).toBe(1);
  });

  it('alpha requests only count alphas', () => {
    const s = postgame();
    upTo(s, 'alphafirst');
    expect(currentRequest(s)?.id).toBe('alphafirst');
    const vet = addMonster(s, 'dhole', 100, 100);
    vet.vet = true;
    killMonster(s, vet);
    expect(s.requests.progress).toBe(0);
    const alpha = addMonster(s, 'dhole', 100, 100);
    Object.assign(alpha, { vet: true, alpha: true });
    killMonster(s, alpha);
    expect(s.requests.progress).toBe(1);
  });

  it('challenges reward hunter seals, the currency of +6..+10 upgrades', () => {
    const post = REQUESTS.filter((r) => r.goal.type === 'swift' || r.goal.type === 'alpha');
    expect(post.length).toBeGreaterThanOrEqual(5);
    for (const r of post) expect(r.reward.items.seal ?? 0).toBeGreaterThan(0);
  });
});
