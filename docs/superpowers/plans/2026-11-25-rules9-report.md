# Rules 9 report (2026-11-25)

Branch `rules9`, cut from main at 0.6.2 (rules 8 live). Three changes decided by David on 2026-11-25. Nothing else was
tuned; the balance swing below is reported, not answered.

## Changes

- **Spartan growth.** New `CONFIG.growthExtraFrom: 2` (`src/engine/data/config.ts`). `growthNeeded`
  (`src/engine/economy.ts`) adds the faction's `growthExtra` only when the city is at that level or higher, so every
  city needs `1 + growthBase` = 2 growth to leave level 1, and the Spartan -1 applies from level 2 on (2 to leave
  level 2, 3 to leave level 3, and so on). Mongols (`growthExtra` 0) are unchanged. It is data, not a faction check;
  `growthExtraFrom: 1` replays rules 8.
- **Level 2 gold reward.** `CONFIG.rewardGold` 6 to 5. The same constant pays a champion or support reward that finds
  no free tile (economy.ts), so that also drops to 5; the rules doc says so. The treasure's gold is a separate number
  (`CONFIG.treasure.gold`, already 5, used in capture.ts) and is untouched.
- **Unhunker.** David: "When units are hunkered, also show an unhunker button on their player card to indicate that
  they are currently hunkered. There is the icon, but it's not enough." New action `{ type: 'unhunker', unit }`
  (`src/engine/hunker.ts`), legal for the current player's hunkered unit only. It ends the hunker (a `hunkerEnded`
  event) and nothing else: no cost, not acting for rest, no movement or attacks given back (a unit that hunkered this
  turn still cannot move; one hunkered on an earlier turn has its normal turn). The unit records `unhunkeredTurn` (the
  stamp) and may not hunker again that turn (`'unhunkered this turn'`, the strict reading). The field is absent until
  first used, so older states hash as before; `CONFIG.hunker.unhunker` switches the action off.
  Online: actions are opaque canonical strings (`src/online/wire.ts`), and `database.rules.json` inspects only
  `endTurn`, so neither changes. AI: not taught to use it (note in `plan.ts`); the planner never calls `legalActions`,
  so its play is unchanged (6 normal simai matches give byte-identical JSON with and without the commit), and the sims
  below stand. UI: the unit card shows Unhunker where Hunker would be, drawn pressed in (`aria-pressed`, a shield icon,
  `button.pressed` in theme.css) with a hint (`T.ui.unhunker`, `T.ui.unhunkerHint`). The change is a `pressed` flag
  on `Command`, one branch in `unitCommands` and `indexActions`, and one CSS rule, so it carries over to the steadycam
  sheet at merge.
- `RULES_VERSION` 8 to 9 (`src/engine/types.ts`). Online matches carry `rulesVersion` and a join from another version
  is refused (`'version'`); a rules 8 solo save shows as not resumable. Per CLAUDE.md, the rules 9 build must not be
  deployed while an online match is being played.
- UI: the gold reward blurb already reads `CONFIG.rewardGold`; the city card's growth bar reads the engine's
  `growthNeeded` (Match.tsx), so both update by themselves. `whatsNew` and `APP_VERSION` are untouched, as asked.
- `docs/rules/stage1-rules.md`: sections 6 (growth, reward table, boxed-in reward) and 13 (Spartans), and a
  "Rules 9 changes" changelog.

## Tests

- New or changed: `economy.test.ts` (Spartan needs 2 at level 1, 2 at level 2, 3 at level 3; Mongol 2 then 3;
  `growthExtraFrom` is 2; reward gold 5 and the boxed-in fallback 5), `turn.test.ts` (unchosen reward pays 5),
  `ui/text.test.ts` (the gold blurb reads `CONFIG.rewardGold`, "5 gold").
- `connect.test.ts`, `capital.test.ts`: where 1 connection growth used to fill a Spartan level 1 bar, the city is
  now level 1 with 1 growth.
