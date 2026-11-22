# Connected cities and Scout sight (rules 7, app 0.5.0)

David, 2026-11-21:
- "Let's try less sight" for the Scout, so its pathfinder step can actually happen.
- "Let's add a connected cities bonus. If you place a road between a city and the capitol both get a growth point
  once they connect. If you put roads between cities but they aren't connected to the capitol then no points until
  they do connect later."
- Easy AI stays as it is. The sounds and stings wait.

Why: the Mongols never reach city level 5 (their cities need L+2 growth to leave level L, the Spartans' L+1), so the
Khan's Guard and Sky Caller never appear. Tile improvements are the same for both factions. Roads are a Mongol
early tech, so the bonus should help them most, but our AI never lays roads today (`src/ai/plan.ts`, `economy()`:
"valueOf has no term a road changes"), so the AI must learn it too.

## Global constraints

- No em or en dashes anywhere (see CLAUDE.md).
- The engine stays pure and deterministic; the AI sees only `AiInput` (no fog cheating).
- `RULES_VERSION` goes to 7; app version 0.5.0. Every re-pinned digest gets a one-line reason in the existing
  comment style ("re-pinned for rules version 7 (...)").
- New config flags follow the rules 6 pattern: a value that replays rules 6 exactly exists so the provenance test
  (`stage1.test.ts` / `stage1.dormant.test.ts`) still replays older fixtures.
- No new sounds. Any new event is silent by `HEARD_RULES`' default (David hears every sound change before it ships).
- Rules text goes in `docs/rules/stage1-rules.md` (section 6 for growth, section 8 for the Scout) and the in-game
  rules or help text if it lists these numbers.

## Rulings (controller, reversible)

- **Scout sight 1** (was 3). A unit always sees every tile within its sight, so after any move every unexplored tile
  is at least sight + 1 away. The Scout moves 2 field tiles, so the pathfinder step onto a fog tile on open ground is
  possible only with sight 1. Sight 2 measured 0 pathfinder steps in 80 AI matches. Cost if wrong: one number.
- **What connects:** a chain of adjacent tiles from the city to its owner's capital where every tile is a road tile
  or a city of that owner. A road inside another player's territory does not count (an enemy cannot ride your roads
  into a bonus). Roads in neutral land count.
- **Once per city per owner:** `City.linked` (false for new cities, true for capitals so they never earn it for
  themselves). The first time a non-capital city becomes connected, it and the capital each get
  `CONFIG.connectGrowth` (1) growth through `addGrowth` (level-ups and rewards follow as usual), and the engine
  emits `{ type: 'connected', city, capital }`. A captured city's `linked` resets to false for its new owner.
  Connections are never lost once paid. No capital, no bonus.
- **When it is checked:** after every successful action, for the current player only (a cheap search over road and
  city tiles). Only a road, a capture or a reward that changes territory can change the answer, but checking after
  every action is simplest and cannot miss a case.
- `CONFIG.connectGrowth: 0` replays rules 6.

## Task 1: engine (rules 7)

- `src/engine/data/units.ts`: Scout sight 1. `src/engine/data/config.ts`: `connectGrowth: 1` with a rules 7 comment.
- `src/engine/types.ts`: `City.linked: boolean`; event `{ type: 'connected'; city: number; capital: number }`.
- `src/engine/state.ts` `foundCity`: `linked: capital`. Capture: reset `linked` to false for the new owner (a captured
  capital stays a capital only if the code already does that; check and keep behaviour).
- New `src/engine/connect.ts` (or in economy.ts): `isConnected(s, city)` and `payConnections(s, player, ev)`, called
  from `applyAction` after a handler succeeds. Export what the AI needs (`isConnected`) from the engine index.
- `RULES_VERSION` 7; re-pin fingerprint, speed, hash and other digest tests with reasons. Keep the provenance replay
  working with `connectGrowth: 0` and the old Scout sight if the replay needs it (follow how rules 6 did it).
- Tests (TDD), at least:
  - a road chain city to capital pays 1 growth to both, once; a second road changes nothing;
  - roads between two non-capital cities pay nothing until a road joins either one to the capital, then each city
    joined pays (the capital gets 1 per city);
  - a chain through another own city counts; a road tile inside enemy territory breaks the chain;
  - a growth bonus that fills the bar levels the city and queues its reward;
  - a captured, previously linked city pays its new owner once when connected to the new owner's capital;
  - a Scout with sight 1 on open field can step onto an unexplored tile (the pathfinder move is in legalActions),
    and with sight 2 on the same board it cannot.

## Task 2: AI lays connecting roads

- In `src/ai`, using only the AI's input: for each own unlinked non-capital city, find the cheapest chain of
  road-legal tiles (explored, field or forest, own or neutral land, no road yet) that would connect it, counting
  existing roads and own cities as free. Value a connection as worth `2 * connectGrowth` growth (it pays two cities),
  turned into the same value units the economy phase uses for harvest and buildings, divided by the chain's gold
  cost. Lay the next road tile of the best chain while its ratio clears the economy threshold (scaled by skill, as
  now). One tile per pass, re-planned after each, so the AI never commits gold to a chain it cannot finish cheaply.
- The economy comment about roads gets replaced with the new behaviour.
- Tests: a scenario where a city two tiles of field from the capital gets a road chain within a few turns at normal
  skill; no road is laid when no own city is unlinked; the AI never lays a road on a tile it has not explored.
- Census in `src/ai/sim.ts`: count connections per match and per faction, and roads laid.

## Task 3: show it

- When a `connected` event lands, the client shows it the way it shows a city level-up today (a short floating
  label over both cities, for example "Linked +1"), and the event log or announcement text names it. No sound.
- A browser or UI test that the label appears for the player's own connection and not for an unseen enemy one (same
  fog rule as other city events).

## Task 4: measure and log

- `npm run sim:ai` 100 matches hard against hard with `--swap`, and the ladder (hard/normal/easy) as in the ai-unit-mix
  log. Write `docs/superpowers/plans/2026-11-21-connected-cities-log.md` with: Spartan win share (target 40 to 60%),
  median rounds, stalls, Mongol city level-5 count and Khan's Guard / Sky Caller picks, connections per match per
  faction, Scout pathfinder steps where a Scout existed.
- If Mongol level 5 is still never reached, say so in the log with the numbers; do not tune `growthExtra` (that is
  David's call).
