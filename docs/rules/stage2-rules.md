# Banners: stage 2 rules (draft numbers)

Stage 2 adds heroes and new treasures to the stage 1 rules. This file covers the heroes part: deeds,
earned traits, what traits do and what each player can see. Every number here is a first draft, tuned in plan 5 Task 8;
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
