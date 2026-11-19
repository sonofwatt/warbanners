# Banners

Banners is a turn-based hex strategy game for two players. This first stage has the Spartans against the Mongols. The game is an original design: no names, text, numbers or assets come from any other game.

## Play

Open https://sonofwatt.github.io/banners/ in a phone browser.

- **Android (Chrome):** tap the Install button on the home screen of the game, or open the browser menu and choose "Add to Home screen".
- **iPhone (Safari):** tap Share, then "Add to Home Screen".

Once it has been opened online one time, the game plays offline, installed or not. A new version waits until you tap Update on the home screen, and is never swapped in during a match.

This stage includes two players on one phone, passing it between turns, with a saved match you can resume. It does not yet include computer opponents or online play.

## Development

- `npm run dev` starts the app on a local dev server.
- `npm run build` typechecks and builds the app into `dist/`.
- `npm test` runs the unit tests and the soak test (ten random matches that check the engine's invariants and replay).
- `npm run test:browser` builds the app and runs the browser suites (board, flow, offline) in Chromium. They skip in a plain `npm test`. Set `GITHUB_PAGES_BASE=/banners/` to test under the deployed sub-path.
- `npm run typecheck` and `npm run lint` check the code.
- `npm run sim -- <seed> [maxTurns=200]` plays one random match and prints one summary line: seed, turns played, winner, cities and units per player, and the final state hash. The same arguments always print the same line.
- `?sheet=1` on the dev or built address shows the art sheet.
- `?board=<seed>&turns=<n>` shows a demo board from a seeded match played for that many turns.

Pushes to `main` run the workflow in `.github/workflows/deploy.yml`: lint, typecheck, unit tests, browser tests, then a deploy to GitHub Pages.

The rules engine (`src/engine`, plain deterministic TypeScript) has its public API in `src/engine/index.ts`.

## Where things are

- Design spec: `docs/superpowers/specs`. Plans: `docs/superpowers/plans`.
- Rules, the authority for game behaviour: `docs/rules/stage1-rules.md`.
