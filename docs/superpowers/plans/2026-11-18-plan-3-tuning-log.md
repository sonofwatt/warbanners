# Plan 3 tuning log

Bulk AI-against-AI matches (`npm run sim:ai`, Task 12). Every run is listed with its summary, its one change and
its hypothesis. Win shares count a stall adjudged to a side as half a win. "Harder level's share" is the second
seat's share in a ladder run (the second seat is the harder level; `--swap` exchanges the factions, not the seats).

Targets (normal against normal, both seat orders): Spartan share 45 to 55%; first seat 42 to 58%; median rounds 20
to 35; stalled at 60 rounds at most 5%; harder level's share: hard over easy 80%, normal over easy 65%, hard over
normal 60%; Spartan adjacentShare minus Mongol at least 0.15; Mongol citiesAtRound10 minus Spartan above 0; Mongol
raidRetreats / mountedAttacks at least 0.5.

Tuning runs are normal against normal on 50 seeds from seed 1 with `--swap` (100 matches) to save time; the
baseline and the final check use 100 seeds (200 matches).

## Baseline: 2026-11-19, commit 5cde636 (rules version 2 with the forest rule and the fog rule)

`npm run sim:ai -- --matches 100 --seed 1 --a normal --b normal --swap --jobs 3`

```
matches 200  seats a=normal b=normal  seed 1  max rounds 60  swap
win share: spartans 3.0%  mongols 93.3%  (adjudged stalls count half)
seat win share: first 47.0%  second 49.3%
stalled 7.5%  rounds p10 12  median 18  p90 45
refusals 387 (not moves 0)  replans 8878
spartans: cities 0.35  at round 10 1.59  trained 9.36  attacks 14.15  kills 3.44  mounted attacks 0.00  raid retreats 0.00  adjacent 0.46  lures 0.00 onto capturable 0.00 lured captures 0.00  forest entries short of mp 0.00
  trained per match: hoplite 8.32, warrior 1.03
mongols: cities 7.50  at round 10 5.07  trained 15.52  attacks 62.08  kills 9.22  mounted attacks 61.11  raid retreats 37.36  adjacent 0.55  lures 5.63 onto capturable 0.00 lured captures 0.00  forest entries short of mp 6.15
  trained per match: horseArcher 12.82, horseman 2.69
spartan adjacent minus mongol -0.09  mongol cities at round 10 minus spartan 3.47  mongol raid retreats / mounted attacks 0.61
```

`npm run sim:ai -- --matches 50 --seed 1001 --a easy --b normal --swap --jobs 3`

```
matches 100  seats a=easy b=normal  seed 1001  max rounds 60  swap
win share: spartans 2.0%  mongols 95.5%  (adjudged stalls count half)
seat win share: first 46.5%  second 51.0%
stalled 5.0%  rounds p10 12  median 17  p90 38
refusals 277 (not moves 0)  replans 4217
spartans: cities 0.23  at round 10 1.63  trained 8.26  attacks 13.52  kills 3.12  mounted attacks 0.00  raid retreats 0.00  adjacent 0.47  lures 0.00 onto capturable 0.00 lured captures 0.00  forest entries short of mp 0.00
  trained per match: hoplite 7.15, warrior 1.11
mongols: cities 7.59  at round 10 5.24  trained 15.12  attacks 55.08  kills 8.30  mounted attacks 54.33  raid retreats 33.05  adjacent 0.54  lures 4.45 onto capturable 0.00 lured captures 0.00  forest entries short of mp 3.84
  trained per match: horseArcher 12.26, horseman 2.86
spartan adjacent minus mongol -0.06  mongol cities at round 10 minus spartan 3.61  mongol raid retreats / mounted attacks 0.61
```

`npm run sim:ai -- --matches 50 --seed 1001 --a normal --b hard --swap --jobs 3`

