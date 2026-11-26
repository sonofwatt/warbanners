# Rules 8 tuning and AI pass: report

Branch `mountains`, rules 8 (0.6.0, unreleased), from 75da924. Every sim is 200 AI matches on the sim worker:
`npx tsx scripts/simai.ts --matches 100 --seed 1 --a L --b L --swap --jobs 8` (seeds 1 to 100, both seatings,
adjudged stalls count half). Nothing merged or deployed; `database.rules.json` untouched.

## 1. Why the Mongols lost ground

Starting point (75da924, Horseman start): normal Spartans 71.8% / Mongols 18.5%, stalls 19%; hard 66.5 / 28.7,
stalls 9.5%. Rules 7 was about 50/50.

Earlier runs on the sim worker place the drop: the mountains build alone had the Mongols at 53 to 58%; the rules 8
additions (city sight, Scout, Mongol riding and roads, hunker heal, climbing tech) took them to 25% normal and 31%
hard; the new tech tree took them a little further, to 18.5 and 28.7.

Ablations: each a copy of 75da924 with one rules 8 change put back to its rules 7 value, nothing else (hard, 200
matches each; the two big ones also at normal). "Gain" is the Mongol share against the 75da924 base.

| Change put back | Hard: Spartans / Mongols | Mongol gain, hard | Normal: Spartans / Mongols | Mongol gain, normal | Stalls hard |
|---|---|---|---|---|---|
| none (75da924) | 66.5 / 28.7 | | 71.8 / 18.5 | | 9.5% |
| Mongols build roads | 47.0 / 47.3 | +18.6 | 55.0 / 38.0 | +19.5 | 11.5% |
| the riding half-point (by territory) | 55.3 / 39.3 | +10.6 | 59.8 / 32.3 | +13.8 | 11.0% |
| city sight +1 | 60.0 / 33.0 | +4.3 | | | 14.0% |
| riders need no tech (no Riding buy) | 62.0 / 32.0 | +3.3 | | | 12.0% |
| Scout sight 1 with pathfinder | 63.5 / 31.0 | +2.3 | | | 11.0% |
| hunker heals at the next turn's start | 64.8 / 30.8 | +2.1 | | | 9.0% |
| foot units relay ride too | 64.5 / 30.3 | +1.6 | | | 10.5% |
| no tech needed to climb | 64.0 / 27.5 | -1.2 | | | 17.0% |
| all of the rules 8 additions at once | 38.0 / 57.0 | +28.3 | | | 10.0% |

The standard error of one share at 200 matches is about 3.5 points, so only the first two rows are clearly more
than noise, and the next two are likely real.

- **No Mongol roads is the main cause.** With roads the Mongols laid 13.7 a match and made 6.2 connections a match
  (each one +1 growth to the city and +1 to the capital, about 12 growth a match), against 0 and 0.01 without. The
  Spartans make 4.7 to 5.5 connections a match either way. Mongol cities fell behind in levels, so in income,
  capacity and level rewards; the Mongols held 3.85 cities at the end with roads and 2.42 without, though both had
  3.33 at round 10.
- **The lost half-point** is the second cause: riders reach and leave fights a step shorter.
- City sight, the Riding buy, the Scout, the hunker timing and foot relay riding each move a few points; climbing
  by tech moves nothing.
- The tech tree's own share is small: its prices are by column, the Riding buy costs the Mongols about 3 points, and
  the rest of the drop from the additions run (25 to 18.5 at normal) is within two standard errors.

Two of the causes (no Mongol roads, no half-point) are David's decided rules, so the fix is a growth lever that
gives back what the lost connections gave (section 3).

## 2. How the AI played the new tree, and what changed

Measured with `scripts/simecon.ts` (new: where each side's gold went, which techs it bought and when, blockades),
replaying the actions of a `--json --actions` run.

Found:

- Research took the most gold of anything: Spartans 165 to 200 gold a match, Mongols 130 to 150, more than either
  spent on units. Both bought nearly the whole tree, Fishing included (round 11 to 16) with no fish in their land,
  and the Spartans bought the walls tech, which gave them nothing.
- Every unit kind is trained. At hard on 75da924 the Spartans trained a Swordsman in 45% of the matches where they
  had Smithing (0.6 a match), at normal 72% (1.1 a match); the Mongols every kind too. The "never a Swordsman" of the
  tree report was 10 hard matches; no change needed.
- The persona tech orders are sensible: Spartans open Spears, Foraging, Defence; Mongols Riding, then Trapping (the
  Archer path pulls it ahead of Farming).
- Stalls: in the stalled matches the winning side banked 400 to 1350 gold with 20 to 50 units spread over its own
  cities, a dozen of them Pipers or Sky Callers (the level 5 support taken at every level once the army was big),
  while the enemy held one or two cities; the rest were even deadlocks, four cities each (or three and five), both
  armies at home.

Changes (all in `src/ai`, through the engine index only):

1. **Research only what gives something now** (`techGivesSomething`, mix.ts): a unit type the persona trains, a
   harvest or building with a legal tile for it in the player's land (probed with the engine's own refusals on the
   position with the tech added), climbing, roads or walls the faction uses, or a tech after it that does. So no
   Fishing without fish, no upgrade tech before there is an improvement to upgrade, and the Spartans' Deep stores
   only while an enemy stands beside one of their cities.
