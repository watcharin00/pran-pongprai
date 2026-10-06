// Turns villager lines and hunt requests (core data) into Thai text.
import type { PartId, RequestDef } from '../data/types';
import type { NpcLine } from '../core/npc';
import * as th from '../i18n/th';
import { fmtItems } from './format';

export function requestText(r: RequestDef): string {
  const g = r.goal;
  if (g.type === 'collect') return th.request.collect(th.materials[g.item], g.count);
  if (g.type === 'veteran') return th.request.veteran(g.monster ? th.monsters[g.monster].name : null, g.count);
  const mon = th.monsters[g.monster].name;
  if (g.type === 'kill') return th.request.kill(mon, g.count);
  if (g.type === 'flawless') return th.request.flawless(mon);
  const part = (th.monsters[g.monster].parts as Partial<Record<PartId, string>>)[g.part] ?? g.part;
  return th.request.break(part, mon);
}

export function rewardText(r: RequestDef): string {
  const parts = [fmtItems(r.reward.items)];
  if (r.reward.potions) parts.push(th.request.potions(r.reward.potions));
  return parts.filter(Boolean).join(', ');
}

export function lineText(line: NpcLine, requestById: (id: string) => RequestDef | undefined): string {
  const S = th.npcSay;
  switch (line.key) {
    case 'smith.ready':
      return S.smithReady(th.weapons[line.weapon].name);
    case 'smith.need':
      return S.smithNeed(th.weapons[line.weapon].name, fmtItems(line.missing));
    case 'smith.allOwned':
      return S.smithAllOwned;
    case 'cook.full':
      return S.cookFull(th.meals[line.meal].name);
    case 'cook.eat':
      return S.cookEat(th.meals[line.meal].name, th.meals[line.meal].desc);
    case 'cook.need':
      return S.cookNeed(th.meals[line.meal].name, fmtItems(line.missing));
    case 'elder.ready': {
      const r = requestById(line.request);
      return S.elderReady(r ? requestText(r) : '');
    }
    case 'elder.progress': {
      const r = requestById(line.request);
      return S.elderProgress(r ? requestText(r) : '', line.progress, line.count);
    }
    case 'elder.wait':
      return S.elderWait;
    case 'elder.allDone':
      return S.elderAllDone;
    case 'kid.tip':
      return S.kidTips[line.n % S.kidTips.length] ?? '';
  }
}
