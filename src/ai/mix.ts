// What to train, what to research for it, and which level reward to take: scored from what the player can see.
import {
  CONFIG, FACTIONS, TECHS, UNITS, blockadeLoss, blockadeOf, buildRefusal, buildingTech, distance, growthNeeded, harvestRefusal, harvestTech,
  maxHpOf, parseKey, playerIncome, roadTech, unitCapacity, unitCost, unitTech, unitsOf, wallsTech,
} from '../engine';
import type { BuildingId, City, FactionId, MatchState, PlayerId, Resource, TechId, UnitTypeId } from '../engine';
import type { Persona } from './types';

const DEFICIT_WEIGHT = 10;     // per share point the army is short of the persona's target mix
const COUNTER_WEIGHT = 4;      // per share of seen enemies a type counters, times its counter strength
const CITY_COUNTER = 0.25;     // the share a seen enemy city counts as, for siege units
const SAVE_MARGIN = 1.5;       // a type must score this much above the best affordable one to be saved for
const SAVE_ARMY = 4;           // never save while the army is smaller than this
const TECH_ORDER_WEIGHT = 0.5; // per place earlier in the persona's techOrder
const UNLOCK_WEIGHT = 3;       // per point of desire for a type the tech unlocks
const PATH_WEIGHT = 1.5;       // per point of desire for a type a tech after it unlocks
const BLOCKADE_TECH_WEIGHT = 5; // rules 8: per gold blockades now cut from the player's income, for the walls tech (half for the one before it)
const SCOUT_REWARD_TILES = 8;  // unexplored tiles within the scout reward's radius that make it worth more than gold
const BARRACKS_FREE = 1;       // free capacity at or below which barracks beats borders
const WOUNDED_SHARE = 0.6;     // a unit below this share of its health counts as wounded
const SUPPORT_WOUNDED = 3;     // this many wounded units call for the support
const STRONG_ATK = 5;          // a unit with at least this attack counts as strong
const CHAMPION_STRONG = 2;     // fewer strong units than this call for the champion
const BIG_ARMY = 16;           // an army this big takes the support even when attacking
const SUPPORT_ARMY = 8;        // and one this big when it is not attacking; otherwise the champion
const SUPPORT_CAP = 2;         // with this many support units alive (Pipers, Sky Callers) the champion is taken instead
const ATTACK_RANGE = 4;        // own units within this of a seen enemy city: the army is attacking

const has = (t: UnitTypeId, trait: string): boolean => (UNITS[t].traits as readonly string[]).includes(trait);
const isMounted = (t: UnitTypeId): boolean => has(t, 'mounted');
const isRanged = (t: UnitTypeId): boolean => UNITS[t].range >= 2;
const isHeavy = (t: UnitTypeId): boolean => UNITS[t].def >= 4 && !isMounted(t);

// How well each type answers each kind of enemy: riders, ranged units, heavy foot, cities. 0 when it does not.
function counterStrength(t: UnitTypeId): { mounted: number; ranged: number; heavy: number; city: number } {
  return {
    mounted: has(t, 'steadfast') ? 1 : t === 'defender' ? 0.8 : 0,
    ranged: isMounted(t) && UNITS[t].atk > 0 ? 1 : 0,
    heavy: has(t, 'splash') ? 1 : has(t, 'doubleStrike') ? 0.8 : has(t, 'chain') ? 0.5 : isRanged(t) ? 0.3 : 0,
    city: has(t, 'siege') ? 1 : 0,
  };
}

// The types a faction can ever train: a cost, and no faction or its own.
export function factionTypes(f: FactionId): UnitTypeId[] {
  return (Object.keys(UNITS) as UnitTypeId[]).filter((t) => UNITS[t].cost !== null && (UNITS[t].faction === null || UNITS[t].faction === f));
}

// The types the player can train now (the tech held), in data order.
export function availableTypes(b: MatchState, me: PlayerId): UnitTypeId[] {
  const techs = b.players[me]!.techs;
  return factionTypes(b.players[me]!.faction).filter((t) => { const tech = unitTech(t); return tech === null || techs.includes(tech); });
}

