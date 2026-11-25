# Open questions for David

Background for each question in chat, in point form. Numbers match the chat and never change; answered questions
move to the bottom.

## Q1. Rules 9 balance swing (2026-11-25)

- Rules 9 built on branch rules9 (17820eb..3155ebb): first level-up needs 2 for everyone (Spartan -1 from level 2),
  level-2 gold reward 5, and Unhunker. Not merged or shipped.
- Sims, 200 matches each: normal Spartans 52.3 to 26.8%, Mongols 43.3 to 68.0%; hard 51.0 to 26.3%, Mongols 46.0 to
  71.8%. Stalls 9 to 10.5% (normal), 6 to 4% (hard).
- The growth change alone does all of it (gold kept at 6 gives 26.3 / 71.0). Spartans end with about 2.2 cities
  instead of 4.2; Mongols 5.4 instead of 3.5. City counts at round 10 barely move, so the gap opens mid-game.
- One growth point at level 1 swinging 25 points is suspicious (likely a cascade: later levels, rewards, the AI's
  expansion timing).
- Options:
  - A: find out why first (a short look at where the Spartan games go wrong), then a tuning pass to bring Spartans back
    to 45 to 55% while keeping the slower first level-up. My pick.
  - B: ship rules 9 now with the 5 gold and Unhunker only; leave the Spartan first level-up for a later rules version.
  - C: keep the growth change and give the Spartans a set boost elsewhere without the investigation.

## Answered

- Q3 (tuning and AI pass), 2026-11-24: proceed; done, report in docs/superpowers/plans/2026-11-24-rules8-tuning-report.md.
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
- Q1 to Q3 (rules 8 tuning), 2026-11-24 (David): Q1 leave normal balance as is; about 40% is good enough for now,
  revisit when more factions arrive. Q2 leave blockades; an edge case humans may use more than the AI. Q3 yes, fix the
  Adaptive AI dial before rules 8 ships (started 2026-11-24).
- Q1 (Deep stores trigger), 2026-11-24 (David): yes, the AI buys it only when a city is blockaded or nearly
  (enemies on 2 or more of its tiles); "no use to have it unless they're almost or are actively blockaded".
- Q1 (archers' attack facing), 2026-11-24 (David): keep it; archers aim side on along the bow and the horse
  archer shoots back over the rump.
- Q1 (Spartan first level-up), 2026-11-25 (David): A; the first level-up needs 2 growth for everyone, the Spartan
  -1 applies from level 2 on. Ships in rules 9 with the level-2 gold reward 6 to 5.
- Q1 (Next unit and End turn while a card is open), 2026-11-25 (David): C, leave it; tapping open space to clear the
  selection is fine.
