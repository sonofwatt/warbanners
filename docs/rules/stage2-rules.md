# Banners: stage 2 rules (draft numbers)

Stage 2 adds heroes and new treasures to the stage 1 rules. This file covers the heroes part: deeds,
earned traits and what each player can see. Every number here is a first draft, tuned in plan 5 Task 8;
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
- This task adds only the bookkeeping. What each trait does is added in a later task.

## 3. Visibility

- Deeds are private: a player sees their own units' totals, and every enemy unit's totals read as zero.
- Traits, hero status and a carried item are public: any player who can see a unit sees these.
