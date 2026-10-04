// Merges human input and AUTO into the single Intent the simulation consumes.
import { TUNING } from '../data';
import type { Vec2 } from '../core/events';
import { emptyIntent, type Intent } from '../core/state';

/** Raw human input for one frame (from joystick + keyboard + buttons). */
export interface HumanInput {
  move: Vec2 | null;
  attackHeld: boolean;
  skills: [boolean, boolean, boolean];
  dodge: boolean;
  potion: boolean;
  lockId: number | null;
}

export const emptyHuman = (): HumanInput => ({ move: null, attackHeld: false, skills: [false, false, false], dodge: false, potion: false, lockId: null });

/**
 * Touching the stick hands control back to the player instantly; AUTO waits
 * `manualOverride` seconds after release before resuming. Button presses from the
 * player always go through, so they can roll or fire skills while AUTO walks.
 */
export class IntentMixer {
  private manualT = 0;

  /** True while the player's stick input is suppressing AUTO. */
  get autoSuspended(): boolean {
    return this.manualT > 0;
  }

  mix(human: HumanInput, auto: (() => Intent) | null, dt: number): Intent {
    if (human.move) this.manualT = TUNING.auto.manualOverride;
    else this.manualT = Math.max(0, this.manualT - dt);

    const base = auto && this.manualT <= 0 ? auto() : emptyIntent();
    return {
      move: human.move ?? base.move,
      attack: human.attackHeld || base.attack,
      targetId: human.attackHeld ? null : base.targetId,
      skills: [human.skills[0] || base.skills[0], human.skills[1] || base.skills[1], human.skills[2] || base.skills[2]],
      dodge: human.dodge, // AUTO never rolls
      potion: human.potion || base.potion,
      lockId: human.lockId,
    };
  }
}

/** Normalises a stick/keyboard vector, applying the dead-zone to analog input. */
export function normaliseMove(x: number, y: number, deadzone = 0): Vec2 | null {
  const m = Math.hypot(x, y);
  if (m === 0 || m <= deadzone) return null;
  return { x: x / m, y: y / m };
}