```
matches 100  seats a=normal b=hard  seed 1001  max rounds 60  swap
win share: spartans 4.5%  mongols 91.5%  (adjudged stalls count half)
seat win share: first 49.5%  second 46.5%
stalled 8.0%  rounds p10 11  median 18  p90 41
refusals 269 (not moves 0)  replans 4554
spartans: cities 0.49  at round 10 1.56  trained 8.94  attacks 14.03  kills 3.88  mounted attacks 0.00  raid retreats 0.00  adjacent 0.47  lures 0.00 onto capturable 0.00 lured captures 0.00  forest entries short of mp 0.00
  trained per match: hoplite 7.65, warrior 1.29
mongols: cities 7.27  at round 10 5.21  trained 15.36  attacks 56.21  kills 8.33  mounted attacks 55.24  raid retreats 35.00  adjacent 0.54  lures 2.21 onto capturable 0.00 lured captures 0.00  forest entries short of mp 4.17
  trained per match: horseArcher 12.37, horseman 2.99
spartan adjacent minus mongol -0.07  mongol cities at round 10 minus spartan 3.65  mongol raid retreats / mounted attacks 0.63
```

`npm run sim:ai -- --matches 50 --seed 1001 --a easy --b hard --swap --jobs 3`

```
matches 100  seats a=easy b=hard  seed 1001  max rounds 60  swap
win share: spartans 5.0%  mongols 88.5%  (adjudged stalls count half)
seat win share: first 42.0%  second 51.5%
stalled 13.0%  rounds p10 12  median 19  p90 60
refusals 352 (not moves 0)  replans 4826
spartans: cities 0.62  at round 10 1.63  trained 10.08  attacks 16.85  kills 4.22  mounted attacks 0.00  raid retreats 0.00  adjacent 0.51  lures 0.00 onto capturable 0.00 lured captures 0.00  forest entries short of mp 0.00
  trained per match: hoplite 8.97, warrior 1.11
mongols: cities 7.23  at round 10 5.20  trained 15.89  attacks 67.39  kills 9.10  mounted attacks 66.43  raid retreats 42.75  adjacent 0.56  lures 3.15 onto capturable 0.00 lured captures 0.00  forest entries short of mp 3.95
  trained per match: horseArcher 12.88, horseman 3.01
spartan adjacent minus mongol -0.05  mongol cities at round 10 minus spartan 3.57  mongol raid retreats / mounted attacks 0.64
```

Reading: the faction decides the match. Mongols win about 93% whatever the levels, so the ladder is flat (normal
over easy 51%, hard over normal 46.5%, hard over easy 51.5%). Mongols hold 5 cities at round 10 to the Spartans'
1.6 and train 12.8 Horse Archers a match; the Spartans end with 0.35 cities. Their formation share is below the
Mongols' (0.46 against 0.55). Lures never pull onto a capturable tile (no lure quirk). Balance first: until the
factions are near even, the ladder cannot be read.

## Tuning runs

### Run 1: Horse Archer attack 4 to 3 (src/engine/data/units.ts)

Hypothesis: the Horse Archer is the Mongol army (12.8 a match) and strikes from range 2 with no counter, then rides off. A quarter less attack cuts its damage to a Warrior from 4 to 3 and to a Hoplite from 4 to 2, so Spartan lines survive and the Spartan share rises well above 3%.

Before: the baseline (Spartans 3.0%, median 18, stalled 7.5%).

```
matches 100  seats a=normal b=normal  seed 1  max rounds 60  swap
win share: spartans 19.0%  mongols 70.5%  (adjudged stalls count half)
seat win share: first 39.0%  second 50.5%
stalled 21.0%  rounds p10 14  median 27  p90 60
refusals 295 (not moves 0)  replans 5940
spartans: cities 1.77  at round 10 1.65  trained 15.23  attacks 30.23  kills 8.51  mounted attacks 0.00  raid retreats 0.00  adjacent 0.55  lures 0.00 onto capturable 0.00 lured captures 0.00  forest entries short of mp 0.00
  trained per match: hoplite 13.71, warrior 1.52
mongols: cities 6.11  at round 10 5.08  trained 19.30  attacks 120.37  kills 11.30  mounted attacks 118.59  raid retreats 75.17  adjacent 0.62  lures 14.55 onto capturable 0.00 lured captures 0.00  forest entries short of mp 10.17
  trained per match: horseArcher 16.16, horseman 3.14
spartan adjacent minus mongol -0.07  mongol cities at round 10 minus spartan 3.43  mongol raid retreats / mounted attacks 0.63
```

