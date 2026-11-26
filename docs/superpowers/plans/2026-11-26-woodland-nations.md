# Woodland Nations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Woodland Nations, a third playable faction, as rules 11: five new units, their traits and
abilities, the faction's economy, an AI that plays them and plays against them, a faction picker with mirror matches,
and their art.

**Architecture:** Every rule is data in `FACTIONS`, `UNITS`, `CONFIG.woodland` and the rules 8 tech tree, or a trait
checked where the engine already checks traits. Spartan and Mongol play must not change: the stage 1 fixture and every
existing engine test stay green untouched, apart from the `RULES_VERSION` number. The AI gets the new actions through
`legalActions` and a danger map built only from `aiInputFor`. The UI picks factions per seat and colours players by
seat, so a mirror match gets two colours.

**Tech Stack:** TypeScript, React, Vite, Vitest, three.js (the 3D board), Firebase Realtime Database (online play).

**Spec:** `docs/superpowers/specs/2026-11-26-woodland-nations-faction.md` (read it alongside this plan; section numbers
below are the spec's, "stage1 N" is `docs/rules/stage1-rules.md` section N).

## Global Constraints

- No em dash or en dash anywhere: code, comments, commits, docs, game text (`CLAUDE.md`).
- Originality: our own art, names, text and numbers. The film is a mood reference only; no film stills in either repo.
  Spec section 9's exclusions list (no war bonnets, sacred pipes, totem poles, dreamcatchers, no "brave", "savage",
  "squaw" or "tribe" as a unit name, no mock war cries or chants) is a hard rule for art, text and sound.
- Engine purity and boundaries (`CLAUDE.md` "Code layout"): no imports from outside `src/engine` inside it; the app
  reaches the engine only through `src/engine/index.ts`; the AI sees only `AiInput`.
- The hard AI fallback (spec section 7) is **not** built. David, 2026-11-26: only if the sims show balance problems,
  and then only with his yes.
- `RULES_VERSION` goes from 10 to 11 (rules 10 is already live in 0.8.0, so "before rules 10" in spec decision 5 now
  means "the next rules version"). If another branch has claimed 11 by merge time, renumber.
- Old states must hash as before: every new `Unit` or `MatchState` field is optional and absent until first set, as
  `relayTurn` and `unhunkeredTurn` are.
- Never merge into `main`, push or deploy without David's yes. `database.rules.json` changes are deployed by the
  controller only, after David's yes, and never while an online match is live (`CLAUDE.md` "Online play").
- Sounds: drafts only; nothing ships until David has listened (memory: sounds listen before push).
- Run `npm run lint`, `npm run typecheck` and `npx vitest run` before every commit; `npm run test:browser` before
  Tasks 11, 14 and 17 are called done; `npm run test:emu` for Task 12.

## Review Focus

1. **Hidden information leaks.** A Woodland unit hidden in a forest, a veiled unit, or a snare must never show up in
   the other player's `playerView`, `AiInput`, board, effects, sounds or text. A shot from a hidden unit shows its
   damage and names the attacker's kind, never its tile. Tests: Task 3 (view), Task 7 (snares), Tasks 13 and 14 (text
   and effects).
2. **A move whose path crosses an enemy snare.** The mover planned the move from its own view; the engine stops it on
   the snare tile and the movement left is lost. The UI must not freeze, misplace the unit or replay the planned path.
   Tests: Task 7 (engine), Task 14 (board follows `moved.to`).
3. **Mirror matches.** Both seats on the same faction: two colours, two names, online settings accepted, stats split by
   player not by faction. Tests: Tasks 11 and 12.
4. **Spartan and Mongol play unchanged.** A refactor of reach, counters or rewards that moves a Spartan or Mongol
   number. Test: Task 1 runs the stage 1 fixture and the seeded soak replays unchanged; every later engine task reruns
   them.
5. **The Dash-strike charge tile filled by an unseen unit.** The UI offered the strike; the engine refuses it and the
   player sees "Something unseen blocks the way" and nothing else. Test: Task 6 (engine refusal), Task 14 (notice).

---

## File structure

Engine (`src/engine`):

- `types.ts`: new ids (faction, units, traits, abilities, events), optional `Unit` and `MatchState` fields.
- `data/factions.ts`, `data/units.ts`, `data/config.ts`, `data/techs.ts`: the faction's numbers.
- `woodland.ts` (new): the faction's pure helpers shared by several handlers: `isHidden`, `isVeiled`, `ambushes`,
  `normalRange`, `forestEyeReach`, `chargeTile`, `snareAt`, `springSnare`. One file so the rules live together.
- `combat.ts`: bow, agile, ambush, forest eye, no mountain range, Dash-strike.
- `movement.ts`: forest stride, guide, path-aware moves that stop on snares.
- `vision.ts`: `canSeeUnit` uses `isHidden`; `playerView` filters snares.
- `abilities.ts`: guide, smoke, snare.
- `economy.ts`: harvest gold, lighter buildings, early champion reward rows.
- `training.ts`: `factionUnits`, replaced units.
- `state.ts`, `capture.ts`, `turn.ts`, `apply.ts`, `index.ts`: start units, treasure unit, legal actions, exports.
- Tests: one file per task, named below. `woodland.*.test.ts` so they group.

AI (`src/ai`): `persona.ts`, `mix.ts`, `plan.ts`, `assess.ts` (danger map), `input.ts` (rival archery guess),
`sim.ts`; `scripts/simai.ts` (faction pair flag).

UI and app: `src/ui/text.ts`, `src/ui/art/palette.ts`, `src/ui/screens/colour.ts`, `src/ui/screens/Setup.tsx`,
`src/ui/screens/OnlineSetup.tsx`, `src/online/wire.ts`, `database.rules.json`, `src/app/store.ts`,
`src/app/stats.ts`, `src/ui/interaction.ts`, `src/ui/panels/commands.ts`, `src/ui/board/Effects.tsx`,
`src/ui/art/factionUnits.tsx`, `src/ui/art/banner.tsx`, `src/ui/terrain3d/units/*`, `src/ui/terrain3d/townLayout.ts`,
`src/ui/terrain3d/town.ts`, `src/ui/terrain3d/buildings.ts`, `src/ui/sound.ts`.

Docs: `docs/rules/stage1-rules.md` gets a new section 15 "Woodland Nations (rules 11)" and a "Rules 11 changes"
changelog; each engine task writes its part.

