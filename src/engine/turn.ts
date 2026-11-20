import { CONFIG } from './data/config';
import { UNITS } from './data/units';
import { applyReward, playerIncome } from './economy';
import { maxMp } from './movement';
import { DIRS, add, key, parseKey } from './hex';
import type { HexKey } from './hex';
import { cityById, freshAttacks, tileAt, unitAt } from './state';
import { canSeeUnit, visibleTiles } from './vision';
import type { Action, Handler, MatchState, Unit } from './types';

// rules 11: what resting would heal the unit where it stands (before the cap at full health): by whose land it
// is on, and nothing while an enemy unit its owner can see stands on a tile next to it (an unseen one changes
// nothing, so the healing never gives it away). `visible` is visibleTiles(s, u.owner), passed in by callers
// that ask about many units.
export function restHealAt(s: MatchState, u: Unit, visible: ReadonlySet<HexKey> = visibleTiles(s, u.owner)): number {
  const at = parseKey(u.pos);
  const seenEnemy = (k: HexKey): boolean => {
    const o = unitAt(s, k);
    return o !== undefined && o.owner !== u.owner && canSeeUnit(s, u.owner, o, visible);
  };
  if (DIRS.some((d) => seenEnemy(key(add(at, d))))) return 0;
  const cityId = tileAt(s, u.pos)?.cityId ?? null;
  if (cityId === null) return CONFIG.restHeal.neutral;
  const owner = cityById(s, cityId)?.owner;
  if (owner === undefined) return CONFIG.restHeal.neutral;
  return owner === u.owner ? CONFIG.restHeal.home : CONFIG.restHeal.enemy;
}

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

  // 4. The new player's income, rest healing, fresh movement, and units spawned last turn may act.
  const player = s.players[next]!;
  if (player.turnsTaken > 0) {
    player.gold += playerIncome(s, next);
    const visible = visibleTiles(s, next);   // every heal is worked out before any is applied: health changes no vision
    for (const u of s.units) {
      if (u.owner !== next || !u.rested) continue;
      u.hp = Math.min(UNITS[u.type].hp, u.hp + restHealAt(s, u, visible));
    }
  }
  for (const u of s.units) {
    if (u.owner !== next) continue;
    u.mp = maxMp(s, u);
    u.attacks = freshAttacks(u.type);
    u.moved = false;
    u.acted = false;
    u.fresh = false;
  }

  // 5.
  ev.push({ type: 'turnStarted', player: next });
  return null;
};