After: Spartans 19.0% (from 3%), median 27 (from 18), but stalled 21% (from 7.5%): Spartan lines now hold (hoplites trained 13.7 from 8.3, kills 8.5 from 3.4), yet the Mongols still own 5 cities at round 10 to 1.65 and win the long game. Kept.

### Run 2: Mongol village tribute 3 to 1 (src/engine/data/factions.ts)

Hypothesis: 3 gold per village (Mongols hold about 5 cities by round 10) pays for two or three extra Horse Archers early; cutting it to 1 slows the snowball and lifts the Spartan share by 10 points.

Before: run 1 (Spartans 19.0%, median 27, stalled 21%).

```
matches 100  seats a=normal b=normal  seed 1  max rounds 60  swap
win share: spartans 18.5%  mongols 70.5%  (adjudged stalls count half)
seat win share: first 51.0%  second 38.0%
stalled 22.0%  rounds p10 15  median 26  p90 60
refusals 246 (not moves 0)  replans 6095
spartans: cities 1.86  at round 10 1.68  trained 16.04  attacks 31.93  kills 8.90  mounted attacks 0.00  raid retreats 0.00  adjacent 0.55  lures 0.00 onto capturable 0.00 lured captures 0.00  forest entries short of mp 0.00
  trained per match: hoplite 14.24, warrior 1.80
mongols: cities 5.99  at round 10 4.95  trained 19.05  attacks 125.45  kills 11.87  mounted attacks 123.54  raid retreats 79.20  adjacent 0.62  lures 15.28 onto capturable 0.00 lured captures 0.00  forest entries short of mp 10.03
  trained per match: horseArcher 15.53, horseman 3.52
spartan adjacent minus mongol -0.07  mongol cities at round 10 minus spartan 3.27  mongol raid retreats / mounted attacks 0.64
```

After: Spartans 18.5%, median 26, stalled 22%: no measurable effect (Horse Archers trained 15.5 from 16.2). Tribute is not what wins. Reverted to 3, so a rule that does nothing measurable is not changed.

### Run 3: Horse Archer cost 4 to 5 (src/engine/data/units.ts)

Hypothesis: Mongols win early (half their wins by round 20) by massing about 16 Horse Archers; one more gold each means fewer of them early, so more Spartan capitals survive the first rush and the Spartan share rises.

Before: run 1 (tribute reverted; Spartans 19.0%, median 27, stalled 21%).

```
matches 100  seats a=normal b=normal  seed 1  max rounds 60  swap
win share: spartans 28.0%  mongols 58.5%  (adjudged stalls count half)
seat win share: first 34.5%  second 52.0%
stalled 27.0%  rounds p10 14  median 34  p90 60
refusals 343 (not moves 0)  replans 7030
spartans: cities 2.61  at round 10 1.70  trained 17.93  attacks 36.85  kills 10.92  mounted attacks 0.00  raid retreats 0.00  adjacent 0.56  lures 0.00 onto capturable 0.00 lured captures 0.00  forest entries short of mp 0.00
  trained per match: hoplite 16.31, warrior 1.62
mongols: cities 5.30  at round 10 5.13  trained 20.34  attacks 123.80  kills 11.55  mounted attacks 122.02  raid retreats 80.09  adjacent 0.64  lures 16.56 onto capturable 0.00 lured captures 0.00  forest entries short of mp 9.96
  trained per match: horseArcher 15.02, horseman 5.32
spartan adjacent minus mongol -0.08  mongol cities at round 10 minus spartan 3.43  mongol raid retreats / mounted attacks 0.66
```

After: Spartans 28.0% (from 19), median 34 (from 27), but stalled 27% (from 21) and first seat 34.5%. Split by seating: with the Spartans first they win 3 and hold 12 stalls of 50; second, 14 wins and 10 stalls. In most stalls the Spartans hold more cities (often 6 or 7 to 1 or 2) but do not take the last one. Kept.

