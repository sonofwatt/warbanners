# Rules 10 report (2026-11-26)

Branch `rules10`, cut from main at 781e327 (0.7.2, rules 9 live). One change, decided by David on 2026-11-26: the
Mongol home territory travel bonus is one tile smaller. Nothing was tuned; the sims below are for the record.

## The rule

Each turn, the first tile a mounted Mongol unit enters by relay riding costs what it would without relay riders; every
later relay tile that turn costs `CONFIG.relayCost` (1 half-point, a road's cost).

- All-home moves on fields: a Horseman, Horse Archer or Sky Caller (4 half-points) rides 2 + 1 + 1 = 3 tiles (4 in
  rules 9); a Knight or Khan's Guard (6) rides 2 + 1 + 1 + 1 + 1 = 5 (6 in rules 9). Exactly one tile less.
- Per turn, not per move. The unit records the stamp of the turn it entered its first relay tile (`relayTurn`, absent
  until first used, so older states hash as before). A split move pays the first tile once, and so does the retreat
  move after an attack: a Horse Archer that rides 2 tiles at home, shoots and retreats 1 has ridden 3 tiles for its 4
  half-points, one less than rules 9. Per move would charge the retreat a field again and make the loss two tiles for
  any unit that moves, attacks and retreats, so per turn is the reading that keeps "one tile less at home" true. The
  next turn pays the first tile again.
- Mixed moves fall out of the same rule. Starting outside and riding in: the outside tiles and the first home tile at
  their normal cost, then 1 each (a Knight two tiles out of a radius 2 territory: 4 tiles, 5 in rules 9). Starting
  inside and riding out: the first home tile at its normal cost, the outside tiles at theirs (a Knight in a radius 1
  territory: 3 tiles, also 3 in rules 9, since only one home tile is on the way). A unit that steps straight out never
  pays the first relay tile.
- A tile that relay riding would not make cheaper (a road between road or city tiles, at 1) is not the first relay tile,
  so on a home road a rider still loses one tile at its first field. Without this a rider starting on a road would lose
  nothing.
- "As if no relay" includes the forest rule: a forest as the first home tile costs the normal forest cost and ends a
  mounted Mongol's move, as any forest does. A forest after the first home tile costs 1, as before.
- Unchanged: Hasten (+2 half-points, spent at 1 a tile once the relay is open), roads, the mountain rule (still first),
  foot units (normal costs at home), Spartans (no relay riding), start gold.

Code: `src/engine/movement.ts`. `reachable()` now runs its search over (tile, relay open) pairs in a private
`explore()`, and reports the most movement left per tile (on a tie, the way that has opened the relay, which is never
worse later in the turn). `moveHandler` uses the same search and stamps `relayTurn` when the chosen way opened the relay.
`CONFIG.relayFirstFull` (true) switches the rule; false replays rules 6 to 9. `RULES_VERSION` 9 to 10.

UI: the board marks the engine's legal moves, built from `reachable()`, so the preview needs no change
(`relay.test.ts` checks the legal moves equal `reachable()` and that each move leaves the mp `reachable()` showed). The
unit card's relay riding blurb (`T.ui.relayRidingBlurb`) now says the first tile costs the usual. `whatsNew` and
`APP_VERSION` are untouched.

AI: no change. The planner calls the engine's `reachable()` and `applyAction`, so it plays the new costs. `moveScore`
builds the moved unit without `applyAction` and so leaves `relayTurn` out; that does not change `valueOf` (checked: at
(3, 91), 62 of 93 moves checked open the relay and the identity holds to 6 places with or without setting it), so it
was left alone. No AI code models relay costs; its threat estimates use `mp / 2` as before.

Rules doc (`docs/rules/stage1-rules.md`): section 13 relay riders, a pointer in section 2, a "Rules 10 changes"
changelog.

## Tests

- New `src/engine/relay.test.ts`: the rule is on; reach of each mounted Mongol unit at home (Horseman 3, Knight 5, Horse
  Archer 3, Khan's Guard 5, Sky Caller 3, with the first tile at a field's cost and the second at the relay cost); foot
  units and Spartans unaffected (and no `relayTurn` on a Spartan move); a road is not the first tile; a forest as the
  first tile ends the move; riding in and riding out; a move straight out never stamps; a split move pays once; the
  retreat move after an attack keeps the relay open; the next turn pays again; hasten; legal moves equal `reachable()`
  and each move leaves what `reachable()` showed.
- New `src/engine/mongols.rules9.test.ts` (mocks `relayFirstFull: false`): the rules 9 reach (4, 6, 4, 6, 4), the
  rules 8 relay tests moved from `mongols.test.ts` and `movement.test.ts` unchanged, and the rules 9 mixed moves
  (riding in 5, riding out 3) that `relay.test.ts` compares with.
- Provenance: `stage1.test.ts` and `stage1.dormant.test.ts` (the rules 3 playouts) and `mongols.rules7.test.ts` mock
  `relayFirstFull: false`; all replay hash for hash. `capital.rules6`, `blockade.rules7` and `hunker.rules7` pass
  unchanged.
- `fingerprint.test.ts`: 10 pinned at `1239e2be437b9819`.
- Re-pinned as consequences (the random playouts play differently once a Mongol rider pays a field for its first home
  tile; the commit message gives each reason): the `speed.test.ts` rows (206 to 58, 57 to 95, 359 to 278 legal actions;
  none has ended); the 25-unit position, `(7, 56)` has 20 units now, so `(3, 70)` with 244 legal actions (about 4.7 ms
  at load 5; the other even 25-unit turns within 300 for seeds 1, 3, 4, 5, 7, 8, 9 are `(7, 66)` with 97 and `(9, 88)`
  with 277) in `speed.test.ts`, `ai/plan.test.ts` and `browser/ai.test.ts`; `ai/input.test.ts` hiddenScout reach 23
  and 24 to 20 and 21; `ai/assess.test.ts` moveScore identity from `(3, 90)` (three Spartan moves onto 2,-1 now differ
  by whole points, moveScore's own approximation as seen before at (3, 88) and (9, 90)) to `(3, 91)`;
  `online/session.test.ts` "a rebuild after a lost race" picks any own action rather than a move (this playout now
  leaves both of Ann's units hunkered, so no move is legal).
- `character.test.ts` (SLOW): at normal '7 mongols' no longer ends within 60 rounds; played on it ends in 76, the
  Mongols winning with every city. Pinned in `KNOWN_NORMAL` (was empty) with that note. At hard all 16 end.
- The adaptive check (`sim.test.ts`, SLOW) passes (it failed on rules 9 as released); `ADAPT_SEEDS` not re-picked.

Checks on the final code (heavy suites under the shared lock): `npx tsc -b` and `npm run lint` clean; `npx vitest run`
139 files passed, 28 skipped (1444 tests passed, 138 skipped); `SLOW=1 npx vitest run src/ai` 136 of 137 before the
'7 mongols' pin, the adaptive check passing, and `sim.test.ts` alone 10 of 10 after; `GITHUB_PAGES_BASE=/warbanners/
npm run test:browser` AI 6 passed, then 64 passed and 2 skipped; `npm run test:online` 2 passed; `npm run test:emu`
143 files passed, 24 skipped (1511 tests passed, 73 skipped).

## Sims

`npx tsx scripts/simai.ts --matches 100 --seed S --a L --b L --swap --jobs 8`, 200 matches each, adjudged stalls
counting half. Rules 9 is main at 781e327; its seed 1 rows were re-run and match the brief's numbers exactly. Seed 1001
ran on the sim worker (identical output to ClaudeComputer), rules 10 seed 1 on ClaudeComputer. Travel is the sim's
"tiles moved per mounted unit per turn".

| Seeds | Level | Rules | Spartans / Mongols | Seats (first / second) | Stalls | Median rounds | Cities at the end (Sp / Mo) | Mongol travel |
|---|---|---|---|---|---|---|---|---|
| 1 to 100 | hard | 9 | 48.3 / 49.3 | 48.5 / 49.0 | 5.0% | 36 | 3.87 / 3.90 | 1.56 |
| 1 to 100 | hard | 10 | 56.5 / 40.5 | 46.5 / 50.5 | 6.0% | 36 | 4.54 / 3.19 | 1.35 |
| 1001 to 1100 | hard | 9 | 49.8 / 48.8 | 53.3 / 45.3 | 3.0% | 34 | 3.88 / 3.81 | 1.61 |
| 1001 to 1100 | hard | 10 | 53.8 / 44.3 | 54.5 / 43.5 | 4.0% | 36 | 4.24 / 3.58 | 1.34 |
| 1 to 100 | normal | 9 | 56.3 / 39.5 | 49.8 / 46.0 | 8.5% | 38 | 4.58 / 3.20 | 1.70 |
| 1 to 100 | normal | 10 | 52.0 / 43.8 | 48.5 / 47.3 | 8.5% | 40 | 4.21 / 3.61 | 1.42 |
| 1001 to 1100 | normal | 9 | 58.0 / 39.3 | 50.2 / 47.0 | 5.5% | 39 | 4.64 / 3.10 | 1.73 |
| 1001 to 1100 | normal | 10 | 56.3 / 42.3 | 50.5 / 48.0 | 3.0% | 37 | 4.38 / 3.35 | 1.41 |

Over 400 matches: hard rules 9 49.1 / 49.1, rules 10 55.2 / 42.4; normal rules 9 57.2 / 39.4, rules 10 54.2 / 43.1.

- Mongol riders travel 13 to 19% less (1.56 to 1.73 tiles a turn down to 1.34 to 1.42); Spartan riders are
  unchanged within noise (1.57 to 1.70 before, 1.58 to 1.76 after).
- Hard swings about 6 points toward the Spartans (8.2 on seed 1, 4.0 on seed 1001; one share over 200 has a standard
  error of about 3.5 points), and the Mongols end with fewer cities (3.19 and 3.58 against 3.90 and 3.81).
- Normal moves the other way, about 3 points toward the Mongols on both seed sets (4.3 and 1.7 points), which is inside
  noise for each set; it does not read as an effect. Normal still leans Spartan (the Mongols 43.1 over 400).
- Seats and stalls barely move; the median match is within 2 rounds.

## Concerns

- Hard now leans Spartan (55.2 / 42.4 over 400, the Mongols under 45 on both seed sets) where rules 9 was even. The
  rule is David's; no lever was tried, as asked.
- The literal "first relay tile at its normal cost" costs more than one tile where the first home tile is a forest:
  the forest rule ends a mounted Mongol's move there. A rider can usually go round it (a field first opens the relay,
  then the forest costs 1), and the AI and the board find that way, but a rider walled in by forest loses its move. If
  David wants exactly one tile in every case, the alternative is "the first relay tile costs 2 half-points" (a field's
  cost) whatever the terrain.
- The road exception (a road tile is not the first relay tile) is my reading of "the first tile entered by relay
  riding"; without it a rider starting on a road would lose nothing at home. The rules doc says so.
- The unit card's relay blurb was updated (it described the old rule); `whatsNew` was not, as asked.
- The sim worker keeps two detached worktrees for these runs, `/root/hk/r9x` (781e327) and `/root/hk/r10x` (781e327
  with this branch's `src` copied in, uncommitted there).