---

## Phase 1: Engine

### Task 1: Ids, data and rules version

**Files:**
- Modify: `src/engine/types.ts`, `src/engine/data/factions.ts`, `src/engine/data/units.ts`, `src/engine/data/config.ts`,
  `src/engine/data/techs.ts`, `src/engine/training.ts`, `src/engine/index.ts`
- Modify (stand-ins only, so the build compiles): `src/ui/text.ts`, `src/ui/art/palette.ts`, `src/ui/screens/colour.ts`,
  `src/ui/screens/Setup.tsx`, `src/ui/art/factionUnits.tsx`, `src/ui/art/banner.tsx`, `src/ui/terrain3d/units/figures.ts`,
  `src/ui/terrain3d/units/crouch.ts`, `src/ai/persona.ts`, `src/ai/sim.ts`, `src/ai/mix.ts`, and any other
  `Record<FactionId | UnitTypeId | Trait, ...>` the typecheck names
- Test: `src/engine/woodland.data.test.ts`

**Interfaces:**
- Produces:
  - `FactionId = 'spartans' | 'mongols' | 'woodland'`.
  - `UnitTypeId` adds `'skirmisher' | 'woodlandHunter' | 'warChief' | 'smokeKeeper' | 'trapper'`.
  - `Trait` adds `'bow' | 'agile' | 'ambush' | 'dashStrike' | 'forestEye' | 'noMountainRange' | 'guide' | 'smoke' | 'snare'`.
  - `AbilityId` adds `'guide' | 'smoke' | 'snare'`; `ABILITIES = ['heal', 'taunt', 'hasten', 'dustStorm', 'guide', 'smoke', 'snare']`.
  - `FactionDef` adds `forestStride: boolean; forestHidden: boolean; harvestGold: number; buildingGrowthCut: number;
    championFromLevel: number; replaces: Partial<Record<UnitTypeId, UnitTypeId>>; extraStartUnit: UnitTypeId | null`.
    Spartans and Mongols: `false, false, 0, 0, 5, {}, null`.
  - `CONFIG.woodland = { bowAtk: 4, bowShare: 0.7, dashArrowShare: 0.33, dashCounterShare: 0.33, ambushAtk: 1,
    forestEyeRange: 1, snareDamage: 3, snareMax: 3, smokeRange: 2, veilTurns: 2 }`.
  - `factionUnits(f: FactionId): UnitTypeId[]` in `training.ts`: types with a cost whose `faction` is null or `f`,
    minus the keys of `FACTIONS[f].replaces`. Exported from the index. `trainable` uses it.
  - `RULES_VERSION = 11`.

- [ ] **Step 1: Write the failing test** `woodland.data.test.ts`:

```ts
it('the Woodland units have the spec numbers', () => {
  expect(UNITS.skirmisher).toMatchObject({ atk: 5, def: 2, range: 1, move: 1, hp: 10, sight: 2, cost: 3, faction: 'woodland' });
  expect(UNITS.skirmisher.traits).toEqual(['bow', 'agile', 'ambush', 'dashStrike']);
  expect(UNITS.woodlandHunter).toMatchObject({ atk: 4, def: 2, range: 2, move: 1, hp: 10, sight: 2, cost: 4 });
  expect(UNITS.woodlandHunter.traits).toEqual(['ambush', 'forestEye', 'noMountainRange']);
  expect(UNITS.warChief).toMatchObject({ atk: 6, def: 5, range: 1, move: 1, hp: 20, sight: 2, cost: null });
  expect(UNITS.warChief.traits).toEqual(['ambush', 'doubleStrike']);
  expect(UNITS.smokeKeeper).toMatchObject({ atk: 2, def: 2, range: 1, move: 1, hp: 10, sight: 2, cost: null });
  expect(UNITS.smokeKeeper.traits).toEqual(['heal', 'guide', 'smoke']);
  expect(UNITS.trapper).toMatchObject({ atk: 2, def: 2, range: 1, move: 1, hp: 10, sight: 1, cost: 2 });
  expect(UNITS.trapper.traits).toEqual(['snare']);
});
it('momentum prices', () => {
  expect(['skirmisher', 'woodlandHunter', 'smokeKeeper', 'trapper'].map((t) => CONFIG.momentum.price[t as UnitTypeId])).toEqual([1, 1, 1, 1]);
  expect(CONFIG.momentum.price.warChief).toBe(3);
});
it('the faction', () => {
  expect(FACTIONS.woodland).toMatchObject({ startUnit: 'skirmisher', extraStartUnit: 'trapper', champion: 'warChief',
    support: 'smokeKeeper', cityCover: 1.5, canBuildWalls: true, growthExtra: 0, capitalStartLevel: 1, canBuildRoads: true,
    forestStride: true, forestHidden: true, harvestGold: 3, buildingGrowthCut: 1, championFromLevel: 4,
    replaces: { warrior: 'skirmisher', archer: 'woodlandHunter' } });
  expect(TECH_TREES.rules8.start.woodland).toBe('trapping');
  expect(TECH_TREES.rules8.units).toMatchObject({ woodlandHunter: 'archery', trapper: 'trapping' });
});
it('Woodland trains neither the Warrior nor the Archer; the others lose nothing', () => {
  expect(factionUnits('woodland')).not.toContain('warrior');
  expect(factionUnits('woodland')).not.toContain('archer');
  expect(factionUnits('woodland')).toEqual(expect.arrayContaining(['skirmisher', 'woodlandHunter', 'trapper', 'spearman', 'catapult']));
  expect(factionUnits('spartans')).toEqual(expect.arrayContaining(['warrior', 'archer', 'hoplite']));
});
```

- [ ] **Step 2: Run** `npx vitest run src/engine/woodland.data.test.ts`. Expected: FAIL (unknown ids).
- [ ] **Step 3: Implement** the interfaces above. `TECH_TREES.rules7.start.woodland = 'hunting'` is a placeholder to
  satisfy the type (the faction never plays rules 7). For every UI and AI table the typecheck flags, add a stand-in:
  faction name `'Woodland Nations'`; player colour `{ main: '#2F7A3E', dark: '#1F5A2B' }` and accent `'#A4452C'`
  (see the open question at the end); Setup face `'skirmisher'`; 2D figures, 3D figures, crouch poses and banner
  glyphs of the new types point at an existing one (skirmisher and trapper at warrior, woodlandHunter at archer,
  warChief at swordsman, smokeKeeper at piper) with a `// stand-in until Tasks 15 and 16` comment; persona `woodland` is a copy
  of `spartans` with its tech order starting `'trapping'`. Text entries for units and traits get the spec's names and
  blurbs now (spec section 3), so Task 13 only adds new UI strings.
