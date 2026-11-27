# Score sheet on the result screen: design

2026-11-27. Asked for by David through the controller session; the numbers below are ours and are a first
proposal, open to his changes (see Open decisions).

## Intent

A finished match should end with one number a player can try to beat next time, and a sheet that shows where it
came from: how fast they won, how they fought, how far they explored, what they built and took. The tally table
already on the result screen compares the two sides; the score sheet rates one player's match.

## Goals, non-goals, anti-goals

- Goal: every human seat gets a sheet on the result screen, one line per scoring item with its count and its
  points, and a total.
- Goal: the score is a pure function of the match record and the final state, so a match reopened from Home, an
  online result and the same match on two phones all show the same score.
- Non-goal: a high-score table, saving scores in the player stats, or online leaderboards (a later step if David
  wants one; the function is ready for it).
- Non-goal: any change to the rules, the AI or what the engine stores.
- Anti-goal: a score that punishes a faction for its own rules (the Mongols build no roads), or that makes a
  person feel they lost points for winning quickly.

## What already exists (measured, not assumed)

- `src/app/tally.ts` replays a match from its settings and counts engine events per seat (kills, deaths, captures,
  treasures, heroes). The result screen and the player stats (merged from `player-stats`) both use it, cached.
- The final `MatchState` has everything else: `players[p].explored` (tiles explored), each city's `owner`,
  `level` and `capital`, and the engine's exported `isConnected(state, city)` (roads to the capital).
- A captured village is a `captured` event for a city id that did not exist before the action; an enemy city
  keeps its id. A faction wiped out is an `eliminated` event; a resign also fires it, so only an elimination
  caused by a `capture` action counts as wiped out.
- The AI level is on the seat in the record (`level`, and the adaptive `adapt.dial`); `LEVEL_DIAL` maps the
  levels to the dial (easy 0.2, normal 0.5, hard 0.85).
- So no new tracking is needed: nothing is added to the engine or to `MatchState`. The counting extends the
  existing replay in `src/app/tally.ts`, and the engine is reached only through its index.

Calibration: 60 AI matches, normal against normal (`simai.ts --matches 30 --seed 500 --swap`). The winner, typical
match: turn 41 (p10 23, p90 55), 32 kills and 16 losses, 125 of 127 tiles explored, 3 villages, 2 treasures,
8 cities with levels summing to about 40, a Spartan winner joining 6 of 7 cities by road (never all 7: the
taken enemy capital sits far away), one faction wiped out.

## The scoring (our own numbers)

| Line | Points | Typical normal win |
|---|---|---|
| Victory on turn N | 20 per turn under 60 (0 at 60 or later, 0 for a loss) | 380 |
| Units defeated | +10 each | 320 |
| Units lost | -5 each | -80 |
| Land explored | +1 per tile | 125 |
| Villages captured | +40 each | 120 |
| Treasures claimed | +30 each | 60 |
| Cities developed | +10 per level above 1, summed over the cities held at the end | 320 |
| Roads to the capital | +25 per city joined, +150 more when every city is joined (factions that build roads only) | 150 |
| Factions wiped out | +200 each (by taking their last city, not by their resigning) | 200 |
| Subtotal | sum of the lines | about 1600 |
| Against the AI | the subtotal times a difficulty factor: easy x1.0, normal x1.5, hard x2.0; adaptive from where its dial finished, on the same line, to the nearest 0.1 | +800 |
| Total | never below 0 | about 2400 |

- The difficulty factor is `1 + (dial - 0.2) / 0.65`, rounded to one decimal: easy 1.0, normal 1.5, hard 2.0, and
  an adaptive AI that finished at dial 0.1 gives 0.8. It shows as a line of its own with the points it adds, so
  every line still sums to the total. In a match between two people there is no difficulty line.
- A subtotal below zero is not multiplied: the difficulty line shows 0 and the total 0.
- The roads line is left out for a faction that cannot build roads (`FACTIONS[f].canBuildRoads`), so the Mongols
  are not marked down for their rules. A Spartan with no city but the capital sees the line with 0.

## How it looks

A paper card under the tally table, in the same family as the result card and the tally: a caption with the
player's name, then one row per line: the label, a small grey count under or beside it, and the points right
aligned in tabular digits with a sign. A thin rule, the subtotal, the difficulty row, a heavier rule and the total
in large bold type in the winner's colour. Sketch:

```
  Score: David
  Victory on turn 41              +380
  Units defeated  32              +320
  Units lost  16                   -80
  Land explored  125 of 127       +125
  Villages captured  3            +120
  Treasures claimed  2             +60
  Cities developed  8, best level 8  +320
  Roads to the capital  6 of 7    +150
  Factions wiped out  1           +200
  ---------------------------------------
  Subtotal                        1595
  Hard AI  x2.0                  +1595
  =======================================
  Total                           3190
```

- One sheet per human seat, the winner's first. Solo play shows one sheet; pass-the-phone and online show two.
- The result screen already scrolls when tall (it does on small phones today with the tally); the sheet keeps
  the Home button reachable by scrolling, measured in the browser test.

## Approaches considered

1. **Count in the app, from the existing replay (chosen).** Extend `matchTallies` to also count villages and
   factions wiped out, and add a pure `scoreSheet(record, state, tallies, seat)` in `src/app/score.ts`. Reuses the
   one cached replay; no engine or state change; nothing to migrate.
2. **New counters in the engine state.** Add per-player counters to `Player`. Changes the state shape and its
   hash, so it needs a rules version bump and breaks resumed saves and online matches in flight, for numbers the
   events already give. Ruled out.
3. **Score only from the final state.** Cheapest, but kills, losses, villages and treasures are not in the final
   state, so it cannot cover the list. Ruled out.

## Left to the builder

- The exact text of each label (in `src/ui/text.ts`, our own wording, no em or en dashes).
- Test ids: `score-sheet-<seat>`, `score-line-<key>`, `score-total`.
- The browser test: finish a solo match in the built app and read the sheet.

## Open decisions (for David, at the end)

- The weights and the difficulty factors above.
- One sheet per human seat, or only the solo player's sheet.
- Whether the Mongols should get something in place of the roads line.
- Whether scores should later go into the player stats (a best score per name).
