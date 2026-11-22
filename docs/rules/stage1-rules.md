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
| Mountain | all remaining, only as the first step of a unit that has not moved this turn | 1.5 | A unit standing here sees 1 tile farther |
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
- Each player starts with 10 gold.
- Each player has explored whatever their capital and starting unit can see.

## 5. Turn

Players alternate. On your turn, in any order and any number of times while legal:
move, attack, use an ability, capture, claim a treasure, train, harvest, build, lay
a road, build walls, research, choose a city reward. Then end the turn.

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
  Mongol city). Spare points carry over.
- Connected cities (since rules 7): a city is connected when a chain of adjacent
  tiles joins it to its owner's capital, every tile of the chain being a road or
  a city of that owner. A road inside another player's territory breaks the
  chain; a road in unclaimed land does not. The first time a city is connected,
  it and the capital each get +1 growth point (which can level either city, with
  its reward as usual). This happens once per city for each owner: a connection
  is never taken back, a second road changes nothing, and a captured city can pay
  its new owner once more. A player has at most one capital, and a city connects
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
| Build Lumber camp on a forest tile with no resource | tech `forestry` | 3 | +2 (+1 before rules 7) |
| Build Mine on ore | tech `bronze` | 5 | +2 |
| Build Market on a field with no resource, one per city | tech `markets` | 6 | +2 (+1 before rules 7), and +2 income |
| Build Walls (the city itself, not Spartans) | tech `shieldwork` | 6 | none |
| Road, on any field or forest tile that is yours or unclaimed | tech `roads` | 1 | none |

A tile with a city standing on it takes no harvest, no building and no road.
A road can only be laid on a tile you have explored.

## 7. Tech

Price: base + (number of cities you hold - 1) * tier. Base is 4, 6, 8 for tiers 1, 2, 3.
A tech needs the one before it in its branch.

| Branch | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| Fields | `foraging`: harvest orchards | `farming`: Farm | `markets`: Market |
| Riding | `riding`: Horseman, Horse Archer | `roads`: roads, the Camp | `chivalry`: Knight |
| Forest | `hunting`: harvest game, Archer | `forestry`: Lumber camp | `engineering`: Catapult |
| Mountain | `bronze`: Mine, Spearman, Hoplite | `shieldwork`: Defender, Walls | `smithing`: Swordsman |

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
| Krypteia Scout | Spartans | 2 | 1 | 1 | 2 | 5 | 1 | 2 | | hidden, noCityCapture, pathfinder |
| Horse Archer | Mongols | 3 | 2 | 2 | 2 | 10 | 2 | 5 | riding | retreat, mounted |
| Khan's Guard | Mongols | 6 | 4 | 1 | 3 | 20 | 2 | - | reward | chain, inspire, mounted |
| Sky Caller | Mongols | 2 | 2 | 1 | 2 | 10 | 2 | - | reward | heal, hasten, dustStorm, mounted |
| Camp | Mongols | 0 | 3 | 0 | 1 | 15 | 1 | 6 | roads | camp |

Starting unit: Spartans a Krypteia Scout, Mongols a Horseman.

The Krypteia Scout's sight is 1 since rules 7 (3 before). A unit sees every tile
within its sight, so after a move the fog is at least sight + 1 tiles away; with
sight 1 and 2 tiles of movement a Scout can step into the fog on open ground.

The Sellsword joins only from a treasure: see stage 2 (`stage2-rules.md` section 6).

## 9. Movement

- One unit per tile. You may pass through your own units but not stop on them. You
  may not enter a tile holding an enemy unit.
- Engagement: entering a tile next to an enemy unit uses up the rest of the move.
- The fog (since rules 6): a move never passes through a tile its owner had not
  explored when the move began, and an ordinary unit never ends a move on one
  either. Moving still reveals what the unit now sees, so exploring means walking to
  the edge of the white fog and looking. Only a unit with `pathfinder` (the Krypteia
  Scout) may end a move on one unexplored tile, as the last tile of the move. Its
  owner explores what it now sees, and its turn ends there: it keeps no movement and
  may not attack, use an ability or drink a draught this turn, even with movement
  left. Costs, engagement, forest, mountain, roads and relay riders apply as usual.
  (Rules 3 to 5 let any unit end a move on one unexplored tile, and let a mounted
  Mongol keep moving after it.)
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
killed by splash.

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
| chain | Each kill gives one more attack this turn. Since rules 5 each kill also costs the unit health: see stage2-rules.md, section 9 |
| splash | Enemy units next to the target take half the damage dealt to the target, rounded, at least 1. No counter from them |
| siege | Cannot attack on a turn it has moved, cannot move after attacking, never counter-attacks |
| mounted | A tag other rules refer to |
| phalanx | +1 defence for each friendly Hoplite next to it, at most +2 |
| unbowed | Attack is not reduced by lost health, when attacking and when striking back |
| hidden | Enemies see it only from a tile next to it (their unit or their city) |
| noCityCapture | Cannot capture an enemy city (villages are still allowed) |
| steady | Friendly units next to it cannot be lured |
| inspire | Friendly mounted units next to it have +1 attack |
| camp | Cannot attack. May train units (see 13) |
| pathfinder | May end a move on one unexplored tile, which ends its turn (see 9) |

Abilities are actions that use up the unit's attack for the turn (and its movement,
as an attack would):

| Ability | Unit | Target | Effect |
|---|---|---|---|
| heal | Piper, Sky Caller | a friendly unit next to it that is below full health | +4 health, up to its maximum |
| taunt | Piper | an enemy unit within 2 | Taunted until the end of its owner's next turn. While taunted, if any enemy unit with the phalanx trait (the Hoplite) is within its range it may attack only such units |
| hasten | Sky Caller | a friendly mounted unit next to it | +2 half-points of movement this turn |
| dustStorm | Sky Caller | a tile within 2 with at least one enemy unit you can see on it or next to it | Enemy units on that tile or next to it are blinded until the end of their owner's next turn: they give no vision and cannot attack beyond distance 1 |

Resting: a unit that did nothing at all on its owner's previous turn heals at the
start of the next turn: 4 if it stands in its owner's territory, 2 on land no city
claims, 1 in an enemy's territory, and nothing while an enemy unit its owner can
see (section 14) stands on a tile next to it. An enemy its owner cannot see changes
nothing.

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
- A Spartan unit standing in a Spartan city has cover 2. Spartans cannot build Walls.
- Units: Hoplite, King's Guard (champion), Piper (support), Krypteia Scout.

Mongols

- Start with `riding`.
- Mounted units shared by all factions (Horseman and Knight) cost 1 less.
- Riding by territory (since rules 6). Mounted Mongol units have 1 extra half-point of
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
- Relay riders: for Mongol units, entering any tile inside Mongol territory costs
  1 half-point.
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
  mountain) and every tile within their cities' territory radius + 1.
- Seen tiles stay explored for the rest of the match.
- An explored tile is shown as it is now, not as it was when last seen: its
  terrain, resource, building, road, and any city on it with that city's owner,
  level and walls. Decided by David, 2026-11-18. Units are the exception, below.
- Enemy units are known only while on a tile the player currently sees, and
  `hidden` ones only from next to them, or from a city they are standing on or
  next to.
- You can only attack or target a unit you currently see. A unit whose range is
  longer than its sight (the Catapult) needs another unit to spot for it.
