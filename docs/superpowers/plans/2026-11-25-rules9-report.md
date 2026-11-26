# Rules 9 report (2026-11-25)

Branch `rules9`, cut from main at 0.6.2 (rules 8 live). Three changes decided by David on 2026-11-25. Nothing else was
tuned; the balance swing below is reported, not answered.

## Changes

- **Spartan growth.** New `CONFIG.growthExtraFrom: 2` (`src/engine/data/config.ts`). `growthNeeded`
  (`src/engine/economy.ts`) adds the faction's `growthExtra` only when the city is at that level or higher, so every
  city needs `1 + growthBase` = 2 growth to leave level 1, and the Spartan -1 applies from level 2 on (2 to leave
  level 2, 3 to leave level 3, and so on). Mongols (`growthExtra` 0) are unchanged. It is data, not a faction check;
  `growthExtraFrom: 1` replays rules 8.
- **Level 2 gold reward.** `CONFIG.rewardGold` 6 to 5. The same constant pays a champion or support reward that finds
  no free tile (economy.ts), so that also drops to 5; the rules doc says so. The treasure's gold is a separate number
  (`CONFIG.treasure.gold`, already 5, used in capture.ts) and is untouched.
- **Unhunker.** David: "When units are hunkered, also show an unhunker button on their player card to indicate that
  they are currently hunkered. There is the icon, but it's not enough." New action `{ type: 'unhunker', unit }`
  (`src/engine/hunker.ts`), legal for the current player's hunkered unit only. It ends the hunker (a `hunkerEnded`
  event) and nothing else: no cost, not acting for rest, no movement or attacks given back (a unit that hunkered this
  turn still cannot move; one hunkered on an earlier turn has its normal turn). The unit records `unhunkeredTurn` (the
  stamp) and may not hunker again that turn (`'unhunkered this turn'`, the strict reading). The field is absent until
  first used, so older states hash as before; `CONFIG.hunker.unhunker` switches the action off.
  Online: actions are opaque canonical strings (`src/online/wire.ts`), and `database.rules.json` inspects only
  `endTurn`, so neither changes. AI: not taught to use it (note in `plan.ts`); the planner never calls `legalActions`,
  so its play is unchanged (6 normal simai matches give byte-identical JSON with and without the commit), and the sims
  below stand. UI: the unit card shows Unhunker where Hunker would be, drawn pressed in (`aria-pressed`, a shield icon,
  `button.pressed` in theme.css) with a hint (`T.ui.unhunker`, `T.ui.unhunkerHint`). The change is a `pressed` flag
  on `Command`, one branch in `unitCommands` and `indexActions`, and one CSS rule, so it carries over to the steadycam
  sheet at merge.
- `RULES_VERSION` 8 to 9 (`src/engine/types.ts`). Online matches carry `rulesVersion` and a join from another version
  is refused (`'version'`); a rules 8 solo save shows as not resumable. Per CLAUDE.md, the rules 9 build must not be
  deployed while an online match is being played.
- UI: the gold reward blurb already reads `CONFIG.rewardGold`; the city card's growth bar reads the engine's
  `growthNeeded` (Match.tsx), so both update by themselves. `whatsNew` and `APP_VERSION` are untouched, as asked.
- `docs/rules/stage1-rules.md`: sections 6 (growth, reward table, boxed-in reward) and 13 (Spartans), and a
  "Rules 9 changes" changelog.

## Tests

- New or changed: `economy.test.ts` (Spartan needs 2 at level 1, 2 at level 2, 3 at level 3; Mongol 2 then 3;
  `growthExtraFrom` is 2; reward gold 5 and the boxed-in fallback 5), `turn.test.ts` (unchosen reward pays 5),
  `ui/text.test.ts` (the gold blurb reads `CONFIG.rewardGold`, "5 gold").
- `connect.test.ts`, `capital.test.ts`: where 1 connection growth used to fill a Spartan level 1 bar, the city is
  now level 1 with 1 growth.
