// Thumb-arc action pad (bottom-right). Buttons sit on an arc around the attack
// button; radius/angle/size per button match the prototype's data-r/data-a/data-s.
import { NPCS, SKILLS, TUNING } from '../data';
import { dodgeCost } from '../core/inventory';
import { weaponSkills } from '../core/skills';
import type { GameState } from '../core/state';
import { requestReady } from '../core/requests';
import type { ContextAction } from '../core/village';
import * as th from '../i18n/th';
import { $ } from './format';
import { padFaceUrl, skillFaceUrl } from '../art/padIcons';

interface Slot {
  id: string;
  r: number;
  a: number;
  s: number;
}
const SLOTS: Slot[] = [
  { id: 'bAtk', r: 0, a: 0, s: 86 },
  { id: 'bDodge', r: 104, a: 182, s: 62 },
  { id: 'bS0', r: 104, a: 138, s: 58 },
  { id: 'bS1', r: 104, a: 94, s: 58 },
  { id: 'bS2', r: 172, a: 158, s: 58 },
  { id: 'bPot', r: 168, a: 116, s: 48 },
];
const MIN_BUTTON = 44;

export interface PadHandlers {
  attackDown: () => void;
  attackUp: () => void;
  dodge: () => void;
  skill: (i: number) => void;
  potion: () => void;
}

export class ActionPad {
  private readonly root: HTMLElement;
  /** skill ids currently shown on the three skill buttons */
  private shown = '';

  constructor(overlay: HTMLElement, h: PadHandlers) {
    overlay.insertAdjacentHTML(
      'beforeend',
      `<div class="pad" id="pad">
        <button id="bAtk" class="pb atk" type="button"><span class="lbl" id="atkLbl">${th.hud.attack}</span></button>
        <button id="bDodge" class="pb dodge" type="button"><span class="lbl">${th.hud.dodge}</span></button>
        <button id="bS0" class="pb sk" type="button"></button>
        <button id="bS1" class="pb sk" type="button"></button>
        <button id="bS2" class="pb sk" type="button"></button>
        <button id="bPot" class="pb pot" type="button" aria-label="${th.hud.drinkPotion}"><span class="n" id="potN">2</span></button>
      </div>`,
    );
    this.root = $(overlay, '#pad');
    // pixel-art faces (frame + disc + icon) painted procedurally, like the sprites
    const faces: [string, Parameters<typeof padFaceUrl>[0]][] = [['#bAtk', 'attack'], ['#bDodge', 'dodge'], ['#bPot', 'potion']];
    for (const [sel, f] of faces) this.q(sel).style.backgroundImage = `url(${padFaceUrl(f)})`;
    hold(this.q('#bAtk'), h.attackDown, h.attackUp);
    hold(this.q('#bDodge'), h.dodge);
    hold(this.q('#bS0'), () => h.skill(0));
    hold(this.q('#bS1'), () => h.skill(1));
    hold(this.q('#bS2'), () => h.skill(2));
    hold(this.q('#bPot'), h.potion);
    this.layout();
  }

  private q(sel: string): HTMLElement {
    return $(this.root, sel);
  }

  /**
   * Narrow phones (< 430px) shrink the arc to 84%; short screens (phone landscape)
   * shrink it with the height so the pad never covers half the view. No button below 44px.
   */
  layout(): void {
    const byWidth = innerWidth < 430 ? 0.84 : 1;
    const byHeight = innerHeight < 520 ? Math.max(0.72, innerHeight / 500) : 1;
    const k = Math.min(byWidth, byHeight);
    for (const slot of SLOTS) {
      const b = this.q(`#${slot.id}`);
      const r = slot.r * k;
      const a = (slot.a * Math.PI) / 180;
      const size = Math.max(MIN_BUTTON, slot.s * k);
      b.style.width = b.style.height = `${size}px`;
      b.style.right = `${42 - r * Math.cos(a) - size / 2}px`;
      b.style.bottom = `${42 + r * Math.sin(a) - size / 2}px`;
    }
  }

  update(s: GameState, ctx: ContextAction | null): void {
    const p = s.player;
    this.q('#potN').textContent = String(p.potions);
    this.q('#bPot').classList.toggle('off', p.potions <= 0);
    this.q('#bDodge').classList.toggle('off', p.dodgeCd > 0 || p.st < dodgeCost(s));
    const ids = weaponSkills(p.weapon);
    const key = ids.join();
    if (key !== this.shown) {
      // the weapon changed: relabel the same three buttons (no new HUD elements)
      this.shown = key;
      ids.forEach((id, i) => {
        const b = this.q(`#bS${i}`);
        b.style.backgroundImage = `url(${skillFaceUrl(SKILLS[id].kind)})`;
        b.innerHTML = `<span class="lbl">${th.skills[id].name}</span><i class="cdo"></i><span class="cdn"></span>`;
      });
    }
    ids.forEach((id, i) => {
      const b = this.q(`#bS${i}`);
      const cd = p.cds[i as 0 | 1 | 2];
      b.style.setProperty('--p', String(cd / SKILLS[id].cooldown));
      const n = b.querySelector('.cdn');
      if (n) n.textContent = cd > 0 ? String(Math.ceil(cd)) : '';
      // while cooling down the number replaces the name
      b.classList.toggle('cooling', cd > 0);
    });
    const atk = this.q('#bAtk');
    if (atk.classList.contains('ctx') !== !!ctx) atk.style.backgroundImage = `url(${padFaceUrl(ctx ? 'context' : 'attack')})`;
    atk.classList.toggle('ctx', !!ctx);
    this.q('#atkLbl').textContent = contextLabel(s, ctx);
  }
}

function hold(el: HTMLElement, down: () => void, up?: () => void): void {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.classList.add('down');
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    down();
  });
  const release = (): void => {
    if (!el.classList.contains('down')) return;
    el.classList.remove('down');
    up?.();
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('lostpointercapture', release);
}

/** The attack button's text: a context action, a villager's name, or "attack". */
function contextLabel(s: GameState, ctx: ContextAction | null): string {
  if (!ctx) return th.hud.attack;
  if (ctx.kind !== 'npc') return th.context[ctx.kind];
  if (NPCS[ctx.npc].role === 'requests' && requestReady(s)) return th.request.claim;
  if (NPCS[ctx.npc].role === 'herbs' && s.inv.herb >= TUNING.player.potion.herbCost) return th.context.brew;
  return th.context.npc[NPCS[ctx.npc].role];
}
