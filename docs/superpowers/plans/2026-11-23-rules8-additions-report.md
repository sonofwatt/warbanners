# Rules 8 additions: build report

Built on `mountains` from the brief `2026-11-23-rules8-additions.md` (sections 1 to 4; section 5, climbing must be
researched, and the draught change to hunker in section 4, both added by David during the build and written into the
brief). `RULES_VERSION` stays 8, the version
0.6.0. Nothing pushed, merged or deployed. No sound changes. `database.rules.json` untouched. Every number is read from
`CONFIG`, `FACTIONS` or `UNITS`.

## What changed, by section

### 1. City vision is territory only

- `CONFIG.citySightExtra` is 0 (was 1). `visibleTiles` already read it; nothing else changed in the engine.
- Test: a city sees exactly its territory radius (`vision.test.ts`).

### 2. The Scout loses pathfinder, gets sight 2

- `UNITS.scout`: sight 2, traits `hidden, noCityCapture`. The pathfinder code in `movement.ts` and the `moveEnds` mark
  for a fog step stay, dormant.
- The pathfinder movement tests moved to `src/engine/pathfinder.test.ts`, which mocks the unit table to give the Scout
  the trait back. The UI fog-step mark test (`interaction.test.ts`) now builds its action index by hand, since the
  boundary rules forbid a UI test from mocking `engine/data` and no unit offers such a move any more.
- Text: the Scout blurb now says it sees two tiles away (no fog line). The `pathfinder` trait text stays: it describes
  the trait, which no unit has. There is no tutorial or tech-tree line about the Scout and the fog.
- Tests: Scout sight 2, no pathfinder, never offered or allowed a move onto an unexplored tile (`movement.test.ts`,
  `connect.test.ts`, the old "sight 1 can step into the fog" test rewritten).

### 3. Mongol riding and roads

- `FactionDef` has two new flags: `relayMountedOnly` and `canBuildRoads`. Mongols: `mountedMoveBonus 0`,
  `territoryRiding false`, `relayMountedOnly true`, `canBuildRoads false`. Spartans: `relayMountedOnly false`,
  `canBuildRoads true`.
- `reachable`: the relay cost applies when `relayRiders && (mounted || !relayMountedOnly)`, for any step whose
  destination is an own territory tile (unchanged test). The mountain check is still first.
- `roadRefusal` refuses with `'your faction cannot build roads'` before any other test, so the road action is never
  listed and never accepted for Mongols. Roads on the map work for every unit as before. Text: "Your people do not
  build roads".
- `ridingBonus` and the territory code still work and give 0. The rules 6 and 7 riding tests moved to
  `src/engine/mongols.rules7.test.ts`, which mocks the Mongol faction back to the rules 7 data.
- The roads tech stays in the Mongol tree. The tech sheet now lists what a tech opens for the viewer's faction
  (`unlocks(tech, faction)`): Mongol Roads shows the Camp only, Spartan Roads the road only (it used to list the Camp
  for both), Spartan Shieldwork no Walls. Chivalry still follows Roads on the ladder.
- Unit card: the "Rides by territory" line is replaced by "Rides Mongol land" (`T.ui.relayRiding`), shown for the
  units relay riding applies to (mounted Mongols).
- Tests (`mongols.test.ts`): a mounted unit pays the relay cost onto own territory starting inside or riding in, over a
  forest too; normal costs outside; no half-point (mp 4); a foot unit pays normal costs in its own territory and a
  road's where one is; the mountain rule wins; a Mongol road is refused, leaves the state unchanged and is never in
  legal actions; a Spartan still builds one; the roads tech still leads to chivalry and the Camp.

### 4. Hunker heals at the end of its owner's turn

- `CONFIG.hunker.healAtTurnEnd: true`. In `endTurnHandler`, after the rest flags are set (step 2b), every hunkered
  unit of the ending player has its `restHealAt` worked out first (one `visibleTiles` for the ending player), then
  applied, capped at max health. Its `rested` flag is cleared, so `passTurn` gives it nothing at the start of its next
  turn. A heal that adds health pushes a new `restHealed { unit, hp }` event and a rest deed (never for a fresh unit).
- Draught (added by David during the build): `CONFIG.hunker.drinkKeepsHunker: true`. `hunkerRefusal` no longer
  counts a drink this turn (a unit may hunker if it has not moved, attacked, used an ability, captured or claimed), and
  `applyAction` no longer ends a hunker on the unit's own `useItem`. Every other hunker rule is as before. A hunkered
  unit that drinks gets the draught's attack; attacking with it ends the hunker as any attack does. Tests: a unit that
  drank may hunker (and it is listed); drinking while hunkered keeps it, attacking after ends it; the switch off
  replays rules 7 for both (`hunker.rules7.test.ts`).