2. **Blockades** (with the new rule, section 4): `valueOf` counts own income after blockades and every blockaded
   enemy city as the gold it loses, so units value standing round an enemy city and lifting a blockade of their own;
   the walls tech (Walls, or Deep stores) gets weight while blockades cut income.
3. **Supports capped**: at level 5 the champion is taken once two supports are alive.
4. **Press on** (`pressOf`, assess.ts): a side holding three times the enemy's known cities has its goal pull three
   times as strong, and from round 25 every side's pull grows by 0.15 a round (twice as strong at round 32, four times
   at round 45), which breaks the even deadlocks. The goal pull is the only term it scales.

Each AI change, measured on top of the Mongol growth change (200 matches each, Horseman start):

| Step | Hard: Spartans / Mongols, seats, stalls, median | Normal: Spartans / Mongols, seats, stalls, median |
|---|---|---|
| Mongol growthExtra 0, the research filter and blockade AI | 42.5 / 50.5, 48.0 / 45.0, 14.0%, 37 | 45.0 / 42.3, 45.3 / 42.0, 25.5%, 43 |
| + supports capped | 45.8 / 48.3, 51.2 / 42.8, 12.0%, 37 | 51.7 / 37.0, 46.5 / 42.3, 22.5%, 43 |
| + press at 3x the cities | 50.0 / 45.8, 48.5 / 47.3, 8.5%, 35 | 48.0 / 45.0, 50.2 / 42.8, 14.0%, 38 |
| + late press from round 30, 0.1 a round | 53.5 / 44.3, 47.5 / 50.2, 4.5%, 35 | 50.0 / 44.5, 49.3 / 45.3, 11.0%, 39 |
| late press from round 25, 0.15 a round (kept) | 52.8 / 44.5, 47.8 / 49.5, 5.5%, 34 | 53.3 / 43.0, 51.2 / 45.0, 7.5%, 38 |
| the same with press at 2x (not kept) | 55.0 / 42.0, 50.5 / 46.5, 6.0%, 34 | 54.8 / 41.8, 56.0 / 40.5, 7.0%, 36 |
| press at 2x without the late press (not kept) | 54.3 / 43.3, 49.5 / 48.0, 5.0%, 33 | 54.3 / 39.3, 52.0 / 41.5, 13.0%, 36 |

Pressing at twice the cities ended about as many stalls but favoured the Spartans (they reach 2x more often), so the
3x threshold stays.

## 3. Numbers changed

All in the faction table (`src/engine/data/factions.ts`); none of David's decided rules moved.

