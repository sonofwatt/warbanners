// What a player can do with a selected unit, city or tile. Everything offered comes from the engine's legal
// actions; a refusal from the engine becomes a disabled command with its reason, or is hidden when it would be noise.
import {
  CONFIG, TECHS, UNITS, buildRefusal, harvestRefusal, roadRefusal, techPrice, trainRefusal, unitCost, wallsRefusal,
} from '../../engine';
import type {
  AbilityId, Action, BuildingId, HexKey, MatchState, RewardId, TechId, UnitTypeId,
} from '../../engine';
import type { ActionIndex, Armed, Selection } from '../interaction';
import { T, reasonText, unlocks } from '../text';

export interface Command {
  id: string; label: string; cost: number | null; enabled: boolean; why: string | null;
  action: Action | null; arm: Armed | null;
  /** A city's train command names the unit, so the city card can show it in its row of units. */
  unit?: UnitTypeId;
  /** Set when a missing tech is all that stands in the way: tapping the command opens the tech tree at it. */
  tech?: TechId;
}

const needs = (t: TechId): string => `${T.ui.needs} ${T.tech[t]}`;
const unitTypes = Object.keys(UNITS) as UnitTypeId[];
const abilityIds = Object.keys(T.ability) as AbilityId[];

function sameArm(a: Armed | null, b: Armed): boolean {
  if (a === null || a.kind !== b.kind) return false;
  return a.kind === 'ability' ? a.ability === (b as typeof a).ability : a.unitType === (b as typeof a).unitType;
}

export function unitCommands(sel: Extract<Selection, { kind: 'unit' }>, state: MatchState, ix: ActionIndex): Command[] {
  const unit = state.units.find((u) => u.id === sel.id);
  if (unit === undefined || unit.owner !== state.current) return [];
  if (sel.askLure !== null) {
    const target = sel.askLure;
    return [
      { id: 'attack', label: T.ui.attack, cost: null, enabled: true, why: null, action: { type: 'attack', unit: unit.id, target }, arm: null },
      { id: 'attack-lure', label: T.ui.attackLure, cost: null, enabled: true, why: null, action: { type: 'attack', unit: unit.id, target, lure: true }, arm: null },
    ];
  }
  const out: Command[] = [];
  // An armed command turns into Cancel, which disarms: tapping it again must not arm the same thing once more.
  const arming = (id: string, label: string, cost: number | null, arm: Armed): Command => {
    const armed = sameArm(sel.armed, arm);
    return { id, label: armed ? T.ui.cancel : label, cost, enabled: true, why: null, action: null, arm: armed ? null : arm };
  };
  if (ix.captures.includes(unit.id)) {
    out.push({ id: 'capture', label: T.ui.capture, cost: null, enabled: true, why: null, action: { type: 'capture', unit: unit.id }, arm: null });
  }
  if (ix.claims.includes(unit.id)) {
    out.push({ id: 'claimTreasure', label: T.ui.claimTreasure, cost: null, enabled: true, why: null, action: { type: 'claimTreasure', unit: unit.id }, arm: null });
  }
  if (ix.items.includes(unit.id)) {
    out.push({ id: 'useItem', label: T.ui.drink, cost: null, enabled: true, why: null, action: { type: 'useItem', unit: unit.id }, arm: null });
  }
  const per = ix.abilities[unit.id] ?? {};
  for (const ability of abilityIds) {
    if ((per[ability] ?? []).length > 0) out.push(arming(`ability-${ability}`, T.ability[ability].name, null, { kind: 'ability', ability }));
  }
  const camp = ix.campTrain[unit.id] ?? {};
  for (const unitType of unitTypes) {
    if ((camp[unitType] ?? []).length > 0) {
      out.push(arming(`camp-${unitType}`, `${T.ui.train} ${T.unit[unitType].name}`, unitCost(state, unit.owner, unitType), { kind: 'campTrain', unitType }));
    }
  }
  // rules 7: last, so a unit's own moves and abilities come first
  if (ix.hunkers.includes(unit.id)) {
    out.push({ id: 'hunker', label: T.ui.hunker, cost: null, enabled: true, why: null, action: { type: 'hunker', unit: unit.id }, arm: null });
  }
  return out;
}

// The two rewards on offer for a city level; levels past the table use its last row.
export function rewardPair(level: number): readonly [RewardId, RewardId] {
  const top = Math.max(...Object.keys(CONFIG.rewards).map(Number));
  return CONFIG.rewards[Math.min(level, top) as keyof typeof CONFIG.rewards];
}