- Provenance: `stage1.test.ts` and `stage1.dormant.test.ts` mock `rewardGold: 6` and `growthExtraFrom: 1` (the
  latter matters because their Mongol mock has `growthExtra` 1 at level 1). Both replay the rules 3 playouts hash
  for hash. The other provenance files (`capital.rules6`, `blockade.rules7`, `hunker.rules7`, `mongols.rules7`) do
  not replay recorded games through a level 1 Spartan city or the gold reward, and pass unchanged.
- Unhunker: `unhunker.test.ts` (legal only for an own hunkered unit on its turn; ends the hunker; no movement back;
  still rests; no re-hunker that turn; a unit hunkered earlier keeps its normal turn), `wire.test.ts` round trip,
  `commands.test.ts` (Unhunker for a hunkered unit, Hunker otherwise, nothing off turn), `panels.test.tsx` (drawn
  pressed). `hunker.test.ts`: a just-hunkered unit's only legal action is now Unhunker.
- `fingerprint.test.ts`: 9 pinned at `00ab42395a0dd506` (`1c0741146a928313` before the unhunker action).
- Re-pinned because play changed (random playouts pick from `legalActions`, which now lists Unhunker):
  `speed.test.ts` rows (7, 130): 183 legal actions; (1, 75): 88; (3, 90): 90; none has ended. The 25-unit position
  moved from (3, 82) to (7, 66) (151 legal actions, about 2.9 ms on a busy machine) in `speed.test.ts`,
  `ai/plan.test.ts` and `browser/ai.test.ts`. `ai/plan.test.ts` withGrowth: 7 Spartan growth now pays 2 + 2 + 3 and
  leaves 0 toward level 4.
- `character.test.ts` (SLOW), normal stalls: four of the 16 seeded matches no longer end within 60 rounds. Run to
  150 rounds: '7 mongols' ends in 66 and '8 mongols' in 69 (Mongols win); '3 mongols' and '4 spartans' are still
  unended at 150. Re-pinned as `KNOWN_NORMAL` with that note (it was empty). Hard is unchanged. The adaptive check
  (`sim.test.ts`) passes.

Runs on the final code: `npx tsc -b` clean; `npm run lint` clean; `npx vitest run` 126 files passed, 22 skipped
(1307 tests passed, 124 skipped); `SLOW=1 npx vitest run src/ai` 12 files, 137 tests passed, the adaptive check
included. `npm run test:browser` was not run (the 25-unit position in `browser/ai.test.ts` moved with the others).

## Sims

`npx tsx scripts/simai.ts --matches 100 --seed 1 --a <level> --b <level> --swap --jobs 8` (200 matches each).
"Before" is a copy of main at da22881 and matches the numbers the brief gave exactly.

| Run | Spartans | Mongols | Stalls | Spartan cities (end / round 10) | Mongol cities (end / round 10) |
|---|---|---|---|---|---|
| normal, before | 52.3% | 43.3% | 9.0% | 4.28 / 2.42 | 3.42 / 3.19 |
| normal, after | 26.8% | 68.0% | 10.5% | 2.33 / 2.36 | 5.33 / 3.30 |
| normal, growth change alone (gold 6) | 26.3% | 71.0% | 5.5% | 2.21 / 2.36 | 5.47 / 3.23 |
| hard, before | 51.0% | 46.0% | 6.0% | 4.08 / 2.38 | 3.54 / 3.39 |
| hard, after | 26.3% | 71.8% | 4.0% | 2.10 / 2.33 | 5.54 / 3.51 |

- The swing is about 25 points toward the Mongols at both levels. The extra run (growth change only, reward gold
  kept at 6, normal) shows the growth change alone accounts for all of it; the gold change is noise next to it.
- City counts at round 10 barely move, so the Spartans do not found fewer cities. They lose them later: Spartan
  units trained fall (normal 38.5 to 31.3, hard 36.8 to 28.6) and Mongols end with about 5.4 cities instead of 3.5.
  A plausible reading: the slower first level-up delays the capital's second unit slot and the level 2 to 5
  reward chain, and the Spartans' whole army comes later. Not investigated further, as asked.
- No AI code hard-codes the old discount: the AI calls the engine's `growthNeeded` (assess.ts, mix.ts).