| Number | Was | Now | Why |
|---|---|---|---|
| Mongol `growthExtra` | 1 (`L+2` to leave level `L`) | 0 (`L+1`, as anyone's) | Gives back the growth the lost road connections paid (about 12 points a match). Alone it took hard from 64.0 / 29.8 to 42.5 / 50.5 and normal from 70.8 / 19.5 to 45.0 / 42.3 (blockade and AI filter in, before the stall fixes). |
| Mongol `tributeVillage`, `tributeCityBase` | 3, 3 | 4, 4 | After the stall fixes the Mongols sat at 43 to 44.5%. Tribute is the Mongols' own economy lever, paid only by taking ground, so it rewards the riding raids the faction is built for. +1 to +2 points at hard and normal. |

Tried and not kept:

| Number | Result (hard; normal) | Why not |
|---|---|---|
| Mongol `growthExtra` 0 and `mountedDiscount` 2 | Spartans / Mongols 31.3 / 61.0; 34.0 / 53.0 | far past even |
| Horse Archer cost 4 (was 5) | 41.5 / 55.8; 42.5 / 54.3 | past even the other way |

The tech prices (4, 6, 8 by column), building and upgrade costs, start gold and resource rates were left as they
are: the ablations put almost none of the drop on the tree, and the two levers above reach the targets.

## 4. Blockade (built in this pass)

From the brief `2026-11-24-blockade.md`, with David's two rulings during the pass.

- Rule (`CONFIG.blockade`): a city with enemy units on `minTiles` (3, David's, fixed) or more of the six tiles next to
  it when its owner's turn starts (seen or not; never the city tile) loses `cut` (0.5) of that turn's income, rounded
  down; `cutWalls` (0.25) with Walls; `cutSpartanTech` (0.15) for a Spartan city whose owner knows the `walls` tech
  (faction flag `blockadeStores`). Whatever the share, a blockade costs at least `minCut` (1 gold, David's, fixed)
  and the city keeps at least `floor` (1 gold), so only a city earning exactly 1 loses nothing. `on: false` replays
  rules 7 (the provenance mocks set it).
- Engine: `blockadeOf(s, city)` (enemies counted, blockaded, gold cut) and `blockadeLoss(s, player)` in economy.ts,
  exported from the index; `passTurn` pays each city's income less its cut and sends a `blockaded` event (city,
  enemies, gold) before `turnStarted`. Growth, research, training and healing are untouched.
- The Spartan `walls` tech is named **Deep stores** on screen (`techName(id, faction)`, text.ts); its card reads
  "Every city: a blockade takes 15% of its income, not 50%", so "Nothing for your people" no longer shows anywhere in
  the rules 8 tree. The Mongol card reads "Walls: a blockade takes 25% of a walled city's income, not 50%".
- UI: an own blockaded city's card shows "Blockaded: -N gold"; the Hud shows "-N" in red after the income; the
  turn-start number "-N gold" on the city, to its owner only. The forecasts are worked out on the viewer's believed
  state, so an unseen enemy is never given away (the engine counts it when income is paid).
- Docs: rules section 6 (income), 7 (tech table), 13 (Spartans), Rules 8 changes list, whatsNew (third sentence).
- Tests: `blockade.test.ts` (3 tiles yes, 2 no, own tile and own units not counted, unseen units counted, the 1 gold
  minimum and the 1 gold floor, Walls, Deep stores, growth untouched), `blockade.rules7.test.ts` (switch off),
  effects, panels, text, AI (`mix.test.ts`, `assess.test.ts`).

How it plays (final numbers, 200 matches each):

| | Normal: Spartans | Normal: Mongols | Hard: Spartans | Hard: Mongols |
|---|---|---|---|---|
| City-turns blockaded per match (own cities) | 1.16 | 0.68 | 1.10 | 0.51 |
| Gold cut per match | 1.75 | 1.62 | 1.65 | 0.99 |
| Matches with any blockade | 34% | 34% | 41% | 29% |
| Bought the defence tech (Deep stores / Walls) | 58%, median round 32 | 34%, round 39 | 44%, round 33 | 25%, round 38 |
| Gold spent on Walls per match | | 0.1 | | 0.2 |

Blockades are rare and cheap: about one city-turn and under 2 gold a match. Three enemy units round a city mostly
happen in the last rounds of a siege, when the city falls within a turn or two anyway. The Spartans buy Deep stores
in about half their matches because the AI buys it once any enemy stands beside one of their cities, which is often
by round 30; that is about 8 to 12 gold for under 2 gold of blockade saved. The cut shares were left at the brief's
drafts: at this frequency no share moves the balance, and the tuning went to the two levers above.

## 5. Final sims

Final code (the tuning commit 6fcb681 and the AI before it; the later commits only re-pin tests), 200 matches each,
seeds 1 to 100 both seatings. The Warrior start is the same code with the Mongol `startUnit` set to `warrior`.

| Start | Level | Spartans | Mongols | Seat 1 / seat 2 | Stalls | Median rounds |
|---|---|---|---|---|---|---|
| Horseman (shipped) | normal | 50.2% | 45.3% | 54.0 / 41.5 | 9.0% | 37 |
| Horseman (shipped) | hard | 49.0% | 48.3% | 43.0 / 54.3 | 5.5% | 34 |
| Horseman, seeds 101 to 200 | normal | 56.3% | 41.5% | 52.5 / 45.3 | 4.5% | 37 |
| Horseman, seeds 101 to 200 | hard | 49.3% | 49.3% | 47.8 / 50.7 | 3.0% | 33 |
| Warrior (comparison) | normal | 53.5% | 42.0% | 46.8 / 48.8 | 9.0% | 37 |
| Warrior (comparison) | hard | 40.8% | 55.5% | 56.8 / 39.5 | 7.5% | 33 |

Against the start (75da924): normal 71.8 / 18.5 with 19% stalls and median 41; hard 66.5 / 28.7 with 9.5% and 35.

Over the 400 Horseman matches: normal 53.3 / 43.4, stalls 6.8%; hard 49.2 / 48.8, stalls 4.3%. Hard is on target. At
normal the Mongols sit just under 45 and stalls just under 8 on the 400. The seat split changes sign between levels
and between seed sets (first seat ahead at normal by 7 to 13 points, second seat ahead at hard by 3 to 11); one
200-match seat share has a standard error near 3.5 points, so the gap is at the edge of noise, and no lever moved
here (start gold is a seat lever and would push hard the wrong way).

The Warrior start is not better: it costs the Mongols 3 points at normal and helps them 7 at hard, with more stalls.
The Horseman start stays.

## 6. Tidy-ups

- `mapgen.ts`: the module helper `placed` is now `treeHarvests`, so it no longer shares its name with the local
  `placed` of the map attempts.
- The Hunker help text and the Hunkered card now follow `CONFIG.hunker.healAtTurnEnd` and `drinkKeepsHunker`: with
  the switches off they say the heal waits for the next turn and a drink ends it (new `text.hunker7.test.ts`).
- The order-dependent stalls in `character.test.ts`: not reproduced. On the final code every one of the 32 seeded
  matches was played in its own process on the sim worker (the test's own `aiMatch`, seeds and salts): normal, all
  end; hard, '5 spartans' stalls. The full SLOW file gives the same lists, and one match replayed twice in one
  process gives the same state hash every turn. Earlier, the normal list alone and in the full file also matched. The
  AI and engine hold no module state between matches (no caches, the persona tables are only read). The earlier
  reports' "same match, different result" most likely compared the test's matches with `sim.ts`'s `runMatch`, whose AI
  seeds differ (`salt: seed * 2 + player` against `seed * 1000 + rounds * 2 + player`), so they were different
  matches.

## 7. Re-pinned (each explained by this pass's rule and number changes)

- `fingerprint.test.ts`: rules 8 (unreleased) `2d94bbca910bbca3` to `60916c498b6b16ec` (blockade, Mongol growth and
  tribute).
- `speed.test.ts` rows, same turns (none ends within 300 random turns): `[7, 130, 100, ...]`, `[1, 75, 240, ...]`,
  `[3, 90, 218, ...]` (were 316, 84, 465).
- The 25-unit position: `(3, 82)`, 184 legal actions, about 2.5 ms (the other even 25-unit turns: (4, 114) 269 and
  5.5 ms, (5, 102) 196 and 3.5 ms, three under 75). Used in `speed.test.ts`, `ai/plan.test.ts`, `browser/ai.test.ts`.
- `ai/plan.test.ts`: the deadline test moved to the seed 3 fixture (seed 7 at turn 130 is now planned within the ten
  clock reads); `withGrowth`'s Mongol city levels at the common pace.
- `character.test.ts`: Mongols-first hard bound 39 to 44 (ends in 40), Spartans-first keeps 41 (ends in 30);
  `KNOWN_NORMAL` ['4 mongols', '7 spartans'] to [] (all 16 end); `KNOWN_HARD` [] to ['5 spartans'].
- `ADAPT_SEEDS` not re-picked (section 8).
- Rules 3 provenance (`stage1.test.ts`, `stage1.dormant.test.ts`): the mocks turn the blockade off and keep the
  Mongol growthExtra 1 and tribute 3; both replay hash for hash. `capital.rules6.test.ts` turns the blockade off.

Checks on the final code, each suite alone under the shared lock: `npx tsc -b` and `npm run lint` clean;
`npx vitest run` 109 files passed, 21 skipped (1145 tests passed, 123 skipped); `npm run test:browser` AI 6 passed,
then 49 passed and 2 skipped; `SLOW=1 npx vitest run src/ai`: everything but the adaptive check passes once the stall
lists above are in.

## 8. Open

- **The adaptive check fails** (`sim.test.ts`, SLOW): over start seeds 1 to 16 the gap is 0.096 on average with 6 of
  16 above 0 (bound: 0.15 and 12 of 16). It was already failing after the rules 8 additions (0.067). Four seeds read
  exactly 0.000, which looks like the dial sitting still rather than moving the wrong way. Not re-picked, since that
  would hide it; the adaptive dial wants its own look.
- Normal sits at the edge: Mongols 41.5 to 45.3, stalls 4.5 to 9.0 across the two seed sets. One more small Mongol
  lever (tribute 5, or the Camp a gold cheaper) would likely settle it; I stopped at two levers.
- The seat split swings by level and seed set (section 5); worth a larger run (400+ matches) before any seat lever.
- Research is still the largest gold sink after training (Spartans 160 to 175 a match, Mongols 135 to 145). It is not
  waste now (every tech bought gives something), but a budget rule for research would leave more for buildings.
- Blockades barely happen (section 4); if David wants them to matter, the levers are the AI's wish to surround a city
  (BLOCKADE_WEIGHT) more than the cut shares.
- The Spartans buy Deep stores as soon as an enemy stands beside a city, about half their matches, for little gold
  back; a stricter trigger (an actual blockade, or two enemy tiles) would save them 8 to 12 gold.
- `docs/superpowers/specs/2026-11-18-banners-design.md` has an uncommitted change in this worktree that is not mine;
  left as it is.