- [ ] **Step 4: Run** `npx vitest run`. Expected: all PASS, with the stage 1 fixture, soak and fingerprint tests
  unchanged except where they assert `RULES_VERSION` (update those numbers only).
- [ ] **Step 5: Commit** `Rules 11: Woodland Nations ids and data`.

### Task 2: Economy and the start of a match

**Files:**
- Modify: `src/engine/economy.ts`, `src/engine/state.ts`, `src/engine/capture.ts`, `src/engine/data/config.ts`
  (`treasure.unit` stays `'warrior'`), `src/engine/index.ts`, `src/ui/panels/commands.ts` (its reward row copy)
- Modify: `docs/rules/stage1-rules.md` (section 15: start, economy, rewards)
- Test: `src/engine/woodland.economy.test.ts`

**Interfaces:**
- Consumes: Task 1's `FactionDef` fields.
- Produces:
  - `rewardOptions(s: MatchState, c: City, level: number): readonly [RewardId, RewardId]` in `economy.ts`, exported:
    `['champion', 'support']` when `level >= FACTIONS[owner faction].championFromLevel`, else today's table row.
    `applyReward` and `commands.ts` use it (delete the private `rewardRow` and the UI copy).
  - `buildingGrowth(s: MatchState, p: PlayerId, b: BuildingId): number` = `max(1, CONFIG.buildings[b].growth - buildingGrowthCut)`.
  - `treasureUnitFor(f: FactionId): UnitTypeId` = `FACTIONS[f].replaces[CONFIG.treasure.unit] ?? CONFIG.treasure.unit`.

- [ ] **Step 1: Write the failing tests:**
  - `a Woodland harvest costs 2 and pays 3 back`: gold 10, harvest a game tile in the capital's land: gold 11, city
    growth +1. Same for orchard, cropland, jewels and fish (each kind). A Spartan harvest: gold 8.
  - `a Woodland building gives 1 less growth, never below 1`: build a Farm (growth 1), a Market (2) and a Lumber camp
    (1) in Woodland land; Mongol Farm gives 2. Market income still +2.
  - `Woodland rewards`: `rewardOptions` for a Woodland city at levels 2, 3, 4, 5, 6, 9 is
    `[gold, scout], [borders, barracks], [champion, support] x4`; a Spartan city at 4 is `[income, growth]`, at 6
    `[champion, support]`. Choosing 0 at level 4 spawns a `warChief`, 1 a `smokeKeeper`.
  - `the Woodland start`: `createMatch({ seed: 7, factions: ['woodland', 'mongols'] })`: player 0 has techs
    `['trapping']`, a Skirmisher on the capital and a Trapper on `firstFreeNeighbor(capital)`, both with full mp, not
    fresh, `home` the capital; capital level 1. A Spartan start has one unit.
  - `a Woodland treasure "unit" gives a Skirmisher`: `treasureUnitFor('woodland') === 'skirmisher'`,
    `treasureUnitFor('spartans') === 'warrior'`, and a claim with the unit outcome (use the seed hunt in
    `treasure.test.ts`) spawns a Skirmisher.
- [ ] **Step 2: Run** `npx vitest run src/engine/woodland.economy.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Harvest: after paying the cost, add `harvestGold`. Build: `addGrowth(s, city,
  buildingGrowth(...))`. `createMatch`: after the start unit, spawn `extraStartUnit` the same way when it is not null
  (if there is no free neighbour, skip it). `capture.ts` line 119 uses `treasureUnitFor`.
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5:** Write the rules text (section 15.1 to 15.3) and commit `Rules 11: Woodland economy, rewards and start`.

### Task 3: Hidden in the forest

**Files:**
- Create: `src/engine/woodland.ts`
- Modify: `src/engine/types.ts` (`Unit.veilUntil?: number`), `src/engine/vision.ts`, `src/engine/index.ts`
- Modify: `docs/rules/stage1-rules.md` (15.4 Woodland cover)
- Test: `src/engine/woodland.hidden.test.ts`

**Interfaces:**
- Produces (in `woodland.ts`, all exported from the index):
  - `isVeiled(s: Pick<MatchState, 'stamp'>, u: Unit): boolean` = `u.veilUntil !== undefined && s.stamp <= u.veilUntil`.
  - `isHidden(s: Pick<MatchState, 'tiles' | 'players' | 'stamp'>, u: Unit): boolean` = the `hidden` trait, or
    `FACTIONS[owner].forestHidden` and the unit's tile is a forest, or `isVeiled`. Takes a view-shaped state so the UI
    and AI can call it.
- `canSeeUnit` uses `isHidden` where it used `hasTrait(u, 'hidden')`.

- [ ] **Step 1: Write the failing tests:**
  - A Woodland Skirmisher on a forest 2 tiles from a Mongol Horseman: not in the Mongol `playerView`; at 1 tile: in it.
  - The same Skirmisher on a field 2 tiles away: seen. A Spartan Hoplite on a forest 2 tiles away: seen.
  - A Woodland unit on a forest next to a Mongol city tile (no Mongol unit near): seen (the city reveals it).
  - `isVeiled`: `veilUntil` = stamp 5 is veiled at stamp 5, not at 6; absent is never veiled.
  - Hash compat: after 40 seeded AI actions in a Spartan and Mongol match, `canonical(state)` holds no `veilUntil`,
    `guidedTurn` or `snares` key (reuse this helper in Tasks 7 and 8).
- [ ] **Step 2: Run** `npx vitest run src/engine/woodland.hidden.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the interfaces.
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5:** Rules text and commit `Rules 11: Woodland units hide in forests`.

### Task 4: Forest stride

**Files:**
- Modify: `src/engine/movement.ts` (`plainStep`), `docs/rules/stage1-rules.md` (15.5)
- Test: `src/engine/woodland.move.test.ts`

**Interfaces:**
- Produces: nothing new outside `movement.ts`. In `plainStep`, a forest costs `CONFIG.terrain.field.enterCost` (2)
  when `faction.forestStride`; roads, engagement, the mountain rule and fog are unchanged.