### Run 4: player 0's start gold 8 to 10 (src/engine/data/config.ts startGold [10, 10])

Hypothesis: the second seat is ahead (52% to 34.5% in run 3), and the Spartans suffer most when they move first. Player 0's 2 gold less buys one unit fewer in the opening rush window; even start gold should bring the first-seat share back into 42 to 58%.

Before: run 3 (first seat 34.5%, Spartans 28.0%, stalled 27%).

```
matches 100  seats a=normal b=normal  seed 1  max rounds 60  swap
win share: spartans 26.5%  mongols 55.5%  (adjudged stalls count half)
seat win share: first 49.0%  second 33.0%
stalled 36.0%  rounds p10 15  median 40  p90 60
refusals 384 (not moves 0)  replans 7603
spartans: cities 2.83  at round 10 1.78  trained 20.13  attacks 41.08  kills 12.07  mounted attacks 0.00  raid retreats 0.00  adjacent 0.57  lures 0.00 onto capturable 0.00 lured captures 0.00  forest entries short of mp 0.00
  trained per match: hoplite 18.52, warrior 1.61
mongols: cities 5.03  at round 10 4.97  trained 21.10  attacks 138.86  kills 13.16  mounted attacks 136.80  raid retreats 91.86  adjacent 0.64  lures 19.86 onto capturable 0.00 lured captures 0.00  forest entries short of mp 9.59
  trained per match: horseArcher 15.94, horseman 5.16
spartan adjacent minus mongol -0.07  mongol cities at round 10 minus spartan 3.19  mongol raid retreats / mounted attacks 0.67
```

After: first seat 49.0% (from 34.5), now inside its target; Spartans 26.5% (no change within noise); stalled 36% (from 27) and median 40: more games reach a stand-off. Kept.

### Run 5: damage scale 2 to 2.5 (src/engine/data/config.ts damageScale)

Hypothesis: a third of the matches stall because garrisons and lines outlast every attack; a quarter more damage everywhere makes fights and sieges end, so stalls drop under 15% and the median comes back toward 30.

Before: run 4 (stalled 36%, median 40, Spartans 26.5%).

```
matches 100  seats a=normal b=normal  seed 1  max rounds 60  swap
win share: spartans 23.5%  mongols 70.0%  (adjudged stalls count half)
seat win share: first 50.5%  second 43.0%
stalled 13.0%  rounds p10 13  median 25  p90 60
refusals 269 (not moves 0)  replans 6478
spartans: cities 2.06  at round 10 1.71  trained 14.75  attacks 27.71  kills 10.40  mounted attacks 0.00  raid retreats 0.00  adjacent 0.52  lures 0.00 onto capturable 0.00 lured captures 0.00  forest entries short of mp 0.00
  trained per match: hoplite 13.36, warrior 1.39
mongols: cities 5.83  at round 10 4.97  trained 19.97  attacks 79.40  kills 10.24  mounted attacks 78.06  raid retreats 50.35  adjacent 0.59  lures 10.37 onto capturable 0.00 lured captures 0.00  forest entries short of mp 7.39
  trained per match: horseArcher 14.34, horseman 5.63
spartan adjacent minus mongol -0.07  mongol cities at round 10 minus spartan 3.26  mongol raid retreats / mounted attacks 0.65
```

After: stalled 13% (from 36), median 25 (from 40), first seat 50.5%. But the stalls mostly turned into Mongol wins: Spartans 23.5%, Mongols 70%. Kept for match length; the faction gap is next.

### Run 6: Hoplite cost 4 to 3 (src/engine/data/units.ts)

Hypothesis: the Spartans field about 15 units to the Mongols' 20; a cheaper Hoplite closes the count, so lines hold the first rush and the Spartan share rises.

Before: run 5 (Spartans 23.5%, stalled 13%, median 25).

