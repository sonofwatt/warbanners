# Momentum (rules 7): build report

Built on `connected-cities` from the brief `2026-11-23-momentum.md`. `RULES_VERSION` stays 7. Nothing pushed,
merged or deployed.

## What changed, by area

### Engine (`src/engine`)

- `CONFIG.momentum = { start: { knight: 7, khansGuard: 8 }, price: { ...one per unit type... }, bracedPrice: 4 }`,
  the brief's draft values verbatim. `CONFIG.chainKillCost` is gone. The `brace` comment now says the braced price
  replaces the chain stop.
- `Unit.momentum: number` (public; `playerView` passes it through like `hunkered`).
- `momentumStart(type)` in `state.ts` (not `combat.ts`: `combat.ts` imports `state.ts`, so the other way round would be a
  cycle). It returns 0 for a type without `chain` and throws for a chain type with no start value; a test walks every
  unit type so a missing start value fails a test, not a match. `spawnUnit` sets it, so a trained, rewarded, camp-trained
  or treasure unit starts full. `turn.ts` resets it with `attacks`, `mp` and `acted` for the player whose turn starts.
- `combat.ts`: `momentumPrice(s, target, attacker)` (the braced price when `bracedAgainst`), `momentumShort(s, target,
  attacker)` (0 without chain or when paid) and `strikeDamage(s, target, attacker, effAtk)` (the damage formula against
  `guardOf` and cover, less the shortfall, never below 1). All three and `momentumStart` are exported from the index.
- `attackHandler`: price and shortfall are judged before the hit lands. The hit uses `strikeDamage`. A short attack sets
  momentum to 0 whether or not it kills. A paid kill takes the price off and grants the extra attack. Events: a paid
  kill with a price above 0 emits `{ type: 'momentum', unit, spent, left }` after `died` and `advanced` (where
  `chainCost` was); a short kill emits `chainEnded` there. The brace chain stop and the health cost are gone.
  `levelUpEndsChain` is unchanged: it takes back the granted attack, the momentum stays paid.
- `GameEvent`: `chainCost` replaced by `momentum`.

### UI (`src/ui`)

- Unit card: a chain unit shows a "Momentum" list line, `Momentum 5 of 7` with a short blurb, for any viewer (momentum
  is public, like the Braced and Hunkered lines). Text in `text.ts` (`momentum`, `momentumLeft`, `momentumBlurb`). A CSS
  line gives it the gold-side border of the hero lines.
- Board effects: the `momentum` event shows `-2 momentum` (`T.ui.momentumSpent`) over the unit in the `hero` tone,
  where the hurt-tone chain cost number was.
- Sound: the `chainCost` cue (same name, same sample files, same synth notes) now plays on the `momentum` event, heard by
  the same `unitSeen` rule. No cue added or removed.
- Text: the Chain trait blurb, the Braced blurb and `whatsNew` (the brace clause now says a rider pays more momentum to
  kill it, plus one sentence on momentum replacing the health cost).
- Combat preview: the UI has none (no expected-damage display anywhere in `src/ui` or `src/app`), so there was nothing
  to change. Any future preview should call `strikeDamage`.

### AI (`src/ai`)

- `assess.ts` `strikeOf` and `plan.ts` `canKillThisTurn` call the engine's `strikeDamage` in place of
  `damageFor(..., guardOf(...), coverAt(...))`, so the cut is the engine's, never a copy.
