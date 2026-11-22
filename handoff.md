# Warbanners: handoff

Rewritten 2026-11-22, before ClaudeComputer moves to a new server. Read this first when picking the project up,
then check `git status`, `git worktree list` and the branches against it: everything below was true when written.

## What it is

An original turn-based hex strategy game for phones (an installable web app), in the same genre as Hexonia but
with its own art, names, text and numbers. Spartans against Mongols, solo against the AI, pass-the-phone, or
online through Firebase (`banners-game`). React, TypeScript, Vite; a pure deterministic engine in `src/engine`.

- Live: https://sonofwatt.github.io/warbanners/ (deployed by `.github/workflows/deploy.yml` on every push to `main`,
  after lint, typecheck, unit, emulator, browser and online tests).
- Public repo: `sonofwatt/warbanners`. Private workspace backup: `sonofwatt/warbanners-workspace` (ledgers, plan
  drafts, sound drafts, sim results, the WebGL sample; `.superpowers/` here is its git-ignored source).
- Rules and every number: `docs/rules/stage1-rules.md`, `docs/rules/stage2-rules.md`. Design: `docs/superpowers/specs/`.
  Plans and tuning logs: `docs/superpowers/plans/`. Project rules: `CLAUDE.md` (no em or en dashes anywhere).

## Where things stand

| Version | Rules | State |
|---|---|---|
| 0.4.5 | 6 | **Live** on `main`. Screen fits with no scroll, card actions top right, a city's units in a sideways row with a detail card and Train, a greyed tech-locked button opens the tech tree at that tech, Cancel disarms an ability, a tap on the board no longer presses a button on the card it opens, the phone's bars match the match screen |
| 0.5.0 | 7 | On `connected-cities` (`.worktrees/connect`), **not merged**: connected cities pay growth, Scout sight 1, a captured capital becomes an ordinary city and the capital moves, Lumber camp 4 gold. Blocked on balance (below) |

## Balance work in progress (rules 7, `connected-cities`)

At rules 7 the Spartans win only about 20% (normal and hard; 0.4.4 was 34% and 30%). Cause, confirmed by city counts:
Mongol expansion (Spartans about 1.6 cities against 6.2). Each lever was measured over 200 AI matches per level
(`npx tsx scripts/simai.ts --matches 100 --seed 1 --a L --b L --swap --jobs 4`). Spartan win share:

| Lever | Normal | Hard |
|---|---|---|
| Rules 7 as committed | 20% | 19.8% |
| A: Mongol capture gold 3 to 1 (`tributeVillage`, `tributeCityBase`) | 30.8% | 33.8% |
| B: Mongol `relayRiders` off | 33.5% | 28.5% |
| **C: Spartan `growthExtra` -1 (cities level one point cheaper)** | **43.5%** | **47.8%** |
| D: connection growth to the capital only | 24.0% | 28.7% |
| C + A | 53.5% | 54.8% |
| C + B | 57.0% | 55.5% |

C alone is the best candidate. Separately the first seat wins about 54% against 41% whatever the levers (the map is
mirrored, so it is tempo). Under test: C with the second seat starting on 12 or 14 gold (`CONFIG.startGold`). Raw
outputs are in the workspace repo under `sim-results/`. Next: pick C (plus a seat fix if it helps), record it in
the rules file and a tuning log, then merge and deploy 0.5.0 (check `npx firebase database:get /rooms` first:
never deploy a RULES_VERSION bump during a live online match).

## Work in other sessions (2026-11-22)

- `gritty-mode` (`.worktrees/gritty-mode`): an opt-in dark art mode with battle wear (scuffed, dented, battered,
  broken; slight blood from battered; healing clears blood and drops wear back one stage; cosmetic only; enemy wear
  visible, so per-unit battle data becomes public), a Settings menu on Home. Mood reference from David: Bad North in
  bad weather and low light (mood only, our own art).
- `player-stats` (`.worktrees/player-stats`): names remembered per phone, stats per name (wins, losses, average
  damage, kills, deaths and more), all three kinds of match with filters. Waiting on David's design answers.
- Neither merges or deploys without David seeing it. Both push their branches.

## Open items

- Rules 7 balance as above; then the final whole-branch review of `connected-cities`, merge, deploy 0.5.0.
- UI labels for the `connected` and `capitalMoved` events (no sound); the connected-cities measurement log.
- The adaptive SLOW test; the engine speed test (`legalActions on a 25-unit position is fast`, 6.5 ms locally) and
  the AI browser test "the page never stands still for 100 ms" fail when sims load the CPU; rerun idle.
- Show David the reworded Scout blurb.
- Heal: David saw it refuse a target that had already acted; not reproduced (a spent Hoplite heals 5 to 9 in the
  built app, covered by `src/browser/abilities.test.ts`). Waiting for what he saw.
- Sounds: the v2 drafts (`scratch/audio` in the workspace repo) wait for David's listen; nothing ships until he has.
- Ideas David is mulling (not approved): WebGL for a version 2 with weather and time of day (sample renders in the
  workspace repo; toon shading preferred), fantasy factions, Exalted Heroes.

## Worktrees

`git worktree list` shows them. `.worktrees/connect` (rules 7), `.worktrees/ui-fit` (merged, 0.4.5),
`.worktrees/gritty-mode`, `.worktrees/player-stats`; `ai`, `art`, `heroes`, `online` are old and merged. Worktrees
under `/tmp/.../scratchpad/abl` and `sweep` are throwaway sim copies: `git worktree prune` after they vanish.
`node_modules` in each worktree is a symlink to `.worktrees/connect/node_modules`; on a fresh machine run `npm ci`.
