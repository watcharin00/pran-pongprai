import { generateMap, T } from '../src/core/mapgen';
import { createMonster } from '../src/core/monsterAI';
import { createGame, step } from '../src/core/sim';
import { emptyIntent, type GameState, type Intent, type MonsterState } from '../src/core/state';
import type { MonsterId } from '../src/data/types';

export const MAP = generateMap();
export const NOW = 1_700_000_000_000;

export function game(): GameState {
  return createGame({ rngSeed: 42, now: NOW, map: MAP, noMonsters: true });
}

/** An open forest tile far from the village, where nothing blocks movement. */
export function openSpot(s: GameState): { x: number; y: number } {
  for (const [tx, ty] of s.map.forestCells) {
    let open = true;
    for (let dy = -3; dy <= 3 && open; dy++) for (let dx = -4; dx <= 4 && open; dx++) {
      const t = s.map.tiles[(ty + dy) * 64 + tx + dx];
      if (t !== 0 && t !== 12) open = false;
    }
    if (open) return { x: tx * T + 8, y: ty * T + 8 };
  }
  throw new Error('no open spot');
}

export function addMonster(s: GameState, kind: MonsterId, x: number, y: number, dirX: 1 | -1 = 1): MonsterState {
  const m = createMonster(s.nextId++, kind, x, y, dirX);
  s.monsters.push(m);
  return m;
}

export function intent(p: Partial<Intent> = {}): Intent {
  return { ...emptyIntent(), ...p };
}

/** Runs the sim at 60 fps. `make` builds the intent each frame. */
export function run(s: GameState, seconds: number, make: () => Intent = () => intent(), until?: () => boolean): number {
  const dt = 1 / 60;
  let t = 0;
  while (t < seconds) {
    step(s, make(), dt, s.now + dt * 1000);
    t += dt;
    if (until?.()) break;
  }
  return t;
}
