# Woodland Nations tuning log (rules 11)

Task 19 of `2026-11-26-woodland-nations.md`. Targets (spec section 5):
- Woodland wins 40% to 60% in each pair, at normal and at hard;
- median rounds at most 40;
- stalls at 60 rounds at most 20%;
- the Spartans against Mongols shares unchanged from 0.8.0.

Every run: `scripts/simai.ts --factions A,B --matches 50 --seed 1 --a L --b L --swap`, which is 100 matches, both
seatings. Adjudged stalls count half.

The levers, tried one at a time in the plan's order:
1. `harvestGold`;
2. the Skirmisher's cost;
3. the Dash-strike shares;
4. `championFromLevel`;
5. Woodland cover for foot units only;
6. dropping the extra start Trapper;
7. then the AI weights of Task 10.

## Baseline (the branch as built, commit 8a05a9f)

| Pair | Level | Woodland | Other | Stalls | Median rounds | Woodland trained | Other trained |
|---|---|---|---|---|---|---|---|
| woodland, spartans | normal | 18.5% | 78.0% | 7.0% | 42 | 28.0 | 49.0 |
| woodland, spartans | hard | 15.5% | 83.0% | 3.0% | 38 | 26.1 | 44.3 |
| woodland, mongols | hard | 45.5% | 51.0% | 7.0% | 34 | 27.1 | 39.3 |

Reading: the Woodland Nations hold the Mongols but lose to the Spartans. They train far fewer units: Hoplite lines
shrug off bow shots, and the Woodland cities fall (1.2 left at the end, against 6.4 Spartan).

## Lever runs

| Lever | Value | Pair | Level | Woodland | Other | Stalls | Median | Kept |
|---|---|---|---|---|---|---|---|---|
| none (baseline) | | woodland, mongols | normal | 43.0% | 55.0% | 4.0% | 32 | |
| none (baseline) | | woodland, woodland | normal | first seat 55.0%, second 37.0% | | 16.0% | 43 | |
| 1. `harvestGold` | 3 to 4 | woodland, spartans | normal | 18.5% | 78.0% | 7.0% | 42 | no: the same matches move for move. The AI does harvest, but Woodland gold is never what limits it |
| 2. Skirmisher cost | 3 to 2 | woodland, spartans | normal | 25.5% | 70.5% | 8.0% | 42 | kept for now (stacks with the next levers) |
| control | | spartans, mongols | normal | Spartans 48.0% | Mongols 47.0% | 10.0% | 42 | 0.8.0 had 52.0 / 43.8 over 200 matches (seeds 1 to 100); within sampling noise, and the engine hashes show their play unchanged |
| 3. Dash-strike shares | arrow 0.33 to 0.5, counter 0.33 to 0.2 | woodland, spartans | normal | 17.5% | 76.5% | 12.0% | 42 | not alone |
| 2 + 3 | cost 2, arrow 0.5, counter 0.2 | woodland, spartans | normal | 33.5% | 62.5% | 8.0% | 41 | kept for now |
| 2 + 3 + 4 | cost 2, arrow 0.5, counter 0.2, champion from level 3 | woodland, spartans | normal | 37.0% | 57.0% | 12.0% | 41 | kept for now |
| 4. `championFromLevel` | 4 to 3 | woodland, spartans | normal | 19.5% | 75.0% | 11.0% | 41 | not alone (in the stack above) |
| 2 + 3 + 4 | as above | woodland, mongols | normal | 68.0% | 29.5% | 5.0% | 33 | too strong here: the stack lifts both pairs |
| AI weights (Task 9 persona) | catapult 0.6 to 1.4, on the stack | woodland, spartans | normal | 36.5% | 60.0% | 7.0% | 40 | no gain |
| AI weights alone | catapult 0.6 to 1.4 | woodland, spartans | normal | 13.5% | 83.5% | 6.0% | 42 | no: worse |
| 2 | cost 2 | woodland, mongols | normal | 62.0% | 35.0% | 6.0% | 35 | over 60 here |
| 2 + 3 | cost 2, arrow 0.5, counter 0.2 | woodland, mongols | normal | 63.5% | 33.5% | 6.0% | 34 | over 60 here |

