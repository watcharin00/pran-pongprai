// Floating joystick: touch anywhere on the left part of the screen and drag.
// The base appears where the finger lands; when idle a faint stick rests bottom-left.
import { TUNING } from '../data';

const I = TUNING.input;

export class Joystick {
  private pointerId: number | null = null;
  private bx = 0;
  private by = 0;
  /** -1..1 per axis, magnitude ≤ 1 */
  vx = 0;
  vy = 0;
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;

  /**
   * `onTap` gets first look at every press (e.g. tapping a monster to lock on);
   * returning true consumes it.
   */
  constructor(
    private readonly surface: HTMLElement,
    overlay: HTMLElement,
    private readonly onTap: (clientX: number, clientY: number) => boolean,
    private readonly enabled: () => boolean,
  ) {
    this.base = document.createElement('div');
    this.base.id = 'joy';
    this.base.className = 'idle';
    this.knob = document.createElement('div');
    this.knob.id = 'knob';
    this.base.appendChild(this.knob);
    overlay.appendChild(this.base);
    surface.addEventListener('pointerdown', this.down);
    surface.addEventListener('pointermove', this.move);
    surface.addEventListener('pointerup', this.end);
    surface.addEventListener('pointercancel', this.end);
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
    this.placeIdle();
  }

  get active(): boolean {
    return this.pointerId !== null;
  }

  release(): void {
    this.pointerId = null;
    this.vx = this.vy = 0;
    this.placeIdle();
  }

  placeIdle(): void {
    this.base.classList.add('idle');
    this.base.style.left = `${Math.max(84, innerWidth * 0.16)}px`;
    this.base.style.top = `${innerHeight - Math.max(110, innerHeight * 0.17)}px`;
    this.knob.style.transform = '';
  }

  private down = (e: PointerEvent): void => {
    e.preventDefault();
    this.surface.focus({ preventScroll: true });
    if (!this.enabled()) return;
    if (this.onTap(e.clientX, e.clientY)) return;
    if (e.clientX < innerWidth * I.joystickArea && this.pointerId === null) {
      this.pointerId = e.pointerId;
      this.bx = e.clientX;
      this.by = e.clientY;
      this.vx = this.vy = 0;
      try {
        this.surface.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
      this.base.classList.remove('idle');
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
      this.knob.style.transform = '';
    }
  };

  private move = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    const R = I.joystickRadius;
    const dx = e.clientX - this.bx;
    const dy = e.clientY - this.by;
    const d = Math.hypot(dx, dy);
    const k = d > R ? R / d : 1;
    this.vx = (dx * k) / R;
    this.vy = (dy * k) / R;
    this.knob.style.transform = `translate(${dx * k}px,${dy * k}px)`;
  };

  private end = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.release();
  };
}
