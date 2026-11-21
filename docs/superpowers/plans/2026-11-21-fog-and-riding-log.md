# Fog and riding log (rules 6, 0.4.2)

What rules 6 does to play, measured with the AI-against-AI simulator. The rules came from David after playing 0.4.1, in
three steps during this change; the measured set is the last one:

- The fog: no move passes through a tile its owner had not explored when the move began. Only a unit with the new
  `pathfinder` trait may end a move on one unexplored tile, and its turn ends there. For now only the Krypteia Scout has
  it (`src/engine/data/units.ts`; giving it to a Mongol rider later is a one-word data change). Scouting riders are gone.
- Mongol riding by territory: the Mongol mounted bonus is 1 half-point (it was a whole tile, 2 half-points), so a
  Horseman has 5 half-points: 2 field tiles with a spare half-point, which buys one more tile only where a tile costs 1,
  so 5 road tiles or 5 relay tiles. The bonus applies on a move that starts in Mongol or neutral land, never on one that
  starts in enemy territory (the default, as for anyone). Relay riders in Mongol territory stay.
- A level-up ends a chain (no effect in these matches: the shipped AI fields no chain unit).

An earlier version of the brief measured an extra cost per enemy tile (`CONFIG.mongolEnemyLandExtra`, 0 to 2). David
dropped it before it was measured, so there are no rows for it and no such number in the code.

Measures: the simulator's summary, plus a new `travel:` line (`npm run sim:ai`): tiles moved per mounted unit per turn,
the hex distance of each move action by a mounted unit over the mounted units each side had at the start of each of its
turns (melee advances after a kill are not moves and do not count).

All runs are normal against normal, `--matches 100 --seed 701 --max-rounds 60 --swap` (seeds 701 to 800, both seatings,
200 matches), one batch at a time. The variants were run from copies of the worktree with the faction data changed; the
ladder is plan 5's harness, `--matches 25 --seed 1001 --swap` in both seat orders.

## Results

| Rules | Spartan win share | Median rounds | Stalled | Mongol travel (tiles per mounted unit per turn) | Chain kills per match | Mongol cities at the end |
|---|---|---|---|---|---|---|
| 0.4.1 as is (rules 5) | 47.8% | 38 | 14.5% | 2.38 | 0.00 | 3.88 |
| Fog rule alone (old whole-tile bonus everywhere) | 45.3% | 38 | 17.0% | 2.35 | 0.00 | 4.00 |
| Fog + riding by territory, whole-tile bonus | 45.0% | 38 | 17.5% | 2.34 | 0.00 | 3.99 |
| Fog + riding by territory, half-point bonus (the full rules 6 set) | 57.0% | 40 | 19.5% | 1.90 | 0.00 | 3.04 |

Plan 5 targets: Spartans 40% to 60%, median rounds at most 39, stalls at most 21.5%.

Hard over normal, the full set (seeds 1001 to 1025, both seatings each way):

| Seats | First seat | Second seat | Stalled | Median |
|---|---|---|---|---|
| normal, hard | 32.0% | 60.0% | 16.0% | 36 |
| hard, normal | 62.0% | 29.0% | 18.0% | 38 |

Hard over normal 61.0% (rules 5: 53.5% on the same seeds; plan 5's target is at least 60%, so it is now met). Rules 5
read 56.0% / 38.0%, stalls 12.0%, median 28 for normal, hard and 69.0% / 25.0%, stalls 12.0%, median 24 for hard,
normal: matches between the levels now run longer and stall a little more, as the normal pair does.

## Reading

- The fog rule alone barely moves the game: the AI already walks to the fog edge and plans its next move from what it
  then sees (the planner re-reads its goals whenever its explored set grows), so no AI change was needed. Stalls rise
  2.5 points (14.5% to 17.0%), inside the target and within the noise of 200 matches (about 2.5 points either way).
  Engine refusals of AI moves fall from 1106 to 902: a move into a white tile can no longer meet an unseen enemy there.
- Riding by territory with the old whole-tile bonus is the same as the fog rule alone (45.0%, 38, 17.5%, travel 2.34): the
  AI's Mongols rarely start a move inside Spartan territory, so taking the bonus away there seldom matters.
- The half-point bonus is the change that bites. Mongol riders move a fifth less (2.35 to 1.90 tiles a turn), the Mongols
  end with fewer cities (4.0 to 3.0), and the Spartans win 57.0%: inside the 40% to 60% target, but the Mongols were the
  side ahead of target balance before (Spartans 45% to 48%) and are now the weaker side by a similar margin the other
  way. Stalls 19.5% stay inside the target. The median rises to 40, one round over the target of 39: slower riders mean
  slower Mongol conquest.

## Choices

- The rules are David's; nothing here was tuned. The half-point reading of "5 tiles on roads, others default, +1 extra
  tile if they have enough points" is the controller's ruling (one data number: `FACTIONS.mongols.mountedMoveBonus`,
  now in half-points).
- The bonus counts movement spent this turn out of the bonus first, so a move that starts in enemy territory loses only
  the part still unspent; a split move never loses it twice, and a hastened unit keeps its haste.
- No AI change: the fog rule did not break exploration (stalls inside the target).

## AI bounds that moved (`SLOW=1 npx vitest run src/ai`)

- The hard plan budget test's 25-unit position is now 164 random turns of seed 7 (236 turns now has 29 units): 451 ms,
  under the 800 ms bound, which is unchanged.
- At normal, the matches of seeds 1 to 8 that reach no winner within 60 rounds are now "1 mongols" and "8 spartans" (was
  "5 mongols" and "8 mongols"): still 2 of 16. The named list was updated, not widened.
- Not changed, still failing: "adaptive climbs against a strong opponent and drops against a weak one" wants the
  adaptive dial after 4 matches against dial 0.85 to end at least 0.2 above the one against dial 0.2. On seed 1 rules 5
  gives 0.403; rules 6 gives -0.034 (seed 2: 0.032, seed 3: 0.075). The fog rule alone, and fog with territory riding at
  the whole-tile bonus, also miss it on seed 1 (-0.106 and 0.160). Four matches with the factions alternating are a thin
  sample, and a changed faction balance moves which side wins each one, so this reads as the test's sample being too
  small for any rules change rather than a broken adaptive AI, but it is an AI question and the bound stays as it was.
- `legalActions on a 25-unit position is fast` (engine, not AI): the bound was raised from 5 ms to 8 ms. 25-unit
  positions in rules 6 playouts hold 260 to 415 legal actions (the new one 283; the rules 5 position had 130). On the same
  state the rules 5 engine takes 4.8 ms and rules 6 5.1 ms, so the engine is not slower per action; the position is busier.

## Carried

- Median rounds 40 against a target of 39 with the full set. If David wants it back under 39, the levers are the bonus
  (a whole tile again in neutral land) or the Mongol AI's raiding; both are his call.
- The Spartans now win 57.0% against the normal AI. A playtest will tell whether the half-point riders feel too slow.
- The shipped AI never fields a chain unit, so the level-up rule is untested by the simulator (engine tests cover it).
- The adaptive AI check above.
