# Banners: stage 1 rules (draft numbers)

Stage 2 (heroes and treasures) adds to these rules: see `stage2-rules.md`.

This is the builder's draft of the rules the design leaves open. Every number here
is a first guess, written fresh for this game, to be tuned by simulated matches in
plan 3. The engine reads all of it from data files, so tuning never touches code.

If this file and the engine's data files disagree, the data files are wrong.

## 1. Board

- Pointy-top hexes in axial coordinates `(q, r)`. A tile's key is the string `"q,r"`.
- The six directions, in this order everywhere: `(1,0) (1,-1) (0,-1) (-1,0) (-1,1) (0,1)`.
- Distance between two tiles: `(|dq| + |dr| + |dq + dr|) / 2`.
- Stage 1 map: every tile within distance 6 of `(0,0)`. That is 127 tiles.
- The map is point-symmetric: whatever is on `(q, r)` is also on `(-q, -r)`.
- Capitals: player 0 at `(-2, 5)`, player 1 at `(2, -5)`. They are 10 tiles apart.

## 2. Terrain

| Terrain | Enter cost (half-points) | Cover | Notes |
|---|---|---|---|
| Field | 2 | 1 | |
| Forest | 4 | 1.25 | |
| Mountain | all remaining, only as the first step of a unit that has not moved this turn; ends the unit's turn (rules 8). Since rules 8 only a player who has researched `bronze` (`CONFIG.mountain.tech`) may step onto one | 1.5 | A unit standing here sees 1 tile farther. A ranged unit here shoots 1 tile farther (section 10). Stepping off is also a first step only and ends the turn (section 9), and needs no tech |
| Water | cannot enter | | Ships arrive in stage 4 |
| Road to road | 1 | | Both the tile left and the tile entered have a road or a city |
| City tile | 2 | 1.5 (2 with Walls, 2 for a Spartan city) | Cover applies to the owner's unit only |

A unit with movement `M` has `2M` half-points each turn (a mounted Mongol unit 1 more:
see 13). A unit that has not moved
yet this turn may always enter one adjacent enterable tile, whatever it costs.

## 3. Map generation

Seeded and deterministic. Work on the half `H` = tiles with `r > 0`, or `r = 0` and
`q < 0`. Everything placed on a tile in `H` is copied to its mirror `(-q, -r)`. The
centre `(0,0)` is always a plain field.

1. Terrain for each tile of `H`, in `range` order, from `rngInt(100)`:
   under 50 field, under 72 forest, under 86 mountain, otherwise water.
2. The capital tile is a field. Water next to a capital becomes field.
3. Resource for each tile of `H` from `rngInt(100)`: field under 20 orchard, under 40
   cropland; forest under 30 game; mountain under 40 ore; otherwise none.
4. Villages: 3 in `H` (6 on the map). Candidates are field or forest tiles of `H` at
   least 3 from both capitals. Shuffle them, then take each one that is at least 3
   from every village already chosen and from every mirrored village. A village
   tile becomes a field with no resource.
5. Treasures: 2 in `H` (4 on the map), chosen the same way from tiles at least 3
   from both capitals and at least 2 from every village and treasure.
6. Check: from capital 0, walking over non-water tiles, capital 1 and every village
   and treasure must be reachable. If not, try again with attempt number + 1. The
   seed for attempt `n` is `(seed + n * 0x9E3779B9) >>> 0`. After 50 failed attempts
   use a map of plain fields with villages and treasures placed by the same steps.

## 4. Start of a match

- Each player: their capital (level 1, territory radius 1), one starting unit on
  the capital tile, their faction's starting tech.
- The first player starts with 10 gold and the second with 12 (both 10 before rules 7).
- Each player has explored whatever their capital and starting unit can see.

## 5. Turn

Players alternate. On your turn, in any order and any number of times while legal:
move, attack, use an ability, hunker (since rules 7, see 11), capture, claim a
treasure, train, harvest, build, lay a road, build walls, research, choose a city
reward. Then end the turn.

At the start of each of your turns except your first: you are paid income, and your
units that did nothing at all on your previous turn heal (see Resting in 11). Then
every unit of yours gets its movement and attacks back.

