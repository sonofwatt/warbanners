# Tech tree rework (rules 8): build report

Built on `mountains` from the brief `2026-11-24-tech-tree.md`, including its "Carried in" section. `RULES_VERSION`
stays 8 (0.6.0, unreleased). Nothing pushed, merged or deployed; no sound changes; `database.rules.json` untouched.
Every number is in `CONFIG` or the data tables.

## The tree and its ids

`CONFIG.techTree: 'rules8'` picks the tree in `src/engine/data/techs.ts` (`TECH_TREES.rules7` and `.rules8`). Each
tree holds its techs (tier = column, `branch`, `row` top or bottom), the faction start techs, the unit unlocks, the
harvest unlocks, the building unlocks with the resources each building stands on, and the Walls and road techs.
`TECHS` and `TECH_TREE` are the tree in play. The `tech` fields left `UNITS`, `FACTIONS` (`startTech`),
`CONFIG.harvest`, `CONFIG.buildings`, `CONFIG.walls` and `CONFIG.road`; everything reads them through the engine
helpers `unitTech`, `harvestTech`, `buildingTech`, `startTech`, `wallsTech` and `roadTech` (exported from the index).

| Branch | Column 1 | Column 2 top | Column 3 top | Column 2 bottom | Column 3 bottom |
|---|---|---|---|---|---|
| Orchards | `foraging` (harvest fruit) | `defence` (Defender) | `walls` (Walls, Mongols) | `orchards` (Orchard) | `plantations` (Plantation) |
| Hunting | `trapping` (trap game) | `archery` (Archer) | `siege` (Catapult) | `logging` (Lumber camp) | `milling` (Lumber mill) |
| Mountains | `prospecting` (gather jewels, climbing) | `spears` (Spearman, Hoplite) | `smithing` (Swordsman) | `mining` (Mine) | `foundry` (Foundry) |
| Plains | `gathering` (harvest wild grain) | `riding` (Horseman, Horse Archer, Camp, roads) | `chivalry` (Knight) | `farming` (Farm) | `granary` (Granary, Market) |
| Waters | `fishing` (catch fish) | none yet | | | |

Starts: Spartans `prospecting`, Mongols `gathering`. `CONFIG.mountain.tech` is `'prospecting'`. Prices are the
rules 7 formula with the column as the tier: 4, 6, 8 plus (cities - 1) x column, so a column costs the same
everywhere. `TechId` holds both trees' ids; the rules 7 ones (`markets`, `roads`, `hunting`, `forestry`,
`engineering`, `bronze`, `shieldwork`) are refused for research under rules 8 because they are not in the tree.

## First numbers (all in CONFIG, for the sims to tune)

- Harvests, each a one-off for 2 gold and +1 growth: fruit, game, wild grain (`cropland`), jewels, fish.
- Orchard: 5 gold, +2 growth (as the Farm).
- Upgrades: Plantation 7 gold +3; Lumber mill 6 gold +3 (Lumber camp 4, +2); Foundry 7 gold +3; Granary 7 gold +3.
- Mapgen (same roll as ore, so the rng stream is unchanged): a mountain is ore under 40 and jewels from 40 to under 55
  (`CONFIG.mapgen.jewels: 55`); water is fish under 25 (`fish: 25`). Mirrored as every resource, never on the
  capital's tile (it is cleared as before). Placed only where the tree in play harvests them, so the rules 7 tree
  makes rules 7 maps.

## Engine

- `Tile.harvested` (new, always present). Under rules 8 (`TreeDef.harvestKeepsTile`) a harvest sets it and keeps
  `resource`; under rules 7 it clears `resource` as before. `harvestRefusal` refuses a harvested tile and a tile with a
  building ('nothing to harvest'), and any resource the tree has no harvest for (ore, and under rules 7 cropland,
  jewels and fish).
- `buildRefusal`: a building not in the tree in play is 'unknown building'. A plain building needs no building on the
  tile, its terrain (`CONFIG.buildings[b].on`) and one of the tree's resources for it (`TreeDef.buildings[b].on`). An
  upgrade (`CONFIG.buildings[b].upgrades`) needs its improvement on the tile ('wrong tile' otherwise, 'already built' if
  it is the upgrade itself) and replaces it; the build handler is unchanged (the building is set, the growth added).
