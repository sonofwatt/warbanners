# Open questions for David

Background for each question in chat, in point form. Numbers match the chat and never change; answered questions
move to the bottom.

## Q3. Tuning and AI pass (answered 2026-11-24: proceed)

- New tree sims, 200 matches each: Spartans 60 to 72%, Mongols 18 to 30%, stalls 10 to 22%.
- Started 2026-11-24: balance, stalls, wasted tech buys (Fishing, Walls), Spartans never train Swordsmen, re-pin
  the slow AI checks.

## Q1 to Q3. Rules 8 tuning results (2026-11-24)

- Report: docs/superpowers/plans/2026-11-24-rules8-tuning-report.md (branch mountains, ae53226..ab828e2, pushed,
  not merged). Targets: 45 to 55% each side, seats within about 5 points, stalls under 8%.
- Results (200 matches): Horseman start normal 50.2 / 45.3, stalls 9%; hard 49.0 / 48.3, stalls 5.5%. Second seed set
  normal 56.3 / 41.5, stalls 4.5%; hard 49.3 / 49.3, stalls 3%. Warrior start hard 40.8 / 55.5.
- Why Mongols fell: no Mongol roads (about 19 points), lost riding half-point (about 11). Fixes: Mongol growthExtra
  1 to 0, Mongol tribute 3 to 4. AI: no useless techs, values blockades, takes champions, pushes late to end stalls.
- Q1 (normal balance): normal Mongols are 41.5 to 45.3%, at the edge. One more small Mongol lever and a 400-match
  confirm (my pick), or ship as is?
- Q2 (blockades): blockades are rare in play (under 2 gold cut a match); Spartans spend 8 to 12 gold on Deep stores
  for under 2 gold saved. Make the AI surround cities more often (my pick, the stronger lever), raise the cut, or leave it?
- Q3 (Adaptive AI): its automatic check fails (it adapts too weakly: gap 0.096 vs 0.15 target; already failing before
  this pass). Fix the adaptive dial before rules 8 ships (my pick), or ship and fix after? Your idea (Adaptive forces
  a random opponent faction) would come with the biomes version.
- Seat split swings 7 to 13 points at normal, within noise for 200 matches; a bigger run is needed before any seat lever.

## Answered

- Q2 (WebGL second pass): renders approved; ship it in the game as a System menu option, off by default
  (2026-11-24). Tweaks: straight summit (no crooked top), mountains 15% lower, one main peak plus 2 to 3 smaller sub-peaks, 3 to 4 variants of every terrain tile, keep rotating layouts.
- Q1 (Spartan slot, blockade), 2026-11-24: add a blockade rule that suppresses income, never stops it; Walls soften it;
  Spartans get a better blockade defence from the same column 3 tech instead of Walls. Blockade starts at 3 occupied neighbouring tiles and always costs at least 1 gold (David). Brief with draft numbers:
  docs/superpowers/plans/2026-11-24-blockade.md; built inside the Q3 tuning pass.
- Q4 (mountain redesign), 2026-11-24: David likes all three options (A broad massif, B layered range, C rocky crag)
  and will likely use all of them; how they are used depends on Q8. Code on branch mountain-options (c59858d).
- Q5 to Q8 (biomes), 2026-11-24: 1 to 3 biomes per map depending on map size; 1v1 maps are one biome 66% of the
  time and two biomes otherwise. Biomes are new looks only and play the same (sand, snow, jungle are reskins). Biome
  rules (snow slows, jungle blocks sight and so on) are noted for a later major version. Mountain shapes are tied to
  biomes. The biome mapgen mix (more sand and jewels, fewer orchards in arid) still changes maps, so it needs a
  RULES_VERSION and sims. Note: maps are mirrored halves today, so two biomes must split fairly between the seats.
- Q9 to Q13 (3D units), 2026-11-24: units always drawn on top; three-quarter turn; broken stage is right; more blood
  (today's stage 4 becomes stage 3, new stage 4 has 3x as much); try a lighter hero pennant. Also: add stratum lines
  to the rocky crag (C) mountains.
- Biome release, 2026-11-24 (David): biomes ship after rules 8, in their own rules version with balance sims.
- Biomes and difficulty, 2026-11-24 (David): each faction has its own starting tech and a best biome; easier
  difficulty starts a player in their best biome, harder outside it. Later, human vs human games let each player pick
  a difficulty that changes starting conditions and the number of cannibal camps. Recorded in the design spec, 5.12.
- Q1 and Q2 (faction biomes), 2026-11-24: Mongols grasslands; Spartans farmland with hills and some mountains (new
  fifth biome); arid for future factions. Against the AI, hard puts the AI in its best biome too; revisit in balance
  testing. New: multiplayer handicap up to +5 (giver leaves best biome, receiver gets theirs plus more starting
  resource tiles and treasures). Spec 5.12.
- Q1 to Q5 (biome sample), 2026-11-24: hoodoos arid only; farmland fields inside each hex; jungle denser and darker
  with wider canopies, vines and mist; per-seat biomes depend on difficulty or handicap, and a map can be all one
  biome; jewels their own resource (mostly mountains, sometimes sand or field), drawn as large crystal clusters with no
  grey mound. Farmland is a modifier, not a biome.
- Q1 to Q4 (biome modifiers), 2026-11-24: on hard, the AI's preferred biome sets the whole map (an AI that prefers
  arid makes the map all arid); this works most simply when the AI faction is random, and a player who picks both
  factions can choose an opponent with the same preference. New idea: Adaptive AI forces the opponent faction to
  random, so the game picks the biome to match the player's skill from the gameplay stats. Level names and the
  easy rich / normal normal / hard sparse mapping approved. Spartans and Mongols both prefer grasslands for now.
  Jewels on sand and field ship with biomes.