// The score of each type in `types`: how far the army is short of the persona mix in it (shares taken over `types`),
// plus how well it answers the enemy units and cities the player sees. Higher is more wanted.
export function unitScores(b: MatchState, me: PlayerId, persona: Persona, types: readonly UnitTypeId[]): Map<UnitTypeId, number> {
  const own = b.units.filter((u) => u.owner === me);
  const enemies = b.units.filter((u) => u.owner !== me);
  const weight = (t: UnitTypeId): number => persona.mix[t] ?? 0;
  const totalWeight = types.reduce((a, t) => a + weight(t), 0) || 1;
  const n = enemies.length || 1;
  const share = (f: (t: UnitTypeId) => boolean): number => enemies.filter((e) => f(e.type)).length / n;
  const seen = { mounted: share(isMounted), ranged: share(isRanged), heavy: share(isHeavy) };
  const enemyCity = b.cities.some((c) => c.owner !== me) ? CITY_COUNTER : 0;
  const out = new Map<UnitTypeId, number>();
  for (const t of types) {
    if (weight(t) <= 0) { out.set(t, -Infinity); continue; }
    const have = own.filter((u) => u.type === t).length / (own.length + 1);
    const c = counterStrength(t);
    const counter = seen.mounted * c.mounted + seen.ranged * c.ranged + seen.heavy * c.heavy + enemyCity * c.city;
    out.set(t, DEFICIT_WEIGHT * (weight(t) / totalWeight - have) + COUNTER_WEIGHT * persona.counter * counter);
  }
  return out;
}

const byScore = (scores: Map<UnitTypeId, number>) => (x: UnitTypeId, y: UnitTypeId): number =>
  scores.get(y)! - scores.get(x)! || (x < y ? -1 : x > y ? 1 : 0);

// The type to train among those `fits` allows, or null to train nothing. Saves (null) when a type the gold cannot buy
// yet but will next turn scores well above the best one `fits` allows, the army is not small and the city is not threatened.
export function chooseUnit(
  b: MatchState, me: PlayerId, persona: Persona, opts: { fits: (t: UnitTypeId) => boolean; threatened: boolean; exclude?: UnitTypeId },
): UnitTypeId | null {
  const types = availableTypes(b, me).filter((t) => t !== opts.exclude);
  const scores = unitScores(b, me, persona, types);
  const ranked = types.filter((t) => scores.get(t)! > -Infinity).sort(byScore(scores));
  const gold = b.players[me]!.gold;
  const affordable = ranked.filter((t) => opts.fits(t));
  const pick = affordable[0] ?? null;
  if (pick === null || opts.threatened) return pick;
  // the best type the gold buys by next turn
  const top = ranked.find((t) => unitCost(b, me, t)! <= gold + playerIncome(b, me));
  if (top === undefined || top === pick || unitCost(b, me, top)! <= gold) return pick;
  const army = b.units.filter((u) => u.owner === me).length;
  return army >= SAVE_ARMY && scores.get(top)! - scores.get(pick)! >= SAVE_MARGIN ? null : pick;
}

// rules 8: whether a tech gives the player anything now: a unit type its persona trains, a harvest or a building with a
// tile for it in its territory, climbing, roads or walls its faction uses (the Spartans' Deep stores only while an enemy
// stands beside one of their cities), or a tech after it that does. Fishing with no fish in the territory, or a column 3
// upgrade before any improvement to upgrade, gives nothing yet, so its gold goes to units and buildings instead.
export function techGivesSomething(b: MatchState, me: PlayerId, persona: Persona, tech: TechId, depth = 2): boolean {
  const player = b.players[me]!;
  const faction = FACTIONS[player.faction];
  if (factionTypes(player.faction).some((t) => unitTech(t) === tech && (persona.mix[t] ?? 0) > 0)) return true;
  if (CONFIG.mountain.tech === tech) return true;
  if (roadTech() === tech && faction.canBuildRoads) return true;
  if (wallsTech() === tech) {
    if (faction.canBuildWalls) return true;
    if (faction.blockadeStores && b.cities.some((c) => c.owner === me && blockadeOf(b, c).enemies > 0)) return true;
  }
  const resources = (Object.keys(CONFIG.harvest) as Resource[]).filter((r) => harvestTech(r) === tech);
  const buildings = (Object.keys(CONFIG.buildings) as BuildingId[]).filter((x) => buildingTech(x) === tech);
  if (resources.length > 0 || buildings.length > 0) {
    // the same position with the tech known and gold to spare: is any harvest or building of it legal somewhere?
    const s = { ...b, players: b.players.map((p) => (p.id === me ? { ...p, techs: [...p.techs, tech], gold: Number.MAX_SAFE_INTEGER } : p)) };
    for (const [at, tile] of Object.entries(b.tiles)) {
      if (tile.resource !== null && resources.includes(tile.resource) && harvestRefusal(s, at) === null) return true;
      if (buildings.some((x) => buildRefusal(s, at, x) === null)) return true;
    }
  }
  return depth > 0 && (Object.keys(TECHS) as TechId[]).some((x) => TECHS[x]!.requires === tech && techGivesSomething(b, me, persona, x, depth - 1));
}

