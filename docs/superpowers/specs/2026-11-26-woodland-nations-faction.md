# Woodland Nations: the third faction

Designed with David on 2026-11-26. Status: draft for David's approval. Nothing here is built.

Marks: **[David]** decided by David; **[Claude's call]** proposed by Claude and open to change; **[Builder]** left to
whoever plans and builds it. Every number is a first guess to be tuned with `scripts/simai.ts`, as for the other
factions. Section references like "stage1 9" point to `docs/rules/stage1-rules.md`.

## 1. Intent

A third playable faction for Warbanners, joining the Spartans (few, sturdy, hold a line) and the Mongols (fast,
wide, strike and vanish). **[David]**

- **Theme:** a blend of many North American peoples, in the same way the later Celtic faction will mix Irish,
  Scottish, Saxon and Viking influences. The look leans on the forests of the film *The Last of the Mohicans*,
  used as a mood reference only, as Bad North is for gritty mode. **[David]**
- **Feel:** they own the forest. Ranged power, stealth and ambush; a warrior people who live off the land rather than
  build tall cities. **[David]**
- **Name on screen:** Woodland Nations. Engine id `woodland`. **[David]** (Métis was considered and dropped: it is the
  name of one specific living people, not a word for a blend.)

### Goals

- Plays unlike both existing factions: the forest is their home ground, their archery is their strength, and their
  economy turns wild land into warriors instead of city levels.
- Every rule is a data switch or a trait, like the existing factions, so `simai.ts` can balance it against both.
- Readable at phone size: their silhouettes, colours and buildings never look like the other two factions.

### Non-goals

- Ships, biome rules and weather. The faction is designed for today's map and rules.
- A faithful portrait of any one nation. It is a respectful blend, with its sources named (section 9).

### Anti-goals

- Caricature or anything sacred used as decoration (section 9).
- A faction that is unbeatable on forest maps or helpless on open ones: both matchups should stay within the balance
  targets (section 8).
- An AI that walks into every ambush. Hidden units must not make the AI look foolish (section 7).

## 2. Faction rules

| Rule | Value | Notes |
|---|---|---|
| Starting tech | `trapping` | Hunting branch, which leads to `archery`. **[Claude's call]** |
| Starting units | a Skirmisher and a Trapper | both on or next to the capital tile, as the builder places a second start unit. **[David, 2026-11-26]** to try in the sims; drop the Trapper if Woodland wins too often |
| Capital start level | 1 | **[Claude's call]** |
| City cover | 1.5 (2 with walls) | as the Mongols. **[Claude's call]** |
| Walls | yes, shown and named as a Palisade (`techFor` name for `walls`: Palisade) | **[Claude's call]** |
| Roads | yes | **[Claude's call]** |
| Growth per level | normal (`growthExtra` 0) | **[David]** "expand normally" |
| Tribute, lure, agoge, myth touch, relay riders | none | |
| Forest walkers | a forest costs their units 2 half-points (a field's cost) instead of 4 | all their units, mounted ones too. Nothing else about movement changes: roads, engagement and the mountain rule (stage1 9) apply as usual. **[Claude's call]** |
| Woodland cover | any unit of theirs standing on a forest tile is hidden (stage1 11, `hidden`): enemies see it only from a tile next to it, or from a city it stands on or next to | **[Claude's call]**, from David's "stealth" |
| Live off the land | each harvest of any kind (fruit, game, jewels, wild grain, fish) also pays back 3 gold at once (cost 2, so net +1 gold and the usual +1 growth) | **[David]** chose "harvests pay gold" |
| Lighter building | every building gives 1 less growth, never below 1 (Orchard 1, Plantation 2, Lumber camp 1, Lumber mill 2, Mine 1, Foundry 2, Farm 1, Granary 2, Market 2). The Market's +2 income is unchanged | **[Claude's call]**, from David's "more from harvests than improvements" |
| Early champion | the champion or support reward comes from level 4, and every level after it offers it again. Their level 4 Income or Growth choice is gone | **[David]** |
| Replaced shared units | they cannot train the Warrior (the Skirmisher replaces it) or the Archer (the Woodland Hunter replaces it). Every other shared unit is open to them as usual | **[David]** |
| Treasure "unit" outcome | gives them a Skirmisher in place of a Warrior | **[Claude's call]** |

Level rewards for the Woodland Nations:

| New level | Option 0 | Option 1 |
|---|---|---|
| 2 | gold (+5) | scout |
| 3 | borders | barracks |
| 4 and every level after | champion: War Chief | support: Smoke Keeper |

### Suggested `FactionDef` shape

The existing fields, plus new ones the other two factions set to off. Names are **[Builder]**.

```ts
woodland: {
  startUnit: 'skirmisher', extraStartUnit: 'trapper', champion: 'warChief', support: 'smokeKeeper',
  cityCover: 1.5, canBuildWalls: true, growthExtra: 0, mountedMoveBonus: 0, mountedDiscount: 0, capitalStartLevel: 1,
  forestStopsMounted: false, relayRiders: false, territoryRiding: false, relayMountedOnly: false, canBuildRoads: true,
  blockadeStores: false, tributeVillage: 0, tributeCityBase: 0, canLure: false, agoge: false, mythTouch: false,
  // new
  forestStride: true,          // forest costs 2 half-points
  forestHidden: true,          // own units on a forest are hidden
  harvestGold: 3,              // gold paid back per harvest
  buildingGrowthCut: 1,        // growth per building minus this, never below 1
  championFromLevel: 4,        // champion / support reward from this level (others 5)
  replaces: { warrior: 'skirmisher', archer: 'woodlandHunter' },
}
```

Tech tree (`TECH_TREES.rules8`): `start.woodland = 'trapping'`; `units.woodlandHunter = 'archery'`,
`units.trapper = 'trapping'`. The Skirmisher needs no tech; its bow and Dash-strike need `archery` (section 4).

## 3. Units

| Unit | Role | Atk | Def | Range | Mv | HP | Sight | Cost | Tech | Traits | Momentum price |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Skirmisher | starting unit, signature troop, replaces the Warrior | 5 | 2 | 1 (2 with the bow) | 1 | 10 | 2 | 3 | none | bow, agile, ambush, dashStrike | 1 |
| Woodland Hunter | long-range archer, replaces the Archer | 4 | 2 | 2 | 1 | 10 | 2 | 4 | archery | ambush, forestEye, noMountainRange | 1 |
| War Chief | champion | 6 | 5 | 1 | 1 | 20 | 2 | reward | - | ambush, doubleStrike | 3 |
| Smoke Keeper | support | 2 | 2 | 1 | 1 | 10 | 2 | reward | - | heal, guide, smoke | 1 |
| Trapper | oddity | 2 | 2 | 1 | 1 | 10 | 1 | 2 | trapping | snare | 1 |

Unit roles **[David]**; stats **[Claude's call]** except where section 4 says David set a number.

Unit blurbs (one plain sentence each, for `src/ui/text.ts`) **[Claude's call]**:

- Skirmisher: A quick fighter who strikes hard up close and, once Archery is known, shoots or makes a Dash-strike from two tiles away.
- Woodland Hunter: A patient archer who shoots three tiles from a forest when it has not moved and a friend spots the target.
- War Chief: The Woodland Nations champion, a hard fighter with a gunstock war club who strikes twice each turn.
- Smoke Keeper: A Woodland helper who heals friends, guides them past enemies and hides them in smoke.
- Trapper: A woodsman who hides snares that hurt and stop the enemies who step on them.

## 4. Traits and abilities

Formula names as stage1 10: `damageFor(a, d, cover) = max(1, round(2.5 * a * a / (a + d * cover)))`, and the health
factor `hf = (hp + maxHp) / (2 * maxHp)`.

### bow (Skirmisher) **[David: 70%]**

- Once its owner knows `archery`, the Skirmisher's range is 2. At distance 1 it fights in melee with its own attack
  (5). At distance 2 it shoots.
- A shot does 70% of what a shared Archer at the Skirmisher's health would do:
  `shot = max(1, round(0.7 * damageFor((4 + bonus) * hf + ambush, def, cover)))`, where 4 is the Archer's attack
  (`CONFIG.woodland.bowAtk`), `bonus` is every attack bonus the Skirmisher has on top of its type's attack (Fierce +1,
  for example), and `ambush` is +1 when Ambush applies. **[Claude's call]**
- It strikes back at either distance: in melee at distance 1 as usual, and at distance 2 with the bow, as
  `max(1, round(0.7 * normal counter worked out with attack 4 + bonus))`. (Agile is not involved: it cuts counters
  against the Skirmisher, not its own.)
- On a mountain it gets the usual ranged bonus (range 3, the long shot's 0.8 applied on top of the 0.7). Only the
  Woodland Hunter is denied it. **[Claude's call]**
- The unit card shows range 1 before `archery` and 2 after.

### agile (Skirmisher) **[David: "high dexterity up close"]**

A counter-attack against it does 1 less damage, never below 1. Same rule as the Watchful agility (stage2 4), and they
stack (2 less with Watchful).

### Dash-strike (Skirmisher) **[David; name, 33% numbers and "lift the shields" by David]**

An attack, using the unit's attack for the turn like any other. Needs `archery`.

1. **Target:** an enemy unit the owner can see at distance exactly 2.
2. **Charge tile:** a tile next to both the Skirmisher and the target that is free (no unit), enterable (not water;
   not a mountain) and explored. The first such tile in direction order is used; with none, Dash-strike is not legal.
   No unit ever stands on it: it is only a path. A tile holding an enemy its owner cannot see counts as not free; if
   that leaves no charge tile, the strike is refused with the usual "Something unseen blocks the way" notice.
   **[Claude's call]**
3. **The arrow:** `max(1, round(0.33 * damageFor((4 + bonus) * hf + ambush, def, cover)))`, where `def` includes every
   defence bonus (phalanx, hunker, brace). No counter. If the arrow kills, the attack ends there.
4. **The charge:** an ordinary melee hit with the Skirmisher's attack, `damageFor((5 + bonus) * hf, defNoShield, cover)`, where
   `defNoShield` is the target's defence **without** its phalanx, hunker and brace bonuses (the shields went up to
   meet the arrow). Terrain and city cover still apply. Hero traits (Hardy) still count. Ambush does not apply to the
   charge.
5. **The counter:** if the target survives, has attack above 0 and no `siege` trait, it strikes back at 33% of a
   normal counter: `max(1, round(0.33 * counter))`, where `counter` is the stage1 10 counter (steadfast included),
   then agile takes 1 off, never below 1.
6. **The return:** the Skirmisher ends on the tile it started from. It never advances, even after a kill. It has no
   movement left (as after any attack), and it stays hidden if it was hidden and no enemy is now next to it.
7. **Deeds:** one Fight deed (and +2 per kill) as for an attack; no March. A Dash-strike ends the Skirmisher's hunker,
   as any attack does.
8. A snare on the charge tile does nothing (snares only catch enemies). An enemy snare on the charge tile is not
   sprung: the charge is not a move. **[Claude's call]**

Worked example (all on a field, full health): a Skirmisher Dash-strikes a Hoplite that has two Hoplites beside it.
Arrow: `damageFor(4, 7, 1) = 4`, times 0.33 = 1 (Hoplite 14 of 15). Charge: `damageFor(5, 5, 1) = 6` (Hoplite 8).
Counter: steadfast counter would be 6, times 0.33 = 2, minus 1 agile = 1. A plain melee attack on the same Hoplite does
5 and takes 6 back.

### ambush (Skirmisher, Woodland Hunter, War Chief) **[Claude's call, approved in the draft]**

When the attacker is **hidden** as the attack begins (by Woodland cover, a smoke veil or a `hidden` trait) and the
target's owner cannot see it, the attack has +1 attack and the target does not strike back. Being merely out of the
target's sight range on open ground is not an ambush: a sight 1 Hoplite cannot see a Skirmisher 2 tiles away on a
field, but that shot gets no +1. (Without this, nearly every shot at sight 1 units would be an ambush.) For a Dash-strike only the arrow gets the +1; the charge still takes its 33% counter.

### forestEye and noMountainRange (Woodland Hunter) **[David]**

- Its sight stays 2 on a forest. **[David, 2026-11-26]**
- Standing on a forest, if it has **not moved or attacked this turn**, it has range 3. A shot at distance 3 is a long
  shot: `max(1, round(damage * 0.8))`, as the mountain long shot (stage1 10). The counter keeps range 2.
- A distance 3 shot needs a spotter: the target must be seen this turn by another unit or city of the Hunter's
  player, since the Hunter cannot see that far itself. **[David, 2026-11-26]**
- It gets no range bonus on a mountain: range 2 there.

### doubleStrike (War Chief)

Two attacks per turn, as the Swordsman.

### heal, guide, smoke (Smoke Keeper)

- **heal:** as the Piper's and Sky Caller's (+4, +5 on a hunkered unit).
- **guide:** a friendly unit next to it ignores engagement (stage1 9) for the rest of this turn: entering a tile next
  to an enemy does not end its move. It can still not pass through enemy units. It works on a unit that has already
  moved this turn too (for its movement left). Uses the Smoke Keeper's ability. **[Claude's call]**
- **smoke:** target a tile within 2. Every friendly unit on it and next to it is veiled until the end of its owner's
  next turn: hidden as the `hidden` trait (seen only from a tile next to it, so an enemy already next to it still sees
  it). A veiled unit that attacks loses its veil (a unit hidden by Woodland cover or its own trait stays hidden as
  usual). **[Claude's call]**

### snare (Trapper) **[Claude's call, approved in the draft]**

- An ability: set a snare on an explored field or forest tile next to the Trapper that has no unit, city, village or
  treasure. A player has at most 3 snares on the map; setting a 4th removes their oldest.
- A snare is seen only by its owner. Enemies never see it until it is sprung.
- An enemy unit that enters the tile by its own move, a lure or a kill advance springs it: it takes 3 damage (which can
  kill it) and has no movement left this turn. It may still attack or use an ability. The snare is used up.
- Units placed on the tile (trained, a reward, a treasure) do not spring it; the snare stays.
- A kill by a snare gives no deeds to anyone.
- Setting a snare uses the Trapper's ability for the turn (its attack and movement), as other abilities do.
- A move whose path crosses a snare stops on the snare tile: the tiles beyond are not entered and the movement left is
  lost. A chain unit whose kill advance lands on a snare takes the damage and its chain ends (as a mountain advance
  does); the kill and its momentum still count. A unit that dies on a snare during its own move earns its march deeds
  up to that tile.
- Snares stay when their Trapper dies or moves away. A removed oldest snare simply disappears; the enemy is not told.
  **[Claude's call, all of these]**

### Hunker

All units hunker as usual (stage1 11). The pose is in section 6.

### Hidden units and information **[Claude's call]**

- Today the engine works out moves and engagement from the real board, and a move the player's view allowed but the
  engine refuses shows "Something unseen blocks the way". That stays as it is: the player's highlighted tiles come
  from what they can see, and a refused move reveals nothing more than that notice.
- A hidden attacker's shot shows the damage on its target and names the attacker's kind in the report ("took 4 damage
  from a Woodland Hunter"), but never its tile. The attacker stays hidden.
- The only ways to see a hidden Woodland unit are the existing ones: an enemy unit or city next to it.

## 5. Matchups and balance risks **[Claude's call]**

| Against | Expected shape | Risk |
|---|---|---|
| Mongols | Forests already stop Mongol riders and their units have defence 2, so hidden Skirmishers and Hunters punish them. On open steppe the riders hunt the Woodland archers down. | Too strong on forest-heavy maps. The Mongols' lure can pull a Skirmisher out of its forest. |
| Spartans | Hoplite lines shrug off arrows, but Dash-strike strips their shields and nearly skips the steadfast counter. Spartan cities (cover 2) are hard to take with archers. | Slow, stalled games if Woodland players never commit to melee or Catapults. |

Other risks:

- **Gold snowball:** the harvest refund makes early training cheap. If the Woodland Nations rush, cut `harvestGold`
  to 2 or raise the Skirmisher to 4 gold.
- **Champion flood:** a War Chief or Smoke Keeper from level 4 and every level after may come too often. Lever:
  `championFromLevel` 5, or War Chief health 18.
- **Hidden everywhere:** Woodland cover plus smoke plus snares may make the game feel unfair to a human opponent too.
  Lever: Woodland cover for foot units only, or smoke range 1.
- **Dash-strike:** the cheapest unit hits armoured lines hard with almost no counter. Levers: the 0.33 shares, the
  charge counting phalanx again, or needing the target not to be in a city.

## 6. Look and sound **[David's direction; details Claude's call]**

### Colours

Forest green `#2f5d3a`, red ochre `#a4452c`, bone white `#e9e1cf` for trim. Player colour stays separate from
faction colour, as for the others.

### Figures (3D, chunky toy style)

- **Skirmisher:** buckskin leggings, breechcloth and sash, a short bow on the back, a ball-headed club in hand.
- **Woodland Hunter:** a long bow, a quiver of fletched arrows, a fur mantle, a green-brown hood or head wrap.
- **War Chief** (from David's reference photos, kept to real Woodlands elements and not the actor's likeness): a
  gunstock war club of dark wood with brass tack studs along the stock, a steel spike blade at the elbow and a
  leather wrist strap; a shaved head with a tall scalplock falling back; a blue trade-cloth shirt over breechcloth and
  sash; buckskin leggings with garters and moccasins; a band of downward triangles tattooed across the chest in our
  own pattern; a silver trade earring; a powder-horn strap across the body. Standing still and watchful, club low,
  blade forward. Reference: `.superpowers/reference/third-faction/war-club-reference.webp` (David's photo, private
  workspace only; the film stills are not kept anywhere in the repos).
- **Smoke Keeper:** an older figure with a fringed shawl and a clay smoke bowl trailing grey wisps.
- **Trapper:** fur hat, coiled rope and a hide pack, a small iron trap at the belt.
- **Hunker pose** **[David]:** the War Chief, Skirmisher and Hunter sling their weapon onto their back and squat on the
  balls of their feet. The Smoke Keeper and Trapper crouch low with their arms around their knees **[Claude's call]**.
- **Hidden in a forest:** to their owner, a unit on a hidden tile is drawn slightly faded, as the Krypteia Scout is.

### Emblems (the new disc style: round disc, profile breaking the top edge, weapon bottom right)

| Unit | Profile breaking the top | Weapon bottom right |
|---|---|---|
| Skirmisher | head with a single feather at the back | ball-headed club |
| Woodland Hunter | hooded head | long bow with an arrow |
| War Chief | scalplock | gunstock war club, spike showing |
| Smoke Keeper | head with a shawl, wisps rising | clay smoke bowl |
| Trapper | fur hat | iron trap |

Banner emblem: a pine on a green disc with an ochre ring.

### City by level **[David]**

At least one tipi stands at every level.

| Level | Buildings |
|---|---|
| 1 | two tipis |
| 2 | one tipi, one longhouse |
| 3 | adds a wigwam cluster |
| 4 | adds a council lodge (a large wooden hall) |
| 5 and up | adds a log palisade ring (walls draw the palisade at any level) |

### Tile improvements **[Claude's call; David asked for distinct structures from tipis, longhouses, wigwams, lean-tos and hogans]**

| Improvement | Look |
|---|---|
| Lumber camp | a lean-to with a woodpile |
| Lumber mill | a larger lean-to with a saw-pit |
| Mine | an adobe hogan at the rock face |
| Foundry | a hogan with a smoking forge |
| Farm | corn, beans and squash beside a wigwam |
| Granary | a raised storage longhouse |
| Orchard | a berry thicket with a drying rack |
| Plantation | a larger thicket with two drying racks |
| Market | a trading lodge |
| Walls | a log palisade |
| Road | a worn forest trail |

### Sound

Wooden knocks and bowstring snaps for attacks; a quick run of footfalls for the Dash-strike; a soft snap for a sprung
snare; low forest ambience under their turn. No imitation of sacred songs or war cries. David hears every sound before
it ships.

## 7. AI **[David: aware of ambushes; Claude's call how]**

- A danger map: unseen forest tiles within 2 of a Woodland city's territory, or of a Woodland unit it can see now,
  count as risky. It uses only the AI's current view (the AI keeps no memory between turns today, and adding one is
  **[Builder]**). The planner avoids ending weak or wounded units there and prefers to walk a sturdy
  unit in first to reveal them. This uses only what the AI's player knows (`aiInputFor`), so the project's no-cheat
  rule holds.
- Playing the Woodland Nations: keep archers in forests, Dash-strike Hoplite lines and wounded targets, set snares on
  the paths into its land, smoke a group that is about to be hit, harvest early for gold.
- Fallback, not used for now **[David, 2026-11-26]**: only if the sims show balance problems from the AI blundering
  into ambushes, and then with David's yes, the hard AI may be told which hidden units stand within 2 of its own units. That would be an exception to the rule in `CLAUDE.md` that the
  planner sees only what its player sees.

## 8. Balance targets and how to measure **[Claude's call]**

- `simai.ts` needs a third faction and a faction pair option. Run each pair (Woodland against Spartans, Woodland
  against Mongols, and the Woodland mirror) for 200 matches per AI level (100 seeds, both seatings), as the rules 7
  work did. Once biomes exist, repeat the Woodland pairs on each of the four biomes (arid, snow, grasslands, jungle)
  and name the best biome from the results. **[David, 2026-11-26]**
- Target: Woodland share of wins 40% to 60% in each pair at normal and hard; median rounds at most 40; stalls at 60
  rounds at most 20%. The Spartans against Mongols numbers must not move.
- Levers, in the order to try: `harvestGold`, the Skirmisher's cost, the Dash-strike shares, `championFromLevel`,
  Woodland cover for foot units only.

## 9. Respect and sources **[Claude's call, agreed with David]**

A blend works only if each piece is real and named. Where the elements come from:

- Tipis: Plains peoples (Lakota, Cheyenne, Blackfoot and others).
- Longhouses: Haudenosaunee and Wendat peoples.
- Wigwams: Anishinaabe, Wampanoag and other Algonquian peoples.
- Hogans: the Diné (Navajo).
- Lean-to shelters: widespread across the continent.
- The gunstock war club: Eastern Woodlands and Great Lakes peoples.
- Corn, beans and squash: the Haudenosaunee "Three Sisters" planting.

Left out on purpose: feathered war bonnets, sacred pipes, totem poles and dreamcatchers as decoration, and the words
"brave", "savage", "squaw" or "tribe" as a unit name. No mock war cries or chants.

## 10. Approaches considered

- **The people:** Comanche or Apache, as David first said; Eastern Woodlands, to fit the film and the forest play; a
  blend. David chose a blend with Eastern Woodlands play and a mix of dwellings.
- **The economy:** A, harvests pay gold and buildings give less growth (chosen); B, harvests give 2 growth; C, harvests
  give 2 growth but levels cost more.
- **The archer:** keep the Woodland Hunter with Forest eye and drop the shared Archer (chosen), or drop the Hunter and
  keep the Archer.

## 11. Left to the builder

- Field and trait names in code; how hidden and veiled units, snares and the Dash-strike are drawn and animated.
- Where the faction picker goes in New match setup, and how the AI faction is chosen with three factions.
- The rules version number and the rules file text, written from this spec. The faction exists
  only in the rules 8 tech tree and the new rules version; older replays and online rooms never see it (the rules 7
  tree's `start` record needs a placeholder entry only to satisfy the type).
- Whether the AI may assume a rival knows `archery` (Skirmisher range 2) once the rival has had the turns to research
  it, since rival techs are not shown today.

## 12. Decisions on the open questions **[David, 2026-11-26]**

1. Mirror matches: allowed. Both players may pick the same faction.
2. Best biome: try all four biomes in the sims (section 8) and pick from the results.
3. The hard AI fallback (section 7): not yet. Use it only if the sims show balance problems.
4. Starting Trapper: yes, try a Skirmisher and a Trapper (section 2).
5. Order of work: the Woodland Nations come before the Spartans against Mongols balance session and rules 10.
   (Rules 10 shipped in 0.8.0 the same day, so the faction becomes rules 11.)

Also changed on 2026-11-26: the Woodland Hunter sees 2 tiles on a forest, not 3, and its range 3 shot needs a spotter
(section 4, forestEye).

No open questions remain.
