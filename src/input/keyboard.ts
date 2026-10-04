// Keyboard: WASD/arrows to move, J/Enter attack (hold), 1/2/3 or U/I/O skills,
// Space/K roll, Q potion, F AUTO, M/Tab menu, Esc close.
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export type KeyCommand = 'attackDown' | 'skill0' | 'skill1' | 'skill2' | 'dodge' | 'potion' | 'auto' | 'menu' | 'close';

export class Keyboard {
  private readonly held = new Set<string>();
  attackHeld = false;
  /** `blocked()` true = ignore gameplay keys (menu open). Menu/close still work. */
  constructor(
    private readonly onCommand: (c: KeyCommand) => void,
    private readonly blocked: () => boolean,
  ) {
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
    window.addEventListener('blur', this.reset);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.down);
    window.removeEventListener('keyup', this.up);
    window.removeEventListener('blur', this.reset);
  }

  reset = (): void => {
    this.held.clear();
    this.attackHeld = false;
  };

  /** Raw (un-normalised) direction. */
  vector(): { x: number; y: number } {
    const h = this.held;
    let x = 0;
    let y = 0;
    if (h.has('KeyA') || h.has('ArrowLeft')) x--;
    if (h.has('KeyD') || h.has('ArrowRight')) x++;
    if (h.has('KeyW') || h.has('ArrowUp')) y--;
    if (h.has('KeyS') || h.has('ArrowDown')) y++;
    return { x, y };
  }

  private down = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const c = e.code;
    if (MOVE_KEYS.has(c)) {
      if (!this.blocked()) this.held.add(c);
      e.preventDefault();
      return;
    }
    if (e.repeat) return;
    if (c === 'Escape') return this.onCommand('close');
    if (c === 'KeyM' || c === 'Tab') {
      e.preventDefault();
      return this.onCommand('menu');
    }
    if (this.blocked()) return;
    if (c === 'KeyJ' || c === 'Enter') {
      this.attackHeld = true;
      this.onCommand('attackDown');
    } else if (c === 'Space' || c === 'KeyK') {
      e.preventDefault();
      this.onCommand('dodge');
    } else if (c === 'Digit1' || c === 'KeyU') this.onCommand('skill0');
    else if (c === 'Digit2' || c === 'KeyI') this.onCommand('skill1');
    else if (c === 'Digit3' || c === 'KeyO') this.onCommand('skill2');
    else if (c === 'KeyQ') this.onCommand('potion');
    else if (c === 'KeyF') this.onCommand('auto');
  };

  private up = (e: KeyboardEvent): void => {
    this.held.delete(e.code);
    if (e.code === 'KeyJ' || e.code === 'Enter') this.attackHeld = false;
  };
}
