import { abilityHandler } from './abilities';
import { attackHandler } from './combat';
import { buildHandler, harvestHandler, rewardHandler, roadHandler, wallsHandler } from './economy';
import { canCapture, canClaimTreasure, captureHandler, claimTreasureHandler, resignHandler } from './capture';
import { canUseItem, useItemHandler } from './items';
import { canHunker, endHunker, hunkerHandler } from './hunker';
import { researchHandler } from './tech';
import { campTrainHandler, trainHandler } from './training';
import { endTurnHandler } from './turn';
import { moveHandler } from './movement';
import { payConnections } from './connect';
import { refreshExplored } from './vision';
import { CONFIG } from './data/config';
import { TECHS } from './data/techs';
import { UNITS } from './data/units';
import { key, neighbors, parseKey } from './hex';
import { abilityTargets } from './abilities';
import { attackTargets, lureApplies } from './combat';
import { reachable } from './movement';
import { createMatch, hasTrait, tileAt, unitAt } from './state';
import { canResearch } from './tech';
import { buildRefusal, harvestRefusal, rewardRefusal, roadRefusal, wallsRefusal } from './economy';
import { campTrainRefusal, trainRefusal } from './training';
import { ABILITIES } from './types';
import type {
  Action, BuildingId, GameEvent, Handler, MatchSettings, MatchState, Result, TechId, UnitTypeId,
} from './types';

// Later tasks register their action handlers here.
export const HANDLERS: Partial<Record<Action['type'], Handler<any>>> = {
  move: moveHandler,
  attack: attackHandler,
  ability: abilityHandler,
  harvest: harvestHandler,
  build: buildHandler,
  road: roadHandler,
  buildWalls: wallsHandler,
  chooseReward: rewardHandler,
  research: researchHandler,
  train: trainHandler,
  campTrain: campTrainHandler,
  capture: captureHandler,
  claimTreasure: claimTreasureHandler,
  useItem: useItemHandler,
  hunker: hunkerHandler,
  resign: resignHandler,
  endTurn: endTurnHandler,
};

export function applyAction(state: MatchState, action: Action): Result {
  // The action is untrusted: every read of it happens inside the try, and the handlers only ever see a
  // plain copy taken once, so a throwing getter or Proxy trap, or a getter that answers differently
  // each time it is read, cannot throw out of here or slip past a check. Every read of the state is
  // inside the try as well, so a missing or malformed state is refused rather than thrown.
  try {
    const winner: unknown = state.winner;
    if (typeof winner === 'number') return { ok: false, reason: 'match over' };
    if (winner !== null) return { ok: false, reason: 'invalid action' };
    const copy: unknown = JSON.parse(JSON.stringify(action));
    const type = typeof copy === 'object' && copy !== null ? (copy as { type?: unknown }).type : undefined;
    if (typeof type !== 'string' || !Object.prototype.hasOwnProperty.call(HANDLERS, type)) {
      return { ok: false, reason: 'unknown action' };
    }
    const handler = HANDLERS[type as Action['type']]!;
    const draft = structuredClone(state);
    const events: GameEvent[] = [];
    const actor = draft.current;
    // rules 7: any action of a hunkered unit's own (move, attack, ability, capture, claim, drink, camp training) ends
    // its hunker before the action is worked out, so it has no hunker defence against a counter. A refusal drops the draft.
    const own = (copy as { unit?: unknown }).unit;
    if (type !== 'hunker' && typeof own === 'number') {
      const u = draft.units.find((x) => x.id === own);
      if (u !== undefined && u.owner === actor) endHunker(u, events);
    }
    const reason = handler(draft, copy as Action, events);
    if (reason !== null) return { ok: false, reason };
    if (draft.players[actor]?.alive === true) payConnections(draft, actor, events);   // rules 7, for the player who acted
    for (const p of draft.players) if (p.alive) refreshExplored(draft, p.id);
    return { ok: true, state: draft, events };
  } catch {
    return { ok: false, reason: 'invalid action' };
  }
}

// Every action applyAction would accept for the current player, in a fixed order. Built from the query
// and refusal functions the handlers themselves use, never by trying each candidate.
export function legalActions(s: MatchState): Action[] {
  if (s.winner !== null) return [];
  const out: Action[] = [];
  const me = s.current;
  const unitTypes = Object.keys(UNITS) as UnitTypeId[];
  const tileKeys = Object.keys(s.tiles).sort();

  for (const u of [...s.units].sort((x, y) => x.id - y.id)) {
    if (u.owner !== me) continue;
    for (const to of Object.keys(reachable(s, u.id)).sort()) out.push({ type: 'move', unit: u.id, to });
    for (const target of attackTargets(s, u.id)) {
      out.push({ type: 'attack', unit: u.id, target });
      // An attack asking for a lure where none can apply is also accepted (the lure is ignored), but it is
      // the same move as the plain attack, so the lure variant is listed only where lureApplies.
      const victim = unitAt(s, target);
      if (victim !== undefined && lureApplies(s, u, victim)) {
        out.push({ type: 'attack', unit: u.id, target, lure: true });
      }
    }
    for (const ability of ABILITIES) {
      for (const target of abilityTargets(s, u.id, ability)) out.push({ type: 'ability', unit: u.id, ability, target });
    }
    if (canCapture(s, u.id)) out.push({ type: 'capture', unit: u.id });
    if (canClaimTreasure(s, u.id)) out.push({ type: 'claimTreasure', unit: u.id });
    if (canUseItem(s, u.id)) out.push({ type: 'useItem', unit: u.id });
    if (canHunker(s, u.id)) out.push({ type: 'hunker', unit: u.id });
    if (hasTrait(u, 'camp')) {
      const around = neighbors(parseKey(u.pos)).map(key).filter((k) => tileAt(s, k) !== undefined).sort();
      for (const unitType of unitTypes) {
        for (const to of around) {
          if (campTrainRefusal(s, u.id, unitType, to) === null) out.push({ type: 'campTrain', unit: u.id, unitType, to });
        }
      }
    }
  }

  for (const c of [...s.cities].sort((x, y) => x.id - y.id)) {
    if (c.owner !== me) continue;
    for (const unitType of unitTypes) {
      if (trainRefusal(s, c.id, unitType) === null) out.push({ type: 'train', city: c.id, unitType });
    }
    if (wallsRefusal(s, c.id) === null) out.push({ type: 'buildWalls', city: c.id });
    for (const choice of [0, 1] as const) {
      if (rewardRefusal(s, c.id, choice) === null) out.push({ type: 'chooseReward', city: c.id, choice });
    }
  }

  for (const at of tileKeys) {
    if (harvestRefusal(s, at) === null) out.push({ type: 'harvest', at });
    for (const building of Object.keys(CONFIG.buildings) as BuildingId[]) {
      if (buildRefusal(s, at, building) === null) out.push({ type: 'build', at, building });
    }
    if (roadRefusal(s, at) === null) out.push({ type: 'road', at });
  }

  for (const tech of Object.keys(TECHS) as TechId[]) {
    if (canResearch(s, me, tech)) out.push({ type: 'research', tech });
  }
  out.push({ type: 'endTurn' }, { type: 'resign' });
  return out;
}

// Plays the actions from a fresh match. A refused action throws, naming its index.
export function replay(settings: MatchSettings, actions: Action[]): MatchState {
  let s = createMatch(settings);
  for (let i = 0; i < actions.length; i++) {
    const r = applyAction(s, actions[i]!);
    if (!r.ok) throw new Error(`action ${i} refused: ${r.reason}`);
    s = r.state;
  }
  return s;
}
