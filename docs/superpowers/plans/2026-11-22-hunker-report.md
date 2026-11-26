# Hunker: build report (2026-11-22)

Branch `connected-cities`, rules version 7 (not bumped). Brief: `2026-11-22-hunker.md`. Nothing pushed, merged or
deployed. `database.rules.json` untouched.

## Commits

- `252b88f` Engine: Hunker, a unit action for defence and healing (rules 7)
- `a743ae7` UI: a Hunker button, a Hunkered line on the unit card and a shield on the board (rules 7)
- `19ed489` Docs: Hunker in the rules (sections 5 and 11, Resting) and a rules 7 changes list
- `c75fb41` Tests: Hunker in the browser, and the board shield carries data-hunker-mark
- `a511841` AI: hunker a threatened garrison or a cornered wounded unit (rules 7)
- `dc7fdd4` AI: drop an unused variable from the hunker check

## What was built

Engine (`src/engine/hunker.ts`, new):

- Action `{ type: 'hunker', unit }`, `hunkerRefusal` / `canHunker` (exported), listed by `legalActions` after `useItem`.
  Refusals: `unit is too new`, `already hunkered`, `siege engines cannot hunker`, `unit already acted this turn`
  (moved, acted, or drank a draught this turn), plus the usual `no such unit` / `not your unit`.
- Hunkering sets `hunkered`, and `mp`, `bonusMp` and `attacks` to 0. It does not set `moved` or `acted`, so
  `endTurn` still marks the unit rested.
- `Unit.hunkered: boolean` (in `spawnUnit`, so hashed, and copied by `playerView` to both players).
- Events `hunkered` and `hunkerEnded`.
- Ending: `applyAction` ends the hunker of the acting unit (any action with a `unit` field other than `hunker`:
  move, attack, ability, capture, claimTreasure, useItem, campTrain) on the draft before the handler runs, so an
  attacker has no hunker defence against the counter, and a refused action leaves the flag as it was. A lure pull
  ends it too (`movement.ts`).
- Defence: `guardOf(s, u) = defenceOf + CONFIG.hunker.def`, used for the target in `attackHandler` (before cover);
  exported and used by the AI's damage guesses.
- Resting: `restHealAt` adds `restBonus` when hunkered; beside a seen enemy a hunkered unit gets
  `ceil(regular * besideEnemyShare)` (2, 1, 1), a plain unit still 0.
- Heal ability: +`abilityHealBonus` on a hunkered target, capped at max.
- `CONFIG.hunker = { on: true, def: 1, restBonus: 1, abilityHealBonus: 1, besideEnemyShare: 0.5 }`. `on: false`
  removes the action; only the two stage 1 provenance tests use it (they also strip `hunkered` from the shape).
- Re-pinned: `FINGERPRINT[7]` (now `f6692e05ebbf3dee`), the three speed digests, and the 25-unit speed position
  (`(9, 274)` has 26 units now; `(9, 256)` has 25, 208 legal actions, about 3.6 ms), also in the AI budget test.

AI (`src/ai/plan.ts`):

- At a unit's first step, when the plan's pick is a move or nothing, it hunkers if an enemy could reach its tile
  (danger map > 0) and no seen enemy is in strike reach from any tile it can reach (enemies whose counter alone
  would kill it do not count), and either it is a garrison on its own city tile with danger at least a third of its
  health, or it is wounded and its move (if any) still ends in danger.
- The AI's kill and strike guesses use `guardOf`.

UI: `ix.hunkers` (not counted in `activeUnits`), a `Hunker` command last in the unit's command list, a `Hunkered`
line with a blurb on the unit card (any viewer), a steel shield (`data-hunker-mark`) in the new-unit glint's slot on
the board with the draught badge moving one slot right, a sample in the art sheet, three refusal texts, `whatsNew`
for 0.5.0 mentions Hunker. No sound, no float text.

Docs: `stage1-rules.md` section 5 (turn list), section 11 (Hunker paragraph and the Resting numbers), a new
"Rules 7 changes" list at the end; `docs/online.md` notes the action needs no rules edit.

## Rulings where the brief was silent

1. A lure pull ends the hunker ("until it moves"). Easy to flip: one line in `pullLured`.
2. Drinking a draught is an action of its own: it ends the hunker, and a unit that drank this turn cannot hunker.
3. The Camp may hunker (only `siege` is excluded); Camp training ends it.
4. The hunker shield shares the glint's slot, since a hunkered unit is never fresh.
5. AI: the brief said "on or beside its own city". Beside-city hunkering (and hunkering under any threat) stalled
   seeded matches ('6 spartans' at normal, then '6 mongols' at hard), so the AI rule is the garrison on the city tile
   with danger at least a third of its health. Recorded in the comment above `hunkers` in `plan.ts`.
6. `character.test.ts`: '7 spartans' at normal no longer ends within 60 rounds (it ends in 83, Mongols win). Listed in
   `KNOWN_NORMAL` with a note, following the file's convention.

## AI check (head to head, scratch script, not committed)

The AI with Hunker against the AI at `252b88f` (same engine, never hunkers), seeds 1 to 14, factions and seats
swapped, 60 rounds:

| Level | New AI | Old AI | Stalls |
|---|---|---|---|
| normal (0.5), 56 matches | 30 | 26 | 0 |
| hard (0.85), 56 matches | 32 | 23 | 1 |

Earlier variants: beside-city at hard 41 to 38 (80 matches), at normal 34 to 42 (80); garrison-only without the
threshold at normal 40 to 39 (80).

## Tests

- `npx tsc --noEmit -p .`: clean. `npm run lint`: 0 warnings, 0 errors.
- `npx vitest run`: 94 files passed, 16 skipped; 984 tests passed, 114 skipped.
- `npx vite build && BROWSER=1 npx vitest run src/browser --exclude src/browser/ai.test.ts`: 11 files passed,
  1 skipped; 40 tests passed, 2 skipped (includes the new `src/browser/hunker.test.ts`).
- New: `src/engine/hunker.test.ts` (14 tests), two AI plan tests, command, panel and art tests.
- SLOW=1 (`character.test.ts`, `plan.test.ts`): pass with the known '7 spartans'.
- SLOW=1 `sim.test.ts` "adaptive climbs against a strong opponent": fails, but it already fails at `5c8822a`,
  before any Hunker work (gap 0.039 there and at `252b88f`; 0.062 with the Hunker AI, bound 0.15). Not fixed here.

## Left open

- Rules 7 balance runs need redoing with Hunker in (as the brief says).
- The adaptive SLOW test failure predates this work.
- The browser AI suite (`src/browser/ai.test.ts`) was not run, per the instructions.
- The brief file `2026-11-22-hunker.md` is still untracked; not committed by me.
