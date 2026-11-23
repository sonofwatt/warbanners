# Banners: stage 2 rules

Stage 2 adds heroes and new treasures to the stage 1 rules. This file covers heroes (deeds,
earned traits, what traits do and what each player can see) and treasures (the draw, the Sellsword, the Battle draught). The numbers
were tuned by simulated AI-against-AI matches in plan 5 Task 8 (section 8). Section 9 is the rules 5 chain kill cost and the rules 6 level-up that ends a chain. The data files (`CONFIG.heroes` in
`src/engine/data/config.ts`, `FACTIONS`) win over this file.

## 1. Deeds

Every unit keeps four running totals, its deeds. They only grow and are never reset.

- Fight: +1 for every attack the unit makes and survives, and +2 more for every unit that attack kills
  (its target, or a unit hit by splash). A unit whose counter-attack kills its attacker also gets +2.
  An attacker that dies to the counter earns nothing.
- March: +1 for every hex of every move the unit makes itself. Being lured, and stepping into the tile of a
  unit it just killed, earn nothing.
- Survive: +1 for every hit the unit lives through: as a target, as a unit hit by splash, or as an attacker
  that takes a counter and lives. +1 when a heal ability raises its health. Resting never counts as surviving.
- Rest: +1 at the start of its owner's turn when the unit rested (did nothing on the previous turn) and
  resting actually raised its health. A garrison at full health earns nothing.