At the end of your turn: any city reward you have not chosen takes its first
option, and statuses on your units (taunted, blinded) wear off.

## 6. Gold, cities and growth

- Income per city each turn: its level, +1 if it is a capital, +1 per "income"
  reward taken, +2 if it has a Market.
- A city's territory is every tile within its radius (1, or 2 after the "borders"
  reward) that no other city already claims.
- Growth points come from harvesting and buildings in the city's territory.
- To go from level `L` to `L+1` a city needs `L+1` growth points (`L+2` for a
  Mongol city, `L` for a Spartan city since rules 7). Spare points carry over.
- Connected cities (since rules 7): a city is connected when a chain of adjacent
  tiles joins it to its owner's capital, every tile of the chain being a road or
  a city of that owner. A road inside another player's territory breaks the
  chain; a road in unclaimed land does not. The first time a city is connected,
  it and the capital each get +1 growth point (which can level either city, with
  its reward as usual). This happens once per city for each owner: a connection
  is never taken back, a second road changes nothing, and each capture lets the
  city pay its new owner once more (a player who retakes a city can earn it again). A player has at most one capital, and a city connects
  only to its owner's capital; the capital never earns the bonus for itself, and
  a player without a capital earns none. It is checked after each action, for
  the player who acted.
- Unit capacity: level + 1, +2 per "barracks" reward. Only units trained by the
  city (or by a Camp on its behalf) count, plus the starting unit for the
  capital. A unit that captures a village or a city counts against that city from
  then on, and no longer against the one it came from (see 12). Champions and
  supports from rewards, and units from treasures, do not count.

Rewards (pick one of two at each new level):

| New level | Option 0 | Option 1 |
|---|---|---|
| 2 | `gold`: +6 gold | `scout`: explore every tile within 3 of the city |
| 3 | `borders`: territory radius becomes 2 | `barracks`: +2 unit capacity |
| 4 | `income`: +1 income for this city | `growth`: +2 growth points now |
| 5 and every level after | `champion`: the faction's champion appears | `support`: the faction's support appears |

A reward unit appears on the city tile, or if that is occupied on the first free
enterable neighbour in direction order. If there is nowhere, the reward becomes
+6 gold.

Things you can do on a tile in your territory (one building per tile):

| Action | Needs | Cost | Growth |
|---|---|---|---|
| Harvest orchard | tech `foraging` | 2 | +1, the orchard is used up |
| Harvest game | tech `hunting` | 2 | +1, the game is used up |
| Build Farm on cropland | tech `farming` | 5 | +2 |
| Build Lumber camp on a forest tile with no resource | tech `forestry` | 4 (3 before rules 7) | +2 (+1 before rules 7) |
| Build Mine on ore | tech `bronze` | 5 | +2 |
| Build Market on a field with no resource, one per city | tech `markets` | 6 | +2 (+1 before rules 7), and +2 income |
| Build Walls (the city itself, not Spartans) | tech `shieldwork` | 6 | none |
| Road, on any field or forest tile that is yours or unclaimed (not Mongols, since rules 8) | tech `roads` | 1 | none |

A tile with a city standing on it takes no harvest, no building and no road.
A road can only be laid on a tile you have explored.

## 7. Tech

Price: base + (number of cities you hold - 1) * tier. Base is 4, 6, 8 for tiers 1, 2, 3.
A tech needs the one before it in its branch.

| Branch | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| Fields | `foraging`: harvest orchards | `farming`: Farm | `markets`: Market |
| Riding | `riding`: Horseman, Horse Archer | `roads`: roads (Spartans), the Camp (Mongols) | `chivalry`: Knight |
| Forest | `hunting`: harvest game, Archer | `forestry`: Lumber camp | `engineering`: Catapult |
| Mountain | `bronze`: Mine, Spearman, Hoplite, climbing mountains (rules 8) | `shieldwork`: Defender, Walls | `smithing`: Swordsman |

## 8. Units

`Mv` is movement in tiles. Cost in gold. A dash in the cost column means the unit
only comes from a city reward.

