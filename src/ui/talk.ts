// Turns villager lines and hunt requests (core data) into Thai text.
import { MONSTERS } from '../data';
import type { MonsterId, PartId, RequestDef } from '../data/types';
import type { NpcLine } from '../core/npc';
import * as th from '../i18n/th';
import { fmtItems } from './format';
import { monsterWhere } from './itemInfo';

export function requestText(r: RequestDef): string {
  const g = r.goal;
  if (g.type === 'collect') return th.request.collect(th.materials[g.item], g.count);
  if (g.type === 'veteran') return th.request.veteran(g.monster ? th.monsters[g.monster].name : null, g.count);
  if (g.type === 'alpha') return th.request.alpha(g.monster ? th.monsters[g.monster].name : null, g.count);
  const mon = th.monsters[g.monster].name;
  if (g.type === 'kill') return th.request.kill(mon, g.count);
  if (g.type === 'flawless') return th.request.flawless(mon);
  if (g.type === 'swift') return th.request.swift(mon);
  const part = (th.monsters[g.monster].parts as Partial<Record<PartId, string>>)[g.part] ?? g.part;
  return th.request.break(part, mon);
}

export function rewardText(r: RequestDef): string {
  const parts = [fmtItems(r.reward.items)];
  if (r.reward.potions) parts.push(th.request.potions(r.reward.potions));
  return parts.filter(Boolean).join(', ');
}

/** Thai name of a monster's hardest-hitting attack. */
function hardestAttack(k: MonsterId): string {
  const a = [...MONSTERS[k].attacks].sort((x, y) => y.damage - x.damage)[0];
  return a ? ((th.monsters[k].attacks as Record<string, string>)[a.id] ?? a.id) : '';
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
    case 'healer.brew':
      return S.healerBrew(line.potions);
    case 'healer.plant':
      return S.healerPlant(th.crops[line.crop].name, th.meals[line.meal].name);
    case 'healer.seed':
      return S.healerSeed(th.crops[line.crop].name, th.crops[line.crop].source);
    case 'healer.potions':
      return S.healerPotions(line.potions);
    case 'farmer.ripe':
      return S.farmerRipe(line.n);
    case 'farmer.plant':
      return S.farmerPlant(th.crops[line.crop].name, line.free);
    case 'farmer.seed':
      return S.farmerSeed(th.crops[line.crop].name, th.crops[line.crop].source);
    case 'farmer.happy':
      return S.farmerHappy;
    case 'hunter.boss': {
      const def = MONSTERS[line.monster];
      return S.hunterBoss(th.monsters[line.monster].name, monsterWhere(line.monster), def.weakTo ? th.weaponTypes[def.weakTo] : null, hardestAttack(line.monster));
    }
    case 'hunter.done':
      return S.hunterDone;
    case 'ranger.boss': {
      const def = MONSTERS[line.monster];
      if (line.hunted) return S.rangerHunted(th.monsters[line.monster].name);
      return S.rangerBoss(th.monsters[line.monster].name, def.weakTo ? th.weaponTypes[def.weakTo] : null, hardestAttack(line.monster), def.attacks.some((a) => a.shape === 'circle' && a.offset < 0));
    }
    case 'ranger.home':
      return S.rangerHome;
  }
}