// The tech to research among `allowed`: its place in the persona's order, plus the desire for the types it unlocks and
// for those the techs after it unlock. Desire is a type's score above 0 over every type the faction could train.
export function chooseTech(b: MatchState, me: PlayerId, persona: Persona, allowed: readonly TechId[]): TechId | null {
  if (allowed.length === 0) return null;
  const faction = b.players[me]!.faction;
  const all = factionTypes(faction);
  const techs = b.players[me]!.techs;
  const scores = unitScores(b, me, persona, all);
  const desire = (tech: TechId): number => all.filter((t) => unitTech(t) === tech && !techs.includes(tech))
    .reduce((a, t) => a + Math.max(0, scores.get(t)!), 0);
  const order = persona.techOrder;
  const score = (tech: TechId): number => {
    const idx = order.indexOf(tech);
    const next = (Object.keys(TECHS) as TechId[]).filter((x) => TECHS[x]!.requires === tech);
    const walls = wallsTech();
    const blockade = tech === walls ? 1 : TECHS[walls]?.requires === tech ? 0.5 : 0;
    return TECH_ORDER_WEIGHT * (order.length - (idx < 0 ? order.length : idx))
      + UNLOCK_WEIGHT * desire(tech) + PATH_WEIGHT * next.reduce((a, x) => a + desire(x), 0)
      + (blockade === 0 ? 0 : BLOCKADE_TECH_WEIGHT * blockade * blockadeLoss(b, me));
  };
  return [...allowed].sort((x, y) => score(y) - score(x) || order.indexOf(x) - order.indexOf(y))[0]!;
}

// The level reward to take, 0 or 1, from the city's and the army's situation (CONFIG.rewards gives the pairs).
export function chooseReward(b: MatchState, me: PlayerId, city: City, level: number): 0 | 1 {
  const row = Math.min(level, 5);
  const own = b.units.filter((u) => u.owner === me);
  if (row === 2) {
    // gold, or the scout reward: worth it while much near the city is unexplored
    const explored = new Set(b.players[me]!.explored);
    const at = parseKey(city.pos);
    const dark = Object.keys(b.tiles).filter((k) => !explored.has(k) && distance(at, parseKey(k)) <= CONFIG.rewardScoutRadius).length;
    return dark >= SCOUT_REWARD_TILES ? 1 : 0;
  }
  if (row === 3) {
    // borders, or barracks when the city is (nearly) full
    return unitCapacity(city) - unitsOf(b, city.id) <= BARRACKS_FREE ? 1 : 0;
  }
  if (row === 4) {
    // income, or growth when it brings the next level now
    return growthNeeded(b, city) - city.growth <= CONFIG.rewardGrowth ? 1 : 0;
  }
  // champion or support. Supports barely fight and fill the city's room: a big army that took one at every level
  // stood at home with a dozen Pipers and hundreds of gold it had no room to spend (stalled sims, 2026-11-24).
  const support = FACTIONS[b.players[me]!.faction].support;
  if (own.filter((u) => u.type === support).length >= SUPPORT_CAP) return 0;
  const wounded = own.filter((u) => u.hp < WOUNDED_SHARE * maxHpOf(u)).length;
  if (wounded >= SUPPORT_WOUNDED) return 1;
  const strong = own.filter((u) => UNITS[u.type].atk >= STRONG_ATK).length;
  if (strong < CHAMPION_STRONG) return 0;
  if (own.length >= BIG_ARMY) return 1;
  const attacking = b.cities.some((c) => c.owner !== me
    && own.some((u) => distance(parseKey(u.pos), parseKey(c.pos)) <= ATTACK_RANGE));
  if (attacking) return 0;
  return own.length >= SUPPORT_ARMY ? 1 : 0;
}
