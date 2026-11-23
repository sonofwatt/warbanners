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

## Rerun with hunker in (f3a4275, 2026-11-22)

Same command and seeds. The phalanx brace (b41a1fb and before) is not in these runs; the AI almost never braces.

| Setup | Spartans normal | Spartans hard | Seats normal (first / second) | Seats hard (first / second) | Stalls normal / hard |
|---|---|---|---|---|---|
| Rules 7 with hunker | 22.3% | 23.8% | 54.0 / 41.8 | 48.3 / 49.5 | 8.5% / 4.5% |
| C | 47.3% | 43.0% | 57.8 / 37.5 | 55.3 / 41.8 | 9.5% / 6.0% |
| C, start gold 10, 13 | 45.3% | 45.3% | 47.3 / 46.5 | 44.5 / 53.5 | 12.5% / 4.0% |

C with 13 gold for the second seat evens the seats at normal and slightly over-corrects at hard. Raw outputs: the
private `warbanners-workspace` repo, `sim-results/rules7-hunker/`.

## Rerun with the brace and momentum in (dccfe7c, 2026-11-23)

Same command and seeds. Momentum replaces the chain health cost and the brace chain stop.

| Setup | Spartans normal | Spartans hard | Seats normal (first / second) | Seats hard (first / second) | Stalls normal / hard |
|---|---|---|---|---|---|
| Rules 7 as built | 24.0% | 25.0% | 56.0 / 39.8 | 48.3 / 49.5 | 8.5% / 4.5% |
| C | 49.0% | 46.3% | 59.0 / 37.0 | 55.8 / 42.5 | 8.0% / 3.5% |
| C, start gold 10, 12 | 50.2% | 49.8% | 50.0 / 44.8 | 53.0 / 45.5 | 10.5% / 3.0% |
| C, start gold 10, 13 | 49.8% | 46.5% | 44.8 / 50.5 | 43.0 / 54.8 | 9.5% / 4.5% |

Chains got longer, as expected without the health cost. Sweeps (one unit, 3 or more kills in a turn) per 100 matches:

| Setup | Before momentum (normal / hard) | With momentum (normal / hard) |
|---|---|---|
| Rules 7 as built | 22.5 / 21.5 | 34.0 / 35.0 |
| C | 32.0 / 29.0 | 56.0 / 39.0 |
| C, start gold 10, 13 | 41.0 / 39.0 | 65.5 / 60.0 |

Chain units' share of all kills rose about 2 to 3 points (to 17 to 21%). Faction balance barely moved; the seat lever
did: 13 gold now tips both levels to the second seat, and 12 is the closer fit (first seat 5 points ahead at normal,
7.5 at hard, against 13's 6 and 12 points the other way). Raw outputs: the private `warbanners-workspace` repo,
`sim-results/rules7-momentum/`.
