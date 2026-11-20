# Warbanners

Warbanners is a turn-based hex strategy game for two players. This first stage has the Spartans against the Mongols. The game is an original design: no names, text, numbers or assets come from any other game.

## Play

Open https://sonofwatt.github.io/warbanners/ in a phone browser.

- **Android (Chrome):** tap the Install button on the home screen of the game, or open the browser menu and choose "Add to Home screen".
- **iPhone (Safari):** tap Share, then "Add to Home Screen".

Once it has been opened online one time, the game plays offline, installed or not. A new version waits until you tap Update on the home screen, and is never swapped in during a match.

This stage includes two players on one phone, passing it between turns, or one player against the computer at four levels (easy, normal, hard and adaptive), with a saved match you can resume. It does not yet include online play.

## Development

- `npm run dev` starts the app on a local dev server.
- `npm run build` typechecks and builds the app into `dist/`.
- `npm test` runs the unit tests and the soak test (ten random matches that check the engine's invariants and replay).
- `npm run test:browser` builds the app and runs the browser suites (board, flow, offline) in Chromium. They skip in a plain `npm test`. Set `GITHUB_PAGES_BASE=/warbanners/` to test under the deployed sub-path.
- `npm run typecheck` and `npm run lint` check the code.
- `npm run sim -- <seed> [maxTurns=200]` plays one random match and prints one summary line: seed, turns played, winner, cities and units per player, and the final state hash. The same arguments always print the same line.
- `npm run sim:ai -- --matches <n> --seed <s> --a <level> --b <level> [--max-rounds 60] [--swap] [--jobs 3] [--json out.jsonl]` plays AI-against-AI matches (levels easy, normal, hard or a dial number) and prints one summary block: win shares, seat shares, stalls, round counts and character metrics. For example `npm run sim:ai -- --matches 50 --seed 1 --a normal --b hard --swap --jobs 3`. The tuning log in `docs/superpowers/plans/2026-11-18-plan-3-tuning-log.md` shows what the numbers mean.
- `npm run sim:adaptive -- --matches <n> [--seed 1] [--max-rounds 60]` plays the adaptive AI against a weak (dial 0.2) and a strong (dial 0.85) opponent and prints its mean dial over each match's second half. For example `npm run sim:adaptive -- --matches 6`.
- `?sheet=1` on the dev or built address shows the art sheet.
- `?board=<seed>&turns=<n>` shows a demo board from a seeded match played for that many turns.

Pushes to `main` run the workflow in `.github/workflows/deploy.yml`: lint, typecheck, unit tests, browser tests, then a deploy to GitHub Pages.

The rules engine (`src/engine`, plain deterministic TypeScript) has its public API in `src/engine/index.ts`.

## The AI

`src/ai` is the computer opponent: a pure planner that picks a whole turn from an `AiInput` (only what that player could see), four levels on a skill dial, a driver that replans when the real board differs from what the plan expected, the adaptive dial, and the bulk simulation used for tuning. `src/ai/worker.ts` runs the planner in a Web Worker, reached from the app through `src/app/aiClient.ts`.

## Where things are

- Design spec: `docs/superpowers/specs`. Plans: `docs/superpowers/plans`.
- Rules, the authority for game behaviour: `docs/rules/stage1-rules.md`.