- Research legality is unchanged code over the tree in play; a column 3 tech needs only its column 2 tech.
- Faction starts come from `TECH_TREE.start` (`createMatch`, and the AI's guess of a rival's techs).
- Training reads `TECH_TREE.units`; roads and walls `TECH_TREE.road` and `.walls`.
- legalActions lists research in the tree's order and builds in `CONFIG.buildings` order; the five new buildings come
  after the four old ones, so the rules 7 order is unchanged.

## Provenance

- `stage1.dormant.test.ts` and `stage1.test.ts` add `techTree: 'rules7'` to their CONFIG mocks and strip
  `tiles[*].harvested` in `stage1Shape`. Both replay the recorded rules 3 playouts hash for hash (6 passed, 1 record
  test skipped). `capital.rules6.test.ts` mocks the rules 7 tree too, since it tests rules 6 numbers with
  rules 7 tech ids.
- `hunker.rules7.test.ts` and `mongols.rules7.test.ts` use no techs and are unchanged.

## Rulings (the brief left these open)

- **Tech ids**: as in the table above. `walls`, `foundry` and `granary` are both a tech id and a building or command
  name; they live in separate types and text tables, so nothing clashes.
- **The switch** is one value, `CONFIG.techTree`, choosing a whole tree object. It also decides the harvest semantics
  (`harvestKeepsTile`) and whether mapgen places jewels and fish (only where the tree harvests them), so the
  provenance mocks add one line. `TECHS` and `TECH_TREE` are fixed when `data/techs.ts` loads, from CONFIG (mocked
  per file in the provenance tests).
- **Tech fields moved out of the data tables** (`UNITS.tech`, `FACTIONS.startTech`, and the `tech` on harvests,
  buildings, walls and roads) into the tree, so a unit or building can never name a tech of the other tree.
- **Lumber camp on game**: allowed (forest with no resource or with game, harvested or not), reading "the game tile
  stays a tile of that resource kind for building on". On unharvested game it ends the harvest, as the Orchard does.
- **Mine on jewels**: not allowed; the Mine stays on ore only, as today. Jewels are a harvest only.
- **A building ends a harvest**: any building on an unharvested resource tile leaves nothing to harvest (the Farm on
  wild grain, the Orchard on fruit, the Lumber camp on game).
- **Upgrade numbers**: Plantation 7/+3, Lumber mill 6/+3, Foundry 7/+3, Granary 7/+3; Orchard 5/+2. New harvests
  2 gold/+1 like the old ones. The upgrade gives its own growth once, like any building (the base's growth was paid
  when it was built).