| Unit | Faction | Atk | Def | Range | Mv | HP | Sight | Cost | Needs | Traits |
|---|---|---|---|---|---|---|---|---|---|---|
| Warrior | any | 4 | 3 | 1 | 1 | 10 | 1 | 2 | | |
| Spearman | any | 4 | 4 | 1 | 1 | 10 | 1 | 3 | bronze | steadfast |
| Swordsman | any | 5 | 4 | 1 | 1 | 15 | 1 | 5 | smithing | doubleStrike |
| Defender | any | 2 | 9 | 1 | 1 | 20 | 1 | 3 | shieldwork | |
| Archer | any | 4 | 2 | 2 | 1 | 10 | 2 | 3 | hunting | |
| Horseman | any | 4 | 2 | 1 | 2 | 10 | 2 | 3 | riding | retreat, mounted |
| Knight | any | 6 | 3 | 1 | 3 | 15 | 2 | 6 | chivalry | chain, mounted |
| Catapult | any | 6 | 1 | 3 | 1 | 10 | 1 | 6 | engineering | splash, siege |
| Hoplite | Spartans | 4 | 5 | 1 | 1 | 15 | 1 | 3 | bronze | steadfast, phalanx |
| King's Guard | Spartans | 6 | 6 | 1 | 1 | 20 | 2 | - | reward | unbowed |
| Piper | Spartans | 2 | 3 | 1 | 1 | 10 | 2 | - | reward | heal, steady, taunt |
| Krypteia Scout | Spartans | 2 | 1 | 1 | 2 | 5 | 2 | 2 | | hidden, noCityCapture |
| Horse Archer | Mongols | 3 | 2 | 2 | 2 | 10 | 2 | 5 | riding | retreat, mounted |
| Khan's Guard | Mongols | 6 | 4 | 1 | 3 | 20 | 2 | - | reward | chain, inspire, mounted |
| Sky Caller | Mongols | 2 | 2 | 1 | 2 | 10 | 2 | - | reward | heal, hasten, dustStorm, mounted |
| Camp | Mongols | 0 | 3 | 0 | 1 | 15 | 1 | 6 | roads | camp |

Starting unit: Spartans a Krypteia Scout, Mongols a Horseman.

The Krypteia Scout's sight is 2 and it has no `pathfinder` since rules 8 (rules 7:
sight 1 and `pathfinder`, so it could step into the fog; 3 and no fog rule before).
It never ends a move on an unexplored tile, like every other unit.

The Sellsword joins only from a treasure: see stage 2 (`stage2-rules.md` section 6).

## 9. Movement

- One unit per tile. You may pass through your own units but not stop on them. You
  may not enter a tile holding an enemy unit.
- Engagement: entering a tile next to an enemy unit uses up the rest of the move.
- The fog (since rules 6): a move never passes through a tile its owner had not
  explored when the move began, and an ordinary unit never ends a move on one
  either. Moving still reveals what the unit now sees, so exploring means walking to
  the edge of the white fog and looking. Only a unit with `pathfinder` (no unit
  since rules 8; the Krypteia Scout in rules 6 and 7) may end a move on one unexplored tile, as the last tile of the move. Its
  owner explores what it now sees, and its turn ends there: it keeps no movement and
  may not attack, use an ability or drink a draught this turn, even with movement
  left. Costs, engagement, forest, mountain, roads and relay riders apply as usual.
  (Rules 3 to 5 let any unit end a move on one unexplored tile, and let a mounted
  Mongol keep moving after it.)
