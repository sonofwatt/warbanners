# Banners Plan 1: Rules Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pure TypeScript rules engine that can create a Spartans against Mongols match from a seed, apply every stage 1 action, and replay a match to the same state on any machine.

**Architecture:** One immutable-from-outside `MatchState` value. `applyAction(state, action)` clones it, runs one handler, and returns the new state plus events, or a refusal. All numbers live in `src/engine/data/`. No UI, no network, no browser APIs: later plans (screen, AI, online play) sit on top of this.

**Tech Stack:** TypeScript ~6.0, Vitest ^4.1, oxlint ^1.75, tsx (to run the sim script), Node 24. Same versions as `~/projects/deutsch-dash`.

**Spec:** `docs/superpowers/specs/2026-11-18-banners-design.md` (sections 5, 8.3, 8.7) and `docs/rules/stage1-rules.md`, which fixes every number the spec leaves to the builder. Executors read both. Section numbers below such as "rules 10" mean the rules file.

**Where this sits:** Stage 1 of the design is four plans. This is the first.

1. Rules engine (this plan).
2. The game on screen: diorama rendering, touch controls, two players on one phone, local saves, offline install, first deploy.
3. AI: easy, normal, hard, adaptive, plus bulk simulated matches to tune the numbers.
4. Live online play: lobby, invite link, turn clock, rejoin, version check.

## Global Constraints

- Never write an em dash or an en dash anywhere: code, comments, tests, commit messages, docs. Use a hyphen, a colon, or a new sentence.
- Nothing is copied from Hexonia: no names, text, numbers or assets. Numbers come only from `docs/rules/stage1-rules.md`.
- Engine code is pure: no `Date`, no `Math.random`, no DOM, no network, no file access. Randomness comes only from the `rng` field of the match.
- Engine arithmetic uses only `+ - * /`, `Math.round`, `Math.floor`, `Math.min`, `Math.max`, `Math.abs`, `Math.imul`. No `Math.pow`, `sqrt`, trig or `toFixed`.
- `applyAction` never throws and never changes the state it was given.
- Game numbers are read from `src/engine/data/*`. A number from the rules file appearing as a literal in any other engine file is a defect.
- Tests sit beside the code as `*.test.ts`. Write the failing test first.
- Every commit message ends with the trailer `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
- Work in `~/projects/banners`. Git identity is already set locally in that repo.

## Review Focus

1. A malformed or hostile action (unknown unit id, another player's unit, missing or wrong-typed fields, an action type that does not exist): `applyAction` returns `{ ok: false }`, does not throw, and the input state is unchanged. Pinned in Task 5 and Task 15.
2. A unit dies in the middle of a resolution (attacker killed by the counter, a second strike aimed at a tile now empty, a lure whose target has since died): no crash, no ghost unit, no action on the dead. Pinned in Task 8 and Task 14.
3. A unit must appear and there is no free tile (reward unit, treasure unit, Camp training, training into an occupied city): the documented fallback happens. Pinned in Tasks 7, 9, 10 and 14.
4. Any action after the match is over, or by an eliminated player: refused. Pinned in Task 11.
5. A state saved as JSON and read back (to a phone's storage or the database) hashes the same and plays on identically. Pinned in Task 5 and Task 15.

---

## File Structure

```
package.json, tsconfig.json, .oxlintrc.json, CLAUDE.md
src/noEmDash.test.ts          repo-wide check for banned dashes
src/engine/hex.ts             axial hex maths
src/engine/rng.ts             seeded random numbers
src/engine/types.ts           every shared type
src/engine/data/config.ts     general numbers, terrain, rewards, buildings
src/engine/data/units.ts      unit table
src/engine/data/techs.ts      tech table
src/engine/data/factions.ts   faction table
src/engine/mapgen.ts          seeded map
src/engine/state.ts           createMatch and state helpers
src/engine/testkit.ts         small hand-built matches for tests
src/engine/hash.ts            canonical hash of a state
src/engine/vision.ts          sight, explored tiles, player view
src/engine/movement.ts        reachable tiles, move action, treasure
src/engine/combat.ts          damage, attack action
src/engine/abilities.ts       heal, taunt, hasten, dustStorm
src/engine/economy.ts         income, growth, rewards, harvest, build, road, walls
src/engine/tech.ts            tech price, research
src/engine/training.ts        train, campTrain, capacity
src/engine/capture.ts         capture, elimination, resign
src/engine/turn.ts            endTurn
src/engine/apply.ts           applyAction, legalActions, replay
src/engine/index.ts           public exports
scripts/sim.ts                random playout from the command line
```

Handler convention used by every action module: a handler has the type

```ts
export type Handler<A> = (s: MatchState, a: A, ev: GameEvent[]) => string | null;
```

It receives a draft that `applyAction` has already cloned, mutates it, pushes events, and returns `null`, or returns a short refusal reason and leaves the draft in any state (it is thrown away). Handlers check that the acting unit or city belongs to `s.current`.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `.oxlintrc.json`, `CLAUDE.md`, `src/noEmDash.test.ts`
- Modify: `.gitignore` (already ignores `node_modules/` and `dist/`)

**Interfaces:**
- Produces: `npm test` (vitest run), `npm run lint` (oxlint), `npm run typecheck` (`tsc --noEmit`), `npm run sim` (`tsx scripts/sim.ts`, added in Task 15).

- [ ] **Step 1: Write `package.json`**

`"name": "banners"`, `"private": true`, `"type": "module"`, `"engines": { "node": ">=20.19" }`. Dev dependencies: `typescript ~6.0.2`, `vitest ^4.1.11`, `oxlint ^1.75.0`, `tsx ^4`, `@types/node ^24`. No runtime dependencies. Scripts as listed under Interfaces.

- [ ] **Step 2: Write `tsconfig.json`**

`strict: true`, `noUncheckedIndexedAccess: true`, `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`, `noEmit: true`, `include: ["src", "scripts"]`.

- [ ] **Step 3: Write `CLAUDE.md`**

Three short sections: the dash rule (copy the wording of `~/projects/deutsch-dash/CLAUDE.md`, section "Writing"); "Where things are written down" pointing at the spec, `docs/rules/stage1-rules.md` and `docs/superpowers/plans/`; and the originality rule from spec section 2 in two sentences.

- [ ] **Step 4: Write the failing test `src/noEmDash.test.ts`**

Port `~/projects/deutsch-dash/src/noEmDash.test.ts`. It walks every tracked text file (`git ls-files`), skips binary extensions, and fails listing `file:line` for any U+2014 or U+2013. The test file must name the characters by code point, not contain them.

- [ ] **Step 5: Run it**

Run: `npm install && npm test`
Expected: PASS, 1 test (the docs already contain none).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Scaffold the engine project"
```

---

### Task 2: Hex maths and seeded random numbers

**Files:**
- Create: `src/engine/hex.ts`, `src/engine/rng.ts`
- Test: `src/engine/hex.test.ts`, `src/engine/rng.test.ts`

**Interfaces:**
- Produces:

```ts
// hex.ts
export type Hex = { q: number; r: number };
export type HexKey = string;                         // "q,r"
export const DIRS: readonly Hex[];                   // rules 1 order
export function key(h: Hex): HexKey;
export function parseKey(k: HexKey): Hex;
export function add(a: Hex, b: Hex): Hex;
export function distance(a: Hex, b: Hex): number;
export function neighbors(h: Hex): Hex[];            // DIRS order, may be off-map
export function range(center: Hex, radius: number): Hex[];  // all within radius, sorted by r then q
export function mirror(h: Hex): Hex;                 // { q: -q, r: -r }, never -0
// rng.ts
export function rngNext(state: number): [value: number, next: number];   // value is a uint32
export function rngInt(state: number, n: number): [value: number, next: number]; // value % n
```

- [ ] **Step 1: Write the failing tests**