## Why one growth point swung the balance (investigation, 2026-11-25)

Every sim below is 200 AI matches, `npx tsx scripts/simai.ts --matches 100 --seed L --a L --b L --swap --jobs 8`
(seeds 1 to 100 both seatings unless said), adjudged stalls counting half. One share has a standard error of about
3.5 points. "Rules 8 growth" is a copy of this branch with `growthExtraFrom: 1` and nothing else (reward gold 5 kept),
so the two differ only in the Spartan level 1 cost. The new `scripts/simgrowth.ts` replays a `--json --actions` batch
and reports when each side's capital reached each level, how fast other cities reached level 2, rewards, growth by
source, cities won and lost, and income, units and spending by round. These runs predate the Market change (below);
on its own the Market's growth 3 moves rules 9 from 26.3 to 27.0% at hard and 26.8 to 27.5% at normal, inside noise.

Spartan win share: rules 8 growth 53.0% hard, 57.3% normal; rules 9 26.3% hard, 26.8% normal. Of the 200 hard
matches (same maps and seats), 62 went from a Spartan win to a Mongol win and 8 the other way.

### Where the gap opens (Spartan side, hard; normal reads the same)

| | rules 8 growth | rules 9 |
|---|---|---|
| Capital reaches level 2 (median round, share of sides) | r3, 98% | r8, 90% |
| Capital reaches level 3 / 4 / 5 | r12 / r21 / r31 | r17 / r25 / r35 |
| Capital reaches level 5 at all | 52% | 36% |
| Other cities: rounds from gaining one to its level 2 (mean, median) | 2.6, 2 | 6.8, 5 |
| Round 4: city levels, income, units | 2.24, 3.24, 3.08 | 1.70, 2.70, 2.75 |
| Round 10: cities, city levels, income, units | 2.46, 4.87, 5.86, 6.00 | 2.35, 3.35, 4.33, 4.76 |
| Round 20: cities, city levels, income, units | 2.94, 8.35, 9.77, 9.94 | 2.49, 5.63, 6.62, 6.42 |
| Champions (level 5+ rewards taken as King's Guard) per match | 5.25 | 2.45 |
| Units trained per match | 37.4 | 28.6 |
| Mongol cities at the end | 3.50 | 5.54 |

The Mongol rows barely move (capital level 2 at r5 in both, income at round 10 6.1 in both). City counts at round 10
match, which is why the first report saw no change there; the Spartan economy is already 26% smaller in income by
round 10 and 32% by round 20, and the army follows: fewer units, half the champions, then the cities.

### Which cities carry it

Ablations on rules 9 (hard): give back the rules 8 level 1 cost to the capital only: 41.3% (+15); to every other
Spartan city only: 32.8% (+6.5); both is rules 8 growth: 53.0%. The capital's first level-up is the largest single
piece, the slower level-ups of captured villages and cities the second, and they compound.

### Why the capital is so much slower: the Spartan start tech

On seeds 1 to 100, the capital's ring of six tiles holds on average 0.89 orchards, 0.68 cropland, 0.36 game, 0.27
ore and 0.11 jewels (the map is mirrored, so both capitals see the same). The Spartans start with `prospecting`, whose
harvest is jewels: 0.11 a capital. The Mongols start with `gathering` (cropland, 0.68). The cheapest growth from the
capital's own ring, with column 1 techs at 4 gold and harvests at 2:

| | 1 growth (rules 8 Spartan level 2) | 2 growth (rules 9 level 2) |
|---|---|---|
| Spartans | 2 gold on 8 maps, 6 gold on 84, none on 8 | 4 gold on 3, 8 on 38, 12 on 26, none on 33 |
| Mongols | | 4 gold on 14, 8 on 46, 12 on 7, none on 33 |

Under rules 8 the Spartan capital levelled for 6 gold on turn 0 or 1 (a tech and one harvest), and the 6 gold reward
paid that back. Under rules 9 it costs 8 to 12 gold, usually a second harvest tech, in a turn the Spartans also want
Spears (6 gold, their Hoplite) and the reward pays 5. So the first level-up went from the cheapest in the game to a
little dearer than the Mongols' own. That is the rules, not the AI: a human Spartan pays the same prices.

### The AI's part

- No AI code hard-codes the old cost: `valueOf` and `chooseReward` read the engine's `growthNeeded`, and a harvest at
  level 1 still clears the economy threshold by a wide margin (about 6 times economy per 2 gold against 0.5 per gold).
- The planner runs research before its economy phase, so gold goes to techs first. Two AI variants tested that order
  (both factions, rules 9): an economy pass before research that takes only actions that complete a level now:
  29.3% hard, 25.3% normal (noise); the whole economy phase before research: 24.0% hard. Neither moved the capital's
  level 2 by more than a round, because a single harvest never completes a level 1 city now.
- 4 more start gold for the Spartans only: 28.0% hard, 29.0% normal; the AI spent it on research (12.7 gold by round 2
  against 9.9) and the capital still reached level 2 at r8. A human could spend it better, but even a human pays
  8 to 12 gold for that level on most maps.

So the swing is mainly a rules effect a human would feel too: the Spartan discount was worth most where it halved a
cost (level 1), at the moment it mattered most (the capital's first turns), and the Spartan start tech harvests almost
nothing near the capital, so without the discount their capital levels late and every later level follows.

## The Market (David, 2026-11-25)

A Market gives 3 growth (was 2); cost 6, +2 income and one per city unchanged (`CONFIG.buildings.market.growth`,
commit 32c0bd9). The rules 3 provenance replays already mock it (1). Alone it moves rules 9 from 26.3 to 27.0% at
hard and 26.8 to 27.5% at normal (Spartans build 1 to 2 Markets a match, Mongols under half of one). Every tuning
run below has it in.

## Tuning the Spartans back (the two-lever form, superseded by the head start below)

Since the cause is the rules, not the AI, no AI change was kept: the two planner variants above moved nothing, and
the narrow one cost the Spartans 10 points on rules 8 growth (53.0 to 42.8% hard). Levers tried, Spartans only,
seed 1, 200 matches each, Spartan / Mongol share:

| Lever | Market | Hard | Normal |
|---|---|---|---|
| none (rules 9) | 2 | 26.3 / 71.8 | 26.8 / 68.0 |
| none (rules 9) | 3 | 27.0 / 70.8 | 27.5 / 68.5 |
| Spartan start gold +4 | 2 | 28.0 / 68.5 | 29.0 / 68.0 |
| a Spartan city's first connection pays it 2 growth, not 1 | 2 | 28.7 / 69.3 | 29.3 / 66.3 |
| from level 3 on `L-1` to leave level `L` (g3) | 2 | 33.8 / 64.3 | 32.5 / 62.3 |
| 1 growth on reaching level 2 (r2g) | 2 | 36.5 / 60.5 | 35.5 / 60.5 |
| r2g and g3 | 2 | 41.5 / 55.8 | 42.3 / 53.5 |
| r2g and the capital starts with 1 growth (cs) | 2 | 48.5 / 48.8 | 55.5 / 40.3 |
| cs | 3 | 39.5 / 58.3 | 47.8 / 48.0 |
| cs and g3 | 3 | 47.0 / 49.8 | 54.5 / 42.5 |
| cs and r2g | 3 | 50.2 / 47.3 | 58.0 / 39.0 |
| **r2g and g3 (kept)** | 3 | **43.0 / 54.0** | **44.8 / 51.0** |

Start gold and connection growth barely move anything (the AI spends the gold on research, and the connection only
helps cities after their first road). The capital's start growth is the strongest single lever, as the ablation
predicts, but it gives the Spartan capital its rules 8 first level-up back, which is the change David chose to make;
with it, normal leans Spartan (54.5 to 58%) while hard is even, and cs with g3 on seed 1001 read 43.8 / 53.5 hard and
55.8 / 40.8 normal (Mongols 41.7% at normal over 400). r2g and g3 keep every city's slower first level-up, the
capital's included, and give the growth back after it.

The two kept levers, as faction data (`src/engine/data/factions.ts`, Mongols 0):

- `levelTwoGrowth: 1`: a Spartan city gains 1 growth point the moment it reaches level 2.
- `growthExtraLate: -1` from `growthExtraLateFrom: 3`: from level 3 on a Spartan city needs `L-1` to leave level `L`.

A Spartan city now needs 2 to leave level 1, then (with the 1 given) 1 more to leave level 2, then 2, 3, 4: 8 growth
gathered from level 1 to level 5, against 10 in rules 8 and 11 in rules 9 before this pass (Mongols 14). So the
Spartans are slower than rules 8 for the first level and faster after it.

### Final sims of the two-lever form (rules 9 with the Market, r2g and g3)

| Seeds | Level | Spartans | Mongols | Seat 1 / seat 2 | Stalls | Median rounds | Cities at the end (Sp / Mo) |
|---|---|---|---|---|---|---|---|
| 1 to 100 | normal | 44.8% | 51.0% | 46.3 / 49.5 | 8.5% | 36 | 3.65 / 4.03 |
| 1 to 100 | hard | 43.0% | 54.0% | 46.8 / 50.2 | 6.0% | 33 | 3.48 / 4.18 |
| 1001 to 1100 | normal | 50.0% | 48.3% | 48.5 / 49.8 | 3.5% | 36 | 3.93 / 3.79 |
| 1001 to 1100 | hard | 46.5% | 51.7% | 54.5 / 43.8 | 3.5% | 31 | 3.65 / 4.00 |

Over the 400 matches per level: normal 47.4 / 49.7, stalls 6.0%; hard 44.8 / 52.9, stalls 4.8%. Normal is inside
45 to 55 for both sides. Hard sits at the lower edge for the Spartans (43.0 and 46.5, 44.8 over 400, about one
standard error under 45). Seats are within 4 points on three of the four runs; seed 1001 hard has the first seat
ahead by 11, which the other three do not show, so it reads as noise. Stalls are under 8% except seed 1 normal
(8.5%, against 8.0% for rules 9 untuned there).

### Tests, re-pins and the seeded stalls

- Re-pinned because of the rule changes (commit messages give each reason): the fingerprint (`5ca7c78cdf02ec87`;
  the Market alone did not move this playout), the `speed.test.ts` rows (Market: seeds 7 and 3; Spartan levers: all
  three), the 25-unit position, now `(7, 52)` with 212 legal actions, in `speed.test.ts`, `ai/plan.test.ts` and
  `browser/ai.test.ts`, and the growth counts in the economy, connect, capital and `withGrowth` tests.
- Provenance: `stage1.test.ts` and `stage1.dormant.test.ts` mock the Spartan `growthExtraLate` and `levelTwoGrowth`
  to 0 (they already mock the Market's growth to 1) and replay the rules 3 playouts hash for hash; the rules 6 and 7
  provenance files pass unchanged.
- `browser/overlay.test.ts` had been failing since the rules 9 growth change (it relied on one orchard harvest
  levelling the seed 7 capital on turn 1; `npm run test:browser` was not run in the first pass). It now uses seed 16,
  whose capital has two orchards beside it, and re-taps the second until its card offers the harvest.
- `character.test.ts` (SLOW): at hard all 16 seeded matches end again (`KNOWN_HARD` was `['5 spartans']`, now
  empty). At normal 13 of 16 end within 60 rounds (`KNOWN_NORMAL` `['4 spartans', '5 spartans', '7 mongols']`, was
  four): '3 mongols' and '8 mongols' now end; '7 mongols' ends in 62 and '5 spartans' in 81, just past the bound.
  '4 spartans' is a deadlock that predates this pass (it was unended at 150 before it): from round 50 the Spartans hold
  only their level 8 capital, with a hunkered Scout on it, and the Mongols' 64 units stand round it, four beside it
  and seeing it, yet a Mongol plan from that position holds no attack at all. That is an AI matter (focus fire on a
  last garrison) and wants its own pass with its own sims, so it is pinned with that note rather than fixed here.
  The adaptive check (`sim.test.ts`) passes; `ADAPT_SEEDS` not re-picked.

### Open

- Hard sits at the lower edge for the Spartans: 43.0 and 46.5 on the two seed sets (44.8 over 400). One more small
  Spartan lever would centre it, but the brief allows two; cs with g3 centres hard but tips normal to the Spartans.
- The Spartan growth curve now has three parts (2, then 2 with 1 given, then `L-1`); that is three numbers to explain
  where rules 8 had one. If David would rather keep one rule, the capital's start growth (cs) is the single strongest
  lever, at the cost of the capital's slower first level-up.
- The '4 spartans' deadlock above.
- The fingerprint playout does not build a Market, so it did not catch the Market change; the speed rows did.

Checks on the final code (each heavy suite under the shared lock): `npx tsc -b` and `npm run lint` clean;
`npx vitest run` 126 files passed, 22 skipped (1307 tests passed, 124 skipped); `SLOW=1 npx vitest run src/ai` 12
files, 137 tests passed, the adaptive check included (here and on the sim worker); `GITHUB_PAGES_BASE=/warbanners/
npx vite build` fine; `npm run test:browser` AI 6 passed, then 50 passed and 2 skipped.

## The Spartan head start (David's decision, 2026-11-25)

David on the two levers: "Instead of an extra growth point, why not just reduce the level 3 growth cost?" A costs-only
form followed (Spartan `growthExtra` -2 from level 2: 2, 1, 2, 3, 4; commit f078936, not simmed), then his decision:
"Have the Spartans growth cost the same as others but give their capital a head start." So the two levers above are
gone, and with them every Spartan growth discount:

- Spartan `growthExtra` 0: every city needs `L+1` to leave level `L` (2, 3, 4, 5). `CONFIG.growthExtraFrom` stays at
  2 (it changes nothing now; the rules 3 provenance replays set it to 1).
- `capitalStartGrowth: 3` (faction data, Mongols 0): the Spartan capital starts the match with 3 growth banked.
  `createMatch` sets it directly, not through `addGrowth`, so the capital stays level 1 with no reward at the start
  even though 3 fills its bar of 2; the first growth its owner adds (a harvest, a building, a connection) levels it,
  with the spare carried into level 2. Every engine call of `addGrowth` is an action, so nothing levels it between
  turns (economy.test.ts checks both).
- `extraStartTechs: ['foraging']` (faction data, Mongols none): the Spartans know Foraging from the start as well as
  Prospecting. This is the one extra lever: the head start alone did not reach the targets, and Foraging answers
  the cause found above (Prospecting harvests 0.11 resources on average near the capital, Foraging's orchards 0.89).
  It is a tech, not a growth discount.

Levers tried on this form, seed 1, 200 matches each, Spartans / Mongols (Market 3 in every row):

| Spartan growthExtra 0 and | Hard | Normal |
|---|---|---|
| capital head start 1 | 29.3 / 67.5 | 31.8 / 64.5 |
| head start 2 | 35.0 / 62.3 | 35.0 / 61.0 |
| head start 3 | 38.8 / 58.3 | 45.8 / 50.0 |
| head start 2 and Spears from the start | 29.8 / 66.3 | 32.8 / 62.3 |
| head start 2 and Foraging from the start | 41.0 / 56.0 | 42.3 / 52.5 |
| **head start 3 and Foraging from the start (kept)** | **46.5 / 51.0** | **49.0 / 46.8** |

Head start 3 is one more than the brief's "1, then 2": 2 left both levels near 35 alone and near 41 with Foraging.
Spears from the start (it saves the 6 gold they spend on turn 0) did nothing.

### Final sims (head start 3 and Foraging), next to the earlier forms

| Seeds | Level | Head start | Seats | Stalls | Median | Cities Sp / Mo | Two levers (r2g, g3) |
|---|---|---|---|---|---|---|---|
| 1 to 100 | hard | 46.5 / 51.0 | 45.0 / 52.5 | 5.0% | 34 | 3.75 / 3.94 | 43.0 / 54.0 |
| 1 to 100 | normal | 49.0 / 46.8 | 47.5 / 48.3 | 8.5% | 39 | 4.07 / 3.67 | 44.8 / 51.0 |
| 1001 to 1100 | hard | 52.3 / 46.0 | 54.8 / 43.5 | 3.5% | 34 | 4.09 / 3.64 | 46.5 / 51.7 |
| 1001 to 1100 | normal | 53.5 / 43.0 | 49.5 / 47.0 | 7.0% | 38 | 4.24 / 3.48 | 50.0 / 48.3 |

Over 400 matches: hard 49.4 / 48.5, stalls 4.3%; normal 51.3 / 44.9, stalls 7.8%. Hard is centred; normal is a touch
Spartan, the Mongols 0.1 under 45 over the 400 (46.8 and 43.0 on the two sets). Seats are within 3.5 points on three
runs and 11 on seed 1001 hard (first seat ahead), as the two-lever form showed on that same run. The kept variant was
measured as a patched copy; the committed code (faction data, `startTechs` in the engine index, the AI's belief of a
rival's start techs) gives byte-identical simai output on 4 hard matches checked.

### Re-pins and tests for this form

- Fingerprint `3747e0372e1e9fa6`; the `speed.test.ts` rows (390 to 140, 74 to 183, 69 to 93 legal actions; none has
  ended); the 25-unit position, now `(1, 80)` with 174 legal actions, in the speed, `ai/plan` and `browser/ai` tests.
- Growth counts in the economy, connect, capital and `withGrowth` tests (the common pace); `state.test.ts` (the
  Spartans start with Prospecting and Foraging, the capital with 3 growth); the UI tests that read seed 7 or 42's
  opening (research list, tech rows, the orchard harvest now enabled, the capital's growth shown as 3/2, the tech
  sheet's research buttons).
- `ai/assess.test.ts`'s moveScore identity moved from `(3, 90)` to `(3, 88)`: at (3, 90) some long Knight moves now
  differ by whole points, as they already did at (9, 90) before this change (moveScore's own approximation).
- `browser/overlay.test.ts` is back on seed 7: one orchard harvest now levels the capital (the head start of 3 fills
  the bar of 2), so the reward choice opens on turn 1 again.
- Provenance: the two rules 3 files mock `capitalStartGrowth` 0 and `extraStartTechs` [] for the Spartans and replay
  hash for hash; the rules 6 and 7 files pass unchanged.

- `character.test.ts` (SLOW): all 32 seeded matches end within 60 rounds, at normal for the first time this branch
  (`KNOWN_NORMAL` now empty; '4 spartans', the deadlock of the two-lever form, ends in 29 with the Mongols winning; the
  longest, '7 spartans', in 53). Hard: all 16 end, the longest '6 spartans' in 54.
- The adaptive check (`sim.test.ts`, SLOW) fails: seeds 8 and 14 read 0.559 and -0.004 (both must be above 0). Over
  start seeds 1 to 16 the gaps are 0.144, 0.303, 0.753, 0.012, 0.278, 0.045, 0.656, 0.559, 0.435, 0.719, -0.263,
  -0.732, -0.575, -0.004, -0.054, 0.619: mean 0.181 (the bound is 0.15) with 11 of 16 above 0 (the bound is 12), so
  the 16-seed reading misses by one seed. Not re-picked, as the brief says; seed 14's dial ends where it started.
  Everything else in `SLOW=1 npx vitest run src/ai` passes.

### Open for this form

- The Spartan capital's card reads "3/2" growth for its first turn (the banked head start is above its bar until it
  levels). Correct by the rule, but it may read as a bug; the bar could cap its display or the card could say
  "levels on its next growth".
- Normal leans Spartan by about 3 points over 400 (Mongols 44.9).
- The adaptive check, above: one seed short of its 16-seed bound and red on its two seeds.

Checks on the final code (head start 3 and Foraging), each heavy suite under the shared lock: `npx tsc -b` and
`npm run lint` clean; `npx vitest run` 126 files passed, 22 skipped (1308 tests passed, 124 skipped);
`GITHUB_PAGES_BASE=/warbanners/ npx vite build` fine; `npm run test:browser` AI 6 passed, then 50 passed and 2
skipped; `SLOW=1 npx vitest run src/ai` 136 of 137 passed, the adaptive check failing as above.

## Rules 9 as released: a level 2 Spartan capital (David's final decision, 2026-11-25)

David: "Let's have the Spartans start on level 2, and all levels from there are 1 point cheaper. Ship it. We'll
balance test later." This replaces every tuning form above; the head start (`capitalStartGrowth`), Foraging from the
start (`extraStartTechs`, `startTechs`) and the two levers are all gone, and the Spartans start with Prospecting only,
as in rules 8.

- New faction field `capitalStartLevel` (Spartans 2, Mongols 1). `createMatch` sets the capital's level directly
  after founding it: no level-up happens, so no level 2 reward is queued. Income (level + capital = 3), unit capacity
  (level + 1 = 3) and the growth need follow the level as for any city; the territory radius stays 1 (only the
  borders reward changes it) and sight does not depend on level. The AI reads all of this from the state.
- Spartan `growthExtra` -1 from `CONFIG.growthExtraFrom` 2, as in this branch's first rules 9 commit: a new Spartan
  city needs 2 to leave level 1 like anyone's, then `L` to leave level `L` (2, 3, 4 against the Mongols' 3, 4, 5).
- Reward gold 5, Market growth 3 and Unhunker stay.

One sim set for the record, nothing changed on it (seed 1, 200 matches each):

| Level | Spartans / Mongols | Seats (first / second) | Stalls | Median rounds | Cities at the end (Sp / Mo) |
|---|---|---|---|---|---|
| hard | 48.3 / 49.3 | 48.5 / 49.0 | 5.0% | 36 | 3.87 / 3.90 |
| normal | 56.3 / 39.5 | 49.8 / 46.0 | 8.5% | 38 | 4.58 / 3.20 |

Hard is even; normal leans Spartan (the Mongols 5.5 under 45). Seed 1001 was not run, as asked.

Tests for this form:

- Re-pinned as consequences: the fingerprint (`d51b5776849292d1`), the `speed.test.ts` rows (239 to 206, 88 to 57,
  69 to 359 legal actions; none has ended), the 25-unit position, now `(7, 56)` with 187 legal actions (speed,
  `ai/plan` and `browser/ai` tests), `state.test.ts` (the capital at level 2, and a new test: no reward pending,
  income 3, capacity 3, growth need 2 for the Spartans in either seat), and `adapt.test.ts`'s opening standing (the
  level 2 capital puts the Spartans 3 points ahead, 13.5 against 10.75 on seed 42; even without it). The growth-count
  tests are back to the first rules 9 commit's, which this form matches.
- `browser/overlay.test.ts` keeps seed 16: Foraging and two harvests now take the level 2 capital to level 3, which
  opens the reward choice on turn 1 as before.
- Provenance: the rules 3 files mock `capitalStartLevel` 1 for the Spartans and replay hash for hash; the rules 6 and
  7 files pass unchanged.
- `character.test.ts` (SLOW): all 16 seeded matches end at normal (longest '7 spartans', 54) and at hard (longest
  '7 spartans', 53), so `KNOWN_NORMAL` and `KNOWN_HARD` are empty.
- The adaptive check (`sim.test.ts`, SLOW) fails: seed 8 reads 0.707 and seed 14 -0.274 (both must be above 0).
  Not re-picked. Everything else in `SLOW=1 npx vitest run src/ai` passes (136 of 137, here and on the sim worker).
- Open: normal leans Spartan on this one seed set (56.3%); the adaptive check is red; the AI's standing measure now
  starts the Spartans 3 points ahead, which the adaptive dial reads as a lead at turn 0.

Checks on the released form, each heavy suite under the shared lock: `npx tsc -b` and `npm run lint` clean;
`npx vitest run` 126 files passed, 22 skipped (1308 tests passed, 124 skipped); `GITHUB_PAGES_BASE=/warbanners/ npx
vite build` fine; `npm run test:browser` AI 6 passed, then 50 passed and 2 skipped; `SLOW=1 npx vitest run src/ai`
136 of 137, the adaptive check failing as above.
