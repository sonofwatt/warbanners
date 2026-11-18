# Banners: design

Date: 2026-11-18
Status: draft for David's approval
Working title: "Banners" (a placeholder; David has said names do not matter to him)

## How to read this

Every decision is marked with who made it.

- **[David]** means David said it or approved it when it was played back to him.
- **[Claude's call]** means Claude chose it. David has seen most of these in
  summary and did not object, but they are open to change.
- **[Builder]** means it is deliberately left to whoever plans and builds it.

Writing rule for everything in this project, including code comments, commit
messages and text the game shows: never use an em dash or an en dash. Use a plain
hyphen, a colon, or a new sentence. **[David]**

## 1. Intent

David loved Hexonia, a mobile turn-based strategy game on a hex map. Its developer
stopped updating it, it was pulled from the Play Store, and it no longer runs
properly on current phones. He wants a game of that kind that he can play on his
Pixel 10 Pro and his iPhone, against friends, family and AI opponents, with online
multiplayer, which Hexonia never had.

What he said he would miss most if this got it wrong: "the gameplay, the aesthetic
vibe, the unit types, really the whole game."

Success is David sitting down with a family member, each on their own phone, and
playing a full match that feels like the game he misses.

## 2. Originality boundary

This is a new game in the same genre, not a copy of Hexonia. **[David accepted]**

Carries over (genre mechanics and feel):

- Full turns taken in sequence on a fogged hex map.
- Villages to capture, cities that grow and offer a choice at each level.
- A tech tree tied to terrain, one simple currency, winning by elimination.
- The roles units fill: cheap infantry, spear, elite sword, shield wall, archer,
  light and heavy cavalry, siege, and later ships.
- A bright, chunky, friendly look that reads at a glance.

Must be new:

- All art, sound, names and text. Nothing is taken from the Hexonia APK.
- The factions and their special units and powers.
- Maps (generated).
- All numbers: costs, stats, formulas, tech prices. They are drafted fresh and
  tuned by playtesting, not copied from Hexonia's tables.

Hexonia's APK was read once to understand how that kind of game plays. It is not
an input to the build.

## 3. Goals, non-goals, anti-goals

Goals

- A home-screen web game that works on a current Pixel and a current iPhone,
  installed from an invite link. No app stores. **[David]**
- Two multiplayer modes. Live: everyone online, turns in sequence with a turn
  clock. Remote: the same match at your own pace over days, with a nudge when it
  is your turn. **[David]**
- Friends and family only, plus AI opponents. AI and humans can share a match.
  **[David; mixing is Claude's assumption, unchallenged]**
- Match length is adjustable from about one hour to a few hours through settings
  such as map size and how far troops move. **[David]**
- No server of David's own. It works like his earlier game Deutsch Dash.
  **[David]**

Non-goals

- Public matchmaking, strangers, rankings, chat moderation.
- Accounts with passwords. A profile is a name plus a private link.
  **[David approved]**
- Purchases, ads, premium currency, consumable items.
- Native app store builds. There is no Mac available to build for iPhone.
- Cheat-proofing against the people you invited (see 8.5).

Anti-goals (these would make it a failure even if it works)

- It looks or reads like a reskin of Hexonia.
- A hero or an Exalted Hero decides a match alone. David's words: "Nothing
  overpowering, but enough to notice."
- The adaptive AI visibly throws the game or visibly cheats.
- A dropped connection or a closed browser tab loses a match.

## 4. Stages

David defined stage 1. The order after it is **[Claude's call]**, approved in
summary.

1. **First playable.** One generated small map, Spartans against Mongols, live
   turns against one other person or one AI, four AI settings (easy, normal,
   hard, adaptive), the diorama look. **[David]**
2. Hero traits and expanded treasures.
3. Remote play: first with a "text them it's their turn" button, then automatic
   notifications.
4. More than two players, map sizes, speed settings, ships and water tech.
5. More factions.
6. Exalted Heroes and player profiles.

Each stage ends in something David can play. This document describes the whole
game so stage 1 is built with the later stages in mind, but only stage 1 is to be
planned in detail now.

## 5. The game

### 5.1 Map

- Hex tiles. Terrain: field, forest, mountain, water. Features: villages (neutral,
  capturable), cities, resource spots, treasure sites. **[David, via the genre]**
- Hidden under fog until a unit or city sees it. Each player has their own view.
- Generated from a seed at match start, so no two matches are the same.
  **[Claude's call]** Stage 1 has one size, tuned for two players and a match of
  roughly 30 to 60 minutes.
- Generation must be fair for two players: comparable land, resources and village
  access near each start, capitals a sensible distance apart. **[Builder]** for the
  method.
- In stage 1 water is an obstacle. Ships arrive in stage 4. **[Claude's call]**

### 5.2 Turn

- Players act in a fixed order, one full turn each. **[David: "Teams take turns."]**
- On your turn you may, in any order: move and attack with each unit, capture,
  train units in cities, harvest resource spots, build and upgrade buildings, lay
  roads, research tech, then end the turn.
- Each unit normally gets one move and one attack per turn. Unit traits modify
  this (5.5).

### 5.3 Economy and cities

- One currency, gold. Cities pay income each turn, the capital more, rising with
  city level.
- Harvesting resource spots and constructing buildings in a city's territory adds
  to that city's growth. Enough growth raises its level.
- Each level-up offers a pick of one of two rewards. Examples of reward kinds:
  gold now, more income, wider borders, more unit capacity, fog cleared around
  the city, the faction's champion, the faction's support unit.
- A city supports a limited number of units. This keeps armies small enough to
  manage on a phone.
- Roads connect cities and speed movement.
- Exact thresholds, incomes, building list and reward table: **[Builder]**, drafted
  fresh.

### 5.4 Tech

- Branches tied to terrain (fields, forest, mountain, common/roads, and water from
  stage 4), each a short ladder of tiers. A tech unlocks units, buildings,
  harvesting of a resource, or movement over a terrain type.
- The price of a tech rises with the number of cities you hold, so a wide empire
  pays more per tech.
- Each faction starts with one tech that suits it.
- The tree's contents and prices: **[Builder]**, drafted fresh.

### 5.5 Units and combat

Stats per unit: attack, counter-attack strength, defence, range, movement, health,
sight, cost.

Shared land units for stage 1 (roles; final names and stats **[Builder]**):

| Role | Character |
|---|---|
| Warrior | Cheap basic infantry |
| Spearman | Strong when attacked |
| Swordsman | Elite infantry, strikes twice |
| Defender | A wall: weak attack, very hard to shift |
| Archer | Attacks from two tiles away |
| Horseman | Fast, can pull back after attacking |
| Knight | Heavy cavalry, may attack again after a kill |
| Catapult | Slow siege, long range, damages the tiles around its target |

Stage 4 adds ships: a transport, a warship, a bombardment ship.

Each faction also has (stage 1 for Spartans and Mongols):

- A **signature troop**: one regular unit unique to the faction.
- A **champion**: a big, expensive unit earned when a city reaches a high level.
- A **support**: a healer that also has one buff for friends and one trick against
  enemies.
- An **oddity**: something unusual (a scout, a mobile camp).

Combat **[Claude's call]**:

- Deterministic. No dice and no hit chance, so every phone computes the same
  result and nobody loses to luck. If any randomness is ever needed it must come
  from a seeded generator stored in the match so all devices agree.
- The attacker deals damage, and the defender, if it survives and is in range,
  strikes back. Defence, terrain, city garrison and health remaining all matter.
- Units heal by resting, faster inside their own borders.
- Formula and values: **[Builder]**.

### 5.6 Capturing and winning

- A unit that ends its turn on a village or an enemy city may capture it on its
  owner's next turn if it is still there.
- A player with no cities left is eliminated. The last player standing wins. A
  player may also resign.

### 5.7 Factions

Theme: warrior cultures through the ages, each with its own flavour and new
names. **[David]**

**Spartans: few, disciplined, immovable** **[David approved all of this]**

- Feel: a small army of expensive soldiers who hold a line and punish anyone who
  attacks it. Slow to expand, very hard to dislodge.
- Shield wall: hoplites standing side by side protect each other.
- "Our men are our walls": no city walls. A garrisoned unit gives the city its
  defence bonus.
- The agoge: units earn hero traits faster than other factions (from stage 2).
- Signature troop, Hoplite: a spearman with a great shield. Strong counter-attack,
  stronger beside another hoplite.
- Champion, the King's Guard: fights at full strength however wounded it is.
- Support, the Piper: heals, steadies nearby allies so they cannot be pushed back
  or stunned, and can taunt an enemy into attacking the line. In stage 1 the only
  forced movement is the Mongol feigned retreat, so "steadied" means immune to
  that lure. Stuns and knockbacks are not part of shared combat; they may arrive
  with later factions, and the same immunity will cover them. **[Claude's call]**
- Oddity, the Krypteia scout: cheap, weak, unseen by enemies unless adjacent.
- Myth touch: two heroes fighting side by side strengthen each other (stage 2).
- Weaknesses: costly units, poor ships, little ranged power.

**Mongols: fast, far-ranging, never where you expect** **[David approved]**

- Feel: a wide, thin empire of riders who strike and vanish. Weak when pinned,
  deadly on open ground.
- Born in the saddle: mounted units are cheaper and move farther on open fields.
  Forest and mountains slow them more than others.
- Tribute: capturing a village or city pays gold at once.
- Small cities, wide empire: each Mongol city levels up slowly, but the number of
  cities grows quickly. Income comes from holding and taking ground. **[David
  confirmed this reading]**
- Relay riders: units move farther inside their own borders without roads.
- Signature troop, Horse Archer: shoots at range, then rides away in the same turn.
- Champion, the Khan's Guard: a heavy lancer that inspires nearby riders to hit
  harder.
- Support, the Sky Caller: heals, grants a rider extra movement, and can call a
  dust storm that blinds enemy sight.
- Oddity, the Camp: a yurt on a cart that moves slowly and trains units wherever
  it stops.
- Feigned retreat: a rider that pulls back after attacking may lure the enemy it
  struck one tile forward, out of formation.
- Weaknesses: fragile units, slow city growth, poor at sea.

Later factions David has asked for (stage 5): Celts, a Native North American
faction (Comanche or Apache), Crusader knights, Zulu, Egyptian warriors. Norse,
Persian and Han-era themes are welcome too as fresh designs. Each is designed with
David when its stage comes. These are real peoples, so each is drawn from its
history with respect and without caricature. **[Claude's call]**

### 5.8 Heroes (stage 2) **[David's idea; playback approved]**

A unit becomes a hero through how it has lived, so two veterans differ.

- Each unit quietly tracks its deeds. Enough of one deed earns a matching trait.
- Fighting: kills build damage and health.
- Marching: a unit that has covered a lot of ground gains movement.
- Surviving: one that is repeatedly hurt and healed gains toughness.
- Resting: one that holds still and recovers gains sight range and agility.
  Agility means taking less from counter-attacks (not a dodge chance, to keep
  combat deterministic).
- A unit holds at most two or three traits. Hero status arrives once it has a
  couple, with a mark every player can see.
- Each trait is a small, visible edge. A hero is worth protecting and never
  decides a match alone.
- Thresholds and sizes: **[Builder]**, tuned by simulated matches.

### 5.9 Treasures (stage 2) **[David; expansions suggested by Claude and accepted]**

Treasure sites on the map, found by exploring. The classics: a free unit, fog
lifted, gold. Stage 1 already has treasure sites with these three, so exploring
is rewarded from the start. **[Claude's call]** Stage 2 adds the rest. Expanded: a relic that grants a hero trait, a one-use ability, a
map to another treasure, a wandering mercenary who joins you.

### 5.10 Exalted Heroes (stage 6) **[David]**

- At the end of a match you win, you may exalt one hero that emerged during it.
- Your profile keeps a roster of up to three. Exalting a fourth means replacing
  one.
- In a later match you may reincarnate one of them once you have passed set
  milestones in that match, built an altar, and paid a hefty sum of gold. It
  returns with the traits it earned.
- One reincarnation per player per match. If it falls it is gone for that match
  and stays on the profile.
- It is a late-game reward, never a head start, and every player has the same
  chance to do it.
- Milestones are things like a city reaching a high level or finishing a branch
  of tech. Exact conditions and cost: **[Builder]** at that stage.

## 6. Multiplayer modes

### 6.1 Live **[David]**

- Host opens a lobby, picks settings, and sends an invite link. The other player
  opens it on their phone.
- Turns go in order. A turn clock is set in the lobby, including "off" for relaxed
  games. When the clock runs out the turn ends by itself. **[Claude's call]**
- If someone drops, the match waits and they rejoin from the same link with
  nothing lost. **[Claude's call]** How long the clock pauses for a drop:
  **[Builder]**.

### 6.2 Remote (stage 3) **[David]**

- The same match and rules, with no clock by default. The match stays in the
  database for days.
- Step one: when you end your turn, a button opens the phone's share sheet to
  text the next player a link. **[Claude's call, told to David]**
- Step two: automatic push notifications. On iPhone these work only for home-screen
  web apps, which this is. Something must send the push. Two candidates: a small
  Firebase function (needs the pay-as-you-go plan, though family use should stay
  within the free allowance) or a small watcher on David's home machine that only
  makes outgoing connections. The choice is David's when stage 3 arrives.

### 6.3 Speed settings (stage 4) **[David]**

Lobby options that set match length from about one hour to a few hours: map size,
movement multiplier, starting gold, income multiplier, tech price multiplier.
Which levers ship and their presets: **[Builder]**.

## 7. AI opponents

- Four settings: easy, normal, hard **[Claude's call]** and adaptive **[David]**.
- One AI with a single skill dial. Easy, normal and hard are fixed positions on
  the dial. Adaptive moves it. **[Claude's call]**
- The AI plays by the same rules as a person: same costs, same income, and it
  sees only what its own fog allows. Lower skill means shallower planning, slower
  expansion and less coordinated attacks. It never makes deliberately suicidal
  moves. **[Claude's call]**
- It also plays each faction to its character: the Spartan AI holds lines, the
  Mongol AI raids and spreads.

Adaptive **[David: "It should adapt to the players ability."]**

How it adapts is **[Claude's call]**:

- During a match it compares its own standing with the human's (cities, army
  strength, tech, income) and nudges the dial in small steps to keep the game
  close. Changes are smoothed over several turns so play does not lurch.
- Between matches it remembers where the dial ended for that player's profile on
  that device, shifted a little by the result, and starts the next match there.
- The player never sees the dial move. After the match the result screen may show
  the level it settled at.
- With several humans in a match (stage 4) it adapts to their average standing.

Running it

- AI turns are computed on a phone, so a turn must finish quickly (a few seconds
  at most on a mid-range phone) and must not freeze the screen.
- In live play the host's phone plays the AI, with handover if the host leaves, as
  Deutsch Dash does for its bots. In remote play the phone of whoever just ended
  a turn plays any AI turns that follow. **[Claude's call]**

## 8. How it gets made

### 8.1 Platform **[David agreed]**

A web game installed to the home screen (a PWA) on Android and iPhone. Phone
first, portrait and landscape.

### 8.2 Stack **[Claude's call, following David's Deutsch Dash]**

David asked for this to work the way Deutsch Dash does. That project
(`~/projects/deutsch-dash`, public repo `sonofwatt/deutsch-dash`) is React,
TypeScript, Vite, Zustand, Vitest, Firebase Realtime Database with anonymous
sign-in, and GitHub Pages. Use the same stack and borrow its proven patterns:
room codes as the credential, host role with handover, emulator-only dev and
tests, security rules tested against the emulator. Its `handoff.md` records the
traps.

### 8.3 Shape **[Claude's call]**

- **Rules engine:** pure TypeScript with no UI or network code. Given a match
  state and an action it returns the new state or a refusal. It is the single
  source of truth for what is legal. All game numbers live in data files, not in
  code.
- **Deterministic:** the same seed and the same list of actions always produce
  the same state on every device. The engine can produce a short hash of a state
  so devices can confirm they agree.
- **Match record:** settings, seed, players, whose turn it is, and the ordered
  list of actions, with occasional snapshots so a rejoining phone does not replay
  a long match from the start. Remote play, rejoin after a drop, and replays all
  fall out of this.
- **Who writes:** the phone of the player whose turn it is checks each action
  with the engine and appends it. Other phones replay it and compare hashes.
  Database rules allow only the current player (or the phone playing the AI) to
  append.
- **AI:** a separate module that reads a fog-limited view and returns actions. It
  runs off the main thread.
- **Rendering:** separate from the rules, so the look can change without touching
  how the game plays.

### 8.4 Look **[David chose option B from three sketches]**

"Diorama": a tilted board of thick hex tiles with chunky little figures standing
on them, bright and toy-like, in an original style. Trees, mountains, houses and
units stand up from the tiles and overlap the tiles behind them.

The sketch David picked is kept at `docs/design/look-b-diorama.html` (open it in a
browser). It is the reference for the look, along with the list in that file of
what it fixes: the tilt, tile thickness, figure size against the tile, flat fills
with no outlines, the palette. It is a rough direction sketch, not final art. David
picked B without giving a reason. Claude's reading is that it comes closest to the
toy-like feel he said he would miss. The two options he passed over were flat
top-down counters and an inked parchment map.

- Faction colours and silhouettes must read at phone size. Spartans: crimson and
  bronze. Mongols: blue and gold. **[Claude's call]**
- Player colour is kept separate from faction colour in the data and the art, so
  that from stage 4 two players can field the same faction. **[Claude's call]**
- Every unit, building and terrain feature needs its own original art. Art is
  authored in the repo as vector or generated assets. How (hand-written SVG,
  procedural drawing, or a 3D scene) is **[Builder]**. Claude's leaning is 2D
  sprites drawn back to front, which runs well on phones.
- Pan and pinch-zoom the map. Tap a unit to see where it can move and what it can
  attack.
- Sound: a few original effects in stage 1, no music. **[Claude's call]**

### 8.5 Trust **[Claude's call, told to David]**

With no server of our own, every phone in a match can technically read the whole
match, including what is under the other player's fog. Fog of war therefore relies
on nobody digging into the data. That is acceptable for friends and family. The
room code is the credential, as in Deutsch Dash.

### 8.6 Constraints

- Built on David's Linux machine "ClaudeComputer". It has Node 24 and the Android
  SDK, no Mac and no Android emulator.
- Checking on real devices: the Pixel 10 Pro over ADB, and the iPhone by David.
- Firebase free plan. No paid services in stages 1 and 2.
- Project lives at `~/projects/banners`, its own git repo.

### 8.7 Testing **[Claude's call]**

- Rules engine: unit tests written before the code, and a determinism test that
  replays a recorded match and checks the final hash.
- AI: simulated AI-against-AI matches run in bulk to check balance between the
  two factions, match length, and that the adaptive AI converges on close games
  against scripted opponents of different strengths.
- Database rules: tested against the Firebase emulator.
- Screens: driven in a phone-sized browser, then on the real phones.

## 9. Stage 1 is done when

- David can open a lobby on one phone, send a link, and a second phone joins.
- The two play a full live match, Spartans against Mongols, to elimination or
  resignation, with a working turn clock.
- Either player can instead play alone against the AI at easy, normal, hard or
  adaptive.
- Closing the browser mid-match and reopening the link resumes the match.
- It installs to the home screen on the Pixel 10 Pro and on David's iPhone.
- Both factions feel different to play, as described in 5.7 (hero-related parts
  excepted until stage 2).

## 10. Left to the builder

Numbers and formulas; the tech tree's contents; the building list; map generation
method; rendering technique and art pipeline; file layout; AI technique; the exact
database layout and rules; lobby and in-match screen layout.

## 11. Needs David

Before stage 1 can be finished (its done list needs two real phones on a deployed
site):

- A Firebase project for this game on the free plan. The Firebase command-line
  tool on ClaudeComputer is already signed in to his account, so Claude can
  create it on his say-so.
- Whether the GitHub repo is public. Free GitHub Pages needs a public repo, as
  Deutsch Dash is.
- Whether playing alone against the AI must work with no internet connection
  (see 12).

Later:

- A real name for the game, whenever he likes.
- At stage 3: which way to send notifications.
- At stage 5: details of each new faction.

## 12. Open question: solo play without internet

Not yet answered by David. It changes stage 1:

- If solo play must work offline, stage 1 needs the game cached on the phone, a
  local store for solo matches beside the Firebase one, and a careful update
  scheme, because two phones on different builds would disagree about the rules.
- If solo play may need a connection, stage 1 runs solo matches through the same
  Firebase match record as live ones, and the offline groundwork waits for stage 3,
  which needs part of it anyway for notifications.
