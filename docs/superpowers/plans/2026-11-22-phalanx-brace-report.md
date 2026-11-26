# Phalanx brace: build report (2026-11-22)

Branch `connected-cities`, rules version 7 (not bumped), app 0.5.0. Brief: `2026-11-22-phalanx-brace.md`. Nothing
pushed, merged or deployed. `database.rules.json` untouched. No new sounds.

## Commits

- `68d5f0a` Engine: phalanx brace against chain riders (rules 7)
- `fa6b5dd` UI: a Braced line on a braced Hoplite's card (rules 7)
- `62ff9c7` Docs: the phalanx brace in the rules (traits table, chain cost, rules 7 list)
- this report

## What was built

Engine (`src/engine/combat.ts`, `src/engine/data/config.ts`):

- `CONFIG.brace = { mates: 2, def: 2 }`. No `on` flag: the stage 1 provenance tests and the fingerprint passed
  unchanged, so none was needed.
- `isBraced(s, u)`: `u` has the `phalanx` trait and at least `CONFIG.brace.mates` units of the same owner with the
  `phalanx` trait stand at distance 1. The phalanx neighbour count is shared with `defenceOf` (a private
  `phalanxMates`), so the phalanx bonus and the brace can never disagree about who is a mate.
- `bracedAgainst(s, target, attacker)`: the attacker has `chain` and the target is braced.
- `guardOf(s, u, attacker)` now takes the attacker (required, so no caller can forget it): `defenceOf + hunker bonus
  + CONFIG.brace.def` when `bracedAgainst`. The attack handler's damage uses it; cover multiplies after, in
  `damageFor`. The counter-attack still uses plain `defenceOf` for the attacker, so a braced Hoplite's own attacks and
  counters are unchanged.
- `attackHandler` judges `bracedAgainst` once, before the damage lands (so before the Hoplite can be removed). On the
  kill of the main target, a chain attacker pays `chainKillCost` and gets the extra attack only when the target was not
  braced. The kill still counts: `died` event, fight deed (`fightPerKill`), hero traits, sim stats and census are
  untouched.
- `isBraced` and `bracedAgainst` are exported from the engine index.

AI (`src/ai/assess.ts`, `src/ai/plan.ts`): the two damage guesses (`strikeOf`, `canKillThisTurn`) pass the attacking
unit to `guardOf`, so they see the brace through the engine function, never a copy. The AI has no explicit chain
planning: it gets its extra attacks by applying actions through the engine, so after a braced kill it simply has no
attack left. No other planner change.

UI: `UnitPanel` takes an optional `braced` prop and shows a "Braced" line (`T.ui.braced`, `T.ui.bracedBlurb`, steel
border like the Hunkered line, class `traits braced`). `Match.tsx` sets it from `isBraced` on the viewer's believed
state, like the myth touch, so an enemy's card cannot reveal Hoplites in the fog. `whatsNew` for 0.5.0 has one more
sentence. No board mark, no sound.

There is no combat preview in the UI (no expected-damage display anywhere in `src/ui` or `src/app`), so nothing there
needed changing; the AI's guesses are the only estimate and they use `guardOf`.

Docs: `stage1-rules.md` phalanx and chain rows in the traits table, and a line in "Rules 7 changes";
`stage2-rules.md` section 9 gets a paragraph on the braced stop.

## Rulings where the brief was silent

1. Splash: in the engine only the main target's kill grants a chain attack (splash kills never did), and no unit has
   both `chain` and `splash`. So "only the braced Hoplite kills lose their chain grant" needs no extra code: a braced
   main target loses its grant, splash kills grant nothing as before. No test for it, since no unit can make that
   attack; it would need a fake unit type.
2. The target must itself have the `phalanx` trait to be braced (a Warrior between two Hoplites is not), as the brief
   says "a Hoplite is braced".
3. The card line shows whenever the Hoplite is braced, whoever is looking at it and whatever is selected, since the
   brace is a standing state, not something tied to one attacker.
4. `guardOf`'s new `attacker` argument is required rather than optional.
5. The Chain trait blurb in `text.ts` was left as it is; the Braced line on the Hoplite's card tells the player.
   One sentence to add there if David wants it.

## Fingerprints and digests

None re-pinned. `FINGERPRINT[7]`, the three speed digests, the AI fingerprints and the stage 1 provenance tests all
passed as they were: the scripted positions never have a chain unit attack a Hoplite with two Hoplite mates.

## AI check (head to head, scratch script, not committed)

The AI after this work against the AI at `f3a4275` (the commit before it; its damage guesses ignore the brace), both
on the new engine. Seeds 1 to 14, both faction orders, both seats, 60 rounds, so 56 matches a level:

| Level | New AI | Old AI | Stalls |
|---|---|---|---|
| normal (0.5), 56 matches | 27 | 27 | 2 |
| hard (0.85), 56 matches | 27 | 27 | 2 |

24 of 28 seat pairs at normal and 26 of 28 at hard played out identically. A second scratch count shows why: in the same
28 self-play matches a level, chain units made 178 attacks at normal (44 on Hoplites, 2 on a braced one, no braced
kill) and 144 at hard (38 on Hoplites, 1 braced, 1 braced kill). The AI does not form Hoplite blocks on purpose, so
the rule rarely comes up between AIs. It is mostly a tool for human Spartans for now; teaching the AI to brace its
Hoplites would be a separate change.

## Tests

- New `src/engine/brace.test.ts` (14 tests): the numbers; two mates braced, one not; enemy Hoplites and a friendly
  non-phalanx neighbour do not count; a non-Hoplite between two Hoplites is not braced; +2 against a Knight with forest
  cover multiplying after; +2 against the Khan's Guard; nothing against a non-chain attacker; adds to hunker; one mate
  gives only the phalanx bonus; a braced Hoplite's own attack and the Knight's counter unchanged; a braced kill gives
  no extra attack, no health cost and no `chainCost` event while the kill and fight deed still count; an unbraced kill
  chains as before; the Khan's Guard is stopped too; bracing judged before the Hoplite falls.
- New panel test: a braced Hoplite shows the Braced line for either viewer, an unbraced one does not.
- `npm run lint`: 0 warnings, 0 errors. `npx tsc -b`: clean (`tsconfig.tsbuildinfo` deleted).
- `npx vitest run`: 95 files passed, 19 skipped; 1002 tests passed, 121 skipped.
- `npm run build`: fine.
- `npm run test:browser`: the first run failed "the page never stands still for 100 ms during the turn" (a timing test,
  machine shared). Rerun alone: `src/browser/ai.test.ts` 6 of 6 passed; the rest of `src/browser` 14 files passed,
  1 skipped, 47 tests passed, 2 skipped.
- SLOW tests not run ("adaptive climbs" was failing before, per the instructions).

## Left open

- Rules 7 balance runs need redoing with Hunker and the brace in.
- The AI seldom braces, so balance runs between AIs will barely see the rule.
- The brief file `2026-11-22-phalanx-brace.md` is still untracked; not committed by me.