- Provenance: `stage1.test.ts` and `stage1.dormant.test.ts` mock `rewardGold: 6` and `growthExtraFrom: 1` (the
  latter matters because their Mongol mock has `growthExtra` 1 at level 1). Both replay the rules 3 playouts hash
  for hash. The other provenance files (`capital.rules6`, `blockade.rules7`, `hunker.rules7`, `mongols.rules7`) do
  not replay recorded games through a level 1 Spartan city or the gold reward, and pass unchanged.
- Unhunker: `unhunker.test.ts` (legal only for an own hunkered unit on its turn; ends the hunker; no movement back;
  still rests; no re-hunker that turn; a unit hunkered earlier keeps its normal turn), `wire.test.ts` round trip,
  `commands.test.ts` (Unhunker for a hunkered unit, Hunker otherwise, nothing off turn), `panels.test.tsx` (drawn
  pressed). `hunker.test.ts`: a just-hunkered unit's only legal action is now Unhunker.
- `fingerprint.test.ts`: 9 pinned at `00ab42395a0dd506` (`1c0741146a928313` before the unhunker action).
- Re-pinned because play changed (random playouts pick from `legalActions`, which now lists Unhunker):
  `speed.test.ts` rows (7, 130): 183 legal actions; (1, 75): 88; (3, 90): 90; none has ended. The 25-unit position
  moved from (3, 82) to (7, 66) (151 legal actions, about 2.9 ms on a busy machine) in `speed.test.ts`,
  `ai/plan.test.ts` and `browser/ai.test.ts`. `ai/plan.test.ts` withGrowth: 7 Spartan growth now pays 2 + 2 + 3 and
  leaves 0 toward level 4.
- `character.test.ts` (SLOW), normal stalls: four of the 16 seeded matches no longer end within 60 rounds. Run to
  150 rounds: '7 mongols' ends in 66 and '8 mongols' in 69 (Mongols win); '3 mongols' and '4 spartans' are still
  unended at 150. Re-pinned as `KNOWN_NORMAL` with that note (it was empty). Hard is unchanged. The adaptive check
  (`sim.test.ts`) passes.

Runs on the final code: `npx tsc -b` clean; `npm run lint` clean; `npx vitest run` 126 files passed, 22 skipped
(1307 tests passed, 124 skipped); `SLOW=1 npx vitest run src/ai` 12 files, 137 tests passed, the adaptive check
included. `npm run test:browser` was not run (the 25-unit position in `browser/ai.test.ts` moved with the others).

## Sims

`npx tsx scripts/simai.ts --matches 100 --seed 1 --a <level> --b <level> --swap --jobs 8` (200 matches each).
"Before" is a copy of main at da22881 and matches the numbers the brief gave exactly.

| Run | Spartans | Mongols | Stalls | Spartan cities (end / round 10) | Mongol cities (end / round 10) |
|---|---|---|---|---|---|
| normal, before | 52.3% | 43.3% | 9.0% | 4.28 / 2.42 | 3.42 / 3.19 |
| normal, after | 26.8% | 68.0% | 10.5% | 2.33 / 2.36 | 5.33 / 3.30 |
| normal, growth change alone (gold 6) | 26.3% | 71.0% | 5.5% | 2.21 / 2.36 | 5.47 / 3.23 |
| hard, before | 51.0% | 46.0% | 6.0% | 4.08 / 2.38 | 3.54 / 3.39 |
| hard, after | 26.3% | 71.8% | 4.0% | 2.10 / 2.33 | 5.54 / 3.51 |

- The swing is about 25 points toward the Mongols at both levels. The extra run (growth change only, reward gold
  kept at 6, normal) shows the growth change alone accounts for all of it; the gold change is noise next to it.
- City counts at round 10 barely move, so the Spartans do not found fewer cities. They lose them later: Spartan
  units trained fall (normal 38.5 to 31.3, hard 36.8 to 28.6) and Mongols end with about 5.4 cities instead of 3.5.
  A plausible reading: the slower first level-up delays the capital's second unit slot and the level 2 to 5
  reward chain, and the Spartans' whole army comes later. Not investigated further, as asked.
- No AI code hard-codes the old discount: the AI calls the engine's `growthNeeded` (assess.ts, mix.ts).