- [ ] **Step 1: Write the failing tests:** a Woodland-owned shared Horseman (move 2, mp 4) on a field with two forests
  in a row ahead reaches the second forest with 0 left; a Spartan Horseman reaches only the first. A Woodland
  Skirmisher next to an enemy stops on entering a tile beside it (engagement unchanged). A Woodland unit still cannot
  climb a mountain without `prospecting`.
- [ ] **Step 2: Run** the file. Expected: FAIL on the first test.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5:** Rules text and commit `Rules 11: Woodland units walk forests as fields`.

### Task 5: Bow, agile, ambush, forest eye

**Files:**
- Modify: `src/engine/woodland.ts`, `src/engine/combat.ts`, `src/engine/index.ts`, `docs/rules/stage1-rules.md` (15.6)
- Test: `src/engine/woodland.combat.test.ts`

**Interfaces:**
- Consumes: `isHidden` (Task 3).
- Produces (all exported from the index):
  - `normalRange(s: Pick<MatchState, 'players'>, u: Unit): number` in `woodland.ts`: the type's range, or 2 for a
    `bow` unit whose owner knows `archery`.
  - `forestEyeReach(s, u): number`: `CONFIG.woodland.forestEyeRange` for a `forestEye` unit standing on a forest that
    has not moved and not acted this turn, else 0.
  - `ambushes(s: MatchState, attacker: Unit, target: Unit): boolean`: the attacker has `ambush`, `isHidden(attacker)`,
    and `!canSeeUnit(s, target.owner, attacker)`, judged before any damage.
  - In `combat.ts`: `mountainReach` uses `normalRange(...) >= 2` and returns 0 for `noMountainRange`;
    `attackReach = blinded ? blindedReach : normalRange + mountainReach + forestEyeReach`; `longShot` is
    `distance > normalRange` (covers the mountain and the forest eye; scale stays `CONFIG.mountain.longShotScale`);
    `counterReach` uses `normalRange`.
  - `bowShot(s, attacker, target): boolean` in `woodland.ts`: a `bow` unit attacking or countering at distance 2 or more.
  - `strikeDamage` gains the bow: for a bow shot, `effAtk` is `(bowAtk + (attackOf - type atk)) * hf + ambushAtk if
    ambush`, the formula result times `bowShare`, rounded, at least 1, then the long shot cut. For any other ambush,
    `effAtk + ambushAtk`. Ambush means no counter.
  - Agile: in the counter, after Watchful, `if hasTrait(attacker, 'agile') counter = max(1, counter - 1)`.
  - The bow counter at distance 2: `max(1, round(bowShare * damageFor((bowAtk + bonus) * f * hf, defenceOf(attacker), 1)))`.
  - `statsOf().range` already reads `attackReach`, so the card shows 1 or 2.

- [ ] **Step 1: Write the failing tests** (full health, fields, no cover unless said):
  - Skirmisher without archery: reach 1. With archery: reach 2. On a mountain with archery: 3.
  - Skirmisher (archery) shoots a Warrior at 2: damage 4 (`round(0.7 * damageFor(4, 3, 1) = 6)`); the Warrior has
    reach 1, so counter 0.
  - Skirmisher melee on a Warrior: damage 8; counter 1 (2 before agile).
  - An Archer shoots a Skirmisher (archery) at 2: damage 7; the Skirmisher counters with the bow for 1.
    Without archery it does not counter.
  - Ambush: a Skirmisher (archery) hidden on a forest shoots a Warrior at 2 that cannot see it: damage 6
    (`round(0.7 * damageFor(5, 3, 1) = 8)`), counter 0. The same shot from a field: 4, no ambush. The same from a
    forest with an enemy Horseman next to the Skirmisher (so it is seen): 4.
  - Melee is never an ambush today: a War Chief on a forest next to a Warrior is seen by it (`hiddenRevealRange` 1),
    so `ambushes` is false and the Warrior strikes back.
  - Fierce carries to the bow: a Fierce Skirmisher's shot at a Warrior is `round(0.7 * damageFor(5, 3, 1)) = 6`.
  - Woodland Hunter on a forest, not moved: reach 3, a shot at 3 does 5 (`round(6 * 0.8)`); after a move: reach 2.
    On a mountain: reach 2. Its counter reach is 2.
  - Hunter spotter: a Hunter on a forest with a Warrior at 3 that no other Woodland unit or city sees: not in
    `attackTargets`; add a Woodland Skirmisher 2 from the Warrior: it is.
  - Skirmisher with archery on a mountain shoots at 3: `round(round(0.7 * 6) * 0.8) = 3`.
  - Spartan and Mongol numbers: rerun `combat.test.ts`, `mountain.test.ts`, `momentum.test.ts` untouched.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement.** Keep `strikeDamage` the one function the attack and every estimate call; give it an
  optional last argument `ambush: boolean` the attack handler passes (estimates pass `ambushes(...)` themselves).
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5:** Rules text and commit `Rules 11: bow, agile, ambush and forest eye`.

### Task 6: Dash-strike

**Files:**
- Modify: `src/engine/types.ts` (attack action `dash?: boolean`; event `{ type: 'dashStrike'; unit: number; target: number; via: HexKey }`),
  `src/engine/woodland.ts`, `src/engine/combat.ts`, `src/engine/apply.ts`, `src/engine/index.ts`,
  `docs/rules/stage1-rules.md` (15.7)
- Test: `src/engine/woodland.dash.test.ts`

**Interfaces:**
- Consumes: `normalRange`, `ambushes`, `bowShot` (Task 5).
- Produces:
  - `chargeTile(s: MatchState, attacker: Unit, targetPos: HexKey): HexKey | null` in `woodland.ts`: the first tile in
    `DIRS` order next to both that is enterable, not a mountain, explored by the attacker's owner, and holds no unit.
    Takes the real state; called on a believed state it gives the player's own guess.
  - `dashTargets(s: MatchState, unitId: number): HexKey[]`, exported: those of `attackTargets` at distance exactly 2,
    for a `dashStrike` unit whose owner knows `archery`, with `chargeTile !== null`.
  - `legalActions` lists `{ type: 'attack', unit, target, dash: true }` after the plain attack for each dash target.
  - `attackHandler` with `dash: true`: refuses `'cannot dash-strike there'` if the target is not in `dashTargets`.
    Then: push `dashStrike`; the arrow (`dashArrowShare` of a bow shot, ambush +1 on it only, guard with every bonus,
    no counter), an `attacked` event with `counter: 0`; if the target lives, the charge `damageFor((5 + bonus) * hf,
    defNoShield, cover)` where `defNoShield = UNITS[type].def + Hardy + myth touch` (no phalanx, hunker or brace), and
    the counter `max(1, round(dashCounterShare * normal counter))` minus agile (and Watchful), at least 1, in a second
    `attacked` event. No advance, `mp = 0`, one Fight deed plus 2 per kill, no March. Task 8 adds the veil loss after
    the attack.

