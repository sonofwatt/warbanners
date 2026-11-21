# Plan 5 tuning log

Bulk AI-against-AI matches (`npm run sim:ai`, with Task 7's hero and treasure lines) for plan 5 Task 8: the hero
thresholds, the trait sizes, the treasure table and the AI's worths. Every run states its hypothesis, changes one lever
group and is kept or reverted. Win shares count a stall adjudged to a side as half a win. Ladder pairs are pooled over
both seat orders (`--a lo --b hi --swap` and `--a hi --b lo --swap`), as in plan 3's Task 12b: "hard over normal 63.5%"
is hard's share over both orders, the rest is normal's share and the half of adjudged stalls each side did not get.

No stage 1 number changes (plan 5 Rulings: the first-seat edge).

Targets (normal against normal unless named, `--max-rounds 60 --swap --jobs 3`):

| Measure | Target |
|---|---|
| Matches with at least one hero | 60% to 95% |
| Heroes per match, both sides | 1 to 4 |
| First-hero side's win share | at most 65% |
| Spartan traits per match minus Mongol | above 0 (the agoge shows) |
| Treasures claimed per match | at least 3 of 4 |
| Draughts drunk per draught found | at least 50% |
| Spartan share of wins | 40% to 60% |
| Hard over easy, normal over easy, hard over normal (pooled, both seat orders) | at least 80%, 65%, 60% |
| Median rounds | at most 39 (no worse than plan 3) |
| Stalled at 60 rounds | at most 21.5% (no worse than plan 3); aim for 15% |
| First-seat win share | measured and reported (42% to 58% is the band) |

Added by the controller: the two SLOW AI tests that fail on the Task 7 head must come back inside their bounds, or the
log gives the evidence that a bound should change (no bound is loosened here):

- `at normal, every match ends within 60 rounds` (src/ai/character.test.ts, seeds 1 to 8 in both seatings, 16 matches);
- `adaptive climbs against a strong opponent and drops against a weak one` (src/ai/sim.test.ts, gap at least 0.2).

`npm run sim:adaptive -- --matches 4 --seed 1 --max-rounds 60` prints the same series the adaptive test reads; its gap is
the last figure against dial 0.85 less the last figure against dial 0.2.

Tuning runs are normal against normal on 50 seeds from seed 1 with `--swap` (100 matches); ladder pairs use 25 seeds from
1001 in both orders (100 matches a pair). On 100 matches a share moves by about 5 points from one sample to the next.

## Baseline: 2026-11-20, commit 12fbdf0 (Task 6's numbers)

`npm run sim:ai -- --matches 50 --seed 1 --a normal --b normal --max-rounds 60 --swap --jobs 3`

```
matches 100  seats a=normal b=normal  seed 1  max rounds 60  swap
win share: spartans 65.0%  mongols 23.5%  (adjudged stalls count half)
seat win share: first 51.5%  second 37.0%
stalled 23.0%  rounds p10 18  median 43  p90 60
refusals 1212 (not moves 0)  replans 11281
spartans: cities 5.64  at round 10 2.12  trained 25.30  attacks 49.90  kills 20.64  mounted attacks 0.00  raid retreats 0.00  adjacent 0.67  lures 0.00 onto capturable 0.00 lured captures 0.01  forest entries short of mp 0.00
  trained per match: hoplite 23.71, warrior 1.59
mongols: cities 2.26  at round 10 4.81  trained 24.13  attacks 95.19  kills 11.11  mounted attacks 94.05  raid retreats 62.99  adjacent 0.49  lures 15.92 onto capturable 0.01 lured captures 0.00  forest entries short of mp 8.40
  trained per match: horseArcher 18.11, horseman 6.02
spartan adjacent minus mongol 0.19  mongol cities at round 10 minus spartan 2.69  mongol raid retreats / mounted attacks 0.67
heroes per match: first seat 8.98  second seat 8.76  both 17.74  (lost per match 10.95)
matches with at least one hero 96.0%  first hero's side won 64.6% of 96 decided
spartans traits per match: fierce 9.27, tireless 7.39, hardy 12.52, watchful 1.85  (total 31.03, heroes 9.78)
mongols traits per match: fierce 7.98, tireless 16.44, hardy 0.13, watchful 0.57  (total 25.12, heroes 7.96)
treasures claimed per match 3.85: explore 0.83, gold 0.70, mercenary 0.59, unit 0.57, draught 0.56, relic 0.42, map 0.18
draughts drunk 26 of 56 found (46.4%)
```

Ladder, 25 seeds from 1001, both orders:

```
hard over easy 84.0% (easy 11.5%, stalled 9.0%, medians 31 and 32)
normal over easy 68.0% (easy 20.5%, stalled 23.0%, medians 38 and 41)
hard over normal 63.5% (normal 30.5%, stalled 12.0%, medians 31 and 33)
```

Hero and treasure lines of the six ladder runs (heroes both sides; matches with a hero; first hero's side; draughts):

| Run | Heroes | With a hero | First hero's side | Draughts drunk |
|---|---|---|---|---|
| easy, hard | 11.88 | 98.0% | 59.2% | 11 of 21 |
| hard, easy | 10.70 | 94.0% | 68.1% | 4 of 18 |
| easy, normal | 14.32 | 100.0% | 62.0% | 8 of 21 |
| normal, easy | 14.02 | 98.0% | 65.3% | 7 of 20 |
| normal, hard | 14.04 | 98.0% | 46.9% | 10 of 20 |
| hard, normal | 15.30 | 100.0% | 60.0% | 9 of 18 |

Gold's share of all treasure claims, normal against normal: 0.70 of 3.85 a match, 18.2%. A plain seventh would be 14.3%;
the rest is the fallbacks (a relic on a full unit or a Camp, a draught for a unit that carries one or cannot attack, a
unit or a Sellsword with no free neighbour). Explore is 21.6% (0.83), a seventh plus the map's fallback.

SLOW tests on this head (Task 6's report): the normal test leaves `1 spartans`, `1 mongols`, `5 spartans`, `8 mongols`
unended; the adaptive gap is -0.449 (the series above reproduces it: 0.403 against 0.852).

Against the targets: heroes 17.7 a match (target 1 to 4) and 96% of matches (60% to 95%) are far too many; the Spartans
win 65.0%; draughts 46.4%; median 43; stalled 23.0%. The ladder, first-hero side (64.6%), treasures (3.85) and the
Spartan trait lead (31.0 against 25.1) are met.

## Diagnosis

1. Where the deeds go. A diagnostic run with every threshold out of reach (30 matches, normal against normal, seeds 1 to 15
   in both seatings, every unit's final deed totals; Camps left out) gave these percentiles (50th, 75th, 90th, 95th, 98th,
   highest):

   | Deed | Spartans (21 units a match) | Mongols (25 units a match) |
   |---|---|---|
   | fight | 2, 5, 9, 11, 14, 34 | 3, 7, 13, 16, 20, 38 |
   | march | 6, 11, 16, 18, 23, 38 | 20, 36, 54, 68, 86, 119 |
   | survive | 5, 7, 10, 12, 13, 25 | 1, 1, 2, 3, 4, 8 |
   | rest | 0, 1, 3, 5, 7, 12 | 0, 0, 2, 3, 4, 11 |

   Counting traits and heroes on those totals reproduces the baseline closely (Spartans 27.0 traits and 8.7 heroes a match,
   Mongols 24.6 and 7.5, against the baseline's 31.0, 9.8, 25.1 and 8.0; relics and Sellswords add the rest). Half of all
   Mongol units march 20 tiles, so march 15 made every second rider Tireless; half of all Spartan units are hit 5 times, so
   survive 4 made every second Hoplite Hardy. The thresholds need to sit near each deed's 90th to 95th percentile for a
   few heroes a match. The same counting was used to pick each threshold run below before it was played.

2. The SLOW tests and the three causes the Task 6 review named. Each cause was put back on its own, on the Task 6
   thresholds (the head), and both tests run:

   | Head with | Normal test: unended of 16 | Adaptive gap |
   |---|---|---|
   | nothing changed | 4 | -0.449 (0.403 against 0.852) |
   | hero, trait and draught worths 0 (unitValue is the gold worth) | 0 (passes) | 0.056 (0.830 against 0.774) |
   | treasure value 6 | fails | 0.162 (0.950 against 0.788) |
   | adapt's standing counts only gold worth | not affected | -0.187 (0.759 against 0.946) |
   | the run 1 thresholds below, worths unchanged | 1 (`5 mongols`) | 0.599 (0.950 against 0.351) |

   With 17 heroes a match the AI's hero worths were what kept matches from ending (danger scales with worth, so a side
   full of heroes hangs back). The adaptive test reads the last of four chained matches, and its gap swings from -0.45 to
   0.60 with any change, as plan 3's log already found (its run 7). What fixed both was having far fewer heroes, not
   any of the three named terms on its own.

## Tuning runs

### Run 1: hero thresholds fight 6 to 14, march 15 to 50, survive 5 to 10, rest 5 to 8; agoge fight 4 to 10, march 10 to 20, survive 4 to 9, rest 4 to 6 (src/engine/data/config.ts)

Hypothesis: on the diagnosis totals these thresholds give about 3 heroes a match (Spartans 1.4, Mongols 1.7), 6.6 Spartan
traits against 5.7 Mongol, and a hero in about two matches of three. Far fewer heroes should take the Spartans' edge
(65%, most of it Hardy Hoplites) back toward even and stop heroes hanging back.

```
matches 100  seats a=normal b=normal  seed 1  max rounds 60  swap
win share: spartans 47.0%  mongols 41.0%  (adjudged stalls count half)
seat win share: first 49.5%  second 38.5%
stalled 24.0%  rounds p10 14  median 42  p90 60
refusals 652 (not moves 0)  replans 9245
spartans: cities 4.29  at round 10 2.05  trained 22.95  attacks 46.32  kills 18.50  mounted attacks 0.00  raid retreats 0.00  adjacent 0.68  lures 0.00 onto capturable 0.00 lured captures 0.00  forest entries short of mp 0.00
  trained per match: hoplite 21.79, warrior 1.16
mongols: cities 3.52  at round 10 4.85  trained 23.89  attacks 102.32  kills 11.95  mounted attacks 101.30  raid retreats 66.41  adjacent 0.48  lures 16.64 onto capturable 0.00 lured captures 0.00  forest entries short of mp 6.80
  trained per match: horseArcher 17.92, horseman 5.97
spartan adjacent minus mongol 0.20  mongol cities at round 10 minus spartan 2.80  mongol raid retreats / mounted attacks 0.66
heroes per match: first seat 2.00  second seat 1.82  both 3.82  (lost per match 2.03)
matches with at least one hero 69.0%  first hero's side won 63.8% of 69 decided
spartans traits per match: fierce 2.01, tireless 1.60, hardy 3.31, watchful 0.91  (total 7.83, heroes 1.95)
mongols traits per match: fierce 2.28, tireless 4.38, hardy 0.09, watchful 0.13  (total 6.88, heroes 1.87)
treasures claimed per match 3.80: explore 0.82, gold 0.67, mercenary 0.60, unit 0.55, draught 0.54, relic 0.43, map 0.19
draughts drunk 20 of 54 found (37.0%)
```

SLOW: normal test 1 unended (`5 mongols`); adaptive gap 0.599 (0.950 against 0.351), passes.

After: heroes 17.7 to 3.8, matches with a hero 69%, Spartans 65.0% to 47.0%. Median 42, stalled 24%, draughts 37%.
Kept.

### Run 2: draught worth 2 to 1 (src/ai/assess.ts ITEM_WORTH)

Hypothesis: the AI drinks only when the drink and its attack together beat losing the draught's worth. On
`draughtFinish()` the drink alone scored -1.22 at normal and -1.77 at hard, and drink plus the killing second attack
scored -0.13 at hard: a Warrior's kill does not pay for a draught worth 2. Worth 1 makes that +0.75 at hard (and the
opening attack -0.09 instead of -0.32, which hard's lookahead then carries), so more draughts are drunk and hard starts
that fight. Measured on the scenario before the run: with worth 1, normal (all five seeds of the test) and hard both
drink and kill.

```
matches 100  seats a=normal b=normal  seed 1  max rounds 60  swap
win share: spartans 41.5%  mongols 45.5%  (adjudged stalls count half)
seat win share: first 46.0%  second 41.0%
stalled 26.0%  rounds p10 15  median 37  p90 60
refusals 557 (not moves 0)  replans 8597
spartans: cities 3.86  at round 10 2.06  trained 21.53  attacks 43.34  kills 17.01  mounted attacks 0.00  raid retreats 0.00  adjacent 0.68  lures 0.00 onto capturable 0.00 lured captures 0.00  forest entries short of mp 0.00
  trained per match: hoplite 20.40, warrior 1.13
mongols: cities 3.96  at round 10 4.85  trained 23.24  attacks 97.37  kills 11.48  mounted attacks 96.36  raid retreats 62.89  adjacent 0.49  lures 15.91 onto capturable 0.00 lured captures 0.00  forest entries short of mp 7.41
  trained per match: horseArcher 17.33, horseman 5.91
spartan adjacent minus mongol 0.19  mongol cities at round 10 minus spartan 2.79  mongol raid retreats / mounted attacks 0.65
heroes per match: first seat 1.68  second seat 1.74  both 3.42  (lost per match 1.77)
matches with at least one hero 66.0%  first hero's side won 68.2% of 66 decided
spartans traits per match: fierce 1.71, tireless 1.41, hardy 3.10, watchful 0.90  (total 7.12, heroes 1.72)
mongols traits per match: fierce 2.14, tireless 4.19, hardy 0.09, watchful 0.14  (total 6.56, heroes 1.70)
treasures claimed per match 3.80: explore 0.82, gold 0.67, mercenary 0.60, draught 0.55, unit 0.55, relic 0.42, map 0.19
draughts drunk 26 of 55 found (47.3%)
```

SLOW: normal test 2 unended (`5 mongols`, `8 mongols`); adaptive gap 0.599, passes.

After: draughts 37.0% to 47.3%, median 42 to 37, Spartans 41.5%. Stalled 26% and the first hero's side 68.2% moved by
noise (about 5 points on 100 matches). Kept, also for the hard drink.

### Run 3: hero trait worth 3 to 2 and hero worth 3 to 1 (src/ai/assess.ts HERO_TRAIT_WORTH, HERO_WORTH)

Hypothesis: the plan review's worry: a two-trait Warrior worth 11 against its gold 2, and danger scaled by worth, keeps
heroes out of the fight. Worth 7 should let them lead, so fewer stalls and a shorter median.

```
matches 100  seats a=normal b=normal  seed 1  max rounds 60  swap
win share: spartans 40.0%  mongols 46.0%  (adjudged stalls count half)
seat win share: first 49.5%  second 36.5%
stalled 27.0%  rounds p10 15  median 39  p90 60
refusals 653 (not moves 0)  replans 9063
spartans: cities 3.74  at round 10 2.07  trained 22.28  attacks 45.67  kills 17.24  mounted attacks 0.00  raid retreats 0.00  adjacent 0.69  lures 0.00 onto capturable 0.00 lured captures 0.00  forest entries short of mp 0.00
  trained per match: hoplite 21.13, warrior 1.15
mongols: cities 4.08  at round 10 4.84  trained 23.77  attacks 106.14  kills 12.72  mounted attacks 104.83  raid retreats 69.70  adjacent 0.49  lures 16.77 onto capturable 0.00 lured captures 0.00  forest entries short of mp 7.77
  trained per match: horseArcher 17.87, horseman 5.90
spartan adjacent minus mongol 0.19  mongol cities at round 10 minus spartan 2.77  mongol raid retreats / mounted attacks 0.66
heroes per match: first seat 2.05  second seat 1.96  both 4.01  (lost per match 2.16)
matches with at least one hero 71.0%  first hero's side won 62.9% of 70 decided
spartans traits per match: fierce 1.78, tireless 1.31, hardy 3.76, watchful 0.96  (total 7.81, heroes 1.97)
mongols traits per match: fierce 2.49, tireless 4.54, hardy 0.09, watchful 0.13  (total 7.25, heroes 2.04)
treasures claimed per match 3.79: explore 0.83, gold 0.67, mercenary 0.60, draught 0.56, unit 0.54, relic 0.41, map 0.18
draughts drunk 26 of 56 found (46.4%)
```

SLOW: normal test 1 unended (`7 mongols`); adaptive gap -0.114 (0.836 against 0.950), fails.

After: stalled 27%, median 39, heroes 4.01 (just past the target). No gain on stalls and the adaptive test fails.
Reverted.

### Run 4: agoge march 20 to 15 and agoge survive 9 to 10 (src/engine/data/config.ts)

Hypothesis: most stalls are a Spartan side holding 6 or 7 cities that cannot take the last Mongol ones in time (in 20 of
26 run 2 stalls the leader had more cities; the Spartans led 16 of them). A Tireless Hoplite moves 2 tiles; more of them
(about 2.5 a match instead of 0.7 on the diagnosis totals) should close wars sooner. Survive 10 keeps the hero count.

```
matches 100  seats a=normal b=normal  seed 1  max rounds 60  swap
win share: spartans 41.5%  mongols 45.5%  (adjudged stalls count half)
seat win share: first 46.0%  second 41.0%
stalled 26.0%  rounds p10 15  median 40  p90 60
refusals 593 (not moves 0)  replans 8567
spartans: cities 3.77  at round 10 2.06  trained 22.12  attacks 43.50  kills 16.53  mounted attacks 0.00  raid retreats 0.00  adjacent 0.68  lures 0.00 onto capturable 0.00 lured captures 0.00  forest entries short of mp 0.00
  trained per match: hoplite 20.85, warrior 1.27
mongols: cities 4.08  at round 10 4.85  trained 23.25  attacks 103.39  kills 12.77  mounted attacks 102.20  raid retreats 66.70  adjacent 0.50  lures 16.73 onto capturable 0.00 lured captures 0.00  forest entries short of mp 7.52
  trained per match: horseArcher 17.54, horseman 5.71
spartan adjacent minus mongol 0.18  mongol cities at round 10 minus spartan 2.79  mongol raid retreats / mounted attacks 0.65
heroes per match: first seat 1.83  second seat 2.01  both 3.84  (lost per match 1.99)
matches with at least one hero 69.0%  first hero's side won 69.6% of 69 decided
spartans traits per match: fierce 1.72, tireless 2.70, hardy 2.26, watchful 0.55  (total 7.23, heroes 1.87)
mongols traits per match: fierce 2.39, tireless 4.49, hardy 0.09, watchful 0.15  (total 7.12, heroes 1.97)
treasures claimed per match 3.82: explore 0.82, gold 0.67, mercenary 0.59, draught 0.57, unit 0.56, relic 0.43, map 0.18
draughts drunk 27 of 57 found (47.4%)
```

SLOW: normal test 1 unended (`5 mongols`); adaptive gap 0.237 (0.917 against 0.680), passes.

After: Spartan Tireless 1.41 to 2.70 but stalled still 26%, median 40, first hero's side 69.6%, Spartan trait lead
0.11. Reverted.

### Run 5: treasure value 9 to 6 (src/ai/assess.ts TREASURE_VALUE), on run 2's numbers

Hypothesis: the third cause the Task 6 review named. A treasure worth 9 pulls units off the front in mid-game; at 6
the fronts stay manned, so fewer stalls. Treasures were claimed at 3.80 of 4, so there is room.

```
matches 100  seats a=normal b=normal  seed 1  max rounds 60  swap
win share: spartans 41.5%  mongols 45.5%  (adjudged stalls count half)
seat win share: first 45.5%  second 41.5%
stalled 26.0%  rounds p10 14  median 36  p90 60
refusals 532 (not moves 0)  replans 8689
spartans: cities 3.84  at round 10 2.03  trained 21.43  attacks 41.96  kills 16.31  mounted attacks 0.00  raid retreats 0.00  adjacent 0.68  lures 0.00 onto capturable 0.00 lured captures 0.00  forest entries short of mp 0.00
  trained per match: hoplite 20.22, warrior 1.21
mongols: cities 3.98  at round 10 4.86  trained 22.67  attacks 96.85  kills 11.53  mounted attacks 95.70  raid retreats 62.07  adjacent 0.49  lures 15.55 onto capturable 0.00 lured captures 0.00  forest entries short of mp 7.10
  trained per match: horseArcher 16.83, horseman 5.84
spartan adjacent minus mongol 0.19  mongol cities at round 10 minus spartan 2.83  mongol raid retreats / mounted attacks 0.65
heroes per match: first seat 1.81  second seat 1.84  both 3.65  (lost per match 1.93)
matches with at least one hero 65.0%  first hero's side won 63.1% of 65 decided
spartans traits per match: fierce 1.60, tireless 1.44, hardy 3.23, watchful 0.90  (total 7.17, heroes 1.82)
mongols traits per match: fierce 2.22, tireless 4.19, hardy 0.09, watchful 0.17  (total 6.67, heroes 1.83)
treasures claimed per match 3.77: explore 0.82, gold 0.67, mercenary 0.59, draught 0.55, unit 0.54, relic 0.42, map 0.18
draughts drunk 28 of 55 found (50.9%)
```

SLOW: normal test 3 unended (`5 mongols`, `7 mongols`, `8 mongols`); adaptive gap 0.054 (0.840 against 0.786), fails.

After: every bulk target met except stalls (26.0%, unchanged); draughts 50.9%, median 36. But both SLOW tests fail, and
the bulk gains over run 2 (draughts 47.3% to 50.9%, median 37 to 36) are inside the noise. Reverted.

Five runs were used. The stall share sat at 26% through runs 2 to 5 whatever moved (draught, hero and treasure worths,
the agoge march), so the remaining runs went to the fresh-seed check below rather than to more guesses at it.

## Final check: 2026-11-20 and 21, run 2's numbers, fresh seeds

Run 2's numbers: thresholds fight 14, march 50, survive 10, rest 8; agoge fight 10, march 20, survive 9, rest 6; draught
worth 1; every other number as at 12fbdf0 (trait sizes, treasure table, hero worths 3 and 3, treasure value 9).

`npm run sim:ai -- --matches 100 --seed 701 --a normal --b normal --max-rounds 60 --swap --jobs 3` (200 matches, seeds
used by no run):

```
matches 200  seats a=normal b=normal  seed 701  max rounds 60  swap
win share: spartans 47.3%  mongols 45.0%  (adjudged stalls count half)
seat win share: first 51.7%  second 40.5%
stalled 15.5%  rounds p10 17  median 39  p90 60
refusals 1116 (not moves 0)  replans 17300
spartans: cities 4.03  at round 10 1.96  trained 21.69  attacks 44.10  kills 17.20  mounted attacks 0.00  raid retreats 0.00  adjacent 0.66  lures 0.00 onto capturable 0.00 lured captures 0.00  forest entries short of mp 0.00
  trained per match: hoplite 20.49, warrior 1.20
mongols: cities 3.92  at round 10 4.96  trained 23.27  attacks 98.61  kills 11.85  mounted attacks 97.41  raid retreats 64.65  adjacent 0.48  lures 15.76 onto capturable 0.00 lured captures 0.00  forest entries short of mp 7.38
  trained per match: horseArcher 17.48, horseman 5.79
spartan adjacent minus mongol 0.18  mongol cities at round 10 minus spartan 3.00  mongol raid retreats / mounted attacks 0.66
heroes per match: first seat 1.74  second seat 1.57  both 3.31  (lost per match 1.65)
matches with at least one hero 70.5%  first hero's side won 58.2% of 141 decided
spartans traits per match: fierce 1.84, tireless 1.18, hardy 3.39, watchful 0.67  (total 7.08, heroes 1.67)
mongols traits per match: fierce 1.93, tireless 4.23, hardy 0.09, watchful 0.14  (total 6.39, heroes 1.65)
treasures claimed per match 3.85: explore 0.90, unit 0.66, mercenary 0.58, gold 0.55, draught 0.55, relic 0.49, map 0.13
draughts drunk 66 of 110 found (60.0%)
```

| Measure | Target | Baseline (seeds 1 to 50) | Fresh seeds 701 to 800 | |
|---|---|---|---|---|
| Matches with at least one hero | 60% to 95% | 96.0% | 70.5% | met |
| Heroes per match, both sides | 1 to 4 | 17.74 | 3.31 | met |
| First-hero side's win share | at most 65% | 64.6% | 58.2% | met |
| Spartan traits minus Mongol | above 0 | 5.91 | 0.69 | met |
| Treasures claimed per match | at least 3 | 3.85 | 3.85 | met |
| Draughts drunk per draught found | at least 50% | 46.4% | 60.0% | met |
| Spartan share of wins | 40% to 60% | 65.0% | 47.3% | met |
| Median rounds | at most 39 | 43 | 39 | met (at the edge) |
| Stalled at 60 rounds | at most 21.5%, aim 15% | 23.0% | 15.5% | met |
| First-seat win share | reported, band 42% to 58% | 51.5% | 51.7% | inside the band |
| Hard over easy | at least 80% | 84.0% | 75.2% | missed |
| Normal over easy | at least 65% | 68.0% | 65.8% | met |
| Hard over normal | at least 60% | 63.5% | 55.5% | missed |

Gold's share of claims on the fresh seeds: 0.55 of 3.85, 14.3%.

Ladder, each pair `--matches 50 --seed 701 --swap` in both orders (200 matches a pair), resumed on 2026-11-21 after the
pause:

```
hard over easy 75.2% (easy 13.8%, stalled 22.0%, medians 37 and 39)
normal over easy 65.8% (easy 19.0%, stalled 30.5%, medians 42 and 40)
hard over normal 55.5% (normal 37.0%, stalled 15.0%, medians 31 and 32)
```

The ladder baseline was taken on seeds 1001 to 1025, so the same numbers were also run there (100 matches a pair):

```
hard over easy 84.0% (easy 9.5%, stalled 13.0%, medians 30 and 32)
normal over easy 68.0% (easy 22.5%, stalled 19.0%, medians 39 and 39)
hard over normal 53.5% (normal 40.5%, stalled 12.0%, medians 28 and 24)
```

Like for like, hard over easy (84.0%) and normal over easy (68.0%) are where the baseline had them; hard over normal fell
from 63.5% to 53.5%. On the fresh seeds hard over easy is 75.2%, so part of its miss there is the seeds (plan 3's own
fresh-seed check had it at 81.5% and its old seeds at 77.0%).

### Run 6 (diagnostic): draught worth back to 2, hard against normal only, seeds 1001 to 1025

Hypothesis: run 2's cheaper draught is what cost hard its edge over normal, since it changes how both levels value a
carrier. If so, hard over normal returns to about 63%.

```
normal, hard: seat win share: first 55.0%  second 38.0%  stalled 14.0%  median 28
hard, normal: seat win share: first 67.0%  second 29.0%  stalled 8.0%  median 24
```

After: hard over normal 52.5% (normal 42.0%), against 53.5% with worth 1. Not the draught. Reverted. That leaves the
thresholds: with 15 heroes a match hard won 63.5% of these seeds, with 3 it wins 53% to 55%. A likely reading, not
measured: hard's near-zero danger weight lets it fight with its heroes where normal hangs back with them, and with few
heroes that edge mostly goes. Six runs
of the twelve were used; no lever in Task 8's list moves the ladder without the hero count going back out of its target.

## Carried

- Hard over normal: 55.5% on fresh seeds (target 60%), 53.5% on the baseline seeds. Run 6 rules out the draught worth;
  the likely cause is the lower hero count, and the ladder's lever (the skill dial in src/ai/skill.ts) is not one of this
  task's. Next to try: hard's danger weight or lookahead in skill.ts, a separate task.
- Probe (run 7, controller's ruling in the Task 8 fix round): hero worth 3 to 5 (src/ai/assess.ts HERO_WORTH), on the
  final numbers. Hypothesis: a hero worth more is hit first and kept safer, which pays most for hard, whose danger
  weight is near zero, so hard over normal climbs back toward 60%.

  ```
  normal, hard (seeds 1001 to 1025): seat win share: first 56.0%  second 36.0%  stalled 16.0%  median 28
  hard, normal (seeds 1001 to 1025): seat win share: first 70.0%  second 26.0%  stalled 8.0%  median 24
  normal, normal (seeds 1 to 50): spartans 43.5%  mongols 45.5%  first seat 46.5%  stalled 22.0%  median 37
    heroes 3.25 a match, with a hero 66.0%, first hero's side 69.7%, draughts 27 of 55 (49.1%)
  ```

  After: hard over normal 53.0% (normal 41.0%), against 53.5% at worth 3, so no gain; normal against normal stalls 22%
  (run 2: 26%) inside the noise, while the first hero's side rises to 69.7%. Reverted. The two hard-ladder misses are
  carried to src/ai/skill.ts.
- Hard over easy: 75.2% on fresh seeds (target 80%), 84.0% on the baseline seeds. Probably mostly seed noise (about 3.5
  points on 200 matches; plan 3's fresh-seed check swung 4.5 points between seed sets), with part of the same hard
  weakness as above.

## The SLOW tests

- Adaptive climbs against a strong opponent: gap 0.599 on the final numbers (0.950 against 0.351), inside its 0.2 bound.
- Normal 60-round matches: on the final numbers `5 mongols` and `8 mongols` (seeds 1 to 8, both seatings) do not end.
  Across runs 1 to 5 this test left 1 to 3 of 16 unended while the bulk stall share stayed 24% to 27% on seeds 1 to 50
  (15.5% on the fresh seeds): at a 15% stall share all 16 end about 7% of the time (0.85^16). By the controller's ruling
  the test now names its known unended matches, as the hard test does (`KNOWN_NORMAL`); any other match that fails to
  end still fails it.

