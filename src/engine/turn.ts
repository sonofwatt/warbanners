import { CONFIG } from './data/config';
import { UNITS } from './data/units';
import { applyReward, playerIncome } from './economy';
import { maxMp } from './movement';
import { cityById, freshAttacks, tileAt } from './state';
import type { Action, Handler } from './types';

// rules 5
export const endTurnHandler: Handler<Extract<Action, { type: 'endTurn' }>> = (s, _a, ev) => {
  const ending = s.current;

  // 1. An unchosen reward takes its first option. Option 0 never adds growth, so this ends;
  // the bound is a guard in case that ever changes.
  for (const city of s.cities) {
    if (city.owner !== ending) continue;
    let guard = city.pendingRewards.length + 4;
    while (city.pendingRewards.length > 0 && guard > 0) {
      applyReward(s, city, 0, ev);
      guard -= 1;
    }
  }

  // 2. Rest is earned by doing nothing; statuses wear off.
  for (const u of s.units) {
    if (u.owner !== ending) continue;
    u.rested = !u.moved && !u.acted;
    u.taunted = false;
    u.blinded = false;
    u.lure = null;
  }

  // 3. Hand the turn to the next living player.
  s.players[ending]!.turnsTaken += 1;
  s.stamp += 1;
  let next = ending;
  for (let i = 0; i < s.players.length; i++) {
    next = (next + 1) % s.players.length;
    if (s.players[next]!.alive) break;
  }
  s.current = next;

  // 4. The new player's income, rest healing and fresh movement.
  const player = s.players[next]!;
  if (player.turnsTaken > 0) {
    player.gold += playerIncome(s, next);
    for (const u of s.units) {
      if (u.owner !== next || !u.rested) continue;
      const cityId = tileAt(s, u.pos)?.cityId ?? null;
      const inHome = cityId !== null && cityById(s, cityId)?.owner === next;
      const heal = inHome ? CONFIG.restHeal.home : CONFIG.restHeal.away;
      u.hp = Math.min(UNITS[u.type].hp, u.hp + heal);
    }
  }
  for (const u of s.units) {
    if (u.owner !== next) continue;
    u.mp = maxMp(s, u);
    u.attacks = freshAttacks(u.type);
    u.moved = false;
    u.acted = false;
  }

  // 5.
  ev.push({ type: 'turnStarted', player: next });
  return null;
};