- [ ] **Step 1: Write the failing tests:**
  - The spec worked example: a Skirmisher (archery) Dash-strikes a Hoplite with two Hoplites beside it, all on fields:
    events `dashStrike`, `attacked { damage: 1, counter: 0 }`, `attacked { damage: 6, counter: 1 }`; Hoplite 8 hp;
    Skirmisher 9 hp, still on its own tile, mp 0.
  - A plain attack on the same Hoplite (from next to it) does 5 and takes 6 back.
  - No charge tile (both shared neighbours are water or hold units): no `dash` action listed. A charge tile held by an
    enemy the attacker cannot see: the action is listed from the attacker's `believedState`-like view (build one with
    the unit removed) but `applyAction` on the real state refuses it.
  - Hunkered target: arrow uses the hunker defence, charge ignores it.
  - Arrow kill: a 1 hp target dies to the arrow; no second `attacked` event; no counter.
  - A Dash-strike from a forest at a target that cannot see it: arrow damage uses attack 5; counter still applies.
  - Without archery: no dash actions. Distance 1: no dash action.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5:** Rules text and commit `Rules 11: Dash-strike`.

### Task 7: Snares and path-aware moves

**Files:**
- Modify: `src/engine/types.ts` (`MatchState.snares?: { owner: PlayerId; at: HexKey }[]`, oldest first; event
  `{ type: 'snared'; unit: number; at: HexKey; damage: number }`), `src/engine/woodland.ts`, `src/engine/movement.ts`,
  `src/engine/abilities.ts`, `src/engine/combat.ts`, `src/engine/vision.ts`, `src/engine/index.ts`,
  `docs/rules/stage1-rules.md` (15.8)
- Test: `src/engine/woodland.snare.test.ts`

**Interfaces:**
- Produces:
  - `snareAt(s, at: HexKey, notOwner: PlayerId): boolean` and `springSnare(s, u: Unit, ev): boolean` (true when it
    sprang) in `woodland.ts`. Springing: remove that snare, `u.hp -= snareDamage`, push `snared`, then `mp = 0`,
    `bonusMp = 0`; if `hp <= 0`, `removeUnit` and `died`, with no deeds to anyone.
  - `pathTo(s, u, to): HexKey[]` in `movement.ts`: the tiles of the way `explore` found to `to`, start excluded. Keep
    a parent per search node in `explore`; ties keep the first parent found, so the path is deterministic.
  - `moveHandler`: walk `pathTo`; the first tile with an enemy snare is where the move ends (`u.pos` there, `mp = 0`),
    then `springSnare`. The `moved` event and the March deed use the tile reached. `reachable` and `legalActions`
    ignore snares (the mover cannot see them).
  - `pullLured` and the kill advance call `springSnare` after placing the unit. A chain unit sprung on its advance: its
    chain ends as a mountain advance does (`chainEnded`, attacks 0); spring it after the attack's credits, so the kill
    and momentum count.
  - Ability `snare` (`abilityTargets`): an explored field or forest tile next to the Trapper with no unit, city,
    village, treasure, or snare of the setter's own. Setting adds `{ owner, at }`; past `snareMax`, drop the owner's
    oldest. It uses the ability like the others (`attacks -1`, `mp 0`, `acted`).
  - `playerView` gets `snares` filtered to the viewer's own (add `snares` to `PlayerView`).
  - `snares` stays absent on a match where none was ever set.

- [ ] **Step 1: Write the failing tests:**
  - Set a snare: listed targets exclude a village, a mountain, a tile with a unit, an unexplored tile; a 4th snare
    removes the oldest; the Trapper's `attacks` 0 and `mp` 0 after.
  - A Mongol Horseman moving 2 tiles through a snare tile stops on it: `moved.to` is the snare tile, hp 7, mp 0, the
    snare is gone, March deed 1. It can still attack next to it.
  - A unit with 3 hp dies on it: `died`, no deeds credited.
  - The owner's own unit walks over its snare: nothing happens.
  - A Knight's kill advance onto a snare: kill and momentum paid, `snared`, `chainEnded`, attacks 0.
  - A lured unit pulled onto a snare springs it.
  - A champion placed by a reward onto a Woodland snare beside its city does not spring it, and the snare stays.
  - The Mongol `playerView` and `aiInputFor` hold no Woodland snare; the Woodland view holds all three.
  - `hashState` of a Spartan and Mongol match is unchanged (no `snares` key).
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS, including `relay.test.ts` and `pathfinder.test.ts`.
- [ ] **Step 5:** Rules text and commit `Rules 11: the Trapper's snares`.

### Task 8: Smoke and guide

**Files:**
- Modify: `src/engine/types.ts` (`Unit.guidedTurn?: number`), `src/engine/abilities.ts`, `src/engine/movement.ts`,
  `src/engine/combat.ts`, `docs/rules/stage1-rules.md` (15.9)
- Test: `src/engine/woodland.smoke.test.ts`