```
matches 100  seats a=normal b=normal  seed 1  max rounds 60  swap
win share: spartans 28.5%  mongols 60.5%  (adjudged stalls count half)
seat win share: first 51.0%  second 38.0%
stalled 22.0%  rounds p10 14  median 30  p90 60
refusals 365 (not moves 0)  replans 7421
spartans: cities 2.76  at round 10 1.78  trained 17.60  attacks 34.16  kills 12.85  mounted attacks 0.00  raid retreats 0.00  adjacent 0.58  lures 0.00 onto capturable 0.00 lured captures 0.00  forest entries short of mp 0.00
  trained per match: hoplite 16.72, warrior 0.88
mongols: cities 5.09  at round 10 4.87  trained 21.61  attacks 95.98  kills 11.01  mounted attacks 94.49  raid retreats 62.50  adjacent 0.61  lures 11.83 onto capturable 0.00 lured captures 0.00  forest entries short of mp 9.43
  trained per match: horseArcher 16.07, horseman 5.54
spartan adjacent minus mongol -0.03  mongol cities at round 10 minus spartan 3.09  mongol raid retreats / mounted attacks 0.66
```

After: Spartans 28.5% (from 23.5), median 30, stalled 22% (from 13). Mongols still win early (their wins have a median near round 20, the Spartans' near 45): the Spartan capital falls before a second Spartan city exists (1.8 Spartan cities at round 10 to 4.9). Kept.

### Run 7: the Spartans start with a Scout instead of a Warrior (src/engine/data/factions.ts startUnit)

Hypothesis: Mongols win early because the Spartan capital falls before a second Spartan city exists. A 2-move Scout as the starting unit reaches the near villages two to three turns sooner than a Warrior, so the Spartans have a second city when the first rush comes and the share rises.

Before: run 6 (Spartans 28.5%, Mongols 60.5%, stalled 22%, median 30).

```
matches 100  seats a=normal b=normal  seed 1  max rounds 60  swap
win share: spartans 41.5%  mongols 46.5%  (adjudged stalls count half)
seat win share: first 45.5%  second 42.5%
stalled 24.0%  rounds p10 14  median 43  p90 60
refusals 493 (not moves 0)  replans 8226
spartans: cities 3.78  at round 10 2.00  trained 21.41  attacks 40.86  kills 15.99  mounted attacks 0.00  raid retreats 0.00  adjacent 0.63  lures 0.00 onto capturable 0.00 lured captures 0.00  forest entries short of mp 0.00
  trained per match: hoplite 20.56, warrior 0.85
mongols: cities 4.11  at round 10 4.86  trained 22.60  attacks 106.31  kills 11.95  mounted attacks 105.17  raid retreats 70.04  adjacent 0.60  lures 13.78 onto capturable 0.00 lured captures 0.00  forest entries short of mp 8.50
  trained per match: horseArcher 16.70, horseman 5.90
spartan adjacent minus mongol 0.03  mongol cities at round 10 minus spartan 2.86  mongol raid retreats / mounted attacks 0.67
```

After: Spartans 41.5% (from 28.5), Mongols 46.5% (from 60.5): the factions are close to even among decided matches. Spartan cities at round 10 2.00 (from 1.78), at the end 3.78 (from 2.76). But stalled 24% and median 43: even matches now run long. Kept.

### Run 8: damage scale 2.5 to 3 (src/engine/data/config.ts damageScale)

Hypothesis: as in run 5, more damage ends more fights, so the 24% stalls fall and the median comes down from 43 into 20 to 35.

Before: run 7 (Spartans 41.5%, Mongols 46.5%, stalled 24%, median 43).

```
matches 100  seats a=normal b=normal  seed 1  max rounds 60  swap
win share: spartans 35.5%  mongols 55.0%  (adjudged stalls count half)
seat win share: first 53.5%  second 37.0%
stalled 19.0%  rounds p10 14  median 36  p90 60
refusals 440 (not moves 0)  replans 7343
spartans: cities 3.24  at round 10 2.05  trained 19.86  attacks 33.78  kills 14.01  mounted attacks 0.00  raid retreats 0.00  adjacent 0.62  lures 0.00 onto capturable 0.00 lured captures 0.00  forest entries short of mp 0.00
  trained per match: hoplite 18.88, warrior 0.98
mongols: cities 4.58  at round 10 4.77  trained 21.68  attacks 90.68  kills 12.07  mounted attacks 89.56  raid retreats 59.42  adjacent 0.61  lures 11.29 onto capturable 0.00 lured captures 0.00  forest entries short of mp 8.40
  trained per match: horseArcher 15.75, horseman 5.93
spartan adjacent minus mongol 0.00  mongol cities at round 10 minus spartan 2.72  mongol raid retreats / mounted attacks 0.66
```

After: stalled 19% (from 24), median 36 (from 43), but Spartans 35.5% (from 41.5) and Mongols 55% (from 46.5): more damage favours the side that strikes without a counter. Fair factions matter more than length, so reverted to 2.5.

### Run 9: Mongol city cover 1.5 to 1 (src/engine/data/factions.ts cityCover), with damage scale back at 2.5

Hypothesis: in most stalls the Spartans hold as many or more cities (often 5 to 7 of 8) but cannot take the last Mongol ones; Mongol garrisons with less cover fall sooner, so stalls turn into Spartan wins: fewer stalls and a higher Spartan share.

Before: run 7, the same numbers with cover 1.5 (Spartans 41.5%, Mongols 46.5%, stalled 24%, median 43).

```
matches 100  seats a=normal b=normal  seed 1  max rounds 60  swap
win share: spartans 41.5%  mongols 46.5%  (adjudged stalls count half)
seat win share: first 46.0%  second 42.0%
stalled 24.0%  rounds p10 14  median 37  p90 60
refusals 453 (not moves 0)  replans 8062
spartans: cities 3.82  at round 10 2.02  trained 20.70  attacks 37.71  kills 15.50  mounted attacks 0.00  raid retreats 0.00  adjacent 0.64  lures 0.00 onto capturable 0.00 lured captures 0.00  forest entries short of mp 0.00
  trained per match: hoplite 19.65, warrior 1.05
mongols: cities 4.08  at round 10 4.84  trained 22.15  attacks 101.90  kills 11.49  mounted attacks 100.70  raid retreats 66.89  adjacent 0.60  lures 13.62 onto capturable 0.00 lured captures 0.00  forest entries short of mp 8.28
  trained per match: horseArcher 16.52, horseman 5.63
spartan adjacent minus mongol 0.04  mongol cities at round 10 minus spartan 2.82  mongol raid retreats / mounted attacks 0.66
```

After: Spartans 41.5%, Mongols 46.5%, stalled 24%: no change (median 37, within noise). The stalls are not decided by Mongol city cover. Reverted to 1.5.

### Run 10: Spartan formation weight 1.5 to 3 (src/ai/persona.ts)

Hypothesis: the Spartan formation share is barely above the Mongols' (0.64 to 0.60, target a 0.15 gap). Doubling the Spartan formation weight makes the AI keep its Hoplites side by side, widening the gap without costing the balance.

Before: run 7's numbers (run 9 reverted): Spartans 41.5%, adjacent gap 0.03 to 0.04.

```
matches 100  seats a=normal b=normal  seed 1  max rounds 60  swap
win share: spartans 20.0%  mongols 63.5%  (adjudged stalls count half)
seat win share: first 49.0%  second 34.5%
stalled 33.0%  rounds p10 13  median 31  p90 60
refusals 413 (not moves 0)  replans 7466
spartans: cities 2.28  at round 10 1.93  trained 17.29  attacks 31.48  kills 11.68  mounted attacks 0.00  raid retreats 0.00  adjacent 0.66  lures 0.00 onto capturable 0.00 lured captures 0.00  forest entries short of mp 0.00
  trained per match: hoplite 16.43, warrior 0.86
mongols: cities 5.58  at round 10 4.86  trained 21.45  attacks 103.49  kills 11.81  mounted attacks 102.37  raid retreats 66.22  adjacent 0.61  lures 13.03 onto capturable 0.00 lured captures 0.00  forest entries short of mp 9.74
  trained per match: horseArcher 16.02, horseman 5.43
spartan adjacent minus mongol 0.05  mongol cities at round 10 minus spartan 2.93  mongol raid retreats / mounted attacks 0.65
```

After: adjacent gap 0.05 (from 0.03), but Spartans 20% (from 41.5) and stalled 33%: a tighter line advances too slowly to take or hold villages. Reverted to 1.5.

This was the tenth tuning run; tuning stops here. The final numbers are run 7's: Horse Archer attack 3 and cost 5, Hoplite cost 3, start gold 10 for both players, damage scale 2.5, the Spartans start with a Krypteia Scout.

## Final check: 2026-11-19, the run 7 numbers

`npm run sim:ai -- --matches 100 --seed 1 --a normal --b normal --swap --jobs 3`

```
matches 200  seats a=normal b=normal  seed 1  max rounds 60  swap
win share: spartans 36.5%  mongols 52.0%  (adjudged stalls count half)
seat win share: first 50.0%  second 38.5%
stalled 23.0%  rounds p10 15  median 35  p90 60
refusals 927 (not moves 0)  replans 15475
spartans: cities 3.31  at round 10 2.02  trained 20.01  attacks 36.78  kills 14.30  mounted attacks 0.00  raid retreats 0.00  adjacent 0.63  lures 0.00 onto capturable 0.00 lured captures 0.00  forest entries short of mp 0.00
  trained per match: hoplite 19.04, warrior 0.97
mongols: cities 4.57  at round 10 4.80  trained 21.71  attacks 101.20  kills 11.85  mounted attacks 99.99  raid retreats 66.24  adjacent 0.60  lures 13.38 onto capturable 0.00 lured captures 0.00  forest entries short of mp 8.91
  trained per match: horseArcher 15.91, horseman 5.80
spartan adjacent minus mongol 0.03  mongol cities at round 10 minus spartan 2.78  mongol raid retreats / mounted attacks 0.66
```

`npm run sim:ai -- --matches 50 --seed 1001 --a easy --b normal --swap --jobs 3`

```
matches 100  seats a=easy b=normal  seed 1001  max rounds 60  swap
win share: spartans 27.5%  mongols 59.5%  (adjudged stalls count half)
seat win share: first 46.5%  second 40.5%
stalled 26.0%  rounds p10 14  median 35  p90 60
refusals 621 (not moves 0)  replans 7570
spartans: cities 2.72  at round 10 2.03  trained 18.24  attacks 39.11  kills 14.24  mounted attacks 0.00  raid retreats 0.00  adjacent 0.63  lures 0.00 onto capturable 0.00 lured captures 0.00  forest entries short of mp 0.00
  trained per match: hoplite 17.31, warrior 0.93
mongols: cities 5.19  at round 10 4.82  trained 22.85  attacks 103.61  kills 11.98  mounted attacks 102.13  raid retreats 67.23  adjacent 0.61  lures 13.57 onto capturable 0.00 lured captures 0.00  forest entries short of mp 7.23
  trained per match: horseArcher 17.04, horseman 5.81
spartan adjacent minus mongol 0.02  mongol cities at round 10 minus spartan 2.79  mongol raid retreats / mounted attacks 0.66
```

`npm run sim:ai -- --matches 50 --seed 1001 --a normal --b hard --swap --jobs 3`

```
matches 100  seats a=normal b=hard  seed 1001  max rounds 60  swap
win share: spartans 32.0%  mongols 53.5%  (adjudged stalls count half)
seat win share: first 58.5%  second 27.0%
stalled 29.0%  rounds p10 14  median 41  p90 60
refusals 643 (not moves 0)  replans 8555
spartans: cities 2.99  at round 10 2.07  trained 18.55  attacks 36.03  kills 13.83  mounted attacks 0.00  raid retreats 0.00  adjacent 0.64  lures 0.00 onto capturable 0.00 lured captures 0.00  forest entries short of mp 0.00
  trained per match: hoplite 17.62, warrior 0.93
mongols: cities 4.86  at round 10 5.00  trained 22.26  attacks 102.85  kills 10.76  mounted attacks 101.57  raid retreats 70.35  adjacent 0.63  lures 5.04 onto capturable 0.00 lured captures 0.00  forest entries short of mp 6.89
  trained per match: horseArcher 16.91, horseman 5.35
spartan adjacent minus mongol 0.01  mongol cities at round 10 minus spartan 2.93  mongol raid retreats / mounted attacks 0.69
```

`npm run sim:ai -- --matches 50 --seed 1001 --a easy --b hard --swap --jobs 3`

```
matches 100  seats a=easy b=hard  seed 1001  max rounds 60  swap
win share: spartans 32.0%  mongols 52.0%  (adjudged stalls count half)
seat win share: first 43.0%  second 41.0%
stalled 32.0%  rounds p10 18  median 44  p90 60
refusals 756 (not moves 0)  replans 8387
spartans: cities 3.25  at round 10 2.14  trained 18.30  attacks 39.50  kills 14.55  mounted attacks 0.00  raid retreats 0.00  adjacent 0.68  lures 0.00 onto capturable 0.00 lured captures 0.00  forest entries short of mp 0.00
  trained per match: hoplite 17.40, warrior 0.90
mongols: cities 4.67  at round 10 4.92  trained 22.55  attacks 101.15  kills 10.06  mounted attacks 99.91  raid retreats 67.92  adjacent 0.63  lures 5.86 onto capturable 0.00 lured captures 0.00  forest entries short of mp 5.25
  trained per match: horseArcher 17.24, horseman 5.31
spartan adjacent minus mongol 0.05  mongol cities at round 10 minus spartan 2.78  mongol raid retreats / mounted attacks 0.68
```

## Result against the targets (final check above)

| Measure | Target | Baseline | Final | |
|---|---|---|---|---|
| Spartan win share, normal against normal | 45% to 55% | 3.0% | 36.5% (Mongols 52.0%) | missed |
| First-seat win share | 42% to 58% | 47.0% | 50.0% | met |
| Median rounds | 20 to 35 | 18 | 35 | met (at the edge) |
| Stalled at 60 rounds | at most 5% | 7.5% | 23.0% | missed |
| Hard over easy | at least 80% | 51.5% | 41.0% (easy 43.0%) | missed |
| Normal over easy | at least 65% | 51.0% | 40.5% (easy 46.5%) | missed |
| Hard over normal | at least 60% | 46.5% | 27.0% (normal 58.5%) | missed |
| Spartan adjacentShare minus Mongol | at least 0.15 | -0.09 | 0.03 | missed |
| Mongol citiesAtRound10 minus Spartan | above 0 | 3.47 | 2.78 | met |
| Mongol raidRetreats / mountedAttacks | at least 0.5 | 0.61 | 0.66 | met |
| Lured captures per 100 matches | lure quirk only above 2 | 0 | 0 | no lure change needed |

Ten tuning runs were used, so tuning stopped with five targets missed.

What the runs show:
- The faction gap went from 3% against 93% to 36.5% against 52%. The levers that moved it were the Horse Archer
  (attack and cost), the cheaper Hoplite and above all the Spartan starting Scout; tribute and Mongol city cover
  did nothing measurable.
- Even matches run long: as the factions close up, more matches reach round 60 (23%). More damage shortened them but
  handed the Mongols the edge (run 8).
- The skill ladder is not ordered, and is worse than flat: hard loses to normal 27% to 58.5% and is not better than
  easy. In the baseline the faction decided everything; with the factions closer it shows that a higher dial plays
  worse. This is an AI problem, not a numbers one (the ladder is moved only by skill.ts, and no tuning run was left
  for it). A likely cause to test first: the danger weight rises from 0.3 (easy) to 1 (hard), so the harder AI
  avoids every threatened tile and stops attacking (hard against easy stalls 32%).
- The Spartan formation share is only a little above the Mongols' because the Mongols mass Horse Archers too;
  doubling the Spartan formation weight (run 10) cost the Spartans half their wins.
