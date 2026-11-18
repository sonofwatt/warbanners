# Banners

Banners is a turn-based hex strategy game for two players, with Spartan and Mongol factions in its first stage. The game is an original design: no names, text, numbers or assets come from any other game.

This repository holds plan 1 only: the rules engine, written in plain TypeScript with no screen, no AI, no online play and no saves. Nothing is playable on a screen yet. The engine is pure and deterministic: the same settings and the same actions always give the same match.

## Running it

- `npm test` runs the unit tests and the soak test (ten random matches that check the engine's invariants and replay).
- `npm run typecheck` and `npm run lint` check the code.
- `npm run sim -- <seed> [maxTurns=200]` plays one random match and prints one summary line: seed, turns played, winner, cities and units per player, and the final state hash. The same arguments always print the same line.

The public API is in `src/engine/index.ts`.

## Where things are

- Design spec: `docs/superpowers/specs`. Plans: `docs/superpowers/plans`.
- Rules, the authority for game behaviour: `docs/rules/stage1-rules.md`.
