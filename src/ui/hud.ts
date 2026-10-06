// Minimal HUD: HP/stamina, meal chip, one-line goal, AUTO + one icon per menu tab, slim monster bar, toasts, zone banner.
import { MEALS, MONSTERS } from '../data';
import type { PartId } from '../data/types';
import { findMonster } from '../core/combat';
import { goalIndex } from '../core/inventory';
import type { GameState, MonsterState } from '../core/state';
import * as th from '../i18n/th';
import { $, ICONS, fmtTime } from './format';
import { TABS, type Tab } from './sheet';
import { Minimap } from './minimap';

export interface LogEntry {
  msg: string;
  cls: '' | 'gold' | 'bad';
}

export class Hud {
  readonly root: HTMLElement;
  readonly log: LogEntry[] = [];
  private zoneTimer = 0;
  private partsKey = '';
  onLog: (() => void) | null = null;
  readonly minimap: Minimap;

  constructor(
    overlay: HTMLElement,
    handlers: { onAuto: () => void; onMenu: (tab: Tab) => void; onGoal: () => void },
  ) {
    const h = th.hud.keyboardHint;
    overlay.insertAdjacentHTML(
      'beforeend',
      `<div class="top">
        <div class="hpbox">
          <div class="bar"><i id="hpFill"></i><span id="hpTxt">100</span></div>
          <div class="bar st"><i id="stFill"></i></div>
          <div class="sub">
            <span id="mealChip" class="chip" hidden><span class="sw" id="mealSw"></span><span id="mealName"></span><b id="mealTime"></b></span>
            <button id="goalLine" type="button"><b>${th.hud.goal}</b><span id="goalT"></span></button>
          </div>
          <canvas id="minimap" role="button" aria-label="${th.menu.tabs.map}"></canvas>
        </div>
        <div id="boss" hidden>
          <div class="bhead"><b id="bName"></b><span class="parts" id="bParts"></span><span id="bTime" class="tm"></span></div>
          <div class="bar"><i id="bHp"></i></div>
        </div>
        <div class="rcol">
          <div class="tbtns">
            <button id="autoBtn" class="tb" type="button" aria-pressed="false"><span class="dot"></span>${th.hud.auto}</button>
          </div>
          <nav class="mbtns" aria-label="${th.hud.menu}">${TABS.map((t) => `<button class="tb mb" type="button" data-menu="${t}" aria-label="${th.menu.tabs[t]}" title="${th.menu.tabs[t]}">${ICONS[`tab_${t}`]}</button>`).join('')}</nav>
        </div>
        <ul id="toasts"></ul>
      </div>
      <div id="zone"></div>
      <div class="hint"><kbd>WASD</kbd> ${h.move} · <kbd>J</kbd> ${h.attack} · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> ${h.skills} · <kbd>Space</kbd> ${h.dodge} · <kbd>Q</kbd> ${h.potion} · <kbd>F</kbd> ${h.auto} · <kbd>M</kbd> ${h.menu}</div>`,
    );
    this.root = overlay;
    $(overlay, '#autoBtn').addEventListener('click', handlers.onAuto);
    overlay.querySelectorAll<HTMLElement>('[data-menu]').forEach((b) => b.addEventListener('click', () => handlers.onMenu(b.dataset.menu as Tab)));
    $(overlay, '#goalLine').addEventListener('click', handlers.onGoal);
    const mm = $(overlay, '#minimap') as HTMLCanvasElement;
    this.minimap = new Minimap(mm);
    mm.addEventListener('click', () => handlers.onMenu('map'));
  }

  private q(sel: string): HTMLElement {
    return $(this.root, sel);
  }

  toast(msg: string, cls: LogEntry['cls'] = ''): void {
    this.log.unshift({ msg, cls });
    if (this.log.length > 40) this.log.pop();
    const ul = this.q('#toasts');
    const li = document.createElement('li');
    li.textContent = msg;
    if (cls) li.className = cls;
    ul.appendChild(li);
    // never more than two lines on screen
    while (ul.children.length > 2) ul.firstChild?.remove();
    setTimeout(() => {
      li.classList.add('out');
      setTimeout(() => li.remove(), 520);
    }, 3200);
    this.onLog?.();
  }

  showZone(name: string): void {
    const z = this.q('#zone');
    z.textContent = name;
    z.classList.add('show');
    clearTimeout(this.zoneTimer);
    this.zoneTimer = window.setTimeout(() => z.classList.remove('show'), 1800);
  }

  update(s: GameState): void {
    const p = s.player;
    this.q('#hpFill').style.width = `${(p.hp / p.maxHp) * 100}%`;
    this.q('#hpTxt').textContent = `${Math.ceil(p.hp)}/${p.maxHp}`;
    this.q('#stFill').style.width = `${(p.st / p.maxSt) * 100}%`;

    const chip = this.q('#mealChip');
    if (p.meal && p.meal.until > s.now) {
      chip.hidden = false;
      this.q('#mealSw').style.background = MEALS[p.meal.id].color;
      this.q('#mealName').textContent = th.meals[p.meal.id].desc;
      this.q('#mealTime').textContent = fmtTime((p.meal.until - s.now) / 1000);
    } else chip.hidden = true;

    this.q('#goalT').textContent = th.goals[goalIndex(s)]?.title ?? '';
    const ab = this.q('#autoBtn');
    ab.classList.toggle('on', s.autoOn);
    ab.setAttribute('aria-pressed', String(s.autoOn));
    this.updateBoss(s);
  }

  private updateBoss(s: GameState): void {
    const p = s.player;
    const locked = findMonster(s, p.lockId);
    const m: MonsterState | undefined = locked && locked.aggro ? locked : s.monsters.find((x) => x.aggro && Math.hypot(x.x - p.x, x.y - p.y) < 220);
    const box = this.q('#boss');
    if (!m) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const def = MONSTERS[m.kind];
    const names = th.monsters[m.kind];
    this.q('#bName').textContent = (m.vet ? th.hud.veteran(names.name) : names.name) + (m.rage ? th.hud.enraged : '') + (m.mode === 'stun' ? th.hud.stunned : '');
    const bt = this.q('#bTime');
    bt.textContent = m.huntT !== null ? fmtTime(m.huntT) : '';
    bt.classList.toggle('low', m.huntT !== null && m.huntT < 15);
    this.q('#bHp').style.width = `${Math.max(0, (m.hp / m.maxHp) * 100)}%`;
    const partIds = Object.keys(def.parts) as PartId[];
    const key = m.id + partIds.map((k) => (m.parts[k]?.broken ? 1 : 0)).join('');
    if (key !== this.partsKey) {
      this.partsKey = key;
      const partNames = names.parts as Partial<Record<PartId, string>>;
      this.q('#bParts').innerHTML = partIds
        .map((k) => {
          const broken = !!m.parts[k]?.broken;
          return `<span class="${broken ? 'br' : ''}">${partNames[k] ?? k}${broken ? th.hud.partBroken : ''}</span>`;
        })
        .join('');
    }
  }
}
