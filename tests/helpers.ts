import { generateMap, T, VILLAGE } from '../src/core/mapgen';
import { createMonster } from '../src/core/monsterAI';
import { createGame, step } from '../src/core/sim';
import { emptyIntent, type GameState, type Intent, type MonsterState } from '../src/core/state';
import type { MonsterId } from '../src/data/types';

export const MAP = generateMap();
export const NOW = 1_700_000_000_000;

export function game(): GameState {
  return createGame({ rngSeed: 42, now: NOW, map: MAP, noMonsters: true });
}

/** An open tile well clear of the village, where nothing blocks movement (forest first, then any open ground). */
export function openSpot(s: GameState): { x: number; y: number } {
  const OPEN = new Set([0, 5, 12]); // grass, sand, flowers
  const clear = (tx: number, ty: number): boolean => {
    if (tx >= VILLAGE.x0 - 2 && tx <= VILLAGE.x1 + 2 && ty >= VILLAGE.y0 - 2 && ty <= VILLAGE.y1 + 2) return false;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = tx + dx;
      const y = ty + dy;
      if (x < 0 || y < 0 || x >= 64 || y >= 48 || !OPEN.has(s.map.tiles[y * 64 + x] ?? 1)) return false;
    }
    return true;
  };
  const all: [number, number][] = [];
  for (let y = 0; y < 48; y++) for (let x = 0; x < 64; x++) all.push([x, y]);
  for (const [tx, ty] of [...s.map.forestCells, ...all]) if (clear(tx, ty)) return { x: tx * T + 8, y: ty * T + 8 };
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
