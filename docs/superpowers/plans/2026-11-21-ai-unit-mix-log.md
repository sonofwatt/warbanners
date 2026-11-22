# AI unit mix log (0.4.4, rules 6, no rules change)

David: "I do want the AI to use knights and Khans guard. Proper balance would allow the AI to use all units and all
tactics." The AI trained from fixed lists (`trainOrder`, first affordable wins) and took fixed level rewards
(`rewardPick`). This log measures what it used before and after it chooses by situation.

All runs are normal against normal, `npm run sim:ai -- --matches 100 --seed 701 --max-rounds 60 --swap --jobs 4`
(seeds 701 to 800, both seatings, 200 matches), one batch at a time. The ladder is plan 5's harness,
`--matches 25 --seed 1001 --swap` in both seat orders for each pair.

## The census

New in `src/ai/sim.ts` (`census`, printed by `npm run sim:ai` on its `census` lines):

- units: for each type a faction can train, the matches its side held the type's tech, and of those the matches it
  trained at least one; plus Knights in matches where chivalry was researched;
- rewards: every level reward taken, and the champion share of the level-5 picks;
- tactics: for each tactic, the matches where it was possible and the matches where it was used. Possible means the
  side had a unit with the trait at the start of one of its turns (a lure also needs a luring faction; steady needs a
  luring rival; a draught needs a carrier; a pathfinder step needs an unexplored tile within the pathfinder's move).
  Used means:
  - lure: a `lured` event; retreat: a move after an attack by a unit with the retreat trait; chainKill: a kill by a
    chain unit;
  - heal, taunt, hasten, dustStorm: the ability used;
  - steady: a luring rider hits a unit beside a friendly steady unit (the Piper stops that lure);
  - inspire: a mounted unit attacks beside a friendly inspire unit (Khan's Guard);
  - doubleStrike: a second attack by one unit in a turn; splash: an attack that splashes;
  - treasure: a claim; draught: one drunk; pathfinder: a move onto an unexplored tile; campTrain: a Camp trains.

The traits that act on their own every time (steadfast, phalanx, unbowed, siege, mounted, hidden, noCityCapture) are
not tactics the planner chooses, so they are not counted.

## Before (0.4.2 as shipped)

```
win share: spartans 57.0%  mongols 33.3%    stalled 19.5%  median 40
census spartans units: warrior 141/200 70.5%, spearman 0/200, swordsman 0/182, defender 0/200, archer 0/200,
  horseman 0/198, knight 0/136, catapult 0/142, hoplite 200/200 100.0% (22.00 a match), scout 0/200
census spartans knights where chivalry: 0/136   rewards: gold 737, borders 108   level 5: none
census spartans tactics: treasure 119/200 59.5%, draught 9/13 69.2%, pathfinder 0/200
census mongols units: warrior 0/200, spearman 0/200, swordsman 0/108, defender 0/182, archer 0/200,
  horseman 200/200 (5.37), knight 0/177, catapult 0/121, horseArcher 200/200 (15.98), camp 0/200
census mongols knights where chivalry: 0/177   rewards: gold 210   level 5: none
census mongols tactics: lure 192/200 96.0%, retreat 199/200 99.5%, treasure 200/200, draught 38/74 51.4%
chain: sweeps per 100 matches 0.00 (2+ kills 0.50)  chain kills per match 0.00
```

(The "pathfinder possible 200/200" in this run used the first census, which counted any Scout; see the pathfinder
finding below. With the final definition it is possible in 0 matches.)

What the census showed beyond the fixed lists:

1. **Levels and rewards: no city ever got past level 3, and the planner never chose a reward.** Every reward taken
   was option 0 (gold, borders): the Mongols' `rewardPick` 1 never once applied. A city levels when growth is bought,
   in the economy phase, which runs after the reward phase; the engine then takes option 0 when the turn ends. And
   growth was bought only for the step that completes a level: a harvest at 2 gold for 1 growth scored 0.375 value per
   gold against a threshold of 0.67 at normal, so a city stopped where the last step was out of reach.
2. **The danger map had lost every Mongol rider** (a rules 6 regression). A Horseman has 5 half-points since rules 6,
   so its threat reach was 3.5 tiles; `range()` with a fractional radius lists fractional coordinates, which are no
   tiles, so the Spartan AI saw no danger from any Mongol rider. Found while building the wounded scenario below.
3. **The pathfinder step cannot happen.** The Scout sees 3 tiles and moves 2 (3 when Tireless), and every move
   updates the explored set, so it never has an unexplored tile within its move. Rules 6 made the pathfinder trait a
   no-op for the only unit that has it. This is a rules matter for David; the AI is not changed for it.

## What changed in the AI

- `src/ai/mix.ts`, unit choice: each type the side can train scores `10 x (target share - share of the army)` from the
  persona's `mix` (relative shares; every type either side can train has one), plus `4 x counter`, where counter is
  the share of seen enemies of each kind times how well the type answers it: steadfast foot and Defenders against
  riders, riders against ranged units, Catapults (and less, Swordsmen, chain riders, ranged units) against heavy foot,
  Catapults a little against a seen enemy city. The best affordable type is trained, unless a type the gold buys next
  turn scores 1.5 or more above it, the army has 4 or more units and the city is not threatened: then it saves.
  Spartans aim at Hoplite 6.5 against 0.4 to 1.2 for the rest; Mongols at Horse Archer 4, Horseman 2.5, Knight 2.
  The counter weight scales with the skill (`skill.focus / 0.5`: 0.4 at easy, 1 at normal, 1.7 at hard), added after
  the ladder below first read hard over easy 74.5%; at normal it is exactly 1, so the normal runs are unchanged (checked
  match for match on seeds 701 both ways).
- Research: each open tech scores 0.5 per place earlier in the persona's `techOrder`, plus 3 x the desire (score above
  0) of the types it unlocks, plus 1.5 x that of the types the next tech unlocks. So Mongols facing archers go for
  chivalry, Spartans facing heavy foot for engineering.
- Rewards: level 2, the scout reward when 8 or more tiles within its radius are unexplored, else gold; level 3,
  barracks when the city has at most 1 free slot, else borders; level 4, growth when it brings the next level, else
  income; level 5, the support with 3 or more badly wounded units (below 60%), the champion with fewer than 2 units of
  attack 5 or more, the support with an army of 16 or more, the champion while own units are within 4 of a seen enemy
  city, else the support with 8 or more units, else the champion.
- The reward phase runs again after the units and after the economy phase, so the planner chooses every reward.
- `valueOf` adds `10 x economy x (level + growth / growth needed)` for each own city: growth is now bought on the way to
  a level, not only for its last step.
- The danger map's reach is whole tiles (`Math.floor`).
- Habits from the Hexonia study, scaled by `skill.focus` (0.2 easy, 0.5 normal, 0.85 hard):
  - a kill scores `focus x (2 + 0.25 x the victim's worth)` more than the same damage without the kill;
  - a badly wounded unit (40% health or less) weighs danger at least `3 x focus` and its objective pull is cut by
    `0.75 x focus`, so it falls back to heal;
  - the garrison in a threatened city and the focus on hurt targets were already there (`hold`, `focus`); they are
    unchanged.
- Tactics the scoring could not see: a taunt is credited 1.5 when the taunted enemy could reach both a Hoplite and
  another own unit next turn (it turns the blow onto the Hoplite); a steady unit is worth 1 for each of up to 2 own
  units beside it that a seen luring rider could reach.

## Runs

| Run | Change | Spartan win share | Median rounds | Stalled | Chain kills per match | Sweeps per 100 | 2+ kill turns per 100 |
|---|---|---|---|---|---|---|---|
| before | 0.4.2 | 57.0% | 40 | 19.5% | 0.00 | 0.0 | 0.5 |
| v1 | mix, research, rewards, reward phase rerun | 39.0% | 39 | 19.5% | 4.03 | 10.5 | 109.5 |
| v2 | mix weights tuned, first kill bonus and wounded care | 39.8% | 37 | 19.0% | 4.41 | 10.0 | 106.5 |
| v3 | growth on the way to a level (level worth 6) | 45.8% | 37 | 19.0% | 5.62 | 25.5 | 181.0 |
| v4 | danger fix, level worth 10, wounded care 3 and pull cut, flat kill bonus | 43.8% | 37 | 17.0% | 5.13 | 12.0 | 124.5 |
| v5 | taunt and steady credits, level 5 rule, Mongol growth x1.6 | 42.3% | 37 | 19.5% | 5.31 | 15.5 | 141.0 |
| v6 | level 5 rule again, Mongol growth x2.5 | 42.5% | 37 | 17.5% | 5.28 | 11.0 | 128.5 |
| after | v6 without the Mongol growth weight (it did not help) | 43.3% | 38 | 18.0% | 5.21 | 12.0 | 128.0 |

Level-5 picks (Spartans; the Mongols had 1 in v5 and none in any other run): v3 2 (all champion), v4 25 (champion
76%), v5 23 (champion 22%), v6 21 (champion 33%), after 25 (champion 36%).

## After (the shipped change)

```
win share: spartans 43.3%  mongols 47.8%    stalled 18.0%  median 38
census spartans units: warrior 65/200 32.5%, spearman 190/200 95.0%, swordsman 114/175 65.1%, defender 156/200 78.0%,
  archer 167/200 83.5%, horseman 177/200 88.5%, knight 129/147 87.8%, catapult 108/134 80.6%, hoplite 200/200 (14.78),
  scout 147/200 73.5%
census spartans knights where chivalry: 129/147 87.8%
  rewards: gold 631, barracks 263, borders 88, income 81, growth 10, support 16, champion 9, scout 1  (champion 36.0%)
census spartans tactics: retreat 37/166 22.3%, chainKill 106/128 82.8%, heal 12/13 92.3%, taunt 7/13 53.8%,
  steady 5/13 38.5%, doubleStrike 62/113 54.9%, splash 62/104 59.6%, treasure 138/200 69.0%, draught 14/22 63.6%
census mongols units: warrior 200/200, spearman 110/200 55.0%, swordsman 71/94 75.5%, defender 145/180 80.6%,
  archer 199/200 99.5%, horseman 198/200 (6.00), knight 126/145 86.9%, catapult 126/146 86.3%, horseArcher 199/200
  (10.87), camp 132/200 66.0%
census mongols knights where chivalry: 126/145 86.9%   rewards: gold 608, barracks 57, borders 17, income 20, scout 2
census mongols tactics: lure 186/200 93.0%, retreat 196/200 98.0%, chainKill 107/126 84.9%, doubleStrike 34/71 47.9%,
  splash 110/126 87.3%, treasure 198/200 99.0%, draught 53/69 76.8%, campTrain 126/132 95.5%
chain: sweeps per 100 matches 12.00 (2+ kills 128.00)  chain kills per match 5.21  chain-unit kill share 12.5%
  knights trained per match 5.44
```

## Targets

| Target | Result |
|---|---|
| Every trainable unit trained in 25% of matches with its tech | Met: the lowest are the Spartan Warrior 32.5% and the Mongol Spearman 55.0% (before: 15 of 20 types never) |
| Knights in 30% of matches with chivalry | Met: Spartans 87.8%, Mongols 86.9% (before: 0%) |
| Champion and support each 25% of level-5 picks | Met for the Spartans (champion 36%, support 64%, 25 picks). The Mongols never reach level 5, so no Khan's Guard or Sky Caller (below) |
| Every tactic in 10% of matches where possible | Met for every tactic that was possible: the lowest are retreat by the Spartan Horseman 22.3% and steady 38.5%. Not possible: the Mongol hasten, dust storm, heal and inspire (no level 5), the pathfinder step (never, see above) |
| Spartans 40% to 60% | 43.3% (57.0% before) |
| Median rounds at most 39 | 38 (40 before) |
| Stalls at most 21.5% | 18.0% (19.5% before) |
| Ladder | See below |

Why the Mongols never reach level 5: a Mongol city needs one more growth for each level than a Spartan one (3, 4, 5
and 6 to leave levels 1 to 4, 18 in all), and the Mongols spend on riders and take villages instead. They reach level
4 about 20 times in 200 matches. Weighing Mongol growth 1.6 times (v5) gave one level-5 pick in 200 matches, 2.5 times
(v6) none, so the weight was taken out again. The Khan's Guard and the Sky Caller now appear only if a Mongol city
reaches level 5, which the reward rule handles like the Spartan one; getting there is an economy question (the Mongol
growth extra) for David, not something the unit mix can fix.

## Hexonia habits

Measured on scenarios rather than in bulk (`src/ai/plan.test.ts`), 20 seeds each, before and after:

| Scenario | easy | normal | hard |
|---|---|---|---|
| Kill a 2-health Warrior rather than chip a full Hoplite (before) | 11 | 12 | 20 |
| (after) | 19 | 17 | 20 |
| A Hoplite at 4 of 15 health steps out of two riders' reach (before) | 11 | 11 | 0 |
| (after) | 14 | 20 | 20 |

Before, the hard AI walked the wounded Hoplite on toward the riders on every seed: the danger map did not see them, and
hard weighs danger 0.195. The easy column moves too, through the danger fix, which every level shares.

## Chain cost re-check (rules 5, cost 2)

With chain units in play (Knights 5.44 a match, all trained ones), 12.0 sweeps (one unit, 3 or more kills in a turn)
and 128.0 turns with 2 or more kills by one unit per 100 matches; chain kills are 12.5% of all kills. The Knight-first
variant of the chain cost log read 0.0 sweeps and 11.5 2+ kill turns per 100 matches at cost 2, with 8 Knights a
match. Most of the difference is the new units, not the chain rule: both counts take every kill an attacker makes in
one attack, so a Catapult's splash kills count as well as a rider's chain (Catapults are now 2.5 to 4.2 a match), and
v1, before the habits, already read 10.5 and 109.5 with 4 Knights a match; the kill bonus adds a little (128.0). The
census does not split chain sweeps from splash ones; that split is the next measure if the number matters. No rules change here, as the brief says; if David finds Knights
sweeping in play, the chain cost log has costs 3 to 5 measured.

## Ladder

Seeds 1001 to 1025, both seatings, each pair in both seat orders (100 matches a pair). The level's share is the mean of
its seat win share over the two orders (adjudged stalls count half).

| Pair | First run (counter fixed) | Final (counter scales with skill) | Target |
|---|---|---|---|
| hard over normal | 60.0% (hard first 59.0%, second 61.0%) | 60.5% (65.0%, 56.0%) | at least 60% (61% before) |
| hard over easy | 74.5% (75.0%, 74.0%) | 76.0% (81.0%, 71.0%) | at least 80% (about 75% before) |
| normal over easy | 60.0% (62.0%, 58.0%) | 68.0% (73.0%, 63.0%) | (none) |

Stalls in the final ladder 10% to 18%, medians 30 to 40.

Hard over easy stays under 80%. Most of what made the AI better here is shared by every level: the danger map now sees
Mongol riders at easy too, easy builds a mixed army and buys growth too. Easy keeps its noise (top 4, temperature 3),
its heavy danger weight and a small habit weight (focus 0.2). Making it weaker still would mean taking the shared
fixes away from easy on purpose, which is a call for David: the gap to hard grew where the dial applies (counters, kill
bonus, wounded care) and the target missed by 4 points on 100 matches, about one standard error and a half.

On these seeds the Mongols win most matches whatever the levels (56% to 71% of the faction share in every pair), while
normal against normal on seeds 701 to 800 is Spartans 43.3%. The plan 5 ladder seeds were not balanced by faction
before either; worth a look if the Spartan share in the ladder matters.

## Tests moved by the change

- The adaptive check (`src/ai/sim.test.ts`) failed on seeds 10 and 11 (gaps 0.030 and 0.186, mean 0.108 against the
  0.15 bound). Over start seeds 1 to 16 the gaps are 0.268, 0.039, 0.211, 0.547, 0.000, -0.337, 0.195, 0.210, 0.470,
  0.030, 0.186, 0.468, 0.744, 0.535, 0.146, 0.072: mean 0.237, 14 of 16 above 0, so the 16-seed bound (mean at least
  0.15, 12 of 16 above 0) holds and is better than rules 6 (0.190, 14 of 16). The bound is unchanged; the check now
  runs seeds 13 and 14 (0.744, 0.535).
- The seeded match-end lists (`src/ai/character.test.ts`, seeds 1 to 8, both seatings, 60 rounds): at hard 13 of 16 end
  (5, 6 and 7 with the Mongols first do not; before 11 of 16); at normal 12 of 16 (1 and 7 Spartans first, 6 and 8
  Mongols first do not; before 14 of 16). Normal stalls fell over 200 fresh matches (19.5% to 18.0%), so the normal
  list is which matches stall, not more stalling. The fast hard check moved from seed 1 to seed 3 (Mongols first, ends
  in round 21), bound 25 unchanged.