**Interfaces:**
- Consumes: `isVeiled` (Task 3), the Dash-strike veil line (Task 6).
- Produces:
  - Ability `guide`: targets a friendly unit next to the Smoke Keeper, not itself, not `turnEnded`. Sets
    `guidedTurn = s.stamp`. In `explore`, `nextToEnemy` does not zero the movement left when `u.guidedTurn === s.stamp`.
    It still cannot pass through enemy units.
  - Ability `smoke`: targets any tile within `smokeRange` with at least one friendly unit on it or next to it. Every
    friendly unit there gets `veilUntil = s.stamp + veilTurns` (2: to the end of its owner's next turn).
  - An attack (any kind, a Dash-strike too) by a veiled unit is judged with the veil (so it can be an ambush), and
    then deletes its `veilUntil`.
  - Heal works as the Piper's (data only).

- [ ] **Step 1: Write the failing tests:**
  - Guide: a guided Skirmisher walks past an enemy Warrior (two tiles, both beside it) in one move; unguided it stops on
    the first. Guide works on a unit that has already moved. Guide lasts this turn only (stamp +2: stops again).
  - Smoke: a Woodland Skirmisher on a field 2 tiles from a Mongol unit is hidden after smoke; still hidden through the
    Mongol turn (stamp +1) and the next Woodland turn (stamp +2); seen at stamp +3. An enemy next to it sees it.
  - A veiled Skirmisher on a field shoots a Warrior that cannot see it: ambush (damage 6, no counter), and it is seen
    afterwards. A veiled Skirmisher on a forest shoots: ambush, and it stays hidden (Woodland cover).
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 5:** Rules text, the "Rules 11 changes" changelog, and commit `Rules 11: smoke and guide`.

---

## Phase 2: AI

### Task 9: The AI plays the Woodland Nations

**Files:**
- Modify: `src/ai/persona.ts`, `src/ai/mix.ts`, `src/ai/sim.ts`, `src/ai/plan.ts`, `scripts/simai.ts`
- Test: `src/ai/woodland.test.ts`

**Interfaces:**
- Consumes: `factionUnits`, `dashTargets`, the new abilities, `ABILITIES`.
- Produces:
  - `PERSONAS.woodland`: `formation 0.5, hold 0.4, spread 4, raid 1, forestPenalty -1` (a negative penalty draws it to
    forests; check `assess.ts` treats the sign so), `techOrder` starting `trapping, archery, foraging, logging, gathering,
    farming, prospecting, spears, siege, orchards, riding, defence, walls, mining, smithing, granary, chivalry, milling,
    plantations, foundry, fishing`, `mix: { skirmisher: 5, woodlandHunter: 2.5, trapper: 0.6, spearman: 0.8,
    catapult: 0.6, swordsman: 0.6, defender: 0.4, horseman: 0.4, knight: 0.4 }`, `counter 1`.
  - `mix.ts` and `sim.ts` use `factionUnits` in place of their own filters; every `Record<FactionId, ...>` in `sim.ts`
    builds from `Object.keys(FACTIONS)`.
  - `plan.ts`: `ABILITY_IDS` is the engine's `ABILITIES`; a dash variant is scored as its own candidate (unlike a lure
    it is a different attack); a snare is scored `+0.3` for a tile in or next to its own territory on a path from a
    seen enemy unit (distance to that enemy at most 4), `0` otherwise; smoke and guide are scored by `scoreAfter` as
    any ability.
  - `scripts/simai.ts --factions a,b` (default `spartans,mongols`), applied to both seatings as today.

- [ ] **Step 1: Write the failing tests:** a seeded `runMatch` Woodland against Mongols at normal finishes within 60
  rounds without a refused action; over 4 seeds the Woodland side trains a Skirmisher, a Woodland Hunter and a
  Trapper, takes a Dash-strike, sets a snare and uses smoke at least once in all (count from events); the planner
  never lists a Warrior or Archer for Woodland.
- [ ] **Step 2: Run** `npx vitest run src/ai/woodland.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/ai`. Expected: PASS, with `character.test.ts` (Spartans and Mongols) unchanged.
- [ ] **Step 5: Commit** `AI: plays the Woodland Nations`.

### Task 10: The AI respects ambushes

**Files:**
- Modify: `src/ai/assess.ts`, `src/ai/plan.ts`, `src/ai/input.ts`, `src/ai/scenarios.ts`
- Test: `src/ai/ambush.test.ts`

**Interfaces:**
- Produces:
  - `riskyTiles(b: MatchState, me: PlayerId): Set<HexKey>` in `assess.ts`: for each Woodland rival, the tiles within 2
    of a forest tile the AI cannot see units on, where that forest is within 2 of the rival's territory or of a rival
    unit it can see now. Built only from the believed state (so from `aiInputFor`).
  - The move score subtracts `RISK_WEIGHT = 0.6` times the unit's share of lost health (`1 - hp / maxHp`) plus `0.3`
    for a unit with `def <= 2`, when it ends on a risky tile; a unit with `hp >= 15` and `def >= 4` gets `+0.2` for
    ending next to an unseen forest (it reveals). Tune the weights in Task 19, not here.
  - `believedState`: a Woodland rival with `turnsTaken >= 4` is believed to know `archery` (it can then shoot with
    Skirmishers); others as today.
