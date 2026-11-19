# Plan 1 (rules engine): outcome and follow-ups

Date: 2026-11-18. Branch `plan-1-rules-engine`, commits 771bd44..8dd209f.

## Outcome

All 15 tasks built and reviewed. Final whole-branch review: ready with fixes, no
critical findings. The fixes are in and re-reviewed.

- 208 tests pass; type checks and lint are clean.
- `npm run sim -- 42` plays a random match to a finish and prints the same line
  every run.
- The engine is deterministic, refuses malformed input without throwing, and
  matches `docs/rules/stage1-rules.md`, including the worked combat examples.

## Decisions made during the build

Where the plan or the rules sheet was silent or in conflict, these were decided
by the controller. The rules sheet has been updated to match. Each is cheap to
reverse.

Rules

- A tile with a city standing on it takes no harvest, building or road.
- A road can only be laid on a tile the player has explored.
- Heal only works on a unit below full health.
- Dust storm can only be aimed where it would blind an enemy the player can see.
- Unbowed applies when striking back as well as when attacking.
- The taunt restriction and the phalanx bonus key on the phalanx trait.
- A captured city's unchosen rewards are dropped. Only factions with a tribute
  rule are paid for capturing a city.
- The Mongol discount applies to mounted units shared by all factions.
- A mountain can be entered only as the first step of a unit that has not moved.
- A unit spawned this turn is fresh until its owner's next turn: it cannot move,
  attack, use an ability, capture, be hastened, or (a Camp) train.
- A city sees a hidden unit standing on its own tile, not only next to it.
- Asking for a lure where none can apply is accepted and has no effect.

Engineering

- Every lookup keyed by a value from an action uses an own-property check, so
  names such as `constructor` and `__proto__` are refused.
- Commit trailers name the model that wrote each commit. The first three engine
  commits carry a Fable trailer though Sonnet wrote them; history was left alone.
- The work was done on a branch in the same checkout, not a separate worktree.

## Carry into later plans

Plan 2 (the game on screen)

- `playerView` shows the live state of tiles and cities the player has explored
  but cannot currently see (an unseen enemy city's level, an unseen new road).
  Decide whether the view should remember only what was last seen.
- Moves that are blocked or stopped by an unseen enemy reveal that enemy through
  the list of legal moves. Decide whether that is acceptable.
- The public data tables are mutable. Freeze them before UI code can touch them.

Plan 3 (AI and tuning)

- There is no turn limit or draw. Random play often runs 120 turns with no
  winner. The AI plan needs a way to end stalled matches in simulations.
- `applyAction` clones the whole state before a handler can refuse. Fine now;
  look at it if the AI probes many actions per turn.
- A lure can pull an enemy onto the Mongol player's own city or a village, which
  that unit may then capture on its next turn. This follows the rules as written.
  Watch for it in simulated matches.
- A Mongol rider with points left can enter a forest that another faction's
  rider with the same points cannot. This follows the rules as written, though
  the design says forests slow Mongols more. Tune if it matters.

Plan 4 (live online play)

- The state relies on `null` fields and empty arrays. Firebase Realtime Database
  drops both. Store snapshots and actions as JSON strings, or the hash will
  change and checks such as `cityId === null` will break.
- Actions carry no player id: whoever appends acts as the current player. The
  database rules must enforce who may append.
- Resigning does not pass the turn. Correct for two players, wrong for more
  (stage 4 of the design).

## Test backlog (none blocks merging)

- The completeness test never reaches attack, lure or ability candidates at 20 to
  40 random actions. Run its check on the ability-soak states too (about ten
  lines).
- The "every ability at least once" check relies on counts filled by earlier
  tests in the same file, so it fails when run alone with a name filter.
- Map generation's fallback after 50 failed attempts has no test (never reached
  in 3,000 seeds).
- `scripts/sim.ts` carries its own copy of the random number generator with no
  test tying it to the engine's.
- Smaller gaps noted by task reviewers: walls and enemy-city branches of cover,
  a blinded defender's counter range, harvesting game, the lumber camp, skipping
  a dead player at end of turn, sort order of ability targets.
- The suite takes about 20 seconds, most of it the ability soak.