- Mountains (since rules 8): a unit may step onto a mountain only if its owner has
  researched `bronze` (`CONFIG.mountain.tech`; without it a mountain is closed to
  that player's units, for moves and kill advances alike). Stepping off needs no
  tech. A step onto a mountain uses all the movement left and
  is allowed only as the first step of a unit that has not moved this turn (as
  before), and a step off a mountain is allowed only the same way: as the first step
  of a unit that has not moved this turn, for all its movement. Either step ends the
  unit's turn: it has no movement and no attacks left, and may not use an ability,
  hunker, capture, claim a treasure or drink a draught this turn. So no move passes
  over a mountain, and a unit cannot step down and attack in one turn. Nothing lets
  it skip this: not roads, relay riders, riding by territory, the forest rule for
  mounted units, a bonus or haste (a unit whose turn ended this way cannot be
  hastened). A unit on a mountain may still attack or act from it without moving;
  one with `retreat` may then step off, which ends its turn. Units placed, pushed or
  lured onto or off a mountain are not moving: nothing changes for them. Mapgen never
  puts a capital, village, city or treasure on a mountain, and roads cannot be built
  on one.
- After attacking, a unit cannot move, unless it has `retreat`, which keeps
  whatever movement it had left.
- A unit trained or spawned this turn is fresh until its owner's next turn starts:
  it cannot move, attack, use an ability, capture, be hastened, or (a Camp) train.
- Stepping onto a treasure does not collect it: it is claimed later (see 12).

## 10. Combat

Only `+ - * /`, `Math.round`, `Math.min` and `Math.max` are used, so every phone
gets the same answer.

```
effAtk  = atk * (hp + maxHp) / (2 * maxHp)        (unbowed: effAtk = atk)
damage  = max(1, round(2.5 * effAtk * effAtk / (effAtk + def * cover)))
```

`cover` is the defender's terrain cover from section 2. `atk` and `def` include any
bonuses (phalanx, inspire).

If the defender survives, has attack above 0, has no `siege` trait, and the
attacker is within the defender's range, it strikes back:

```
cAtk    = atk * f * (hp + maxHp) / (2 * maxHp)    (hp after the hit; f = 0.75, or 1.25 with steadfast)
counter = max(1, round(2.5 * cAtk * cAtk / (cAtk + attackerDef)))   (the attacker gets no cover)
```

A unit at 0 health is removed. When an attacker with range 1 kills the defender, it
moves into the defender's tile. The step costs no movement and changes nothing else:
the attacker still cannot move after attacking unless it has `retreat`, a Knight's
`chain` attack is made from the new tile, and the step counts as entering the tile
this turn (so it cannot capture or claim a treasure there until a later turn).
Attackers with range 2 or more never move in, and neither does anyone for a unit
killed by splash. Since rules 8 an advance onto or off a mountain ends the attacker's
turn as a climb does (no chain attack and no retreat move after it); the kill still
counts.

Ranged units on a mountain (since rules 8): a unit whose type has range 2 or more
(Archer, Horse Archer, Catapult) has +1 range for its own attacks while it stands on
a mountain (Archer 3, Horse Archer 3, Catapult 4). A shot at a target farther than
its normal range (a long shot) does less damage: after every other step, including
the momentum cut,

```
damage  = max(1, round(damage * 0.8))            (long shot only)
```

Shots within the normal range from a mountain do full damage. A blinded unit keeps
its blinded reach. The counter-attack keeps the normal range and full damage, so a
unit on a mountain never strikes back at the extra tile. A Catapult still cannot
attack after moving, so one that climbs shoots on a later turn. Splash from a long
shot is half the cut damage.

Worked examples (all at full health on a field unless said):

| Attack | Damage | Counter |
|---|---|---|
| Warrior on Warrior | 6 | 2 |
| Warrior on Warrior in forest | 5 | |
| Warrior on Warrior in a city | 5 | |
| Warrior on Warrior in a Spartan city | 4 | |
| Warrior on Defender | 3 | 1 |
| Warrior on Spearman | 5 | 5 |
| Warrior at 5 health on Warrior | 4 | |
| Knight on Warrior | 10 (kills it) | |
| Catapult on Warrior | 10 (kills it) | none; neighbours take 5 |
| Warrior on Hoplite with two Hoplites beside it, in a Spartan city | 2 | |
| King's Guard at 5 health on Warrior | 10 (kills it) | |

## 11. Traits and abilities

| Trait | Effect |
|---|---|
| steadfast | Counter-attack factor 1.25 in place of 0.75 |
| doubleStrike | Two attacks per turn |
| retreat | Keeps its remaining movement after attacking |
| chain | Each kill gives one more attack this turn, except a kill whose advance steps onto or off a mountain, which ends the turn (rules 8). Since rules 7 the unit has momentum (Knight 7, Khan's Guard 8 at the start of each of its owner's turns): each kill costs the dead unit's price, and only a kill it can pay for gives the extra attack; an attack it cannot pay for does 1 less damage per missing point (at least 1) and ends the chain. See stage2-rules.md, section 9 (rules 5 to 6: each kill cost 2 health instead) |
| splash | Enemy units next to the target take half the damage dealt to the target, rounded, at least 1. No counter from them |
| siege | Cannot attack on a turn it has moved, cannot move after attacking, never counter-attacks |
| mounted | A tag other rules refer to |
| phalanx | +1 defence for each friendly Hoplite next to it, at most +2. Since rules 7 a Hoplite with at least two friendly Hoplites next to it is braced: +2 more defence when a chain unit (Knight, Khan's Guard) attacks it (added with the hunker bonus, before cover multiplies; never on its counter or its own attacks), and a chain unit pays a momentum price of 4 to kill it in place of the Hoplite's 2 (stage2-rules.md, section 9; the brace no longer stops the chain by itself). Bracing is judged when the attack is made |
| unbowed | Attack is not reduced by lost health, when attacking and when striking back |
| hidden | Enemies see it only from a tile next to it (their unit or their city) |
| noCityCapture | Cannot capture an enemy city (villages are still allowed) |
| steady | Friendly units next to it cannot be lured |
| inspire | Friendly mounted units next to it have +1 attack |
| camp | Cannot attack. May train units (see 13) |
| pathfinder | May end a move on one unexplored tile, which ends its turn (see 9). No unit has it since rules 8 |

Abilities are actions that use up the unit's attack for the turn (and its movement,
as an attack would):

| Ability | Unit | Target | Effect |
|---|---|---|---|
| heal | Piper, Sky Caller | a friendly unit next to it that is below full health | +4 health, up to its maximum |
| taunt | Piper | an enemy unit within 2 | Taunted until the end of its owner's next turn. While taunted, if any enemy unit with the phalanx trait (the Hoplite) is within its range it may attack only such units |
| hasten | Sky Caller | a friendly mounted unit next to it | +2 half-points of movement this turn |
| dustStorm | Sky Caller | a tile within 2 with at least one enemy unit you can see on it or next to it | Enemy units on that tile or next to it are blinded until the end of their owner's next turn: they give no vision and cannot attack beyond distance 1 |

Hunker (since rules 7): an action, like an ability but for any unit except one with
the `siege` trait (the Catapult never hunkers). A unit may hunker only if it has not
moved, attacked, used an ability, captured, claimed a treasure or drunk a draught
this turn, was not trained this turn, and is not hunkered already. Hunkering uses up
its movement and attacks for the turn, but it is not doing something for resting:
a unit that only hunkered still rests. A hunkered unit stays hunkered over later
turns until it takes an action of its own (moves, attacks, uses an ability,
captures, claims a treasure, drinks a draught, or a Camp trains), or a lure pulls it
off its tile. Being attacked, striking back, being healed, taunted or blinded do not
end it. While hunkered:

- When it is attacked it has +1 defence, added before cover (`(def + 1) * cover`).
  It gets nothing when it attacks, and attacking ends it first, so the counter it
  takes is worked out without the bonus.
- Its resting heal is 1 more (see Resting), and it still heals with a seen enemy
  next to it.
- Since rules 8 it heals at the end of its owner's turn, not at the start of the
  next: a unit that is hunkered when its owner ends the turn heals then, by the
  resting heal as it stands at that moment (its land, the extra 1, and the share
  with a seen enemy next to it), up to its maximum. It then gets no resting heal
  when its owner's next turn starts, so it never heals twice for one turn. A heal
  that adds health counts as a rest for deeds. Units that rest without hunkering
  heal as before, at the start of the next turn. (`CONFIG.hunker.healAtTurnEnd`.)
- A Heal on it gives 1 more: +5 health, up to its maximum.

Both players see that a unit is hunkered (a shield beside its health on the board).
The numbers are `CONFIG.hunker`.

Resting: a unit that did nothing at all on its owner's previous turn heals at the
start of the next turn: 4 if it stands in its owner's territory, 2 on land no city
claims, 1 in an enemy's territory, and nothing while an enemy unit its owner can
see (section 14) stands on a tile next to it. An enemy its owner cannot see changes
nothing. Hunkering does not count as doing something. A hunkered unit heals 1 more
(5, 3 and 2), and with a seen enemy next to it still heals half the regular heal,
rounded up and without the extra 1: 2, 1 and 1.

## 12. Treasures, capture, winning

- Treasure: a unit standing on a treasure may claim it if it entered that tile on an
  earlier turn and has not moved or attacked this turn (so it must still be there
  when its owner's turn starts). Claiming uses the unit's whole turn. Either
  player's units may claim it; the first to claim takes it. The tile's treasure is
  removed and `rngInt(3)` decides: 0 gives +5 gold; 1 explores every tile within 4;
  2 gives a Warrior on the first free enterable neighbour in direction order (or +5
  gold if there is none). Stage 2 replaces the draw: see `stage2-rules.md` section 5.
- Capture: a unit standing on a village or an enemy city may capture it (a unit with
  `noCityCapture`, the Krypteia Scout, may take a village but never a city) if it
  entered that tile on an earlier turn and has not moved or attacked this turn. It
  uses the unit's whole turn. A village becomes a level 1 city of the captor. An
  enemy city changes owner and keeps its level, buildings and territory; units it
  had trained no longer count against it. The captor counts against the captured
  city from then on (even past its capacity, which only limits training), and no
  longer against its old city; a captor that counted against no city still does
  not. Any city reward its previous owner had
  not yet chosen is dropped. City tribute is paid only by factions that have a
  tribute rule.
- Captured capitals (since rules 7): a captured capital becomes an ordinary city
  for its captor (no capital income, no capital banner), and it can earn the
  connection bonus (see 6) for its new owner like any other city. If the player
  who lost it still has cities, one of them becomes their capital at once: the
  highest level, then the most growth points toward the next level, then the
  nearest (hex distance) to the lost capital's tile, then the lowest city id. The
  new capital counts as connected. Cities that already earned the bonus keep it
  and earn nothing more; the others can now connect to the new capital. Before
  rules 7 a captured capital stayed a capital, so a player could hold two.
- A player with no cities is eliminated and their units are removed. The last
  player left wins. Either player may resign at any time, on their own turn or the other's; resigning eliminates them.

## 13. Faction rules

Spartans

- Start with `bronze`.
- A Spartan city needs 1 less growth point to level up (since rules 7): `L` to go
  from level `L` to `L+1`.
- A Spartan unit standing in a Spartan city has cover 2. Spartans cannot build Walls.
- Units: Hoplite, King's Guard (champion), Piper (support), Krypteia Scout.

Mongols

- Start with `riding`.
- Mounted units shared by all factions (Horseman and Knight) cost 1 less.
- Riding by territory (rules 6 and 7; gone since rules 8, when the extra half-point is
  0). Mounted Mongol units had 1 extra half-point of
  movement (before rules 6, a whole tile): a Horseman has 5 half-points, so 2 field
  tiles with one half-point left, which buys one more tile only where a tile costs 1
  (a road, or relay riders in Mongol territory): 5 road tiles. Territory is the city
  whose land a tile lies in, and that city's owner. Best in Mongol land, then neutral
  land, and in enemy land the same as anyone:
  - Mongol territory: relay riders (below) and the extra half-point.
  - Neutral land (no city's territory): the extra half-point, normal costs.
  - A move that starts in enemy territory: normal costs and no extra half-point.
  The extra half-point may be spent only on a move that starts in Mongol or neutral
  land. Movement spent earlier in the turn comes out of it first, so a move that
  starts in enemy territory loses it only while it is still unspent, and what that
  move leaves is all the unit has. A hastened unit keeps its haste. The same costs
  apply to the move a `retreat` unit makes after attacking.
- Entering a forest costs mounted Mongol units the normal forest cost and then uses
  up the rest of their move.
- Relay riders: for mounted Mongol units (since rules 8; every Mongol unit before),
  entering any tile inside Mongol territory costs 1 half-point, the cost of a road,
  whether the move started inside it or is riding in. Mongol foot units pay the
  normal terrain costs there (or a road's, where a road is). The mountain rule
  (section 9) still comes first.
- Mongols build no roads (since rules 8). They still research `roads`, which opens
  the Camp and leads to `chivalry`. Roads already on the map, built by anyone, work
  for every unit.
- Tribute: capturing a village pays 3 gold, capturing a city pays 3 + its level.
- Mongol cities need `L+2` growth points to leave level `L`.
- Feigned retreat (lure): when a Mongol unit with `retreat` attacks, the player may
  ask for a lure. If the target survives, is not steadied, and is not in a city,
  then when the attacker next moves this turn the target is pulled one tile toward
  the tile the attacker left: onto that tile itself for an attack from distance 1,
  or onto the tile between them for distance 2 (the first shared neighbour in
  direction order that is free and enterable). If no such tile is free, nothing
  happens. Asking for a lure where none can apply is allowed and simply has no
  effect. On the client, a second tap on the same enemy while the lure choice is
  showing makes the plain attack (no lure).
- The Camp: on its turn, if it has not moved, it may train one unit per turn onto a
  free enterable tile next to it. The unit counts against the Mongol city with the
  most free capacity (lowest id on a tie). If no city has room it cannot train.
- Units: Horse Archer, Khan's Guard (champion), Sky Caller (support), Camp.

## 14. Vision

- A player sees every tile within `sight` of each of their units (one more from a
  mountain) and every tile within their cities' territory radius (radius + 1 before
  rules 8).
- Seen tiles stay explored for the rest of the match.
- An explored tile is shown as it is now, not as it was when last seen: its
  terrain, resource, building, road, and any city on it with that city's owner,
  level and walls. Decided by David, 2026-11-18. Units are the exception, below.
- Enemy units are known only while on a tile the player currently sees, and
  `hidden` ones only from next to them, or from a city they are standing on or
  next to.
- You can only attack or target a unit you currently see. A unit whose range is
  longer than its sight (the Catapult) needs another unit to spot for it.

## Rules 7 changes

- Connected cities: the first time roads join a city to its owner's capital, both
  gain 1 growth (section 6).
- A captured capital is an ordinary city for its captor, and the loser's best city
  becomes their capital (section 12).
- Lumber camp costs 4 and gives 2 growth, a Market gives 2 growth (section 6).
- The Krypteia Scout's sight is 1 (section 8).
- Hunker, a unit action for defence and healing (section 11).
- Phalanx brace: a Hoplite with two friendly Hoplites beside it has +2 defence
  against chain attackers, and costs a chain unit 4 momentum to kill (traits table).
- Momentum replaces the rules 5 chain health cost: a chain unit pays each kill's
  momentum price, and only a paid kill gives the extra attack; an attack it cannot
  pay for is cut by the shortfall and ends the chain (stage2-rules.md, section 9).
- A Spartan city needs 1 less growth to level up (sections 6 and 13).
- The second player starts with 12 gold instead of 10 (section 4).

## Rules 8 changes

This list and the one above are the file's changelog.

- Ranged units (range 2 or more) on a mountain have +1 range for their own attacks;
  a shot that uses the extra tile does 0.8 of the damage, rounded, at least 1. The
  counter-attack is unchanged (section 10).
- A step onto a mountain ends the unit's turn, and a step off one is allowed only as
  the first step of a unit that has not moved this turn and ends its turn too, so no
  move passes over a mountain (sections 2 and 9). Relay riders no longer pay 1 for a
  mountain in their own territory.
- A melee kill advance onto or off a mountain ends the attacker's turn too, chain
  and retreat included (section 10).
- A city sees its territory radius and nothing beyond (section 14).
- The Krypteia Scout has sight 2 and no `pathfinder`: it no longer steps into the
  fog (section 8).
- Mongol relay riders: only mounted Mongol units pay a road's cost onto their own
  territory; foot units pay normal costs. The extra half-point of riding by
  territory is gone, and Mongols build no roads (section 13).
- A hunkered unit heals at the end of its owner's turn, not at the start of the
  next (section 11).
- Climbing must be researched: a unit steps onto a mountain only if its owner knows
  `bronze`; stepping off needs nothing (sections 2, 7 and 9).