- The board shows `restHealed` as a `+N` heal number, under the same secrecy rules as the other numbers. No sound.
- Text: the Hunkered card line says it heals at the end of each of its turns and that a drink does not end it; the Hunker button has help text
  (`T.ui.hunkerHint`, "...it heals at the end of this turn"), given as the button's title. There was no help text
  mechanism, so `Command` has an optional `hint`, rendered as `title`.
- Tests (`hunker.test.ts`): the heal lands on the end turn itself for home, unclaimed and enemy land, with the event
  and a rest deed, before `turnStarted`; never twice (nothing at the next start, one more at the next end); beside a
  seen enemy as the turn ends it heals the share, and an enemy arriving on the other turn takes nothing away; capped,
  and nothing (no event, no deed) at full health; a rested unit without hunker still heals at the start of the next
  turn. `hunker.rules7.test.ts` mocks the switch off and checks the rules 7 timing.

### 5. Climbing must be researched

- `CONFIG.mountain.tech: 'bronze'` (typed `TechId | null`; null means no tech). `canClimb(s, player)` in
  `movement.ts`, exported from the index. In `reachable` a mountain is skipped for a player who cannot climb; stepping
  off needs nothing. The melee kill advance in `combat.ts` does not step onto a mountain without it: the attack and
  kill happen, the killer stays put (and gets no advance event).
- Pushes, lures and placements are unchanged.
- UI: move highlights come from the engine. The mountain tile text starts "Units climb a mountain only once Bronze is
  known; stepping off needs nothing." (the tech's name from `T.tech`), and the tech sheet lists "Climbing
  mountains" under the tech in `CONFIG.mountain.tech`.
- `CONFIG.mountain.tech` stays 'bronze' (David is reworking the tech tree separately) and is read only from CONFIG:
  no engine, AI or UI code names the tech; the texts take its name from `T.tech`.
- Tests (`mountain.test.ts`): a tech is set; refused by a move and absent from legal actions
  without it, allowed with it; stepping off allowed without it; a kill advance does not climb without it, does with it;
  a field advance is unaffected. Existing mountain tests give both players the tech.

## Rulings (the brief left these open)

- **Spartans start with Bronze**, so with `mountain.tech: 'bronze'` the Spartans can climb from turn one and the
  Mongols only after researching it. That is what the value gives; flagged for David in case it was not meant.
- **Hunker heal and `rested`.** A hunkered unit always has `rested` true at the end of its turn (any move or action
  ends the hunker), so the end-of-turn heal needs no rested test; clearing `rested` is what stops the second heal.
- **The heal event** is new (`restHealed`), since no rest heal had one; the start-of-turn rest heal still shows no
  number, as before.
- **Hunker heal by a resign.** A resign by the player whose turn it is goes through `passTurn` only, as before, so no
  end-of-turn heal happens then.
- **territoryRiding** set to false for the Mongols (the brief allowed either); with a bonus of 0 it would change
  nothing.
- **Tech sheet per faction.** Making Mongol Roads not say "Road" meant giving `unlocks` the faction, so faction units
  and walls are now filtered too (the Spartans no longer see the Camp under Roads, nor Walls under Shieldwork).
- **Rules 7 test positions that relied on the old city sight** were given a city of radius 2 (two AI tests, one turn
  test) or moved a tile (one digest test); the AI scenarios (`scenarios.ts`) mark the tiles within a city's radius + 1
  explored, so the positions they were tuned on keep their explored land.
- **Spartan road tests.** Tests that had a Mongol player build roads (capital move, roads and walls, legal order) use a
  Spartan builder now; the capital test's city then levels up (a Spartan level 1 city fills on 1 growth).

## AI changes

- `plan.ts` `hunkers`: the garrison test compares the danger with the health the enemy's turn will meet, the hunker
  heal in (`restHealAt` on the unit as if hunkered, capped), when `healAtTurnEnd` is on.
- `assess.ts` `unitTerms`: for a hunkered unit the danger term divides by that same healed health.
- `roads.ts` `connectingChains`: no chains for a faction with `canBuildRoads` false (otherwise the planner would plan
  a refused road).
- Climbing and Mongol foot movement need no AI change: the planner moves only through `reachable` and probes. New AI
  tests (`ai/mountain.test.ts`): without the tech (and no gold to research it) no planned move onto a mountain, every
  action legal, at three dials and seeds; a Mongol planner with Roads and gold plans no road. The planner's danger map
  ignores terrain, so it gives a mountain no value of its own.

## Re-pinned fingerprints, digests and positions

