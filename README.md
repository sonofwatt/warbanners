# Banners

Banners is a turn-based hex strategy game for two players, with Spartan and Mongol factions in its first stage. The game is an original design: no names, text, numbers or assets come from any other game.

This repository holds the rules engine (plan 1), written in plain TypeScript and pure and deterministic: the same settings and the same actions always give the same match. It also holds the start of the on-screen game (plan 2): a React and Vite app whose shell currently shows only the title and version line. There is no AI, no online play and no saves yet.

## Running it

- `npm run dev` starts the app on a local dev server.
- `npm run build` typechecks and builds the app into `dist/`.
- `npm test` runs the unit tests and the soak test (ten random matches that check the engine's invariants and replay).
- `npm run typecheck` and `npm run lint` check the code.
- `npm run sim -- <seed> [maxTurns=200]` plays one random match and prints one summary line: seed, turns played, winner, cities and units per player, and the final state hash. The same arguments always print the same line.

The public API is in `src/engine/index.ts`.

## Where things are

- Design spec: `docs/superpowers/specs`. Plans: `docs/superpowers/plans`.
- Rules, the authority for game behaviour: `docs/rules/stage1-rules.md`.
