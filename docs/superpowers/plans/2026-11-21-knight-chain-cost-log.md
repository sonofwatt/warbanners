# Knight chain cost log (rules 5, 0.4.1)

Picking `CONFIG.chainKillCost`: the health a chain unit (Knight, Khan's Guard) loses for each kill it makes with its own
attack, never below 1. David's report: Knights sweep kill after kill, which feels awful against a person.

Measures added to the simulator (`src/ai/sim.ts`, printed by `npm run sim:ai` on its `chain:` line):

- sweeps: turns in which one unit makes 3 or more kills, per 100 matches;
- 2+ kill turns: turns in which one unit makes 2 or more kills, per 100 matches (added during this log, see below);
- chain kills per match, and the chain-unit kill share (chain kills over all kills);
- Knights trained per match.

The rule from the brief: the smallest cost that at least halves the sweeps against cost 0, provided chain units still
make kills (chain-unit kill share above half of today's) and no plan 5 target breaks (Spartan win share 40% to 60%,
median rounds at most 39, stalls at most 21.5%).

All runs are normal against normal, `--matches 100 --seed 701 --max-rounds 60 --swap --jobs 3` (seeds 701 to 800, both
seatings, 200 matches), one batch at a time; the ladder is plan 5's harness, `--matches 25 --seed 1001 --swap` in both
seat orders.

## 1. The AI as it ships: no chain unit is ever fielded

Cost 0 (the head with the cost switched off):

```
matches 200  seats a=normal b=normal  seed 701  max rounds 60  swap
win share: spartans 47.8%  mongols 45.0%  (adjudged stalls count half)
seat win share: first 52.0%  second 40.8%
stalled 14.5%  rounds p10 17  median 38  p90 60
  trained per match: hoplite 20.43, warrior 1.20
  trained per match: horseArcher 17.33, horseman 5.80
chain: sweeps (one unit, 3+ kills in a turn) per 100 matches 0.00  chain kills per match 0.00  chain-unit kill share 0.0%  knights trained per match 0.00
```

Neither persona ever trains a Knight (the Mongols list it fifth in `trainOrder` and never reach it; the Spartans do not
list it), and the Mongols take `support` over `champion` at level 5, so no Khan's Guard appears either. With no chain
kill in 200 matches the cost's code never runs, so every cost plays these 200 matches move for move as cost 0 does: the
table below would read the same on every row. The ladder confirms it (cost 0 and cost 2, seeds 1001 to 1025):

```
normal, hard: seat win share: first 56.0%  second 38.0%  stalled 12.0%  median 28   (cost 0 and cost 2 identical)
hard, normal: seat win share: first 69.0%  second 25.0%  stalled 12.0%  median 24   (cost 0 and cost 2 identical)
```

Hard over normal 53.5% at both costs, the same as plan 5's final check on these seeds. Apart from the new `chain:` line,
the cost 0 and cost 2 ladder outputs are byte for byte the same.

So against the shipped AI the plan 5 targets hold at any cost: Spartans 47.8%, median 38, stalls 14.5%.

## 2. A Knight variant of the AI, for measurement only

To get matches with Knights in them, the Mongol persona was changed for these runs only and then restored
(`src/ai/persona.ts` is unchanged in the commits): `chivalry` second in `techOrder` (after `riding`), `knight` first in
`trainOrder`, and `rewardPick` 5 set to 0 (the champion, Khan's Guard). The Spartans are unchanged. This makes the Mongols
field about 8 Knights a match. Win shares in this variant are not the live balance (a Knight-first Mongol side wins more
than the shipped one); what matters is how the chain numbers move with the cost.

| Cost | Sweeps per 100 matches (count) | 2+ kill turns per 100 matches | Chain kills per match | Chain-unit kill share | Spartan win share | Median rounds | Stalled |
|---|---|---|---|---|---|---|---|
| 0 | 1.50 (3) | 24.0 | 4.50 | 16.4% | 30.8% | 39 | 26.0% |
| 1 | 0.00 (0) | 18.0 | 4.44 | 16.2% | 30.8% | 38 | 28.5% |
| 2 | 0.00 (0) | 11.5 | 4.11 | 15.0% | 32.8% | 38 | 26.0% |
| 3 | 0.50 (1) | 13.0 | 3.87 | 14.0% | 31.8% | 40 | 28.0% |
| 4 | 1.00 (2) | 12.0 | 3.90 | 14.1% | 32.5% | 39 | 27.0% |
| 5 | 0.50 (1) | 9.5 | 3.40 | 12.5% | 32.3% | 39 | 27.0% |

Knights trained stays 8.1 to 8.5 a match on every row.

Reading:

- Sweeps are rare even with Knights first: 3 in 200 matches at cost 0. The AI does not line up wounded enemies for a
  rider, so 3 or more kills in a turn hardly happens. Counts of 0 to 3 are noise; costs 3 to 5 show 1 or 2 again. The
  sweep column alone cannot pick a number. Read literally, cost 1 halves it (3 to 0).
- 2+ kill turns are the denser signal of the same thing (a chain that keeps going): 48 turns in 200 matches at cost 0.
  Cost 1 cuts them by a quarter (24.0 to 18.0); cost 2 is the smallest cost that halves them (to 11.5, 48%); costs 3 to 5
  stay near there (13.0, 12.0, 9.5), so past 2 the extra cost mostly buys less.
- Chain units still kill: the kill share is 15.0% at cost 2 against 16.4% at cost 0, far above half (8.2%). The first kill
  is never touched (the cost comes after it); the cost only damps the second and later.
- The win share, median and stalls barely move with the cost (Spartans 30.8% to 32.8%, all inside 200-match noise of
  about 3.5 points). The variant's own Spartan share and stall share are outside the plan 5 targets at every cost,
  cost 0 included, because of the variant persona, not the cost.

## 3. An engine check: one rider against a line of enemies

`chainline.ts` (scratch, not committed): a full-health Knight, Fierce Knight and Khan's Guard each attack a line of 8
identical enemies (Warrior, Archer, Horseman, Horse Archer, Hoplite, Spearman, Swordsman) at every health from 1 to full,
advancing after each kill: 240 cases, 202 with a first kill.

| Cost | Cases with 3+ kills | Kills per case | Cases with all 8 kills |
|---|---|---|---|
| 0 | 202 (84.2%) | 6.73 | 202 |
| 1 | 193 (80.4%) | 6.40 | 185 |
| 2 | 182 (75.8%) | 5.65 | 133 |
| 3 | 169 (70.4%) | 4.93 | 105 |
| 4 | 159 (66.3%) | 4.53 | 103 |
| 5 | 144 (60.0%) | 4.28 | 99 |

At cost 0 a rider that kills one of a line kills all of it. The "never below 1" floor keeps a rider at 1 health killing
enemies with 1 to 3 health, so no cost up to 5 halves sweeps against a line of badly wounded enemies; what the cost does
is cut the long chains through healthier enemies (all 8 kills: 202 to 133 at cost 2). Cost 1 changes little here too.

## Choice: 2

Cost 2 is the smallest cost that halves the multi-kill turns in matches with Knights (24.0 to 11.5 per 100 matches) and
brings sweeps to 0 there (3 to 0), while chain units keep 15.0% of all kills (16.4% today, the floor is 8.2%). The
first-listed rule picks cost 1 on the sweep column alone, but that column holds 3 events at cost 0 and cannot tell 1 from
5; on the 2+ kill turns and on the line check, cost 1 barely moves anything. Against the AI as it ships, every plan 5
target named in the brief holds at any cost (Spartans 47.8%, median 38, stalls 14.5%; hard over normal 53.5%, unchanged),
because that AI fields no chain unit.

2 is 13% of a Knight's 15 health and 10% of a Khan's Guard's 20: a small cost per kill, felt across a chain.

## Carried

- The shipped AI never trains a Knight or takes the Khan's Guard, so the simulator cannot show the cost in normal play.
  A persona that fields Knights is a separate AI task.
- Sweeps (3+ kills by one unit in a turn) are too rare in AI play to measure on 200 matches; the 2+ kill count stands
  in for them. Real people line up wounded enemies differently from the AI; David's next playtest is the real check.
