# Mountains (rules 8): design and build brief

Decided by David on 2026-11-23. Branch `mountains`, from main at 0.5.0 (rules 7). `RULES_VERSION` becomes 8 and the
version 0.6.0. Not released until the balance runs are back and David has seen them.

## The rule

### Ranged units see farther from the heights

- A **ranged unit** is one whose unit type has range 2 or more (today Archer, Catapult, Horse Archer).
- A ranged unit standing on a mountain has **+1 range** for its own attacks (Archer 3, Horse Archer 3, Catapult 4).
- A shot that uses the extra tile (the target is farther than the unit's normal range) does **a little less damage**:
  the damage is multiplied by `CONFIG.mountain.longShotScale` (0.8), rounded, never below 1. Shots within the normal
  range from a mountain do full damage. The cut is applied after every other damage step (momentum does not apply to
  ranged units, but apply it last anyway), so a forecast and the result always agree.
- The bonus is for the unit's own attacks only. Its counter-attack keeps the normal reach and full damage.
- A blinded unit keeps its blinded reach (blindness wins over the mountain).
- Everything else about attacking stays: siege units (Catapult) still cannot attack after moving, so a Catapult that
  climbs shoots on a later turn.
- Ruling by the controller (cheap to change): the cut applies only to the extra-tile shot, not to every shot from a
  mountain; counters are not changed.

### Climbing costs the turn, both ways

- Today: entering a mountain uses all remaining movement and is allowed only as the first step of a unit that has not
  moved this turn. That stays.
- New: **entering a mountain ends the unit's turn**: after the step it has no movement and no attacks left and cannot
  use an ability, hunker or capture that turn.
- New: **leaving a mountain ends the unit's turn too**: a unit standing on a mountain may step off only as the first
  step of a move, before it has moved this turn; that step uses all its movement and ends its turn the same way. So no
  move passes over a mountain, and a unit cannot step down and attack in one turn.
- A unit on a mountain may still attack (or act) from it without moving, as today; after attacking it may not then
  step off if the normal rules already forbid moving after an attack. Keep whatever order rules apply today; only add
  the two turn ends.
- Roads cannot be built on mountains today, so the road cost never applies to a mountain step. Should a city stand on a
  mountain, the mountain rule takes precedence over the road and relay costs for steps onto or off that tile. Check
  whether mapgen can put a city or village on a mountain and say so in the report.
- Units that teleport, are pushed, are lured or are placed (training, rewards, camps) are not "moving": nothing
  changes for them. A unit trained in a city on a mountain (if possible) is fresh as usual.
- Mongol relay riders, the forest stop for mounted units, territory riding and any move bonus (hasten, bonusMp) never
  let a unit skip either turn end.

## Numbers

All in `CONFIG`, never inline: for example `mountain: { rangeBonus: 1, longShotScale: 0.8, endsTurn: true }`. Add an
`on` style switch only if the stage 1 provenance tests need one (as hunker did): the dormant provenance tests must
switch rules 8 off and still replay the recorded playouts.

## What changes

- **Engine** (`src/engine`): reach (`reachOf` in `combat.ts`) and attack targets; damage (the long shot cut, through the
  same function the forecast uses; export a helper through the index for the UI and AI, for example
  `longShot(s, attacker, target)`); movement (`movement.ts`: the step off a mountain only as a first step, and both
  steps end the turn); the move handler sets attacks to 0 and marks the unit as done after such a step, through
  whatever field the engine uses for "acted". Events: no new event unless the UI needs one; if it does, keep it small.
- **Tests:** +1 range on a mountain for each ranged type, none on other terrain, none for melee units on a mountain;
  the long shot cut (0.8, rounded, at least 1) and full damage within normal range; counter reach unchanged; blinded
  wins; entering ends the turn (no attack, no ability, no hunker after); leaving only as a first step and ends the
  turn; a unit that already moved cannot step onto or off a mountain; move bonuses do not skip it; the AI's plans stay
  legal. Update the provenance tests, the RULES_VERSION fingerprint test and any digests the change explains, and say
  which in the report.
- **Combat preview and highlights:** the attack highlights show the extra-range targets from a mountain, and the damage
  preview uses the same cut. The move highlights show that a mountain step ends the turn (use the existing look for a
  move that ends the turn, if there is one).
- **AI** (`src/ai`): uses the engine's reach, damage and movement (reuse, never copy). It should value a mountain tile
  for its ranged units a little (for example in its position score) and know that climbing ends the turn. Keep the
  planner change small and say what you changed. It must not get worse: run the AI tests (and `SLOW=1`); re-pin
  fingerprints and digests only where the rule change explains it.
- **UI:** a ranged unit's card on a mountain shows its range with the bonus (for example "Range 3 (mountain)"); the
  mountain tile's info says what it does now. Text in `src/ui/text.ts`. No new sound.
- **Rules docs:** `docs/rules/stage1-rules.md`: the terrain table (mountain row), the movement section, the ranged
  attack section, a new "Rules 8 changes" list and the changelog. `whatsNew` for 0.6.0 in `text.ts`: one or two plain
  sentences.
- `src/version.ts` to 0.6.0, `RULES_VERSION` to 8, and the tests that pin either.
- No em or en dashes anywhere (project CLAUDE.md). A plain hyphen is fine.