Survive and rest do not count for a fresh unit (one spawned or found last turn and not yet through its
owner's next turn start), so a new unit does not start its story by standing still.

The order within one attack: the attacker's fight, then survive for the target, then for each splashed unit
(in unit order), then for the attacker if it took a counter, then the kill for the defender if the counter
killed the attacker. Deeds are applied at the end of the action, unit by unit, each unit's in the order
fight, march, survive, rest.

## 2. Traits

Each deed earns exactly one trait when its total reaches the threshold:

| Deed | Trait | Threshold | Spartan (agoge) threshold |
| --- | --- | --- | --- |
| Fight | Fierce | 14 | 10 |
| March | Tireless | 50 | 20 |
| Survive | Hardy | 10 | 9 |
| Rest | Watchful | 8 | 6 |

- Spartan units train under the agoge and use the lower column.
- A unit holds at most 3 traits, in the order earned. It never gets a fourth.
- A unit with 2 or more traits is a hero.
- When one action takes a unit past several thresholds, its traits are granted in deed order (fight, march,
  survive, rest) until the cap.
- The Camp cannot earn traits. Its deeds still count; only the traits are withheld.
- Deeds keep counting after their trait is earned, and are never reset.
- What each trait does is in section 4.

## 3. Visibility

- Deeds are private: a player sees their own units' totals, and every enemy unit's totals read as zero.
- Traits, hero status and a carried item are public: any player who can see a unit sees these.

## 4. Trait effects

| Trait | Deed | Effect | Number |
| --- | --- | --- | --- |
| Fierce | Fight | +attack and +maximum health; the extra health is healed at once | +1 attack, +2 health |
| Tireless | March | +movement | +1 tile (2 half-points) |
| Hardy | Survive | +defence | +1 defence |
| Watchful | Rest | +sight, and agility (below) | +1 sight, counters cut by 1 |

Every unit gets these, whatever its type. A trait applies from the moment it is earned. Movement is set when
a turn starts, so Tireless shows in the next turn's movement; Fierce's health, and Watchful's sight, at once.
Every maximum health in the game is the unit's own: its type's health plus 2 if Fierce. Resting, a heal
ability and the health factor of an attack all use it, so a Fierce Warrior stands at 12 of 12 and hits at
full strength.

Agility: a counter-attack against a Watchful unit deals 1 less damage, never below 1, and only when there
is a counter. Stage 1's counter formula is `damageFor(attack * counterFactor * healthFactor, defence, 1)`
(steadfast units use their own factor); against a Watchful attacker it becomes
`max(1, damageFor(...) - 1)`.

Watchful sight is added where a unit's sight is read, so it stacks with the mountain bonus: a Watchful
unit on a mountain sees 1 + 1 + 1 tiles.

Myth touch (Spartans only): a Spartan hero with another Spartan hero of the same owner on a neighbouring
tile has +1 attack and +1 defence. It is one bonus however many hero neighbours it has, and it stacks
with the phalanx. Mongol heroes have nothing like it.

The unit's displayed numbers (`statsOf`) include traits and the faction's mounted bonus but no neighbour
bonuses (inspire, phalanx, myth touch). A Fierce Tireless Mongol Horseman is attack 5, defence 2, health 12,
move 4 tiles, sight 2, range 1.

Worked examples (a Warrior is attack 4, defence 3, health 10; all on open field, health at its maximum):

1. A Fierce Warrior (12 of 12) hits a Warrior for 8 and takes a counter of 2.
2. A Warrior hits a Hardy Warrior for 5 and takes a counter of 2.
3. A Warrior hits a Warrior, and a Watchful attacker takes 1 from the counter, not 2.
4. A Watchful Warrior attacking a Spearman takes 4 from the counter, not 5.
5. A counter of 1 against a Watchful attacker stays 1.
6. Tireless: a Warrior has 4 half-points of movement, a Mongol Horseman 8.

## 5. Treasures

Stage 2 replaces the stage 1 draw. Who may claim, the whole turn it takes and the tile being cleared are unchanged
(stage 1 section 12). The claim draws once, `rngInt(7)` over `CONFIG.treasure.table`, and the entry drawn decides:

| Roll | Outcome | What it gives | Fallback when it cannot |
|---|---|---|---|
| 0 | gold | +5 gold | none |
| 1 | explore | every tile within 4 of the claimer explored | none |
| 2 | unit | a Warrior on the first free neighbour in direction order (fresh, no home) | +5 gold |
| 3 | relic | one trait the claimer lacks, in trait order, picked by a second draw `rngInt(n)` over the n traits it lacks | +5 gold, with no second draw |
| 4 | draught | the claimer carries a Battle draught (section 7) | +5 gold |
| 5 | map | every tile within 1 of the nearest other treasure the claimer's owner has not explored (nearest by distance from the claimer, ties by key) | the explore outcome |
| 6 | mercenary | a Sellsword (section 6) on the first free neighbour | +5 gold |

The fallbacks: a relic falls back when the claimer is a Camp, already holds the most traits (3), or lacks none; a draught
when the claimer already carries one or has attack or range 0; a map when no other treasure is unexplored; a unit or
a mercenary when no neighbour is free. The `treasure` event names the outcome actually given, so a fallback shows as
`gold` or `explore`. The draw order is one `rngInt(7)` per claim, plus one more only when a relic grants a trait.

## 6. The Sellsword

A wandering fighter for hire. It comes only from a treasure (section 5), never from a city, and joins whoever claimed
it, already Tireless (so it moves 2 tiles, counted in the trait's own `heroTrait` event). It is fresh, has no home
(it counts against no city's capacity), and has no faction.

| Unit | Faction | Atk | Def | Range | Mv | HP | Sight | Cost | Needs | Traits |
|---|---|---|---|---|---|---|---|---|---|---|
| Sellsword | any | 5 | 3 | 1 | 1 | 15 | 1 | - | treasure | |

## 7. The Battle draught

A one-use ability found in a treasure (section 5). A unit carries at most one, until it is drunk or the unit dies (it
is lost with the unit). The item is public, like a trait.

- The action is `{ type: 'useItem', unit }`. It gives the unit one more attack this turn (`attacks + 1`), removes the
  draught and records a `usedItem` event.
- A draught may be drunk only on a later turn than the one it was found. A unit that captured a city or village, or
  claimed a treasure, this turn (stage 1 rule: it uses the unit's whole turn) cannot drink either, whenever the
  draught was found. The unit stores that turn (`itemTurn`, the match `stamp`), and drinking is refused with
  `not until a later turn` while it is still the current turn.
- The extra attack is for attacking only, never a second ability. A unit that drank this turn keeps one attack back
  from abilities, so an ability needs more than one attack left. A unit that used its ability and then drinks can
  attack once more but cannot use the ability again; one that drinks first can use its ability once and still attack.
- It is refused unless the unit exists (`no such unit`), is the current player's (`not your unit`), carries something
  (`nothing to use`), is not fresh (`unit is too new`), did not find it, capture or claim this turn (`not until a later turn`), has attack and range above 0, and is not a siege unit that has
  moved (`cannot attack`, for both). A malformed unit is `bad item use`.
- Drinking is not acting: it sets neither `acted` nor `moved`, so a unit that drinks and then rests still counts as
  having rested.
- The legal action list shows it right after the unit's claim entry.

## 8. Tuning

The thresholds in section 2 and the AI's draught worth were tuned by simulated AI-against-AI matches in plan 5 Task 8;
the trait sizes and the treasure table are the first draft, kept. Every run is in
`docs/superpowers/plans/2026-11-20-plan-5-tuning-log.md`. Final check on fresh seeds (normal against normal, seeds 701 to
800 in both seatings, 200 matches; ladder pairs on seeds 701 to 750 in both seat orders, 200 matches a pair):

| Measure | Target | Result |
|---|---|---|
| Matches with at least one hero | 60% to 95% | 70.5% |
| Heroes per match, both sides | 1 to 4 | 3.31 |
| First-hero side's win share | at most 65% | 58.2% |
| Spartan traits per match minus Mongol | above 0 | 0.69 (7.08 against 6.39) |
| Treasures claimed per match | at least 3 of 4 | 3.85 |
| Draughts drunk per draught found | at least 50% | 60.0% |
| Spartan share of wins | 40% to 60% | 47.3% |
| Median rounds | at most 39 | 39 |
| Stalled at 60 rounds | at most 21.5% | 15.5% |
| First-seat win share | 42% to 58% (reported) | 51.7% |
| Hard over easy | at least 80% | 75.2% (missed) |
| Normal over easy | at least 65% | 65.8% |
| Hard over normal | at least 60% | 55.5% (missed) |

## 9. Momentum (rules 7, replacing the rules 5 chain kill cost)

- A unit with the `chain` trait (the Knight and the Mongols' Khan's Guard) has momentum. It starts each of its owner's
  turns at its start value: Knight 7, Khan's Guard 8 (`CONFIG.momentum.start`). A chain unit that appears mid-turn
  (trained, a reward, a camp, a treasure) starts with its start value too. Other units have none (0, never shown).
- Every unit type has a momentum price (`CONFIG.momentum.price`). When a chain unit kills with its own attack, the kill
  costs the dead unit's price. If the price is no more than the momentum left, it is paid (the momentum goes down by
  the price) and the kill gives one more attack this turn. There is no refund.
- A chain unit may attack any legal target. If the target's price is more than the momentum left, the attack is short:
  its damage goes down by 1 for each missing point, never below 1, it gives no extra attack even if it kills, and the
  momentum left drops to 0, kill or not. The counter-attack is worked out as usual, from the target as the hit leaves it.
- The price check applies to every attack a chain unit makes, the first of the turn included; a kill on the first attack
  costs momentum too. With start values of 7 and 8 and prices of at most 4, the first attack is never short.
- If one attack kills several units (splash), only the target's kill is priced and only it can give the extra attack.
- A braced Hoplite (rules 7, phalanx trait) costs `CONFIG.momentum.bracedPrice`, 4, in place of the Hoplite's 2, and
  keeps its +2 defence against chain attackers. Bracing is judged when the attack is made, before the target can fall.
- No cost when a chain unit kills by striking back. There is no health cost any more.

| Price | Units |
|---|---|
| 0 | Scout |
| 1 | Warrior, Archer, Horseman, Spearman, Catapult, Piper, Sky Caller |
| 2 | Hoplite, Swordsman, Horse Archer, Knight, Sellsword, Camp |
| 3 | Defender, King's Guard, Khan's Guard |
| 4 | a braced Hoplite (in place of its 2) |

Example: a Knight with 7 kills three Hoplites (2 each, 1 left); a fourth Hoplite is 1 short, so that attack does 1
less damage and ends the chain. Scouts cost nothing, so a chain through a line of Scouts goes on.

- Events: after a paid kill with a price above 0 the engine emits `{ type: 'momentum', unit, spent, left }` after the
  kill's `died` and `advanced` events; the board shows "-2 momentum" (for example) over the unit in the hero tone, and
  it plays the old chain cost sound. A short attack that kills emits `{ type: 'chainEnded', unit }` after the advance,
  and the board shows "Chain ends". The unit card of a chain unit shows "Momentum 5 of 7" (for example).
- A level-up ends the chain (rules 6): if the chain unit earns a hero trait from its own attack (the deed points that
  attack earns are counted after it), it does not get the extra attack from that kill. The momentum already paid stays
  paid, and a Fierce trait still heals its new health at once. The engine emits `{ type: 'chainEnded', unit }` after the
  `heroTrait` event. `CONFIG.levelUpEndsChain` switches the rule (on).
- The prices are a draft. Before rules 7 (rules 5 and 6) each chain kill cost the unit `chainKillCost` health, 2, never
  below 1, and gave the extra attack every time; the rules 7 brace first stopped the chain outright. Momentum replaces
  both. The rules 5 number was picked by `docs/superpowers/plans/2026-11-21-knight-chain-cost-log.md`.
