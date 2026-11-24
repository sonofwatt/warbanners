# Rules 8 additions: sight, Mongol riding, hunker (build brief)

Decided by David on 2026-11-23. Branch `mountains` (rules 8, 0.6.0, not released), on top of the mountains build
(6c61512). RULES_VERSION stays 8: these join the same rules version. Every number in `CONFIG` or the faction and unit
tables, never inline. No em or en dashes anywhere (project CLAUDE.md).

## 1. City vision is territory only

- `CONFIG.citySightExtra` becomes 0: a city sees its territory radius and nothing beyond.

## 2. The Scout loses pathfinder, gets sight 2

- Remove `pathfinder` from the Scout's traits in `src/engine/data/units.ts` and set its sight to 2.
- Leave the pathfinder code in place (it is dormant with no unit carrying the trait), but remove any UI text, tutorial
  or tech-tree line that promises the Scout steps into the fog. The `moveEnds` mark stays (mountains use it).
- `noCityCapture` and `hidden` stay; the Scout still captures villages.

## 3. Mongol riding: own territory rides like a road, mounted units only

- Today `relayRiders` gives every Mongol unit the relay cost (`CONFIG.relayCost`, a road's cost) for any step onto a
  tile in Mongol territory, and mounted Mongols also get `mountedMoveBonus: 1` (a half-point) through
  `territoryRiding`.
- New rule: only **mounted** Mongol units get the relay cost. It applies to any step whose destination tile lies in
  their own territory, whether the move started there or is passing through (this is what the code already does for
  the destination test; only the mounted limit is new). Foot units pay normal terrain costs (or a road, where one was
  built before; see below).
- Remove the extra half-point: Mongol `mountedMoveBonus: 0`. Leave `territoryRiding` and `ridingBonus` code working
  (they give 0 now); set the flag to false if that is cleaner, and keep the tests that cover the mechanism by driving
  it with a mock faction, as the provenance tests do.
- Suggested shape: a faction field such as `relayMountedOnly: true` (or make `relayRiders` take `'mounted'`), so the
  stage 1 provenance tests can still replay the old rule.
- The mountain rule still wins over the relay cost (it is checked first today; keep it so).
- **Mongols cannot build roads.** Add a faction flag (for example `canBuildRoads: false` for Mongols, true for
  Spartans) checked in `roadRefusal` (economy.ts), so the road action is never offered or accepted for them. The
  `roads` tech stays in their tree, because it leads to chivalry and unlocks the Camp; change the tech's text for
  Mongols so it no longer says it builds roads (say what it unlocks for them). Roads already on the map, built by
  anyone, keep working for every unit as today.
- Mongol mounted units still stop in forests (`forestStopsMounted`); unchanged.

## 4. Hunker heals at the end of its owner's turn

- Today a unit that did nothing on its owner's turn (`rested`) heals at the start of its owner's next turn
  (`passTurn`), and a hunkered unit gets `restBonus` on top (or the beside-enemy share).
- New: a unit that is **hunkered when its owner ends the turn** heals right then, at the end of that turn, by
  `restHealAt` as it is worked out at that moment (same bonus and same beside-enemy share), capped at its max health.
  It then gets no resting heal at the start of its owner's next turn for that same turn, so it never heals twice. Units
  that rest without hunkering heal as today, at the start of the next turn.
- The heal happens in the end-turn step for the ending player, before the turn passes, with the same "work every heal
  out before applying any" pattern `passTurn` uses. It counts as a rest for deeds as today (a heal that adds health,
  never a fresh unit's). Use the existing heal event, or the smallest new one the UI needs to show the number.
- Hunker stays allowed only for a unit that has done nothing yet this turn (today's `hunkerRefusal`: not moved, not
  acted, not drunk). Keep it exactly so.
- Hunker needs a `CONFIG.hunker` switch for the timing (for example `healAtTurnEnd: true`) so the rules 7 provenance
  playouts still replay with it off.
- The AI: wherever it forecasts a hunkered unit's health for the enemy's coming turn (danger, garrison choice), it
  should now count the heal as already in. Reuse `restHealAt`; keep the change small and say what you changed.
- UI: the hunker button's help text and the unit card say the unit heals at the end of the turn.

## 5. Climbing must be researched

Added by David on 2026-11-23, during the build.

- A unit may step onto a mountain only if its owner has researched `CONFIG.mountain.tech` (a TechId; set it to
  'bronze', the tech that already builds mines on mountains; David may change it, so read it only from CONFIG, never
  inline). Without it, a mountain is not enterable for that player's units: not by a move, and not by a kill advance
  (the attack still happens, the attacker just does not advance). Stepping off a mountain needs no tech. Pushes, lures
  and placements are unchanged as in the mountains brief.
- Needs a switch (null = no tech needed) so the provenance tests can replay.
- AI: it uses the engine's reach, so it should simply follow; check its plans stay legal and that it does not value
  mountain tiles it cannot enter.
- UI: the move highlights follow the engine; the mountain tile info and the Bronze tech's card say it lets units climb
  mountains.
- Docs: terrain table, tech table, Rules 8 changes list, whatsNew.
- Tests: refused without the tech, allowed with it, kill advance does not climb without it, stepping off still
  allowed.

## Docs and text

- `docs/rules/stage1-rules.md`: city sight, the Scout's row and traits, the Mongol faction section (relay riders now
  mounted only, no riding bonus, no roads), the hunker section, and the "Rules 8 changes" list. Update the stage 2
  rules file if it mentions any of these.
- `whatsNew` for 0.6.0 in `src/ui/text.ts`: add these in one or two plain sentences next to the mountain sentence.

## Tests

- City sight: a city sees its territory radius, not one more.
- Scout: sight 2, no pathfinder; it cannot step onto an unexplored tile.
- Mongol mounted unit: relay cost onto own territory tiles, starting inside or passing through; normal costs outside;
  no half-point bonus. Mongol foot unit: normal terrain costs in own territory. Mountain rule still wins.
- Roads: a Mongol road action is refused and never listed in legal actions; Spartans still build roads; an existing
  road still works for a Mongol unit.
- Hunker: heals at end of turn by the right amount (own land, enemy land, neutral, beside a seen enemy), never twice;
  a rested unit without hunker still heals at the start of the next turn; the timing switch off replays rules 7.
- Run the full suite (one heavy suite at a time), `SLOW=1` for the AI, and re-pin the RULES_VERSION 8 fingerprint,
  digests, `KNOWN_NORMAL` and ADAPT_SEEDS only where this change explains it. Say which in the report.
