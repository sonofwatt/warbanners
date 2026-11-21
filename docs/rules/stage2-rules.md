# Banners: stage 2 rules (draft numbers)

Stage 2 adds heroes and new treasures to the stage 1 rules. This file covers heroes (deeds,
earned traits, what traits do and what each player can see) and treasures (the draw, the Sellsword, the Battle draught). Every number here is a first draft, tuned in plan 5 Task 8;
the data files (`CONFIG.heroes` in `src/engine/data/config.ts`, `FACTIONS`) win over this file.

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
| Fight | Fierce | 6 | 4 |
| March | Tireless | 15 | 10 |
| Survive | Hardy | 5 | 4 |
| Rest | Watchful | 5 | 4 |

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
- It is refused unless the unit exists (`no such unit`), is the current player's (`not your unit`), carries something
  (`nothing to use`), is not fresh (`unit is too new`), has attack and range above 0, and is not a siege unit that has
  moved (`cannot attack`, for both). A malformed unit is `bad item use`.
- Drinking is not acting: it sets neither `acted` nor `moved`, so a unit that drinks and then rests still counts as
  having rested.
- The legal action list shows it right after the unit's claim entry.