Levers 5 (Woodland cover for foot units only) and 6 (no extra start Trapper) both weaken the faction, so they cannot
help a faction that is already short against the Spartans. They were not run.

## Where it stands

- **The gap is one matchup.** Against the Mongols the Woodland Nations sit inside the band as built: 43.0% at normal
  and 45.5% at hard. Against the Spartans they win 18.5% at normal and 15.5% at hard. Every lever that helps lifts
  both pairs together:
  - the cheaper Skirmisher gives 25.5% against the Spartans but 62.0% against the Mongols;
  - the full stack gives 37.0% against 68.0%.
  No setting of the listed levers puts both pairs between 40% and 60%.
- **Why the Spartans:** Hoplite lines, 20 Hoplites a match, shrug off bow shots. Spartan cities, with cover 2, hold
  out. The Spartans out-train the Woodland Nations 49 to 28 units and end with 6 cities to 1.5. The spec named this
  shape in its section 5 ("Hoplite lines shrug off arrows").
- **Ruling:** no number is changed on the branch. The rules stay as the spec set them, and David chooses the
  direction. The options:
  - (a) A Spartans-specific answer, for example arrows that ignore the phalanx bonus, or a Dash-strike charge that
    also stops a braced Hoplite's counter. This is a rules change.
  - (b) The full stack plus a Mongol-side pull-back, so both pairs land near 40%. Two changes that pull against each
    other.
  - (c) Ship the Woodland Nations as a hard counter to the Mongols and a hard matchup against the Spartans, on
    purpose, with the cheaper Skirmisher only.
- **A trial of option (a)** (not a lever in the plan, and not kept): bow shots ignore the phalanx bonus and the brace.
  Against the Spartans: 17.5% at normal (Spartans 79.0%) and 16.0% at hard (80.5%), no gain. The shield wall is not what beats them. Production
  is: the Spartans train 49 units a match to the Woodland Nations' 28, and their cities grow (the Woodland building
  growth cut and the AI's build order are where to look next).
- **Not done:** the hard level for the levers, the mirror at hard, and the biomes (biomes are not merged).
- **The mirror:** at normal the first seat wins 55.0% to the second's 37.0%, with 16% stalls. The second seat's
  extra 2 gold does not make up for moving second in a mirror of the hidden faction.

## Second round (2026-11-27, after David's notes)

David leaned to a cheaper Skirmisher or two start Skirmishers. The baseline showed Spartan cities taking about five
times the city rewards of Woodland cities, so a production lever was run too: `buildingGrowthCut` 1 to 0 (Woodland
buildings give their full growth). Same method: 100 matches each, both seatings.

| Change | Spartans normal | Spartans hard | Mongols normal | Mongols hard |
|---|---|---|---|---|
| none (baseline) | 18.5% | 15.5% | 43.0% | 45.5% |
| Skirmisher cost 3 to 2 | 25.5% | 26.5% | 62.0% | 60.5% |
| two start Skirmishers (the extra Trapper swapped for a Skirmisher) | 27.0% | 27.5% | 57.0% | 61.5% |
| `buildingGrowthCut` 1 to 0 | 33.0% | 21.0% | 55.5% | 53.0% |
| growth cut 0 and two start Skirmishers | 35.5% | not run | 69.5% | not run |

- Full building growth gives the best trade at normal: the most against the Spartans for the least against the Mongols.
  It does little at hard (21.0%).
- Each of David's two levers adds about 8 to 9 points against the Spartans, and takes the Mongols pair to about 60%.
- Combining levers overshoots the Mongols pair (69.5%).
- Still no setting puts the Spartans pair in the band without the Mongols pair leaving it. Nothing is committed to the
  rules; the choice is David's.

**Decision (David, 2026-11-27): full growth.** `buildingGrowthCut` is 0 for the Woodland Nations. Against the
Spartans 33.0% at normal and 21.0% at hard; against the Mongols 55.5% and 53.0%. The Spartans pair stays short of
the band, a known hard matchup for now.