- `fingerprint.test.ts`: rules 8 (unreleased) re-pinned to `f49b094429fa4695` (was `5bf1725e9812dbbf`). Rules 7 stays.
- `stage1.dormant.test.ts` and `stage1.test.ts`: the mocks add `citySightExtra: 1`, `mountain.tech: null` and the
  Mongol `relayMountedOnly: false, canBuildRoads: true` (hunker is already off there). Both replay the recorded
  playouts hash for hash; nothing re-pinned.
- `speed.test.ts` rows: every digest and legal count moved (all five additions change random play). Same turns: seed
  7 at 130 (ends after 243 now), seed 1 at 75 (unfinished at 300), seed 3 at 90 (ends after 125). New rows
  `[7, 130, 400, ...]`, `[1, 75, 53, ...]`, `[3, 90, 266, ...]` (were 322, 22, 138).
- The 25-unit position: `(9, 164)` has 41 units now. Node (`speed.test.ts`, `plan.test.ts`) and the browser
  (`src/browser/ai.test.ts`, whose `(3, 156)` is now past seed 3's end) use `(1, 92)`: 185 legal actions, about 4.4 ms
  per `legalActions` (the even 25-unit turns of seeds 7, 3, 9, 4 and 8 had 225 to 414 and took 4.8 to 7.8 ms). The
  browser AI test passed on it.
- `character.test.ts` (default suite): seed 3, Spartans first, at hard now ends in round 37 (42 with the AI's hunker
  forecast reverted, so the rules moved it); its bound is 41, the test's own rule (last measure plus four). Mongols
  first ends in 17, inside its bound of 33, which is kept.
- **Not re-pinned: the SLOW AI checks fail on the rules 8 additions** (see Unsure). `KNOWN_NORMAL` and `ADAPT_SEEDS`
  are left as they were, because the numbers below do not support a re-pin by the tests' own rules.
  - Hard stalls (`character.test.ts`, full SLOW file): '7 mongols' does not end within 60 rounds. It is the first hard
    stall on rules 8 (all 16 ended before). Run on its own, the same match ends in round 58, the Mongols winning.
  - Normal stalls (full SLOW file): '6 spartans' and '8 mongols' stall besides the known '4 mongols' and '7 spartans'.
    Run alone with `-t`, the 16 normal matches end except '7 mongols' (60): '6 spartans' in 32, '8 mongols' in 37,
    '4 mongols' in 28 and '7 spartans' in 56.
  - The outcome of the same match depends on which tests ran before it in the file. In a fresh file the same match
    replays identically (6 spartans: 32 rounds, before and after five other matches), and I found no module state in
    `src/ai` that a match writes. So some earlier test in `character.test.ts` changes something later matches read.
    I did not find what; it may be older than this build (the earlier reports measured with the full file).
  - Adaptive check (`sim.test.ts`): seeds 8 and 14 read a mean of -0.220 (bound 0.15). Over start seeds 1 to 16 the
    gaps are 0.573, -0.629, 0.219, 0.132, 0.135, 0.097, -0.535, -0.252, 0.441, -0.000, 0.061, 0.661, 0.029, -0.189,
    0.166, 0.156: a mean of 0.067 with 11 of 16 above 0, so the 16-seed bound (mean at least 0.15, 12 of 16 above 0)
    fails too, and re-picking the two seeds nearest the mean (15 and 13, or 11) would hide that. On the mountains build
    the mean was 0.303. The adaptive dial separates strong from weak opponents less well on these rules.

## Checks run

- `npx tsc -b` and `npm run lint`: clean.
- `npx vitest run` (alone, on the final code): 106 files passed, 21 skipped; 1120 tests passed, 123 skipped.
- `npm run test:browser` (alone, on the final code): 6 AI tests, then 49 passed and 2 skipped.
- `SLOW=1 npx vitest run src/ai` (alone, on the final code): 124 passed, 3 failed (the hard stall, the normal stalls
  and the adaptive check, above). `SLOW=1` on `character.test.ts` alone gave the same two stall failures.
- Stage 1 provenance tests replay hash for hash with the new switches off in their mocks.
- No touched file or commit message contains U+2014 or U+2013.

## Unsure

- The SLOW AI checks fail (above): a first hard stall, two more normal stalls in the full file, and the adaptive gap
  mean of 0.067 over 16 seeds. These are balance signals from the rules (the AI changes are the hunker forecast and
  the empty Mongol road chains), and the test-order dependence in `character.test.ts` needs looking at before its
  stall lists are trusted again. David should decide: accept and re-pin, or tune.
- Spartans begin with the climbing tech (see rulings).
- The Hunker help text is a button title: seen on hover or a long press, not on a plain tap on a phone. If David wants
  it visible, it needs a place on the card.
- The tech sheet now filters by faction, a small change beyond the brief.
