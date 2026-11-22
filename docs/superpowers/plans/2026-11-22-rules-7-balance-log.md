# Rules 7 balance: lever sweep and seat test (2026-11-22)

Rules 7 (connected cities, Scout sight 1, a moving capital, Lumber camp 4 gold) dropped the Spartans to about 20%
of wins at normal and hard, from 34% and 30% at 0.4.4. City counts show why: Mongol expansion (Spartans about 1.6
cities against 6.2 at hard). Nothing below is committed to the rules yet: each lever was a throwaway copy of
`connected-cities` at 2b05abf.

Every row is 200 AI matches, the same level on both sides, factions swapped across seats:
`npx tsx scripts/simai.ts --matches 100 --seed 1 --a L --b L --swap --jobs 4`. Adjudged stalls count half. With 200
matches a share moves by about 3.5 points either way from chance alone.

## Levers, one at a time and in pairs

| Lever | Spartans normal | Spartans hard | Spartan cities (normal) |
|---|---|---|---|
| Rules 7 as committed | 20% | 19.8% | about 1.6 |
| A: Mongol capture gold 3 to 1 (`tributeVillage`, `tributeCityBase`) | 30.8% | 33.8% | 2.57 |
| B: Mongol `relayRiders` off | 33.5% | 28.5% | 2.73 |
| **C: Spartan `growthExtra` -1** (a level costs one growth point less) | **43.5%** | **47.8%** | 3.51 |
| D: the connection growth goes to the capital only | 24.0% | 28.7% | 2.12 |
| C + A | 53.5% | 54.8% | |
| C + B | 57.0% | 55.5% | |

C alone comes closest to even; both pairs overshoot.

## The first seat

The map is mirrored, yet the first seat wins about 54% against 41% in every row above: one turn of tempo. Both
seats start with 10 gold (`CONFIG.startGold`). On top of C:

| Start gold (first, second) | Spartans normal | Spartans hard | Seats normal (first / second) | Seats hard (first / second) |
|---|---|---|---|---|
| 10, 10 (C) | 43.5% | 47.8% | 54.3 / 38.8 | 56.3 / 40.5 |
| 10, 12 | 43.8% | 45.0% | 56.3 / 39.8 | 51.0 / 46.3 |
| 10, 14 | 47.0% | 41.5% | 46.8 / 48.0 | 40.0 / 55.5 |

12 is not enough at normal and 14 tips hard the other way, so 13 is the likely answer.

## Next

- Run C with start gold 10, 13 at normal and hard (and a second seed if it lands near even).
- If it holds, put `growthExtra: -1` for the Spartans and `startGold: [10, 13]` into the rules file with a changelog
  line, then the whole-branch review, merge and deploy 0.5.0 (rooms checked first).
- Raw outputs: the private `warbanners-workspace` repo, `sim-results/`.