```ts
// hex.test.ts
test('distance', () => {
  expect(distance({ q: -2, r: 5 }, { q: 2, r: -5 })).toBe(10);
  expect(distance({ q: -2, r: 5 }, { q: 0, r: 0 })).toBe(5);
});
test('range of 6 is the stage 1 board', () => {
  const all = range({ q: 0, r: 0 }, 6);
  expect(all).toHaveLength(127);
  expect(all[0]).toEqual({ q: 0, r: -6 });           // smallest r, then smallest q
});
test('neighbors follow DIRS order', () => {
  expect(neighbors({ q: 0, r: 0 }).map(key)).toEqual(['1,0', '1,-1', '0,-1', '-1,0', '-1,1', '0,1']);
});
test('key round trip and mirror', () => {
  expect(parseKey(key({ q: -3, r: 2 }))).toEqual({ q: -3, r: 2 });
  expect(key(mirror({ q: 0, r: 0 }))).toBe('0,0');
  expect(key(mirror({ q: -3, r: 2 }))).toBe('3,-2');
});
// rng.test.ts
test('fixed sequence from seed 1', () => {
  const [a, s1] = rngNext(1); const [b, s2] = rngNext(s1); const [c, s3] = rngNext(s2);
  expect([a, b, c]).toEqual([2693262067, 11749833, 2265367787]);
  expect(s3).toBe(1199730144);
});
test('rngInt stays in range', () => {
  let s = 7;
  for (let i = 0; i < 200; i++) { const [v, n] = rngInt(s, 6); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(6); s = n; }
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/engine/hex.test.ts src/engine/rng.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement both files**

`rngNext` is mulberry32 and must be exactly this, because the test values depend on it:

```ts
export function rngNext(state: number): [number, number] {
  let t = (state + 0x6d2b79f5) >>> 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [(t ^ (t >>> 14)) >>> 0, next];
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run src/engine/hex.test.ts src/engine/rng.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add hex maths and seeded random numbers"
```

---

### Task 3: Types and data tables

**Files:**
- Create: `src/engine/types.ts`, `src/engine/data/config.ts`, `src/engine/data/units.ts`, `src/engine/data/techs.ts`, `src/engine/data/factions.ts`
- Test: `src/engine/data/data.test.ts`

**Interfaces:**
- Produces `types.ts` exactly as follows (later tasks rely on every name):

```ts
import type { HexKey } from './hex';
export const RULES_VERSION = 1;
export type PlayerId = number;
export type FactionId = 'spartans' | 'mongols';
export type Terrain = 'field' | 'forest' | 'mountain' | 'water';
export type Resource = 'orchard' | 'cropland' | 'game' | 'ore';
export type BuildingId = 'farm' | 'lumberCamp' | 'mine' | 'market';
export type TechId = 'foraging' | 'farming' | 'markets' | 'riding' | 'roads' | 'chivalry'
  | 'hunting' | 'forestry' | 'engineering' | 'bronze' | 'shieldwork' | 'smithing';
export type UnitTypeId = 'warrior' | 'spearman' | 'swordsman' | 'defender' | 'archer' | 'horseman'
  | 'knight' | 'catapult' | 'hoplite' | 'kingsGuard' | 'piper' | 'scout'
  | 'horseArcher' | 'khansGuard' | 'skyCaller' | 'camp';
export type Trait = 'steadfast' | 'doubleStrike' | 'retreat' | 'chain' | 'splash' | 'siege' | 'mounted'
  | 'phalanx' | 'unbowed' | 'hidden' | 'steady' | 'inspire' | 'camp' | 'heal' | 'taunt' | 'hasten' | 'dustStorm';
export type AbilityId = 'heal' | 'taunt' | 'hasten' | 'dustStorm';
export type RewardId = 'gold' | 'scout' | 'borders' | 'barracks' | 'income' | 'growth' | 'champion' | 'support';

export interface Tile {
  terrain: Terrain; resource: Resource | null; building: BuildingId | null;
  road: boolean; village: boolean; treasure: boolean;
  cityId: number | null;                 // the city whose territory this tile is in
}
export interface City {
  id: number; pos: HexKey; owner: PlayerId; capital: boolean;
  level: number; growth: number; radius: number; walls: boolean; market: boolean;
  incomeBonus: number; capacityBonus: number;
  pendingRewards: number[];              // levels awaiting a choice, oldest first
}
export interface Unit {
  id: number; type: UnitTypeId; owner: PlayerId; pos: HexKey; hp: number;
  mp: number;                            // half-points of movement left this turn
  attacks: number;                       // attacks or abilities left this turn
  home: number | null;                   // city whose capacity it uses
  enteredTurn: number;                   // value of MatchState.stamp when it entered its tile
  moved: boolean; acted: boolean;        // this turn
  rested: boolean;                       // did nothing on its owner's previous turn
  taunted: boolean; blinded: boolean;
  lure: { target: number; from: HexKey } | null;
}
export interface Player {
  id: PlayerId; faction: FactionId; gold: number; techs: TechId[];
  explored: HexKey[];                    // kept sorted
  alive: boolean; turnsTaken: number;
}
export interface MatchState {
  rulesVersion: number; seed: number; rng: number; radius: number;
  tiles: Record<HexKey, Tile>; cities: City[]; units: Unit[]; players: Player[];
  current: PlayerId;
  stamp: number;                         // +1 at every endTurn
  nextUnitId: number; nextCityId: number;
  winner: PlayerId | null;
}
export interface MatchSettings { seed: number; factions: [FactionId, FactionId]; }

export type Action =
  | { type: 'move'; unit: number; to: HexKey }
  | { type: 'attack'; unit: number; target: HexKey; lure?: boolean }
  | { type: 'ability'; unit: number; ability: AbilityId; target: HexKey }
  | { type: 'capture'; unit: number }
  | { type: 'train'; city: number; unitType: UnitTypeId }
  | { type: 'campTrain'; unit: number; unitType: UnitTypeId; to: HexKey }
  | { type: 'harvest'; at: HexKey }
  | { type: 'build'; at: HexKey; building: BuildingId }
  | { type: 'buildWalls'; city: number }
  | { type: 'road'; at: HexKey }
  | { type: 'research'; tech: TechId }
  | { type: 'chooseReward'; city: number; choice: 0 | 1 }
  | { type: 'endTurn' }
  | { type: 'resign' };

export type GameEvent =
  | { type: 'moved'; unit: number; from: HexKey; to: HexKey }
  | { type: 'attacked'; unit: number; target: number; damage: number; counter: number }
  | { type: 'splashed'; target: number; damage: number }
  | { type: 'died'; unit: number }
  | { type: 'lured'; unit: number; from: HexKey; to: HexKey }
  | { type: 'ability'; unit: number; ability: AbilityId; target: HexKey }
  | { type: 'trained'; unit: number; at: HexKey }
  | { type: 'captured'; city: number; by: PlayerId }
  | { type: 'treasure'; at: HexKey; outcome: 'gold' | 'explore' | 'unit' }
  | { type: 'cityLevel'; city: number; level: number }
  | { type: 'reward'; city: number; reward: RewardId }
  | { type: 'built'; at: HexKey; what: BuildingId | 'road' | 'walls' | 'harvest' }
  | { type: 'researched'; tech: TechId }
  | { type: 'turnStarted'; player: PlayerId }
  | { type: 'eliminated'; player: PlayerId }
  | { type: 'matchOver'; winner: PlayerId };

export type Result = { ok: true; state: MatchState; events: GameEvent[] } | { ok: false; reason: string };
```

- Produces the data modules:

```ts
// data/units.ts
export interface UnitDef { atk: number; def: number; range: number; move: number; hp: number; sight: number;
  cost: number | null; tech: TechId | null; faction: FactionId | null; traits: readonly Trait[]; }
export const UNITS: Record<UnitTypeId, UnitDef>;          // rules 8, one row each
// data/techs.ts
export interface TechDef { tier: 1 | 2 | 3; requires: TechId | null; }
export const TECHS: Record<TechId, TechDef>;              // rules 7
// data/factions.ts
export interface FactionDef { startTech: TechId; startUnit: UnitTypeId; champion: UnitTypeId; support: UnitTypeId;
  cityCover: number; canBuildWalls: boolean; growthExtra: number; mountedMoveBonus: number; mountedDiscount: number;
  forestStopsMounted: boolean; relayRiders: boolean; tributeVillage: number; tributeCityBase: number; canLure: boolean; }
export const FACTIONS: Record<FactionId, FactionDef>;     // rules 13
// data/config.ts
export const CONFIG: {
  mapRadius: 6; capitals: [HexKey, HexKey];               // ['-2,5', '2,-5']
  startGold: [number, number];                            // [8, 10]
  terrain: Record<Terrain, { enterCost: number | null; cover: number }>;  // mountain enterCost 0 means "all remaining"
  roadCost: 1; relayCost: 1; cityCover: 1.5; wallsCover: 2; mountainSightBonus: 1;
  mapgen: { field: 50; forest: 72; mountain: 86; orchard: 20; cropland: 40; game: 30; ore: 40;
            villagesPerHalf: 3; treasuresPerHalf: 2; maxAttempts: 50 };
  techBase: [4, 6, 8];
  counterFactor: 0.75; steadfastFactor: 1.25;
  restHeal: { home: 4; away: 2 }; abilityHeal: 4; hastenMp: 2; phalanxMax: 2; inspireAtk: 1;
  treasure: { gold: 5; exploreRadius: 4; unit: 'warrior' };
  rewards: { 2: [RewardId, RewardId]; 3: [RewardId, RewardId]; 4: [RewardId, RewardId]; 5: [RewardId, RewardId] };
  rewardGold: 6; rewardScoutRadius: 3; rewardCapacity: 2; rewardGrowth: 2;
  harvest: Record<'orchard' | 'game', { tech: TechId; cost: number; growth: number }>;
  buildings: Record<BuildingId, { tech: TechId; cost: number; growth: number; on: Terrain; resource: Resource | null; income: number }>;
  walls: { tech: 'shieldwork'; cost: 6 }; road: { tech: 'roads'; cost: 1 }; marketIncome: 2;
};
```

Faction values: Spartans `cityCover 2`, `canBuildWalls false`, everything else zero or false. Mongols `cityCover 1.5`, `canBuildWalls true`, `growthExtra 1`, `mountedMoveBonus 1`, `mountedDiscount 1` (applies to `horseman` and `knight` only), `forestStopsMounted true`, `relayRiders true`, `tributeVillage 3`, `tributeCityBase 3`, `canLure true`.

- [ ] **Step 1: Write the failing test**

```ts
test('every unit row matches the rules file spot checks', () => {
  expect(UNITS.warrior).toMatchObject({ atk: 4, def: 3, range: 1, move: 1, hp: 10, sight: 1, cost: 2, tech: null, faction: null });
  expect(UNITS.hoplite).toMatchObject({ atk: 4, def: 5, hp: 15, cost: 4, tech: 'bronze', faction: 'spartans' });
  expect(UNITS.hoplite.traits).toEqual(['steadfast', 'phalanx']);
  expect(UNITS.kingsGuard.cost).toBeNull();
  expect(UNITS.camp).toMatchObject({ atk: 0, range: 0, cost: 6, tech: 'roads', faction: 'mongols' });
  expect(Object.keys(UNITS)).toHaveLength(16);
});
test('tech tree is four ladders of three', () => {
  expect(Object.keys(TECHS)).toHaveLength(12);
  expect(TECHS.smithing).toEqual({ tier: 3, requires: 'shieldwork' });
  for (const t of Object.values(TECHS)) if (t.requires) expect(TECHS[t.requires].tier).toBe(t.tier - 1);
});
test('references resolve', () => {
  for (const u of Object.values(UNITS)) if (u.tech) expect(TECHS[u.tech]).toBeDefined();
  for (const f of Object.values(FACTIONS)) {
    expect(UNITS[f.champion].cost).toBeNull(); expect(UNITS[f.support].cost).toBeNull();
    expect(TECHS[f.startTech].tier).toBe(1);
  }
  expect(CONFIG.rewards[5]).toEqual(['champion', 'support']);
  expect(CONFIG.buildings.market).toMatchObject({ tech: 'markets', cost: 6, growth: 1, on: 'field', resource: null, income: 2 });
});
```

- [ ] **Step 2: Run to see it fail** - `npx vitest run src/engine/data` - FAIL, modules not found.
- [ ] **Step 3: Write `types.ts` as given and fill the four data files from the rules file, row for row.**
- [ ] **Step 4: Run to see it pass** - `npx vitest run src/engine/data && npm run typecheck` - PASS.
- [ ] **Step 5: Commit** - `git add -A && git commit -m "Add engine types and data tables"`

---

### Task 4: Map generation

**Files:**
- Create: `src/engine/mapgen.ts`
- Test: `src/engine/mapgen.test.ts`

**Interfaces:**
- Consumes: `range`, `mirror`, `key`, `neighbors`, `distance`, `rngInt`, `CONFIG`.
- Produces:

```ts
export interface GeneratedMap { tiles: Record<HexKey, Tile>; villages: HexKey[]; treasures: HexKey[]; rng: number; attempts: number; }
export function generateMap(seed: number, radius: number): GeneratedMap;   // rules 3; `rng` is the state to carry into the match
export function isConnected(tiles: Record<HexKey, Tile>, from: HexKey, targets: HexKey[]): boolean;
```

`cityId` is `null` on every generated tile. Capital tiles are plain fields; cities are added by `createMatch`.

- [ ] **Step 1: Write the failing tests**

```ts
const seeds = [1, 2, 3, 42, 1000, 123456];
test.each(seeds)('seed %i: symmetric, complete, connected', (seed) => {
  const m = generateMap(seed, 6);
  expect(Object.keys(m.tiles)).toHaveLength(127);
  for (const k of Object.keys(m.tiles)) {
    const a = m.tiles[k]!, b = m.tiles[key(mirror(parseKey(k)))]!;
    expect([b.terrain, b.resource, b.village, b.treasure]).toEqual([a.terrain, a.resource, a.village, a.treasure]);
  }
  expect(m.villages).toHaveLength(6);
  expect(m.treasures).toHaveLength(4);
  expect(m.tiles['-2,5']!.terrain).toBe('field');
  expect(m.tiles['0,0']).toMatchObject({ terrain: 'field', resource: null, village: false, treasure: false });
  for (const n of neighbors({ q: -2, r: 5 })) { const t = m.tiles[key(n)]; if (t) expect(t.terrain).not.toBe('water'); }
  for (const v of m.villages) {
    expect(m.tiles[v]).toMatchObject({ terrain: 'field', resource: null, village: true });
    expect(distance(parseKey(v), { q: -2, r: 5 })).toBeGreaterThanOrEqual(3);
    expect(distance(parseKey(v), { q: 2, r: -5 })).toBeGreaterThanOrEqual(3);
  }
  expect(isConnected(m.tiles, '-2,5', ['2,-5', ...m.villages, ...m.treasures])).toBe(true);
});
test('same seed, same map; different seed, different map', () => {
  expect(generateMap(42, 6)).toEqual(generateMap(42, 6));
  expect(generateMap(42, 6).tiles).not.toEqual(generateMap(43, 6).tiles);
});
test('isConnected sees water as a wall', () => {
  const m = generateMap(1, 6);
  for (const n of neighbors({ q: 2, r: -5 })) { const t = m.tiles[key(n)]; if (t) t.terrain = 'water'; }
  expect(isConnected(m.tiles, '-2,5', ['2,-5'])).toBe(false);
});
```

- [ ] **Step 2: Run to see them fail** - `npx vitest run src/engine/mapgen.test.ts` - FAIL.
- [ ] **Step 3: Implement `generateMap` following rules 3 step by step.** The shuffle is Fisher-Yates from the end of the array down, drawing `rngInt(state, i + 1)`. Villages and treasures are returned sorted in `range` order. The attempt loop is bounded by `CONFIG.mapgen.maxAttempts`, then falls back as rules 3 step 6 says.
- [ ] **Step 4: Run to see them pass** - `npx vitest run src/engine/mapgen.test.ts` - PASS, 8 tests.
- [ ] **Step 5: Commit** - `git add -A && git commit -m "Add seeded symmetric map generation"`

---

### Task 5: Match state, test kit, hash, and the action gate

**Files:**
- Create: `src/engine/state.ts`, `src/engine/testkit.ts`, `src/engine/hash.ts`, `src/engine/apply.ts`
- Test: `src/engine/state.test.ts`, `src/engine/hash.test.ts`, `src/engine/apply.test.ts`

**Interfaces:**
- Produces:

```ts
// state.ts
export function createMatch(settings: MatchSettings): MatchState;          // rules 4
export function unitById(s: MatchState, id: number): Unit | undefined;
export function unitAt(s: MatchState, k: HexKey): Unit | undefined;
export function cityById(s: MatchState, id: number): City | undefined;
export function cityAt(s: MatchState, k: HexKey): City | undefined;
export function hasTrait(u: Unit, t: Trait): boolean;
export function isEnterable(s: MatchState, k: HexKey): boolean;            // on the map and not water
export function firstFreeNeighbor(s: MatchState, k: HexKey): HexKey | null; // DIRS order, enterable, no unit
export function spawnUnit(s: MatchState, type: UnitTypeId, owner: PlayerId, pos: HexKey, home: number | null): Unit; // mp 0, attacks 0, moved false, acted false, enteredTurn = s.stamp
export function removeUnit(s: MatchState, id: number): void;               // also clears any lure that targets it
export function foundCity(s: MatchState, owner: PlayerId, pos: HexKey, capital: boolean): City; // level 1, radius 1, claims territory
export function claimTerritory(s: MatchState, city: City): void;           // sets cityId on unclaimed tiles within city.radius
export function freshAttacks(type: UnitTypeId): number;                    // 2 with doubleStrike, 0 when atk is 0 and it has no ability trait, else 1
// testkit.ts
export function blankMatch(opts?: { radius?: number; factions?: [FactionId, FactionId] }): MatchState;
//   all fields, radius 4, factions spartans then mongols, no cities, no units, 20 gold each, no techs,
//   nothing explored, current 0, stamp 5, rng 1
export function addUnit(s: MatchState, type: UnitTypeId, owner: PlayerId, q: number, r: number, patch?: Partial<Unit>): Unit;
//   full hp, full mp for its type (2 * move, no faction bonus), freshAttacks, enteredTurn 0
export function addCity(s: MatchState, owner: PlayerId, q: number, r: number, patch?: Partial<City>): City;
export function setTile(s: MatchState, q: number, r: number, patch: Partial<Tile>): void;
export function give(s: MatchState, player: PlayerId, ...techs: TechId[]): void;
export function must(r: Result): MatchState;                               // throws the reason if refused
// hash.ts
export function canonical(value: unknown): string;                          // JSON with object keys sorted at every depth
export function hashState(s: MatchState): string;                           // 16 lowercase hex characters
// apply.ts
export const HANDLERS: Partial<Record<Action['type'], Handler<any>>>;       // later tasks register here
export function applyAction(state: MatchState, action: Action): Result;
```

`hashState` is two 32-bit FNV-1a passes over the UTF-16 code units of `canonical(s)`, with offset bases `0x811c9dc5` and `0x01000193 ^ 0x811c9dc5`, prime `0x01000193` via `Math.imul`, each printed as 8 hex digits and joined.

`applyAction`: refuse with `'match over'` if `state.winner !== null`; refuse with `'unknown action'` if `action` is not an object with a string `type` that has a handler; otherwise `structuredClone` the state, run the handler inside `try/catch` (a throw becomes `{ ok: false, reason: 'invalid action' }`), and on success return the draft and events. After a successful handler it calls `refreshExplored` for every living player once Task 6 exists.

- [ ] **Step 1: Write the failing tests**

```ts
// state.test.ts
test('createMatch sets up rules 4', () => {
  const s = createMatch({ seed: 42, factions: ['spartans', 'mongols'] });
  expect(s.rulesVersion).toBe(RULES_VERSION);
  expect(s.players.map(p => p.gold)).toEqual([8, 10]);
  expect(s.players.map(p => p.techs)).toEqual([['bronze'], ['riding']]);
  expect(s.cities.map(c => [c.pos, c.owner, c.capital, c.level])).toEqual([['-2,5', 0, true, 1], ['2,-5', 1, true, 1]]);
  expect(s.units.map(u => [u.type, u.owner, u.pos, u.home])).toEqual([['warrior', 0, '-2,5', 0], ['horseman', 1, '2,-5', 1]]);
  expect(s.tiles['-2,5']!.cityId).toBe(0);
  expect(s.tiles['-1,5']!.cityId).toBe(0);
  expect([s.current, s.stamp, s.winner]).toEqual([0, 0, null]);
  expect(createMatch({ seed: 42, factions: ['spartans', 'mongols'] })).toEqual(s);
});
test('starting units can act on the first turn', () => {
  const s = createMatch({ seed: 42, factions: ['spartans', 'mongols'] });
  expect(s.units[0]).toMatchObject({ mp: 2, attacks: 1 });
});
// hash.test.ts
test('hash ignores key order and survives JSON', () => {
  const s = createMatch({ seed: 7, factions: ['mongols', 'spartans'] });
  const shuffled = Object.fromEntries(Object.entries(s).reverse()) as MatchState;
  expect(hashState(shuffled)).toBe(hashState(s));
  expect(hashState(JSON.parse(JSON.stringify(s)))).toBe(hashState(s));
  expect(hashState(s)).toMatch(/^[0-9a-f]{16}$/);
});
test('hash changes when anything changes', () => {
  const s = createMatch({ seed: 7, factions: ['mongols', 'spartans'] });
  const t = structuredClone(s); t.players[0]!.gold += 1;
  expect(hashState(t)).not.toBe(hashState(s));
});
// apply.test.ts
test('garbage is refused without throwing or touching the state', () => {
  const s = blankMatch(); const before = hashState(s);
  const bad: unknown[] = [null, undefined, 7, 'endTurn', {}, { type: 5 }, { type: 'fly' }, { type: 'move' },
    { type: 'move', unit: 'x', to: 3 }, { type: 'move', unit: 999, to: '0,0' }];
  for (const a of bad) { const r = applyAction(s, a as Action); expect(r.ok).toBe(false); }
  expect(hashState(s)).toBe(before);
});
test('nothing is accepted once there is a winner', () => {
  const s = blankMatch(); s.winner = 1;
  expect(applyAction(s, { type: 'endTurn' })).toEqual({ ok: false, reason: 'match over' });
});
```

- [ ] **Step 2: Run to see them fail** - `npx vitest run src/engine/state.test.ts src/engine/hash.test.ts src/engine/apply.test.ts` - FAIL.
- [ ] **Step 3: Implement the four files.** `createMatch` calls `generateMap(seed, CONFIG.mapRadius)`, founds the two capitals in player order (ids 0 and 1), spawns each faction's `startUnit` with `home` set to the capital and then gives it full `mp` and `freshAttacks`, and stores the map's returned `rng`.
- [ ] **Step 4: Run to see them pass** - same command - PASS, 6 tests.
- [ ] **Step 5: Commit** - `git add -A && git commit -m "Add match state, test kit, state hash and the action gate"`

---

### Task 6: Vision

**Files:**
- Create: `src/engine/vision.ts`
- Modify: `src/engine/apply.ts` (call `refreshExplored` after a successful handler), `src/engine/state.ts` (`createMatch` calls it once)
- Test: `src/engine/vision.test.ts`

**Interfaces:**
- Produces:

```ts
export function visibleTiles(s: MatchState, player: PlayerId): Set<HexKey>;   // rules 14, blinded units give none
export function refreshExplored(s: MatchState, player: PlayerId): void;       // merges into player.explored, keeps it sorted
export function canSeeUnit(s: MatchState, player: PlayerId, u: Unit): boolean; // own unit, or visible tile and not hidden-at-range
export interface PlayerView { player: PlayerId; tiles: Record<HexKey, Tile>; cities: City[]; units: Unit[]; visible: HexKey[]; }
export function playerView(s: MatchState, player: PlayerId): PlayerView;       // explored tiles, cities on explored tiles, own units plus enemy units canSeeUnit allows
```

- [ ] **Step 1: Write the failing tests**

```ts
test('a warrior sees one tile, two from a mountain', () => {
  const s = blankMatch(); addUnit(s, 'warrior', 0, 0, 0);
  expect(visibleTiles(s, 0).size).toBe(7);
  setTile(s, 0, 0, { terrain: 'mountain' });
  expect(visibleTiles(s, 0).size).toBe(19);
});
test('a city sees its radius plus one', () => {
  const s = blankMatch(); addCity(s, 0, 0, 0);
  expect(visibleTiles(s, 0).size).toBe(19);
});
test('explored tiles stay explored', () => {
  const s = blankMatch(); const u = addUnit(s, 'warrior', 0, 0, 0);
  refreshExplored(s, 0); u.pos = '3,0'; refreshExplored(s, 0);
  expect(s.players[0]!.explored).toContain('0,0');
  expect(s.players[0]!.explored).toContain('4,0');
  expect([...s.players[0]!.explored]).toEqual([...s.players[0]!.explored].sort());
});
test('hidden scout is seen only from next to it', () => {
  const s = blankMatch(); const scout = addUnit(s, 'scout', 0, 2, 0);
  addUnit(s, 'horseman', 1, 0, 0);                       // sight 2, distance 2
  expect(canSeeUnit(s, 1, scout)).toBe(false);
  addUnit(s, 'warrior', 1, 1, 0);                        // adjacent
  expect(canSeeUnit(s, 1, scout)).toBe(true);
});
test('a blinded unit gives no vision', () => {
  const s = blankMatch(); addUnit(s, 'warrior', 0, 0, 0, { blinded: true });
  expect(visibleTiles(s, 0).size).toBe(0);
});
test('playerView leaves out what the player cannot see', () => {
  const s = blankMatch(); addUnit(s, 'warrior', 0, 0, 0); addUnit(s, 'warrior', 1, 3, 0); refreshExplored(s, 0);
  const v = playerView(s, 0);
  expect(v.units.map(u => u.owner)).toEqual([0]);
  expect(v.tiles['3,0']).toBeUndefined();
});
```

- [ ] **Step 2: Run to see them fail** - `npx vitest run src/engine/vision.test.ts` - FAIL.
- [ ] **Step 3: Implement.** Tiles off the map are never visible. Sorting `explored` uses plain string comparison.
- [ ] **Step 4: Run all tests** - `npm test` - PASS.
- [ ] **Step 5: Commit** - `git add -A && git commit -m "Add vision, explored tiles and the player view"`

---

### Task 7: Movement and treasure

**Files:**
- Create: `src/engine/movement.ts`
- Modify: `src/engine/apply.ts` (register `move`)
- Test: `src/engine/movement.test.ts`

**Interfaces:**
- Consumes: state helpers, `FACTIONS`, `CONFIG`, `UNITS`, `rngInt`.
- Produces:

```ts
export function maxMp(s: MatchState, u: Unit): number;                       // 2 * (move + faction mounted bonus)
export function reachable(s: MatchState, unitId: number): Record<HexKey, number>; // tile it may stop on -> half-points left on arrival
export const moveHandler: Handler<Extract<Action, { type: 'move' }>>;
export function collectTreasure(s: MatchState, u: Unit, ev: GameEvent[]): void;   // rules 12
```

Rules 2 and 9 decide `reachable`. Order of checks for the cost of one step into tile `T`: not enterable or enemy unit there: blocked. Relay riders (faction flag, `T.cityId` is a city of the unit's owner): 1. Road to road (both tiles have `road` or a city): 1. Mountain: needs `!u.moved` and this to be the first step, costs everything. Forest for a mounted unit whose faction has `forestStopsMounted`: costs everything left. Otherwise the terrain's `enterCost`. If the cost is more than the points left, the step is allowed only as the first step of a unit that has not moved, and leaves 0. After arriving next to any enemy unit the points left become 0. A tile holding a friendly unit may be passed through but is not in the result. A unit with `mp === 0`, or one with `acted` and no `retreat` trait, reaches nothing.

`moveHandler` sets `pos`, `mp`, `moved = true`, `enteredTurn = s.stamp`, pushes `moved`, calls `collectTreasure` if the tile has one, then resolves a pending lure (Task 14 fills that in; for now it just clears `u.lure`).

- [ ] **Step 1: Write the failing tests**

```ts
test('warrior on fields reaches its six neighbours', () => {
  const s = blankMatch(); const u = addUnit(s, 'warrior', 0, 0, 0);
  expect(Object.keys(reachable(s, u.id)).sort()).toEqual(['-1,0', '-1,1', '0,-1', '0,1', '1,-1', '1,0'].sort());
});
test('forest costs two tiles of movement, but one step is always allowed', () => {
  const s = blankMatch(); const h = addUnit(s, 'horseman', 0, 0, 0);          // 4 half-points
  setTile(s, 1, 0, { terrain: 'forest' });
  const r = reachable(s, h.id);
  expect(r['1,0']).toBe(0); expect(r['2,0']).toBeUndefined(); expect(r['-2,0']).toBe(0);
  const w = addUnit(s, 'warrior', 0, 0, 2); setTile(s, 1, 2, { terrain: 'forest' });
  expect(reachable(s, w.id)['1,2']).toBe(0);
});
test('mountain needs a fresh unit and ends the move; water is closed', () => {
  const s = blankMatch(); const k = addUnit(s, 'horseman', 0, 0, 0);
  setTile(s, 1, 0, { terrain: 'mountain' }); setTile(s, -1, 0, { terrain: 'water' });
  const r = reachable(s, k.id);
  expect(r['1,0']).toBe(0); expect(r['-1,0']).toBeUndefined(); expect(r['2,0']).toBeUndefined();
});
test('roads are cheap', () => {
  const s = blankMatch(); const w = addUnit(s, 'warrior', 0, 0, 0);
  for (const q of [0, 1, 2]) setTile(s, q, 0, { road: true });
  expect(reachable(s, w.id)['2,0']).toBe(0);
});
test('engagement stops a unit beside an enemy; enemies block, friends do not', () => {
  const s = blankMatch(); const k = addUnit(s, 'knight', 0, 0, 0);          // 6 half-points
  addUnit(s, 'warrior', 1, 3, -1); addUnit(s, 'warrior', 0, 1, 0);
  const r = reachable(s, k.id);
  expect(r['1,0']).toBeUndefined();           // a friend stands there
  expect(r['2,0']).toBe(0);                   // passed through the friend; beside the enemy, so the 2 points left are gone
  expect(r['2,-1']).toBe(0);                  // also beside the enemy
  expect(r['3,0']).toBeUndefined();           // only reachable through 2,0
  expect(r['3,-1']).toBeUndefined();          // the enemy's tile
  expect(r['-2,0']).toBe(2);                  // away from the enemy nothing is lost
});
test('move action updates the unit and refuses a bad target', () => {
  const s = blankMatch(); const u = addUnit(s, 'warrior', 0, 0, 0);
  const t = must(applyAction(s, { type: 'move', unit: u.id, to: '1,0' }));
  expect(unitById(t, u.id)).toMatchObject({ pos: '1,0', mp: 0, moved: true, enteredTurn: 5 });
  expect(applyAction(s, { type: 'move', unit: u.id, to: '3,0' }).ok).toBe(false);
  const e = addUnit(s, 'warrior', 1, 0, 2);
  expect(applyAction(s, { type: 'move', unit: e.id, to: '1,2' }).ok).toBe(false);   // not the current player
});
test('treasure outcomes follow rngInt(3)', () => {
  // with rng state 1 the first draw is 2693262067 % 3 = 1: explore
  const s = blankMatch(); const u = addUnit(s, 'warrior', 0, 0, 0); setTile(s, 1, 0, { treasure: true });
  const r = applyAction(s, { type: 'move', unit: u.id, to: '1,0' }); const t = must(r);
  expect(t.tiles['1,0']!.treasure).toBe(false);
  expect(r.ok && r.events).toContainEqual({ type: 'treasure', at: '1,0', outcome: 'explore' });
  expect(t.players[0]!.explored).toContain('4,-3');     // within 4 of 1,0 (the far edge of the radius-4 board)
  expect(t.rng).not.toBe(s.rng);
});
const rngStateFor = (n: number, want: number) => { let st = 1; while (rngInt(st, n)[0] !== want) st++; return st; };
test('treasure unit appears on the first free neighbour', () => {
  const s = blankMatch(); const u = addUnit(s, 'warrior', 0, 0, 0); setTile(s, 1, 0, { treasure: true });
  s.rng = rngStateFor(3, 2);
  const t = must(applyAction(s, { type: 'move', unit: u.id, to: '1,0' }));
  expect(unitAt(t, '2,0')).toMatchObject({ type: 'warrior', owner: 0, home: null });
  expect(t.players[0]!.gold).toBe(20);
});
test('treasure unit with nowhere to stand becomes 5 gold', () => {
  const s = blankMatch({ radius: 1 }); setTile(s, 1, 0, { treasure: true });
  setTile(s, 1, -1, { terrain: 'water' }); setTile(s, 0, 1, { terrain: 'water' });
  addUnit(s, 'warrior', 0, 0, 0);                                   // a friend on the only other neighbour
  const h = addUnit(s, 'horseman', 0, -1, 0);                       // rides through the friend
  s.rng = rngStateFor(3, 2);
  const t = must(applyAction(s, { type: 'move', unit: h.id, to: '1,0' }));
  expect(t.units).toHaveLength(2); expect(t.players[0]!.gold).toBe(25);
});
test('treasure gold', () => {
  const s = blankMatch(); const u = addUnit(s, 'warrior', 0, 0, 0); setTile(s, 1, 0, { treasure: true });
  s.rng = rngStateFor(3, 0);
  expect(must(applyAction(s, { type: 'move', unit: u.id, to: '1,0' })).players[0]!.gold).toBe(25);
});
```

- [ ] **Step 2: Run to see them fail** - `npx vitest run src/engine/movement.test.ts` - FAIL.
- [ ] **Step 3: Implement.** `reachable` is a best-first search keyed on tile with the most points left winning.
- [ ] **Step 4: Run all tests** - `npm test` - PASS.
- [ ] **Step 5: Commit** - `git add -A && git commit -m "Add movement, engagement, roads and treasure"`

---

### Task 8: Combat

**Files:**
- Create: `src/engine/combat.ts`
- Modify: `src/engine/apply.ts` (register `attack`)
- Test: `src/engine/combat.test.ts`

**Interfaces:**
- Produces:

```ts
export function coverAt(s: MatchState, defender: Unit): number;      // rules 2: terrain cover, or the city value when the unit stands in its owner's city
export function attackOf(s: MatchState, u: Unit): number;            // base atk plus inspire (Task 14)
export function defenceOf(s: MatchState, u: Unit): number;           // base def plus phalanx (Task 13)
export function damageFor(effAtk: number, def: number, cover: number): number;
export function attackTargets(s: MatchState, unitId: number): HexKey[];  // tiles holding an enemy this unit may attack now
export const attackHandler: Handler<Extract<Action, { type: 'attack' }>>;
```

Sequence in `attackHandler` (rules 10 and 11): check `attacks > 0`, target in `attackTargets`; compute and apply damage; if the target dies remove it and, with `chain`, add one attack; apply `splash` to enemy units adjacent to the target tile (they may die, no counter); if the target lives and may counter, apply the counter and remove the attacker if it dies; then, if the attacker lives: `attacks -= 1`, `acted = true`, `mp = 0` unless it has `retreat`. One `attacked` event carries both numbers (`counter: 0` when there was none). `attackTargets` requires: the unit is the current player's, not (`siege` and `moved`), the target unit passes `canSeeUnit`, distance within `range` (1 when `blinded`), and the taunt rule from Task 13.

- [ ] **Step 1: Write the failing tests** (values are from the table in rules 10)

```ts
const duel = (atk: UnitTypeId, def: UnitTypeId, patchA?: Partial<Unit>, tile?: Partial<Tile>) => {
  const s = blankMatch(); const a = addUnit(s, atk, 0, 0, 0, patchA); const d = addUnit(s, def, 1, 1, 0);
  if (tile) setTile(s, 1, 0, tile);
  const t = must(applyAction(s, { type: 'attack', unit: a.id, target: '1,0' }));
  return { a: unitById(t, a.id), d: unitById(t, d.id), t };
};
test('warrior on warrior: 5 dealt, 2 back', () => {
  const { a, d } = duel('warrior', 'warrior');
  expect(d!.hp).toBe(5); expect(a!.hp).toBe(8);
  expect(a).toMatchObject({ attacks: 0, mp: 0, acted: true });
});
test('cover', () => {
  expect(duel('warrior', 'warrior', undefined, { terrain: 'forest' }).d!.hp).toBe(6);
  expect(duel('warrior', 'defender').d!.hp).toBe(12);
  expect(duel('warrior', 'defender').a!.hp).toBe(9);
});
test('steadfast counter hurts: spearman deals 5 back', () => {
  const { a, d } = duel('warrior', 'spearman');
  expect(d!.hp).toBe(6); expect(a!.hp).toBe(5);
});
test('a wounded attacker hits softer', () => {
  expect(duel('warrior', 'warrior', { hp: 5 }).d!.hp).toBe(7);
});
test('a city protects its owner', () => {
  const s = blankMatch(); const a = addUnit(s, 'warrior', 0, 0, 0); addCity(s, 1, 1, 0); const d = addUnit(s, 'warrior', 1, 1, 0);
  s.players[1]!.faction = 'mongols';
  expect(unitById(must(applyAction(s, { type: 'attack', unit: a.id, target: '1,0' })), d.id)!.hp).toBe(6);
});
test('archer at range takes no counter and cannot shoot three tiles', () => {
  const s = blankMatch(); const a = addUnit(s, 'archer', 0, 0, 0); const d = addUnit(s, 'warrior', 1, 2, 0);
  const t = must(applyAction(s, { type: 'attack', unit: a.id, target: '2,0' }));
  expect(unitById(t, d.id)!.hp).toBe(5); expect(unitById(t, a.id)!.hp).toBe(10);
  d.pos = '3,0';
  expect(applyAction(s, { type: 'attack', unit: a.id, target: '3,0' }).ok).toBe(false);
});
test('knight kills, chains, and may strike again', () => {
  const s = blankMatch(); const k = addUnit(s, 'knight', 0, 0, 0);
  const w1 = addUnit(s, 'warrior', 1, 1, 0, { hp: 8 }); addUnit(s, 'warrior', 1, 0, 1);
  const r = applyAction(s, { type: 'attack', unit: k.id, target: '1,0' }); const t = must(r);
  expect(unitById(t, w1.id)).toBeUndefined();
  expect(r.ok && r.events).toContainEqual({ type: 'died', unit: w1.id });
  expect(unitById(t, k.id)!.attacks).toBe(1);
  expect(must(applyAction(t, { type: 'attack', unit: k.id, target: '0,1' })).units.length).toBe(2);
});
test('swordsman strikes twice, and the second strike needs a living target', () => {
  const s = blankMatch(); const sw = addUnit(s, 'swordsman', 0, 0, 0); addUnit(s, 'warrior', 1, 1, 0);
  const t1 = must(applyAction(s, { type: 'attack', unit: sw.id, target: '1,0' }));   // 6 damage, warrior at 4
  const t2 = must(applyAction(t1, { type: 'attack', unit: sw.id, target: '1,0' }));  // kills
  expect(unitAt(t2, '1,0')).toBeUndefined();
  expect(applyAction(t2, { type: 'attack', unit: sw.id, target: '1,0' }).ok).toBe(false);
});
test('catapult: splash, no counter, no shot after moving', () => {
  const s = blankMatch(); const c = addUnit(s, 'catapult', 0, 0, 0);
  const d = addUnit(s, 'warrior', 1, 3, 0); const n = addUnit(s, 'warrior', 1, 3, -1); const mine = addUnit(s, 'warrior', 0, 2, 0);
  const t = must(applyAction(s, { type: 'attack', unit: c.id, target: '3,0' }));
  expect(unitById(t, d.id)!.hp).toBe(2); expect(unitById(t, n.id)!.hp).toBe(6);
  expect(unitById(t, mine.id)!.hp).toBe(10); expect(unitById(t, c.id)!.hp).toBe(10);
  const moved = must(applyAction(s, { type: 'move', unit: c.id, to: '0,1' }));
  expect(attackTargets(moved, c.id)).toEqual([]);
});
test('an attacker killed by the counter is removed cleanly', () => {
  const s = blankMatch(); const a = addUnit(s, 'warrior', 0, 0, 0, { hp: 1 }); addUnit(s, 'spearman', 1, 1, 0);
  const t = must(applyAction(s, { type: 'attack', unit: a.id, target: '1,0' }));
  expect(unitById(t, a.id)).toBeUndefined();
  expect(t.units).toHaveLength(1);
});
test('you cannot attack what you cannot see, your own units, or out of turn', () => {
  const s = blankMatch(); const a = addUnit(s, 'archer', 0, 0, 0);
  addUnit(s, 'scout', 1, 2, 0); addUnit(s, 'warrior', 0, -1, 0); const e = addUnit(s, 'warrior', 1, 0, 3);
  expect(applyAction(s, { type: 'attack', unit: a.id, target: '2,0' }).ok).toBe(false);   // hidden at distance 2
  expect(applyAction(s, { type: 'attack', unit: a.id, target: '-1,0' }).ok).toBe(false);  // own unit
  expect(applyAction(s, { type: 'attack', unit: e.id, target: '0,2' }).ok).toBe(false);
});
```

- [ ] **Step 2: Run to see them fail** - `npx vitest run src/engine/combat.test.ts` - FAIL.
- [ ] **Step 3: Implement.** `damageFor` is exactly the formula in rules 10. `attackOf` and `defenceOf` return the base stats for now.
- [ ] **Step 4: Run all tests** - `npm test` - PASS.
- [ ] **Step 5: Commit** - `git add -A && git commit -m "Add combat with counters and the shared unit traits"`

---

### Task 9: Economy: income, growth, rewards, harvest, buildings, roads, walls

**Files:**
- Create: `src/engine/economy.ts`
- Modify: `src/engine/apply.ts` (register `harvest`, `build`, `road`, `buildWalls`, `chooseReward`)
- Test: `src/engine/economy.test.ts`

**Interfaces:**
- Produces:

```ts
export function cityIncome(s: MatchState, c: City): number;          // rules 6
export function playerIncome(s: MatchState, p: PlayerId): number;
export function growthNeeded(s: MatchState, c: City): number;        // level + 1 + faction growthExtra
export function addGrowth(s: MatchState, c: City, n: number, ev: GameEvent[]): void;  // levels up, queues pendingRewards
export function applyReward(s: MatchState, c: City, choice: 0 | 1, ev: GameEvent[]): void; // consumes pendingRewards[0]
export function unitCapacity(c: City): number;                       // level + 1 + capacityBonus
export const harvestHandler, buildHandler, roadHandler, wallsHandler, rewardHandler: Handler<...>;
```

All five handlers require the tile (or city) to belong to a city of `s.current`, the tech, and the gold; they subtract the cost and push `built` or `reward`. `road` also accepts an unclaimed tile.

- [ ] **Step 1: Write the failing tests**

```ts
test('income', () => {
  const s = blankMatch(); const cap = addCity(s, 0, 0, 0, { capital: true }); addCity(s, 0, 3, 0, { level: 2, incomeBonus: 1, market: true });
  expect(cityIncome(s, cap)).toBe(2); expect(playerIncome(s, 0)).toBe(2 + 5);
});
test('growth levels a city and queues the reward; Mongols need one more', () => {
  const s = blankMatch(); const c = addCity(s, 0, 0, 0); const ev: GameEvent[] = [];
  addGrowth(s, c, 2, ev);
  expect(c).toMatchObject({ level: 2, growth: 0, pendingRewards: [2] });
  expect(ev).toContainEqual({ type: 'cityLevel', city: c.id, level: 2 });
  const m = addCity(s, 1, 3, 0); addGrowth(s, m, 2, []);
  expect(m).toMatchObject({ level: 1, growth: 2 });
  addGrowth(s, m, 1, []); expect(m.level).toBe(2);
});
test('each reward does what rules 6 says', () => {
  const s = blankMatch(); const c = addCity(s, 0, 0, 0, { level: 2, pendingRewards: [2] });
  let t = must(applyAction(s, { type: 'chooseReward', city: c.id, choice: 0 }));
  expect(t.players[0]!.gold).toBe(26); expect(cityById(t, c.id)!.pendingRewards).toEqual([]);
  c.pendingRewards = [3]; t = must(applyAction(s, { type: 'chooseReward', city: c.id, choice: 0 }));
  expect(cityById(t, c.id)!.radius).toBe(2); expect(t.tiles['2,0']!.cityId).toBe(c.id);
  c.pendingRewards = [3]; t = must(applyAction(s, { type: 'chooseReward', city: c.id, choice: 1 }));
  expect(unitCapacity(cityById(t, c.id)!)).toBe(2 + 1 + 2);
  c.pendingRewards = [4]; t = must(applyAction(s, { type: 'chooseReward', city: c.id, choice: 0 }));
  expect(cityById(t, c.id)!.incomeBonus).toBe(1);
  c.pendingRewards = [7]; t = must(applyAction(s, { type: 'chooseReward', city: c.id, choice: 0 }));
  expect(unitAt(t, '0,0')).toMatchObject({ type: 'kingsGuard', home: null, mp: 0 });
  c.pendingRewards = [5]; t = must(applyAction(s, { type: 'chooseReward', city: c.id, choice: 1 }));
  expect(unitAt(t, '0,0')!.type).toBe('piper');
  expect(applyAction(t, { type: 'chooseReward', city: c.id, choice: 0 }).ok).toBe(false);
});
test('reward unit steps aside when the city is occupied, and becomes gold when boxed in', () => {
  const s = blankMatch({ radius: 1 }); const c = addCity(s, 0, 0, 0, { level: 5, pendingRewards: [5] }); addUnit(s, 'warrior', 0, 0, 0);
  let t = must(applyAction(s, { type: 'chooseReward', city: c.id, choice: 0 }));
  expect(unitAt(t, '1,0')!.type).toBe('kingsGuard');
  for (const n of neighbors({ q: 0, r: 0 })) setTile(s, n.q, n.r, { terrain: 'water' });
  t = must(applyAction(s, { type: 'chooseReward', city: c.id, choice: 0 }));
  expect(t.units).toHaveLength(1); expect(t.players[0]!.gold).toBe(26);
});
test('harvest and build', () => {
  const s = blankMatch(); const c = addCity(s, 0, 0, 0); give(s, 0, 'foraging', 'farming', 'bronze', 'markets');
  setTile(s, 1, 0, { resource: 'orchard' }); setTile(s, 0, 1, { resource: 'cropland' }); setTile(s, -1, 0, { terrain: 'mountain', resource: 'ore' });
  let t = must(applyAction(s, { type: 'harvest', at: '1,0' }));
  expect(t.tiles['1,0']!.resource).toBeNull(); expect(t.players[0]!.gold).toBe(18); expect(cityById(t, c.id)!.growth).toBe(1);
  t = must(applyAction(t, { type: 'build', at: '0,1', building: 'farm' }));
  expect(t.tiles['0,1']!.building).toBe('farm'); expect(cityById(t, c.id)!.level).toBe(2);
  expect(applyAction(t, { type: 'build', at: '0,1', building: 'farm' }).ok).toBe(false);     // already built
  expect(applyAction(t, { type: 'build', at: '-1,0', building: 'farm' }).ok).toBe(false);    // wrong tile
  t = must(applyAction(t, { type: 'build', at: '0,-1', building: 'market' }));
  expect(cityById(t, c.id)!.market).toBe(true);
  expect(applyAction(t, { type: 'build', at: '1,-1', building: 'market' }).ok).toBe(false);  // one per city
  expect(applyAction(s, { type: 'harvest', at: '3,0' }).ok).toBe(false);                     // outside territory
});
test('no tech, no gold, no deal', () => {
  const s = blankMatch(); addCity(s, 0, 0, 0); setTile(s, 1, 0, { resource: 'orchard' });
  expect(applyAction(s, { type: 'harvest', at: '1,0' }).ok).toBe(false);
  give(s, 0, 'foraging'); s.players[0]!.gold = 1;
  expect(applyAction(s, { type: 'harvest', at: '1,0' }).ok).toBe(false);
});
test('roads and walls', () => {
  const s = blankMatch({ factions: ['mongols', 'spartans'] }); const c = addCity(s, 0, 0, 0); give(s, 0, 'roads', 'shieldwork');
  let t = must(applyAction(s, { type: 'road', at: '3,0' }));                    // unclaimed tile is allowed
  expect(t.tiles['3,0']!.road).toBe(true); expect(t.players[0]!.gold).toBe(19);
  expect(applyAction(t, { type: 'road', at: '3,0' }).ok).toBe(false);
  setTile(s, 2, 0, { terrain: 'mountain' }); expect(applyAction(s, { type: 'road', at: '2,0' }).ok).toBe(false);
  t = must(applyAction(s, { type: 'buildWalls', city: c.id }));
  expect(cityById(t, c.id)!.walls).toBe(true); expect(t.players[0]!.gold).toBe(14);
  const sp = blankMatch(); const sc = addCity(sp, 0, 0, 0); give(sp, 0, 'shieldwork');
  expect(applyAction(sp, { type: 'buildWalls', city: sc.id }).ok).toBe(false);  // Spartans cannot
});
```

- [ ] **Step 2: Run to see them fail** - `npx vitest run src/engine/economy.test.ts` - FAIL.
- [ ] **Step 3: Implement.** `applyReward` maps the level to a row of `CONFIG.rewards` (levels above 5 use row 5). The `scout` reward adds every on-map tile within the radius to the owner's `explored`. Walls change `coverAt` in `combat.ts` (extend it and add one assertion there: a Mongol unit in a walled Mongol city takes 3 from a Warrior).
- [ ] **Step 4: Run all tests** - `npm test` - PASS.
- [ ] **Step 5: Commit** - `git add -A && git commit -m "Add income, city growth, rewards, harvesting, buildings, roads and walls"`

---

### Task 10: Tech and training

**Files:**
- Create: `src/engine/tech.ts`, `src/engine/training.ts`
- Modify: `src/engine/apply.ts` (register `research`, `train`)
- Test: `src/engine/tech.test.ts`, `src/engine/training.test.ts`

**Interfaces:**
- Produces:

```ts
// tech.ts
export function techPrice(s: MatchState, p: PlayerId, tech: TechId): number;   // rules 7
export function canResearch(s: MatchState, p: PlayerId, tech: TechId): boolean; // prerequisite held, not held, affordable
export const researchHandler: Handler<Extract<Action, { type: 'research' }>>;
// training.ts
export function unitCost(s: MatchState, p: PlayerId, type: UnitTypeId): number | null; // null when reward-only; applies the mounted discount
export function trainable(s: MatchState, p: PlayerId): UnitTypeId[];           // faction allows, tech held, has a cost; UNITS key order
export function unitsOf(s: MatchState, cityId: number): number;                // units whose home is this city
export const trainHandler: Handler<Extract<Action, { type: 'train' }>>;
```

- [ ] **Step 1: Write the failing tests**

```ts
test('tech price rises with cities', () => {
  const s = blankMatch(); addCity(s, 0, 0, 0);
  expect([techPrice(s, 0, 'foraging'), techPrice(s, 0, 'farming'), techPrice(s, 0, 'markets')]).toEqual([4, 6, 8]);
  addCity(s, 0, 3, 0); addCity(s, 0, -3, 0);
  expect([techPrice(s, 0, 'foraging'), techPrice(s, 0, 'farming'), techPrice(s, 0, 'markets')]).toEqual([6, 10, 14]);
});
test('research needs the step before it', () => {
  const s = blankMatch(); addCity(s, 0, 0, 0);
  expect(applyAction(s, { type: 'research', tech: 'farming' }).ok).toBe(false);
  const t = must(applyAction(s, { type: 'research', tech: 'foraging' }));
  expect(t.players[0]!.techs).toEqual(['foraging']); expect(t.players[0]!.gold).toBe(16);
  expect(applyAction(t, { type: 'research', tech: 'foraging' }).ok).toBe(false);
  expect(must(applyAction(t, { type: 'research', tech: 'farming' })).players[0]!.gold).toBe(10);
});
test('what each faction can train', () => {
  const s = blankMatch(); give(s, 0, 'bronze'); give(s, 1, 'riding');
  expect(trainable(s, 0)).toEqual(['warrior', 'spearman', 'hoplite', 'scout']);
  expect(trainable(s, 1)).toEqual(['warrior', 'horseman', 'horseArcher']);
  expect(unitCost(s, 1, 'horseman')).toBe(2); expect(unitCost(s, 0, 'horseman')).toBe(3);
  expect(unitCost(s, 0, 'kingsGuard')).toBeNull();
});
test('training', () => {
  const s = blankMatch(); const c = addCity(s, 0, 0, 0); give(s, 0, 'bronze');
  const r = applyAction(s, { type: 'train', city: c.id, unitType: 'hoplite' }); const t = must(r);
  expect(unitAt(t, '0,0')).toMatchObject({ type: 'hoplite', owner: 0, home: c.id, mp: 0, attacks: 0, hp: 15 });
  expect(t.players[0]!.gold).toBe(16);
  expect(applyAction(t, { type: 'train', city: c.id, unitType: 'warrior' }).ok).toBe(false);       // tile occupied
  expect(applyAction(s, { type: 'train', city: c.id, unitType: 'archer' }).ok).toBe(false);        // no tech
  expect(applyAction(s, { type: 'train', city: c.id, unitType: 'horseArcher' }).ok).toBe(false);   // wrong faction
  expect(applyAction(s, { type: 'train', city: c.id, unitType: 'piper' }).ok).toBe(false);         // reward only
});
test('capacity is level + 1', () => {
  const s = blankMatch(); const c = addCity(s, 0, 0, 0);
  addUnit(s, 'warrior', 0, 2, 0, { home: c.id }); addUnit(s, 'warrior', 0, 2, 1, { home: c.id });
  expect(applyAction(s, { type: 'train', city: c.id, unitType: 'warrior' }).ok).toBe(false);
  c.capacityBonus = 2;
  expect(applyAction(s, { type: 'train', city: c.id, unitType: 'warrior' }).ok).toBe(true);
});
```

- [ ] **Step 2: Run to see them fail** - `npx vitest run src/engine/tech.test.ts src/engine/training.test.ts` - FAIL.
- [ ] **Step 3: Implement.** Harvest and build already check techs through `CONFIG`; nothing else changes.
- [ ] **Step 4: Run all tests** - `npm test` - PASS.
- [ ] **Step 5: Commit** - `git add -A && git commit -m "Add tech research and unit training"`

---

### Task 11: Capture, elimination, resigning

**Files:**
- Create: `src/engine/capture.ts`
- Modify: `src/engine/apply.ts` (register `capture`, `resign`)
- Test: `src/engine/capture.test.ts`

**Interfaces:**
- Produces:

```ts
export function canCapture(s: MatchState, unitId: number): boolean;      // rules 12
export const captureHandler: Handler<Extract<Action, { type: 'capture' }>>;
export function eliminate(s: MatchState, p: PlayerId, ev: GameEvent[]): void;  // alive false, units removed, winner set when one is left
export const resignHandler: Handler<Extract<Action, { type: 'resign' }>>;
```

- [ ] **Step 1: Write the failing tests**

```ts
test('a village becomes a city, but not on the turn you arrive', () => {
  const s = blankMatch(); setTile(s, 1, 0, { village: true }); const u = addUnit(s, 'warrior', 0, 0, 0);
  const arrived = must(applyAction(s, { type: 'move', unit: u.id, to: '1,0' }));
  expect(applyAction(arrived, { type: 'capture', unit: u.id }).ok).toBe(false);
  const waited = structuredClone(arrived); waited.stamp += 2; const w = unitById(waited, u.id)!; w.moved = false; w.mp = 2; w.attacks = 1;
  const r = applyAction(waited, { type: 'capture', unit: u.id }); const t = must(r);
  const c = cityAt(t, '1,0')!;
  expect(c).toMatchObject({ owner: 0, level: 1, capital: false, radius: 1 });
  expect(t.tiles['1,0']!.village).toBe(false); expect(t.tiles['2,0']!.cityId).toBe(c.id);
  expect(unitById(t, u.id)).toMatchObject({ mp: 0, attacks: 0, acted: true });
  expect(t.players[0]!.gold).toBe(20);                                   // Spartans get no tribute
  expect(r.ok && r.events).toContainEqual({ type: 'captured', city: c.id, by: 0 });
});
test('taking a city keeps its level and frees its units', () => {
  const s = blankMatch(); const c = addCity(s, 1, 0, 0, { level: 3, walls: true }); addCity(s, 1, 3, 0);
  const theirs = addUnit(s, 'warrior', 1, 2, 2, { home: c.id }); const u = addUnit(s, 'warrior', 0, 0, 0);
  const t = must(applyAction(s, { type: 'capture', unit: u.id }));
  expect(cityById(t, c.id)).toMatchObject({ owner: 0, level: 3, walls: true });
  expect(unitById(t, theirs.id)!.home).toBeNull();
  expect(t.winner).toBeNull();
});
test('losing your last city ends the match', () => {
  const s = blankMatch(); addCity(s, 1, 0, 0); addCity(s, 0, 3, 0); addUnit(s, 'warrior', 1, 2, 2); const u = addUnit(s, 'warrior', 0, 0, 0);
  const r = applyAction(s, { type: 'capture', unit: u.id }); const t = must(r);
  expect(t.players[1]!.alive).toBe(false); expect(t.units.every(x => x.owner === 0)).toBe(true); expect(t.winner).toBe(0);
  expect(r.ok && r.events.slice(-2)).toEqual([{ type: 'eliminated', player: 1 }, { type: 'matchOver', winner: 0 }]);
  for (const a of [{ type: 'endTurn' }, { type: 'move', unit: u.id, to: '1,0' }, { type: 'resign' }] as Action[])
    expect(applyAction(t, a)).toEqual({ ok: false, reason: 'match over' });
});
test('capture needs the right place and a fresh unit', () => {
  const s = blankMatch(); addCity(s, 0, 0, 0); const u = addUnit(s, 'warrior', 0, 0, 0);
  expect(applyAction(s, { type: 'capture', unit: u.id }).ok).toBe(false);          // own city
  setTile(s, 2, 0, { village: true }); const v = addUnit(s, 'warrior', 0, 2, 0, { acted: true });
  expect(applyAction(s, { type: 'capture', unit: v.id }).ok).toBe(false);
});
test('resigning hands the win to the other player', () => {
  const s = blankMatch(); addCity(s, 0, 0, 0); addCity(s, 1, 3, 0);
  expect(must(applyAction(s, { type: 'resign' })).winner).toBe(1);
});
```

- [ ] **Step 2: Run to see them fail** - `npx vitest run src/engine/capture.test.ts` - FAIL.
- [ ] **Step 3: Implement.** A captured village's city gets the next city id and is not a capital. Tribute is read from `FACTIONS` (zero for Spartans); add one assertion with a Mongol captor: village pays 3, a level 3 city pays 6.
- [ ] **Step 4: Run all tests** - `npm test` - PASS.
- [ ] **Step 5: Commit** - `git add -A && git commit -m "Add capture, elimination and resigning"`

---

### Task 12: The turn cycle

**Files:**
- Create: `src/engine/turn.ts`
- Modify: `src/engine/apply.ts` (register `endTurn`)
- Test: `src/engine/turn.test.ts`

**Interfaces:**
- Consumes: `applyReward`, `playerIncome`, `maxMp`, `freshAttacks`, `CONFIG.restHeal`.
- Produces: `export const endTurnHandler: Handler<{ type: 'endTurn' }>;` following rules 5 in this order: (1) auto-choose option 0 for every pending reward of the current player's cities; (2) for each of their units set `rested = !moved && !acted`, clear `taunted`, `blinded`, `lure`; (3) `turnsTaken += 1`, `stamp += 1`, `current` = next living player; (4) for the new current player: if `turnsTaken > 0` add income and heal their `rested` units; then give every unit of theirs `mp = maxMp`, `attacks = freshAttacks`, `moved = false`, `acted = false`; (5) push `turnStarted`.

- [ ] **Step 1: Write the failing tests**

```ts
test('turn passes and comes back with income', () => {
  const s = blankMatch(); addCity(s, 0, 0, 0, { capital: true }); addCity(s, 1, 3, 0, { capital: true });
  const t1 = must(applyAction(s, { type: 'endTurn' }));
  expect([t1.current, t1.stamp, t1.players[0]!.turnsTaken]).toEqual([1, 6, 1]);
  expect(t1.players[1]!.gold).toBe(20);                         // first turn: no income
  const t2 = must(applyAction(t1, { type: 'endTurn' }));
  expect(t2.current).toBe(0); expect(t2.players[0]!.gold).toBe(22);
  const t3 = must(applyAction(t2, { type: 'endTurn' }));
  expect(t3.players[1]!.gold).toBe(22);
});
test('units get their turn back', () => {
  const s = blankMatch(); addCity(s, 0, 0, 0); addCity(s, 1, 3, 0);
  const u = addUnit(s, 'swordsman', 0, 0, 1, { mp: 0, attacks: 0, moved: true, acted: true });
  const t = must(applyAction(must(applyAction(s, { type: 'endTurn' })), { type: 'endTurn' }));
  expect(unitById(t, u.id)).toMatchObject({ mp: 2, attacks: 2, moved: false, acted: false });
});
test('resting heals 4 at home and 2 away, never past full, and only if the unit did nothing', () => {
  const s = blankMatch(); addCity(s, 0, 0, 0); addCity(s, 1, 3, 0);
  const home = addUnit(s, 'warrior', 0, 1, 0, { hp: 3 }); const away = addUnit(s, 'warrior', 0, -3, 0, { hp: 3 });
  const nearlyFull = addUnit(s, 'warrior', 0, 0, 1, { hp: 9 }); const busy = addUnit(s, 'warrior', 0, 0, -1, { hp: 3, moved: true });
  const t = must(applyAction(must(applyAction(s, { type: 'endTurn' })), { type: 'endTurn' }));
  expect([home, away, nearlyFull, busy].map(u => unitById(t, u.id)!.hp)).toEqual([7, 5, 10, 3]);
});
test('an unchosen reward takes its first option, and statuses wear off', () => {
  const s = blankMatch(); const c = addCity(s, 0, 0, 0, { level: 2, pendingRewards: [2] }); addCity(s, 1, 3, 0);
  const u = addUnit(s, 'warrior', 0, 1, 0, { taunted: true, blinded: true });
  const t = must(applyAction(s, { type: 'endTurn' }));
  expect(cityById(t, c.id)!.pendingRewards).toEqual([]); expect(t.players[0]!.gold).toBe(26);
  expect(unitById(t, u.id)).toMatchObject({ taunted: false, blinded: false });
});
```

- [ ] **Step 2: Run to see them fail** - `npx vitest run src/engine/turn.test.ts` - FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run all tests** - `npm test` - PASS.
- [ ] **Step 5: Commit** - `git add -A && git commit -m "Add the turn cycle"`

---

### Task 13: Spartans

**Files:**
- Create: `src/engine/abilities.ts`
- Modify: `src/engine/combat.ts` (`defenceOf`, `coverAt`, `attackTargets`, unbowed), `src/engine/apply.ts` (register `ability`)
- Test: `src/engine/spartans.test.ts`

**Interfaces:**
- Produces:

```ts
// abilities.ts
export function abilityTargets(s: MatchState, unitId: number, ability: AbilityId): HexKey[];
export const abilityHandler: Handler<Extract<Action, { type: 'ability' }>>;   // rules 11; this task implements heal and taunt
export function isSteadied(s: MatchState, u: Unit): boolean;                  // a friendly unit with the steady trait is adjacent
```

An ability needs the trait of the same name, `attacks > 0`, and a legal target. Using one sets `attacks -= 1`, `mp = 0`, `acted = true` and pushes an `ability` event.

- [ ] **Step 1: Write the failing tests**

```ts
test('phalanx: each hoplite beside it adds 1 defence, up to 2', () => {
  const s = blankMatch(); const h = addUnit(s, 'hoplite', 0, 0, 0);
  expect(defenceOf(s, h)).toBe(5);
  addUnit(s, 'hoplite', 0, 1, 0); addUnit(s, 'hoplite', 0, -1, 0); addUnit(s, 'hoplite', 0, 0, 1); addUnit(s, 'warrior', 0, 0, -1);
  expect(defenceOf(s, h)).toBe(7);
});
test('our men are our walls: a hoplite line in a Spartan city takes 2 from a warrior', () => {
  const s = blankMatch({ factions: ['mongols', 'spartans'] }); addCity(s, 1, 1, 0);
  const h = addUnit(s, 'hoplite', 1, 1, 0); addUnit(s, 'hoplite', 1, 2, 0); addUnit(s, 'hoplite', 1, 1, 1);
  const a = addUnit(s, 'warrior', 0, 0, 0);
  expect(unitById(must(applyAction(s, { type: 'attack', unit: a.id, target: '1,0' })), h.id)!.hp).toBe(13);
});
test('a lone warrior in a Spartan city takes 3', () => {
  const s = blankMatch({ factions: ['mongols', 'spartans'] }); addCity(s, 1, 1, 0); const d = addUnit(s, 'warrior', 1, 1, 0);
  const a = addUnit(s, 'warrior', 0, 0, 0);
  expect(unitById(must(applyAction(s, { type: 'attack', unit: a.id, target: '1,0' })), d.id)!.hp).toBe(7);
});
test('unbowed: the King\'s Guard at 5 health still deals 8', () => {
  const s = blankMatch(); const g = addUnit(s, 'kingsGuard', 0, 0, 0, { hp: 5 }); const d = addUnit(s, 'warrior', 1, 1, 0);
  expect(unitById(must(applyAction(s, { type: 'attack', unit: g.id, target: '1,0' })), d.id)!.hp).toBe(2);
});
test('piper heals a neighbour by 4, not past full, and it costs the piper its turn', () => {
  const s = blankMatch(); const p = addUnit(s, 'piper', 0, 0, 0); const w = addUnit(s, 'warrior', 0, 1, 0, { hp: 3 });
  const t = must(applyAction(s, { type: 'ability', unit: p.id, ability: 'heal', target: '1,0' }));
  expect(unitById(t, w.id)!.hp).toBe(7); expect(unitById(t, p.id)).toMatchObject({ attacks: 0, mp: 0, acted: true });
  expect(applyAction(t, { type: 'ability', unit: p.id, ability: 'heal', target: '1,0' }).ok).toBe(false);
  expect(applyAction(s, { type: 'ability', unit: p.id, ability: 'heal', target: '3,0' }).ok).toBe(false);
  expect(applyAction(s, { type: 'ability', unit: p.id, ability: 'hasten', target: '1,0' }).ok).toBe(false);
});
test('a taunted unit in reach of a hoplite may attack only hoplites', () => {
  const s = blankMatch(); const p = addUnit(s, 'piper', 0, 0, 0);
  addUnit(s, 'hoplite', 0, 1, 0); addUnit(s, 'warrior', 0, 1, 1); const e = addUnit(s, 'warrior', 1, 2, 0);
  const t = must(applyAction(s, { type: 'ability', unit: p.id, ability: 'taunt', target: '2,0' }));
  expect(unitById(t, e.id)!.taunted).toBe(true);
  const theirTurn = must(applyAction(t, { type: 'endTurn' }));
  expect(attackTargets(theirTurn, e.id)).toEqual(['1,0']);                 // 1,1 holds a warrior it may no longer hit
  const after = must(applyAction(theirTurn, { type: 'endTurn' }));
  expect(unitById(after, e.id)!.taunted).toBe(false);
});
test('isSteadied', () => {
  const s = blankMatch(); addUnit(s, 'piper', 0, 0, 0); const near = addUnit(s, 'warrior', 0, 1, 0); const far = addUnit(s, 'warrior', 0, 3, 0);
  expect([isSteadied(s, near), isSteadied(s, far)]).toEqual([true, false]);
});
```

- [ ] **Step 2: Run to see them fail** - `npx vitest run src/engine/spartans.test.ts` - FAIL.
- [ ] **Step 3: Implement.** `coverAt` uses the owner's `FACTIONS[...].cityCover` when the unit stands in a city it owns (or `CONFIG.wallsCover` if the city has walls and that is higher).
- [ ] **Step 4: Run all tests** - `npm test` - PASS.
- [ ] **Step 5: Commit** - `git add -A && git commit -m "Add Spartan rules: phalanx, garrison cover, unbowed, the Piper"`

---

### Task 14: Mongols

**Files:**
- Modify: `src/engine/movement.ts` (bonus movement, forest stop, relay riders, lure resolution), `src/engine/combat.ts` (`attackOf` inspire, lure flag), `src/engine/abilities.ts` (hasten, dustStorm), `src/engine/training.ts` (Camp), `src/engine/apply.ts` (register `campTrain`)
- Test: `src/engine/mongols.test.ts`

**Interfaces:**
- Produces: `export const campTrainHandler: Handler<Extract<Action, { type: 'campTrain' }>>;` and `export function campCity(s: MatchState, p: PlayerId): City | null;` (the owner's city with the most free capacity, lowest id on a tie, `null` if none has room).

- [ ] **Step 1: Write the failing tests**

```ts
const mongols = () => blankMatch({ factions: ['mongols', 'spartans'] });
test('mounted Mongols move one farther, and forest stops them', () => {
  const s = mongols(); const h = addUnit(s, 'horseman', 0, 0, 0, { mp: 6 });
  expect(maxMp(s, h)).toBe(6);
  setTile(s, 1, 0, { terrain: 'forest' });
  const r = reachable(s, h.id);
  expect(r['-3,0']).toBe(0);
  expect(r['1,0']).toBe(0);                  // a Spartan rider would arrive with 2 left out of 6
  const w = addUnit(s, 'warrior', 0, 0, 2); expect(maxMp(s, w)).toBe(2);
});
test('relay riders: one half-point per tile inside Mongol territory', () => {
  const s = mongols(); addCity(s, 0, 0, 0, { radius: 2 }); claimTerritory(s, s.cities[0]!);
  setTile(s, 1, 0, { terrain: 'forest' }); const w = addUnit(s, 'warrior', 0, 0, 0);
  expect(reachable(s, w.id)['2,0']).toBe(0);                // two tiles on 2 half-points, forest included
});
test('tribute and slow growth', () => {
  const s = mongols(); setTile(s, 1, 0, { village: true }); const u = addUnit(s, 'horseman', 0, 1, 0);
  expect(must(applyAction(s, { type: 'capture', unit: u.id })).players[0]!.gold).toBe(23);
  const c = addCity(s, 1, 3, 0, { level: 3 }); const v = addUnit(s, 'horseman', 0, 3, 0); addCity(s, 1, -3, 0);
  expect(must(applyAction(s, { type: 'capture', unit: v.id })).players[0]!.gold).toBe(26);
  expect(growthNeeded(s, addCity(s, 0, 0, 3))).toBe(3); void c;
});
test('inspire: a horseman beside the Khan\'s Guard deals 6 to a warrior', () => {
  const s = mongols(); const h = addUnit(s, 'horseman', 0, 0, 0); addUnit(s, 'khansGuard', 0, -1, 0); const d = addUnit(s, 'warrior', 1, 1, 0);
  expect(unitById(must(applyAction(s, { type: 'attack', unit: h.id, target: '1,0' })), d.id)!.hp).toBe(4);
  const w = addUnit(s, 'warrior', 0, -1, 1); expect(attackOf(s, w)).toBe(4);        // not mounted
});
test('horse archer shoots, keeps its movement, and lures the target one tile', () => {
  const s = mongols(); const a = addUnit(s, 'horseArcher', 0, 0, 0, { mp: 6 }); const d = addUnit(s, 'warrior', 1, 2, 0);
  const shot = must(applyAction(s, { type: 'attack', unit: a.id, target: '2,0', lure: true }));
  expect(unitById(shot, a.id)).toMatchObject({ mp: 6, attacks: 0, lure: { target: d.id, from: '0,0' } });
  const r = applyAction(shot, { type: 'move', unit: a.id, to: '-2,0' }); const t = must(r);
  expect(unitById(t, d.id)!.pos).toBe('1,0');
  expect(r.ok && r.events).toContainEqual({ type: 'lured', unit: d.id, from: '2,0', to: '1,0' });
  expect(unitById(t, a.id)!.lure).toBeNull();
});
test('melee lure pulls the target onto the tile the rider left', () => {
  const s = mongols(); const h = addUnit(s, 'horseman', 0, 0, 0, { mp: 6 }); const d = addUnit(s, 'defender', 1, 1, 0);
  const hit = must(applyAction(s, { type: 'attack', unit: h.id, target: '1,0', lure: true }));
  const t = must(applyAction(hit, { type: 'move', unit: h.id, to: '-1,0' }));
  expect(unitById(t, d.id)!.pos).toBe('0,0');
});
test('no lure on a steadied unit, a unit in a city, a dead unit, or for Spartans', () => {
  const s = mongols(); const a = addUnit(s, 'horseArcher', 0, 0, 0, { mp: 6 });
  const d = addUnit(s, 'warrior', 1, 2, 0); addUnit(s, 'piper', 1, 3, 0);
  expect(unitById(must(applyAction(s, { type: 'attack', unit: a.id, target: '2,0', lure: true })), a.id)!.lure).toBeNull();
  const s2 = mongols(); const a2 = addUnit(s2, 'horseArcher', 0, 0, 0, { mp: 6 }); addCity(s2, 1, 2, 0); addUnit(s2, 'warrior', 1, 2, 0);
  expect(unitById(must(applyAction(s2, { type: 'attack', unit: a2.id, target: '2,0', lure: true })), a2.id)!.lure).toBeNull();
  const s3 = mongols(); const a3 = addUnit(s3, 'horseArcher', 0, 0, 0, { mp: 6 }); const weak = addUnit(s3, 'warrior', 1, 2, 0, { hp: 6 });
  const other = addUnit(s3, 'horseArcher', 0, 0, 1, { mp: 6 });
  const first = must(applyAction(s3, { type: 'attack', unit: a3.id, target: '2,0', lure: true }));
  const killed = must(applyAction(first, { type: 'attack', unit: other.id, target: '2,0' }));
  expect(unitById(killed, weak.id)).toBeUndefined();
  const moved = must(applyAction(killed, { type: 'move', unit: a3.id, to: '-1,0' }));
  expect(moved.units).toHaveLength(2);                                    // nothing pulled, nothing broken
  const sp = blankMatch(); const h = addUnit(sp, 'horseman', 0, 0, 0); addUnit(sp, 'defender', 1, 1, 0);
  expect(unitById(must(applyAction(sp, { type: 'attack', unit: h.id, target: '1,0', lure: true })), h.id)!.lure).toBeNull();
  void d;
});
test('sky caller: hasten and dust storm', () => {
  const s = mongols(); const c = addUnit(s, 'skyCaller', 0, 0, 0, { mp: 6 }); const h = addUnit(s, 'horseman', 0, 1, 0, { mp: 6 });
  const e1 = addUnit(s, 'archer', 1, 2, -1); const e2 = addUnit(s, 'warrior', 1, 3, -2); const mine = addUnit(s, 'warrior', 0, 2, 0);
  expect(unitById(must(applyAction(s, { type: 'ability', unit: c.id, ability: 'hasten', target: '1,0' })), h.id)!.mp).toBe(8);
  expect(applyAction(s, { type: 'ability', unit: c.id, ability: 'hasten', target: '2,0' }).ok).toBe(false);   // not adjacent, not mounted
  const t = must(applyAction(s, { type: 'ability', unit: c.id, ability: 'dustStorm', target: '2,-1' }));
  expect([e1, e2, mine].map(u => unitById(t, u.id)!.blinded)).toEqual([true, true, false]);
  const theirs = must(applyAction(t, { type: 'endTurn' }));
  expect(attackTargets(theirs, e1.id)).toEqual([]);                        // both their units are blind, so they see no one
  expect(visibleTiles(theirs, 1).size).toBe(0);
});
test('the Camp trains beside itself on behalf of a city', () => {
  const s = mongols(); give(s, 0, 'riding', 'roads'); const city = addCity(s, 0, -3, 0); const camp = addUnit(s, 'camp', 0, 2, 0);
  expect(campCity(s, 0)!.id).toBe(city.id);
  const t = must(applyAction(s, { type: 'campTrain', unit: camp.id, unitType: 'horseman', to: '3,0' }));
  expect(unitAt(t, '3,0')).toMatchObject({ type: 'horseman', home: city.id, mp: 0, attacks: 0 });
  expect(t.players[0]!.gold).toBe(18);
  expect(applyAction(t, { type: 'campTrain', unit: camp.id, unitType: 'horseman', to: '2,1' }).ok).toBe(false);  // one per turn
  expect(applyAction(s, { type: 'campTrain', unit: camp.id, unitType: 'horseman', to: '0,0' }).ok).toBe(false);  // not adjacent
  const full = structuredClone(s); cityById(full, city.id)!.level = 0; cityById(full, city.id)!.capacityBonus = -1;
  expect(applyAction(full, { type: 'campTrain', unit: camp.id, unitType: 'horseman', to: '3,0' }).ok).toBe(false); // no room anywhere
  const movedCamp = structuredClone(s); unitById(movedCamp, camp.id)!.moved = true;
  expect(applyAction(movedCamp, { type: 'campTrain', unit: camp.id, unitType: 'horseman', to: '3,0' }).ok).toBe(false);
  expect(attackTargets(s, camp.id)).toEqual([]);
});
```

- [ ] **Step 2: Run to see them fail** - `npx vitest run src/engine/mongols.test.ts` - FAIL.
- [ ] **Step 3: Implement** following rules 13. The lure pull happens inside `moveHandler` after the attacker has left its tile; it re-checks that the target is alive and that the destination is free and enterable, sets the pulled unit's `enteredTurn` to `s.stamp`, and never triggers a treasure. A lure is recorded only when `FACTIONS[faction].canLure`, the attacker has `retreat`, the target survived, `!isSteadied`, and the target is not on a city tile.
- [ ] **Step 4: Run all tests** - `npm test` - PASS.
- [ ] **Step 5: Commit** - `git add -A && git commit -m "Add Mongol rules: riders, tribute, lure, the Sky Caller and the Camp"`

---

### Task 15: Legal actions, replay, soak test, sim script

**Files:**
- Modify: `src/engine/apply.ts` (`legalActions`, `replay`)
- Create: `src/engine/index.ts`, `scripts/sim.ts`, `README.md`
- Modify: `package.json` (script `sim`)
- Test: `src/engine/legal.test.ts`, `src/engine/soak.test.ts`

**Interfaces:**
- Produces:

```ts
export function legalActions(s: MatchState): Action[];   // every action applyAction would accept for s.current, in a fixed order; [] when the match is over
export function replay(settings: MatchSettings, actions: Action[]): MatchState;  // throws Error(`action ${i} refused: ${reason}`)
// index.ts re-exports: createMatch, applyAction, legalActions, replay, hashState, playerView, visibleTiles, reachable,
//   attackTargets, abilityTargets, canCapture, trainable, unitCost, techPrice, canResearch, cityIncome, playerIncome,
//   growthNeeded, unitCapacity, RULES_VERSION, UNITS, TECHS, FACTIONS, CONFIG, and every type.
```

Order of `legalActions`: for each unit by id: moves (tile keys sorted), attacks (with and without `lure` where a lure is possible), abilities, capture, campTrain; then for each city by id: train, buildWalls, chooseReward (0 then 1); then harvest, build, road (tile keys sorted); then research (TECHS key order); then `endTurn`, then `resign`. It is built from the query functions, not by trial application.

`scripts/sim.ts`: `npm run sim -- <seed> [maxTurns=200]` plays random legal actions (its own `rngInt` stream seeded from the seed, at most 40 actions per turn before forcing `endTurn`, never choosing `resign`) and prints one line: seed, turns played, winner or "none", cities and units per player, final hash.

- [ ] **Step 1: Write the failing tests**

```ts
// legal.test.ts
test('every listed action is accepted and nothing else obvious is missing', () => {
  const s = createMatch({ seed: 42, factions: ['spartans', 'mongols'] });
  const acts = legalActions(s);
  for (const a of acts) expect(applyAction(s, a).ok).toBe(true);
  expect(acts.at(-2)).toEqual({ type: 'endTurn' }); expect(acts.at(-1)).toEqual({ type: 'resign' });
  expect(acts.some(a => a.type === 'move')).toBe(true);
  expect(acts.some(a => a.type === 'train')).toBe(false);                    // the starting unit stands on the capital
  const moved = must(applyAction(s, acts.find(a => a.type === 'move')!));
  expect(legalActions(moved).some(a => a.type === 'train' && a.unitType === 'hoplite')).toBe(true);
  expect(acts.some(a => a.type === 'research' && a.tech === 'shieldwork')).toBe(true);
  expect(acts.some(a => a.type === 'research' && a.tech === 'smithing')).toBe(false);
});
test('nothing is legal once the match is over', () => {
  const s = createMatch({ seed: 42, factions: ['spartans', 'mongols'] });
  expect(legalActions(must(applyAction(s, { type: 'resign' })))).toEqual([]);
});
test('replay reproduces a match and reports a bad action by index', () => {
  const settings: MatchSettings = { seed: 42, factions: ['spartans', 'mongols'] };
  let s = createMatch(settings); const log: Action[] = [];
  for (let i = 0; i < 6; i++) { const a = legalActions(s)[0]!; log.push(a); s = must(applyAction(s, a)); }
  expect(hashState(replay(settings, log))).toBe(hashState(s));
  expect(() => replay(settings, [...log, { type: 'move', unit: 999, to: '0,0' }])).toThrow(/action 6 refused/);
});
// soak.test.ts
test.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('seed %i: 60 random turns keep every invariant and replay to the same hash', (seed) => {
  const settings: MatchSettings = { seed, factions: seed % 2 ? ['spartans', 'mongols'] : ['mongols', 'spartans'] };
  let s = createMatch(settings); let pick = seed * 7919; const log: Action[] = [];
  for (let turn = 0; turn < 60 && s.winner === null; turn++) {
    for (let n = 0; n < 40; n++) {
      const acts = legalActions(s).filter(a => a.type !== 'resign' && a.type !== 'endTurn');
      if (acts.length === 0) break;
      const [i, next] = rngInt(pick, acts.length); pick = next;
      const r = applyAction(s, acts[i]!); expect(r.ok).toBe(true); if (!r.ok) return;
      log.push(acts[i]!); s = r.state; checkInvariants(s);
      if (s.winner !== null) break;
    }
    if (s.winner === null) { log.push({ type: 'endTurn' }); s = must(applyAction(s, { type: 'endTurn' })); checkInvariants(s); }
  }
  expect(hashState(replay(settings, log))).toBe(hashState(s));
  const viaJson = JSON.parse(JSON.stringify(s)) as MatchState;               // Review Focus 5
  expect(hashState(viaJson)).toBe(hashState(s));
  if (s.winner === null) expect(hashState(must(applyAction(viaJson, { type: 'endTurn' })))).toBe(hashState(must(applyAction(s, { type: 'endTurn' }))));
});
test('hostile actions against a live match are all refused quietly', () => {      // Review Focus 1
  const s = createMatch({ seed: 5, factions: ['spartans', 'mongols'] }); const before = hashState(s);
  const enemy = s.units.find(u => u.owner === 1)!; const mine = s.units.find(u => u.owner === 0)!;
  const bad = [
    { type: 'move', unit: enemy.id, to: '0,0' }, { type: 'move', unit: mine.id, to: 'x' }, { type: 'move', unit: mine.id, to: '99,99' },
    { type: 'attack', unit: mine.id, target: mine.pos }, { type: 'train', city: 1, unitType: 'warrior' },
    { type: 'train', city: 0, unitType: 'dragon' }, { type: 'research', tech: 'magic' }, { type: 'chooseReward', city: 0, choice: 5 },
    { type: 'build', at: '0,0', building: 'castle' }, { type: 'ability', unit: mine.id, ability: 'heal', target: mine.pos },
    { type: 'campTrain', unit: mine.id, unitType: 'horseman', to: '0,0' }, { type: 'capture', unit: -1 },
  ] as unknown as Action[];
  for (const a of bad) expect(applyAction(s, a).ok).toBe(false);
  expect(hashState(s)).toBe(before);
});
```

`checkInvariants(s)` lives in the soak test file and asserts: no two units share a tile; every unit is on an enterable tile; `1 <= hp <= UNITS[type].hp`; `mp >= 0` and `attacks >= 0`; every player's gold is `>= 0`; every `home` and every `tile.cityId` names an existing city; every unit's owner is alive; `explored` is sorted and has no duplicates; a winner exists exactly when one player is alive.

- [ ] **Step 2: Run to see them fail** - `npx vitest run src/engine/legal.test.ts src/engine/soak.test.ts` - FAIL.
- [ ] **Step 3: Implement `legalActions`, `replay`, `index.ts` and `scripts/sim.ts`.** Fix whatever the soak test turns up in earlier modules, adding a focused test beside the fix each time.
- [ ] **Step 4: Run everything**

Run: `npm test && npm run typecheck && npm run lint && npm run sim -- 42`
Expected: all tests PASS, no type or lint errors, and one line of sim output ending in a 16 character hash. Running `npm run sim -- 42` twice prints the same line.

- [ ] **Step 5: Write `README.md`**

What the project is (two sentences and the originality rule), how to run tests and the sim, and a pointer to the spec, the rules file and the plans. State that plan 1 delivers the engine only and nothing is playable on a screen yet.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Add legal actions, replay, a soak test and the sim script"
```

---

## What this plan does not do

- No screen, no AI, no online play, no saves: those are plans 2, 3 and 4.
- No balance tuning. The numbers in the rules file are a first draft; plan 3 tunes them with bulk simulated matches.
- No hero traits, expanded treasures, ships, extra factions or Exalted Heroes (design stages 2 to 6). The state and data shapes leave room: units already carry per-unit state, and traits are data.