- **Jewel and fish rates**: jewels on 15 of every 100 mountain rolls (after ore's 40), fish on 25 of every 100 water
  rolls, on the same draw as today, so terrain, ore, fruit, wild grain and game, villages and treasures fall exactly
  where they did.
- **Ore has no harvest** (it was never harvestable); the harvest command is not offered on ore.
- **Market and Granary** share the `granary` tech; the Market keeps its rules (field with no resource, one a city).
- **Walls for Spartans**: the tech is still in their tree (the tree is shared) and opens nothing for them; its card
  says "Nothing for your people" rather than an empty list.
- **Waters**: only `fishing`; the card says "Boats and more come later."
- **Upgrade command label**: "Build Plantation" and so on, the same pattern as every building.
- **Resource names on screen**: fruit (the `orchard` resource, so it does not read like the Orchard building), wild
  grain (`cropland`), game, ore, jewels, fish. Harvest commands name their verb: Harvest fruit, Trap game, Gather
  jewels, Harvest wild grain, Catch fish.
- **Starting units** are still placed (Spartan Scout, Mongol Horseman); the starting Horseman needs no tech, and more
  riders wait for Riding.
- **The rules doc** keeps the rules 7 tree as a second table in section 7 (for the replays), and the unit table's
  "Needs" column names the rules 8 techs.

## AI changes

- `persona.ts` `techOrder` redone for the new tree, every tech once, each starting with its own start tech:
  - Spartans: prospecting, spears, foraging, defence, smithing, gathering, farming, trapping, archery, mining, riding,
    logging, granary, siege, orchards, chivalry, foundry, plantations, milling, fishing, walls.
  - Mongols: gathering, riding, farming, trapping, foraging, archery, chivalry, prospecting, logging, granary, defence,
    walls, spears, siege, smithing, orchards, mining, plantations, milling, foundry, fishing.
- `mix.ts`, `sim.ts`, `roads.ts`, `input.ts` read the tree through the engine helpers; no scoring changed. The
  economy pass already probes every harvest and build (the new ones and the upgrades included) and scores them by
  value gained per gold, so it needed nothing new.
- Carried in: `plan.ts` `hunkers()` passes one cached visible set per believed state to `restHealAt` (a `seen` cache
  keyed on `this.b`). Stale comments fixed in `sim.ts` (no unit has pathfinder since rules 8) and `scenarios.ts` (a
  Watchful Scout on a mountain sees 4 tiles now; the wounded Hoplite scenario's Scout note).
- What it does now (seeds 1 to 5, both seatings, hard, 60 rounds): all 10 matches end (rounds 23 to 42). Both open
  with their unit tech in round 0 (Spartans Spears, Mongols Riding), then mostly the cheap column 1 techs and the
  Defender and Archer rows; Fishing is bought by both around round 10, which is wasted gold for now. Units trained
  over those 10 matches: Mongols every kind they can train (Warrior, Horseman, Horse Archer, Camp, Spearman, Defender,
  Archer, Swordsman, Knight, Catapult); Spartans every kind but the Swordsman (Warrior, Scout, Hoplite, Spearman,
  Defender, Archer, Horseman, Knight, Catapult). In seed 5 the Spartans held Smithing from round 12 and still trained
  none, so it is the mix weights, not the tree; left for the tuning pass.

## UI changes

- Tech sheet (`TechSheet.tsx`, `theme.css`): five branch cards (Orchards, Hunting, Mountains, Plains, Waters), each
  its name, its column 1 tech, then a fork: a rail from the column 1 badge with a spur into each row, the top row
  (`aria-label` Army) and the bottom row (Land), column 2 then column 3. The rung itself (badge, name, what it opens,
  Research with price, Known, Too costly now, Locked) is unchanged. Two branch cards side by side on a wide portrait
  panel and on a sheet 900 px wide or more. Locked commands still carry `tech` and open the sheet ringed at it
  (browser test `techlink.test.ts` checks it, now also five branches).
- Tile commands: the harvest is offered for any resource the tree harvests (labelled with its verb); every building
  of the tree is offered where it fits, upgrades on their improvement.
- Board art (`features.tsx`, small SVG marks in the board's style): jewels (three cut stones in a rock crack), fish
  (two leaping fish over a ripple), the Orchard (two fruit trees behind a fence), Plantation (five trees and a
  basket), Lumber mill (a mill house with a round blade; drawn before the grove like the Lumber camp), Foundry (a
  stone furnace, chimney and glow), Granary (a round store with a conical roof and sheaves). A harvested resource is
  drawn faded (`data-harvested`, opacity 0.45). All added to the art sheet (`?sheet=1`) and the footprint test.
- Tile card: "Fruit (harvested)" and the line "Already harvested, so it gives no more growth by itself, but it can
  still be built on."
- `text.ts`: names for the new techs, branches, buildings and resources, the harvest verbs, `unlocks()` from the
  tree, and `whatsNew` for 0.6.0 rewritten as two sentences covering all of rules 8 (mountains and the climbing
  tech, the ranged bonus, city sight, the Scout's sight, Mongol riding and no roads, the hunker heal, the five-branch
  tree with jewels and fish and upgrades), every number and name read from CONFIG and the tables.
- Screenshots (headless Chromium, from the browser suite with `SHOT_DIR`):
  `docs/superpowers/plans/2026-11-24-tech-tree-shots/techsheet-412x780.png` (portrait, top of the sheet),
  `techsheet-915x412.png` (landscape side column), `techlink-412x780.png` and `techlink-915x412.png` (opened from
  Build Farm, ringed at Farming). The landscape shot also shows fish and jewels on the board.

## Rules docs

`docs/rules/stage1-rules.md`: section 3 (jewels and fish in mapgen), 4 (start techs train no unit), 6 (the new actions
table, harvests keep the tile), 7 (the new tree, prices by column, the rules 7 tree kept as a second table), 8 (the
unit table's techs), 9 and 2 (climbing needs `prospecting`), 13 (faction starts, Mongol Riding), and the Rules 8 changes
list (four new entries; the climbing entry names `prospecting`).

## Re-pinned, and why

- `fingerprint.test.ts`: rules 8 (unreleased) `f49b094429fa4695` to `2d94bbca910bbca3` (new tiles field, new starts,
  new tree). Rules 7 and older stay.
- `speed.test.ts` rows (same turns): `[7, 130, 316, ...]`, `[1, 75, 84, ...]`, `[3, 90, 465, ...]` (were 400, 53 and
  266). None of seeds 1, 3, 4, 5, 7, 8, 9 ends within 300 random turns now.
- The 25-unit position: `(1, 92)` has 30 units now; `(1, 84)` has 25, 170 legal actions, about 3.5 ms per
  `legalActions` (the other even 25-unit turns: (4, 94) 175 and 3.1 ms, (8, 80) 244 and 5.3 ms). Used in
  `speed.test.ts`, `ai/plan.test.ts` and `browser/ai.test.ts`.
- `character.test.ts` (default suite), seed 3 at hard: Mongols first now ends in round 35 (bound 33), Spartans first
  in 39 (bound 41, kept). Mongols first gets 39, the test's own rule (last measure plus four).
- `tally.test.ts`: the five random-playout tests got 30 s timeouts; random play has more to choose from now (the
  summing test took 4.7 s alone and timed out at the 5 s default in a full run).
- Not re-pinned: the three SLOW checks (below), as the brief said.

## Test results (each suite run alone, on the final code unless noted)

- `npx tsc -b` and `npm run lint`: clean.
- `npx vitest run`: 106 files passed, 21 skipped; 1129 tests passed, 123 skipped.
- Stage 1 provenance (`stage1.dormant.test.ts`, `stage1.test.ts`): hash for hash with `techTree: 'rules7'`.
- `npm run test:browser`: AI 6 passed; the rest 47 passed, 2 skipped, 2 failed (`overlay.test.ts`, which built a Mine
  on the first move to reach a reward; the Mine now waits on Mining). Fixed to research Foraging and harvest fruit
  instead; `overlay.test.ts` then passed alone (2 of 2). The full browser suite was not rerun after that fix.
- `SLOW=1 npx vitest run src/ai` (before the last UI-only commit): 124 passed, 3 failed, the same three as before:
  - normal stalls (full file): '5 mongols', '6 spartans', '8 spartans' beyond the known '4 mongols' and '7 spartans'
    (before this build: '6 spartans', '8 mongols');
  - hard stalls (full file): '6 mongols' (before: '7 mongols');
  - adaptive check (`sim.test.ts`, seeds 8 and 14): mean gap -0.162 (before: -0.220; bound 0.15).
  The same match measured outside the file differs (seed 1 to 5 at hard all end, see AI changes), so the test-order
  dependence noted last time is still there; not chased.
- No touched file or commit message contains U+2014 or U+2013.

## Concerns

- The AI spends early gold on cheap column 1 techs with nothing behind them for its side (Fishing for both, Walls
  sits last for the Spartans); a persona or chooseTech nudge may help once sims tune the tree.
- Spartans trained no Swordsman in 10 hard matches (mix weights, not the tree).
- The full browser suite was not rerun after the overlay test fix and the row-gap CSS tweak (overlay alone passed).
- First numbers for upgrades, the Orchard and jewels and fish rates are guesses for the sims.