- Chain planning: the planner already plays each candidate attack through an engine probe and plans the next step on the
  probed state, so after a short kill it sees no attack left, and `strikeOf` (which counts only units with attacks left)
  values a paid kill's extra attack and not a short one's. That is what makes it prefer a kill it can pay for when the
  rest is equal; no other planner change was needed. A new test (`plan.test.ts`, "a chain rider takes the kill it can
  pay for first") pins it at dials 0.5, 0.85 and 1, three seeds each: a Knight with 2 momentum between an unbraced
  Hoplite (paid, opens a second kill) and a braced one (short) takes the unbraced one first. It passes with and without
  the `strikeDamage` swap, because the probes carry it; the swap matters for the danger and ranking estimates.

### Rules docs

- `stage1-rules.md`: chain row, phalanx row (no chain stop, braced price 4), and the Rules 7 changes list (brace item
  reworded, a momentum item added). That list is the file's changelog; there is no other.
- `stage2-rules.md` section 9 is now "Momentum (rules 7, replacing the rules 5 chain kill cost)": the rule, the price
  table, the example, the events, the level-up rule and a line on what rules 5 and 6 did.

## Tests replaced or deleted

- `combat.test.ts`: the rules 5 block deleted (a chain kill costs health and still grants; the cost stops at 1 health;
  no cost without a kill; no cost on a counter kill; the Khan's Guard pays; the cost earns no deed). Each is replaced in
  `momentum.test.ts` by its momentum twin (paid kill, no health lost; counter kill costs nothing; Khan's Guard pays out
  of 8; a paid kill leaves the deeds as they were). The rules 6 level-up test stays, now expecting the `momentum` event
  and full health.
- `brace.test.ts`: the "chain stops" block (braced kill grants no extra attack and costs no health; unbraced kill chains
  with the health cost; Khan's Guard stopped; judged before the fall) replaced by "the momentum price" (braced costs 4,
  unbraced 2, the kill still counts; Khan's Guard pays 4). "Judged before the fall" moved to `momentum.test.ts`. The
  defence tests are unchanged.
- New `momentum.test.ts` (20 tests) covers every item on the brief's test list, and `momentum.splash.test.ts` (1 test,
  alone because it `vi.mock`s the Knight to have splash: no unit has chain and splash today) covers the splash rule.
- UI: the effects chain cost test now checks the hero-tone `-1 momentum`; the sound tests use the `momentum` event; the
  Knight card text test checks the new blurb; a new panel test checks the Momentum line for Knight (5 of 7, either
  viewer), Khan's Guard (8 of 8) and none for a Warrior.
- `stage1.dormant.test.ts`: `chainKillCost: 0` became every momentum price 0 (and `bracedPrice` 0), which gives endless
  chains with no cut, as rules 3 had. Both stage 1 files strip `momentum` from the rules 3 shape. `stage1.test.ts` now
  stops at the first `momentum` or `chainEnded` event in place of `chainCost` (a short attack can only follow a paid
  kill with a price, so the first outcome change is always behind one of those).

## Re-pinned fingerprints and digests

- `fingerprint.test.ts` rules 7: `f6692e05ebbf3dee` to `e3e216adf5b4f994`. Every unit now carries `momentum`, and chain
  play changed.
- `speed.test.ts`, all three rows: every state and view digest moved because of the new field. Seed 7's playout also
  plays differently after a Knight's chain kill (no health cost, momentum), so its legal action count went from 70 to
  122 and its legal digest moved; seeds 1 and 3 kept their legal counts and legal digests. None of the three has ended.
  The 25-unit position `(9, 256)` still has 25 units, so it was not re-picked.
- No AI fingerprint or digest needed re-pinning: the `src/ai` tests in `npm test` passed unchanged.
- `character.test.ts` (SLOW=1 only): the known normal stall moved from '7 spartans' to '6 spartans'. Measured with a
  150-round bound: '7 spartans' now ends in 51 rounds (it ended in 83 with hunker), '6 spartans' ends in 73 (the
  Mongols win). Both numbers are identical with and without the AI's `strikeDamage` swap, so the rule moved it: still
  one stall in 16, a different match. The hard test (all 16 end) and `sim.test.ts` passed under SLOW=1 unchanged. The
  base commit passed the normal test before the change, so this is the one place a SLOW result moved.

## Decisions the brief did not settle

- The `momentum` event is emitted only when the price is above 0. A Scout kill (price 0) is paid and grants the extra
  attack, but emits nothing, as `chainCost` emitted nothing when no health was lost: a "-0 momentum" number and a cost
  cue for nothing spent seemed wrong. Cheap to change (one condition in `attackHandler`).
- A short attack that does not kill emits no event; only a short kill emits `chainEnded`, as the brief says.
- "The counter-attack is not changed by the cut": read as "the counter formula is not cut". The counter still uses the
  target's health after the hit, so a cut hit leaves the target healthier and its counter can be a point stronger than
  after an uncut hit. A test pins that reading.
- The cut applies to the attack's damage before splash is worked out, so a short splash attack also splashes less. No
  unit has both chain and splash today.
- The momentum line shows for every chain unit, own or enemy, as Braced and Hunkered do.
- `momentumStart` lives in `state.ts` to avoid an import cycle; it is exported from the index like the rest.

## Checks run

- `npx tsc -b`, `npm run lint`: clean.
- `npm test`: 101 files passed, 21 skipped; 1060 tests passed, 123 skipped.
- `npm run test:browser`: green (6 AI tests, then 49 passed and 2 skipped). The first run failed one timing test
  ("the page never stands still for 100 ms", a 112 ms task) while the SLOW sims were running on the same machine; the
  rerun on a quiet machine passed.
- SLOW=1 `sim.test.ts` and `character.test.ts`: green after the KNOWN_NORMAL change above.
- No touched file contains U+2014 or U+2013.

## Concerns

- A rules 7 solo save made before this change (only possible on a dev build, rules 7 is unreleased) has units without
  `momentum`; such a Knight would compute NaN damage. `RULES_VERSION` stays 7 by ruling, so these saves are not refused.
- The draft prices make a Knight's first two or three kills free of any cost it can feel; with the health cost gone the
  Knight may be stronger than under rules 6. The rules 7 balance reruns will show it.