- [ ] **Step 1: Write the failing tests:** a scenario with an unseen forest next to a Woodland city: a wounded Mongol
  Horseman's best move avoids the tiles beside it; a full-health Defender's best move ends next to it. A Woodland
  unit's true position never changes the AI's choice (run the same `AiInput` with and without a hidden Skirmisher in
  the real state: identical plans).
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/ai`. Expected: PASS.
- [ ] **Step 5: Commit** `AI: wary of forests near the Woodland Nations`.

---

## Phase 3: App and UI

### Task 11: Faction picker, mirror matches and seat colours

**Files:**
- Modify: `src/ui/art/palette.ts`, `src/ui/screens/colour.ts`, every `playerColour` / `PLAYER_COLOURS` /
  `FACTION_COLOUR` call that colours a player (22 files; `grep -rn "playerColour\|PLAYER_COLOURS\|FACTION_COLOUR" src`),
  `src/ui/screens/Setup.tsx`, `src/app/store.ts`, `src/app/stats.ts`, `src/ui/screens/Stats.tsx`, `src/ui/text.ts`
- Test: `src/ui/screens/screens.test.tsx` (extend), `src/ui/art/palette.test.ts` (new), `src/app/stats.test.ts` (extend)

**Interfaces:**
- Produces:
  - `seatColour(players: readonly { faction: FactionId }[], id: PlayerId): { main: string; dark: string }` in
    `palette.ts`: the faction's colour, except seat 1 in a mirror match gets `MIRROR_COLOUR = { main: '#6B3FA0',
    dark: '#4E2D77' }`. `seatAccent` likewise (mirror accent `'#C9B6E4'`). Every place that colours a player's units,
    cities, borders, banners or HUD uses these. `playerColour(faction)` stays for faction cards only.
  - `Setup.tsx`: each seat has its own faction chips (Spartans, Mongols, Woodland Nations), defaults Spartans and
    Mongols; the swap button swaps the two choices; the line under the cards names each player's faction.
  - Stats record each player's faction per match; filters gain Woodland Nations; a mirror match counts for both.
- [ ] **Step 1: Write the failing tests:** `seatColour` for `[woodland, woodland]` gives two different mains; for
  `[spartans, mongols]` gives today's colours. Setup with seat 0 Woodland and seat 1 Woodland starts a match with
  `factions: ['woodland', 'woodland']`. Stats from a mirror match list one win and one loss for Woodland.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** Before choosing the Woodland player colour, see the open question below; keep the Task 1
  stand-in until David answers.
- [ ] **Step 4: Run** `npx vitest run` and `npm run test:browser`. Expected: PASS.
- [ ] **Step 5: Commit** `Faction picker for three factions; mirror matches get a second colour`.

### Task 12: Online rooms with three factions

**Files:**
- Modify: `src/online/wire.ts`, `src/ui/screens/OnlineSetup.tsx`, `src/app/store.ts` (`createRoom` takes
  `factions: [FactionId, FactionId]`), `src/net/*` (room shape), `database.rules.json`, `docs/online.md`
- Test: `src/online/wire.test.ts`, `src/net/contract.ts` cases, emulator suite

**Interfaces:**
- Produces: a room stores `hostFaction` and `guestFaction`; `factionsFor(host, guest)` returns them; `decodeSettings`
  accepts equal factions and `'woodland'`. `database.rules.json` validates both fields against the three ids.
- [ ] **Step 1: Write the failing tests:** `decodeSettings` accepts `['woodland', 'woodland']` and refuses
  `['woodland', 'elves']`; the emulator contract creates a Woodland-against-Spartans room and plays a move.
- [ ] **Step 2: Run** `npx vitest run src/online` and `npm run test:emu`. Expected: FAIL.
- [ ] **Step 3: Implement.** The host picks both factions in `OnlineSetup`.
- [ ] **Step 4: Run** them again. Expected: PASS.
- [ ] **Step 5: Commit** `Online: three factions and mirror rooms`. Do not deploy the rules: the controller deploys
  `database.rules.json` after David's yes, with no live match (`npx firebase database:get /rooms` first).

### Task 13: Text, cards and commands

**Files:**
- Modify: `src/ui/text.ts`, `src/ui/panels/commands.ts`, `src/ui/panels/UnitPanel.tsx`, `src/ui/interaction.ts`
- Test: `src/ui/text.test.ts`, `src/ui/panels/commands.test.ts`, `src/ui/interaction.test.ts`

**Interfaces:**
- Consumes: the dash action flag, the new abilities and events.
- Produces:
  - `ActionIndex.dashes: Record<number, HexKey[]>`, filled from `dash: true` attacks; a tap on a dash target asks
    `askDash` as the lure does (`askLure`): the unit card offers "Shoot" and "Dash-strike" (`T.ui.attackDash`).
  - Ability labels and blurbs: Guide "Lets a friend beside it slip past enemies this turn.", Smoke "Hides friends on and
    around a tile until the end of your next turn.", Snare "Hides a snare that hurts and stops the next enemy to step
    on it." Trait entries for bow, agile, ambush, dashStrike, forestEye, noMountainRange (one plain sentence each, from
    spec section 4).
  - `techFor.woodland = { walls: 'Palisade' }`.
  - Event text: `snared` "{unit} stepped on a snare and took {n} damage."; an `attacked` event whose attacker the
    viewer cannot see: "{target} took {n} damage from a {kind}." (the kind from the full state's unit type; never a
    tile); `dashStrike` "{unit} made a Dash-strike."
- [ ] **Step 1: Write the failing tests:** each new entry is present and dash-free; the card for a Skirmisher with a
  dash target shows both commands; the hidden-attacker line names the kind.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/ui`. Expected: PASS.
- [ ] **Step 5: Commit** `UI: Woodland text, Dash-strike command, abilities`.

### Task 14: Board: hidden attackers, snares, veils, the Dash-strike

**Files:**
- Modify: `src/ui/board/Effects.tsx`, `src/ui/board/effects.ts`, `src/ui/board/scene.ts`, `src/ui/terrain3d/unitsInput.ts`,
  `src/ui/terrain3d/units/strike.ts`, `src/ui/board/Board.tsx`
- Test: `src/ui/board/effects.test.ts`, `src/ui/terrain3d/unitsInput.test.ts`, a browser test `src/browser/woodland.test.ts`

**Interfaces:**
- Produces:
  - An attack effect whose attacker the viewer cannot see draws no arrow or source mark: only the hit on the target.
  - The owner sees each own snare as a small trap mark on its tile; nobody else does.
  - `unitShown` gets `hidden` from `isHidden` (forest, veil or trait), so the existing slashed-eye mark shows on the
    owner's hidden Woodland units (the spec's "faded" is this existing mark; no unit is drawn see-through).
  - The Dash-strike animation: run to the charge tile (`dashStrike.via`), strike, run back; about 0.6 s. The board
    always ends on the engine's positions.
  - A move stopped by a snare animates only to `moved.to` and plays the snare effect there.
- [ ] **Step 1: Write the failing tests:** the effects list for a hidden shot holds no source tile; `unitsInput` marks
  a Woodland unit on a forest hidden for its owner only; the browser test plays a seeded Woodland match to a snare
  stop and checks the unit stands on the snare tile, and a refused Dash-strike shows "Something unseen blocks the way."
- [ ] **Step 2: Run** them (`npm run test:browser` for the browser one). Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run` and `npm run test:browser`. Expected: PASS.
- [ ] **Step 5: Commit** `Board: hidden shots, snares, veils and the Dash-strike run`.

### Task 15: Unit art, 2D and emblems

**Files:**
- Modify: `src/ui/art/factionUnits.tsx`, `src/ui/art/banner.tsx`, `src/ui/art/palette.ts`, `src/ui/screens/Setup.tsx`,
  `src/ui/art/ArtSheet.tsx`
- Test: `src/ui/art/factionUnits.test.tsx`, `src/ui/art/banner.test.tsx`

**Interfaces:**
- Produces: five 2D figures and five emblem glyphs per spec section 6 (emblem table), replacing the Task 1 stand-ins;
  the faction banner, a pine on a green disc with an ochre ring; faction colours forest green `#2F5D3A`, red ochre
  `#A4452C`, bone `#E9E1CF` as the figures' own colours (not the player colour).
- [ ] **Step 1: Write the failing tests:** every Woodland type has its own figure and glyph (not a shared one); the art
  sheet renders them.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** Use an Opus subagent (art); render the art sheet and look at it at phone size before
  committing.
- [ ] **Step 4: Run** `npx vitest run src/ui/art`. Expected: PASS.
- [ ] **Step 5:** Send David the art sheet render, then commit `Art: Woodland figures and emblems`.

### Task 16: 3D figures and the hunker pose

**Files:**
- Modify: `src/ui/terrain3d/units/figures.ts`, `parts.ts`, `crouch.ts`, `strike.ts`, `idle.ts`
- Test: `src/ui/terrain3d/units/units3d.test.ts`, `crouch.test.ts`

**Interfaces:**
- Produces: five chunky toy figures per spec section 6 (War Chief from David's reference photo
  `.superpowers/reference/third-faction/war-club-reference.webp`, kept to the listed elements); crouch poses: War Chief,
  Skirmisher and Hunter sling the weapon onto the back (`WEAPON` piece moved to the back) and squat on the balls of the
  feet; Smoke Keeper and Trapper crouch low with arms around the knees; the bow shot uses the existing `BOW` and `ARROW`
  pieces.
- [ ] **Step 1: Write the failing tests:** `ALL_TYPES` includes the five; each builds with a shadow; each has a crouch
  pose; the three weapon carriers' crouch moves `WEAPON` behind the body.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** with an Opus subagent; render shots with the `scripts/units3d`-style shot script and look.
- [ ] **Step 4: Run** `npx vitest run src/ui/terrain3d`. Expected: PASS.
- [ ] **Step 5:** Send David the shots, then commit `3D: Woodland figures and hunker poses`.

### Task 17: Woodland towns and tile improvements

**Files:**
- Modify: `src/ui/terrain3d/townLayout.ts`, `src/ui/terrain3d/town.ts`, `src/ui/terrain3d/buildings.ts`,
  `src/ui/terrain3d/buildingLayout.ts`, `src/ui/board/RoadSheet.tsx` (trail)
- Test: `src/ui/terrain3d/townLayout.test.ts`, `src/ui/terrain3d/buildingLayout.test.ts`

**Interfaces:**
- Produces: `townPlan` for `faction === 'woodland'` by level: L1 two tipis; L2 a tipi and a longhouse; L3 adds a wigwam
  cluster; L4 adds a council lodge; L5 and up adds a log palisade ring; walls draw the palisade at any level; at least
  one tipi at every level. Tile buildings on Woodland land use the spec section 6 improvements table (lean-to, hogan,
  wigwam farm, raised storage longhouse, berry thicket, trading lodge); roads on Woodland land draw as a worn trail.
- [ ] **Step 1: Write the failing tests:** the plan's pieces per level (counts of tipi, longhouse, wigwam, lodge,
  palisade); a tipi at levels 1 to 8; each building id maps to a Woodland piece on Woodland land and to today's piece
  elsewhere.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** with an Opus subagent; take shots per level.
- [ ] **Step 4: Run** `npx vitest run src/ui/terrain3d` and `npm run test:browser`. Expected: PASS.
- [ ] **Step 5:** Send David the shots, then commit `3D: Woodland towns and improvements`.

### Task 18: Sound drafts

**Files:**
- Create: drafts in the workspace repo `scratch/audio/woodland/` (not in this repo)
- Modify (only after David's yes): `src/ui/sound.ts`, `public/sounds/`

- [ ] **Step 1:** Make drafts: a wooden knock, a bowstring snap, a quick run of footfalls (Dash-strike), a soft snap
  (snare), low forest ambience. Nothing from sacred songs or war cries.
- [ ] **Step 2:** Send them to David and wait. On his yes, wire them in `SOUNDS`, `ORDER` and `HEARD_RULES` with a
  test in `src/ui/sound.test.ts` that `snared` and `dashStrike` pick their sounds, and commit `Sound: Woodland`.

---

## Phase 4: Balance and release

### Task 19: Sims and tuning

**Files:**
- Create: `docs/superpowers/plans/2026-11-26-woodland-tuning-log.md`
- Modify (tuning only): `src/engine/data/*`, `src/ai/persona.ts`, the rules file

- [ ] **Step 1:** Run each pair on the sim worker (`ssh simworker`), in the background:
  `npx tsx scripts/simai.ts --factions woodland,spartans --matches 100 --seed 1 --a L --b L --swap --jobs 8` for
  L = normal and hard; the same for `woodland,mongols` and `woodland,woodland`; and `spartans,mongols` to check it
  did not move.
- [ ] **Step 2:** Compare with the targets: Woodland wins 40% to 60% in each pair at normal and hard; median rounds at
  most 40; stalls at 60 rounds at most 20%; the Spartans against Mongols shares unchanged from 0.8.0.
- [ ] **Step 3:** If off target, try the levers in this order, one at a time, recording every run in the log:
  `harvestGold`, the Skirmisher's cost, the Dash-strike shares, `championFromLevel`, Woodland cover for foot units
  only, then dropping the extra start Trapper. Then the AI weights of Task 10.
- [ ] **Step 4:** If the AI's blunders into ambushes are the cause and no lever fixes it, stop and ask David about the
  fallback (spec section 7). Do not build it unasked.
- [ ] **Step 5:** Commit each kept change with its numbers: `Rules 11 tuning: <lever> (<shares>)`.
- [ ] **Biomes:** when biomes exist, repeat the Woodland pairs on each of arid, snow, grasslands and jungle, and name
  the best biome in the log (spec decision 2). Not part of this branch if biomes are not merged yet.

### Task 20: Final review and hand-off

- [ ] **Step 1:** `npm run lint && npm run typecheck && npx vitest run && npm run test:browser && npm run test:emu`.
  Expected: all PASS.
- [ ] **Step 2:** A whole-branch review (Fable, per the subagent model memory) against the spec and this plan, with the
  Review Focus list.
- [ ] **Step 3:** Write `docs/superpowers/plans/2026-11-26-woodland-report.md` (what was built, sims, open items).
- [ ] **Step 4:** Ask David before merging, pushing, deploying the app or the database rules.

---

## Open question for David

Raised while planning, not in the spec:

1. **The Woodland player colour.** Today a player's colour is their faction's (Spartans red, Mongols blue). The
   spec's forest green is close to the grass and may read poorly on the board. Use a green anyway (stand-in
   `#2F7A3E`), or a different colour such as amber?