export function cityCommands(cityId: number, state: MatchState, ix: ActionIndex): Command[] {
  const city = state.cities.find((c) => c.id === cityId);
  if (city === undefined || city.owner !== state.current) return [];
  const player = state.players[city.owner]!;
  const out: Command[] = [];
  for (const type of unitTypes) {
    const def = UNITS[type];
    if (def.cost === null || (def.faction !== null && def.faction !== player.faction)) continue;
    const cost = unitCost(state, city.owner, type);
    const label = `${T.ui.train} ${T.unit[type].name}`;
    const action: Action = { type: 'train', city: cityId, unitType: type };
    if ((ix.train[cityId] ?? []).includes(type)) {
      out.push({ id: `train-${type}`, label, cost, enabled: true, why: null, action, arm: null, unit: type });
    } else {
      const missing = def.tech !== null && !player.techs.includes(def.tech) ? def.tech : null;
      const why = missing !== null ? needs(missing) : reasonText(trainRefusal(state, cityId, type) ?? 'cannot train that');
      out.push({ id: `train-${type}`, label, cost, enabled: false, why, action: null, arm: null, unit: type, ...(missing !== null ? { tech: missing } : {}) });
    }
  }
  // The row of units to train: what the city can train now first, then the rest, each part cheapest first (a stable
  // sort, so equal costs keep the units' own order).
  out.sort((a, b) => Number(b.enabled) - Number(a.enabled) || (a.cost ?? 0) - (b.cost ?? 0));
  const walls = { id: 'walls', label: T.ui.walls, cost: CONFIG.walls.cost, arm: null };
  if (ix.walls.includes(cityId)) {
    out.push({ ...walls, enabled: true, why: null, action: { type: 'buildWalls', city: cityId } });
  } else {
    const refusal = wallsRefusal(state, cityId);
    if (refusal === 'missing tech') out.push({ ...walls, enabled: false, why: needs(CONFIG.walls.tech), action: null, tech: CONFIG.walls.tech });
    else if (refusal === 'not enough gold') out.push({ ...walls, enabled: false, why: reasonText(refusal), action: null });
  }
  if (ix.rewards.includes(cityId) && city.pendingRewards[0] !== undefined) {
    const pair = rewardPair(city.pendingRewards[0]);
    for (const choice of [0, 1] as const) {
      out.push({ id: `reward-${choice}`, label: T.reward[pair[choice]].name, cost: null, enabled: true, why: null, action: { type: 'chooseReward', city: cityId, choice }, arm: null });
    }
  }
  return out;
}

export function tileCommands(at: HexKey, state: MatchState, ix: ActionIndex): Command[] {
  const tile = state.tiles[at];
  if (tile === undefined) return [];
  const out: Command[] = [];
  // One rule for all three kinds: legal, or refused for gold, or (when allowed) refused for a missing tech.
  const offer = (id: string, label: string, cost: number, tech: TechId, legal: boolean, action: Action, refusal: string | null, showTech: boolean): void => {
    const base = { id, label, cost, arm: null };
    if (legal) out.push({ ...base, enabled: true, why: null, action });
    else if (refusal === 'not enough gold') out.push({ ...base, enabled: false, why: reasonText(refusal), action: null });
    else if (refusal === 'missing tech' && showTech) out.push({ ...base, enabled: false, why: needs(tech), action: null, tech });
  };
  if (tile.resource === 'orchard' || tile.resource === 'game') {
    const rule = CONFIG.harvest[tile.resource];
    offer('harvest', T.ui.harvest, rule.cost, rule.tech, ix.harvest.includes(at), { type: 'harvest', at }, harvestRefusal(state, at), true);
  }
  for (const b of Object.keys(CONFIG.buildings) as BuildingId[]) {
    const rule = CONFIG.buildings[b];
    offer(`build-${b}`, `${T.ui.build} ${T.building[b]}`, rule.cost, rule.tech, (ix.build[at] ?? []).includes(b), { type: 'build', at, building: b }, buildRefusal(state, at, b), true);
  }
  offer('road', T.ui.road, CONFIG.road.cost, CONFIG.road.tech, ix.road.includes(at), { type: 'road', at }, roadRefusal(state, at), false);
  return out;
}

export interface TechRow {
  tech: TechId; branch: number; tier: 1 | 2 | 3; status: 'owned' | 'ready' | 'costly' | 'locked'; price: number; unlocks: string[];
}

export function techRows(state: MatchState, ix: ActionIndex): TechRow[] {
  const me = state.current, player = state.players[me]!;
  return (Object.keys(TECHS) as TechId[]).map((tech, i) => {
    const def = TECHS[tech];
    const status: TechRow['status'] = player.techs.includes(tech) ? 'owned'
      : ix.research.includes(tech) ? 'ready'
        : def.requires !== null && !player.techs.includes(def.requires) ? 'locked' : 'costly';
    return { tech, branch: Math.floor(i / 3), tier: def.tier, status, price: techPrice(state, me, tech), unlocks: unlocks(tech) };
  });
}
