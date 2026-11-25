# Rules 8 tiles in the 3D look: report

Branch `mountains` (rules 8, app 0.6.0, unreleased), after the merge of main 0.5.3 (10c3c92). Code commit c2a1040.

## What was missing

The 3D terrain from 0.5.3 was written against rules 7:

- `layout.ts` RES_ID knew four resources, so `build.ts` failed to type check on `jewels` and `fish`.
- `input.ts` GL_RESOURCE listed four resources. Jewels and fish fell back to the SVG resource layer, so they
  showed as flat SVG marks on the 3D ground.
- GlTile had no `harvested` field. A harvested resource was drawn at full strength in 3D, where the SVG fades it,
  and a harvest did not change the map signature, so the tile was never rebuilt.
- The mountain layout cleared the front of the tile only for a `mine`. A `foundry` (the mine's upgrade) got the full,
  unshared peak, with the SVG foundry drawn over it.
- `input.test.tsx` built Tiles without `harvested`.

Every building, including the five rules 8 ones, is drawn by the SVG layer in both looks (BuildingMark). The 3D
layout already leaves room for buildings: no resource props on a built tile, and a grove along the back of a forest
(this covers the lumber mill as it does the lumber camp). So no building needed 3D art. Only the foundry needed the
mountain to move back.

## What I drew and changed (src/ui/terrain3d only; units/ untouched)

- `input.ts`: GlTile gets `harvested`. GL_RESOURCE lists all six resources, so with 3D on the SVG never draws a
  resource on a 3D terrain: each resource is drawn once. The map signature includes the harvest flag (also in
  `terrain3d.ts`' per-tile cache code).
- `layout.ts`:
  - RES_ID has jewels 5 and fish 6. RES_HARVESTED (8) is added to the ground's resource id on a harvested tile.
  - Setup has `faded`.
  - Jewels share the mountain the way ore does. The main cluster stands in the front corner, up to four smaller
    clusters sit on the slopes, and the rock never gets the ore tint.
  - Fish are one `fish` prop on water, with no ground shadow.
  - Mine and foundry both move the peak back (MOUNTAIN_WORKS).
  - A harvested ore mountain keeps plain grey rock. Its deposits fade.
- `build.ts`:
  - `gemCluster`: the approach of the approved biomes sample (jewels-3d.png): seven six-sided prisms with pointed
    tips, glossy, fanned out, no rock under them. The seed turns the colours.
  - `fishLeap`: two orange fish (the SVG mark's colours) leaping over ripple rings, plus a fin breaking the water.
  - `fade()`: a harvested resource's parts (props and cropland tufts) are mixed 55 percent toward the ground's tone,
    matching the SVG mark's 0.45 opacity. Their glint drops to 0.3 and their outline to 0.4. The parts stay opaque, so
    the merged prop mesh and its outline pass need no transparency.
- `shaders.ts`: on a harvested tile the ground tint of the resource (cropland straw, ore rust) is cut to 0.45.
- Original art only. Nothing comes from Hexonia.

## Tests added

- `build.test.ts` (new):
  - every resource has props, and a harvested one has the same geometry with different colours;
  - the ground carries the resource id plus the harvest flag;
  - jewels are far more saturated than ore.
- `layout.test.ts`:
  - jewels layout;
  - fish layout with no shadow;
  - a harvested resource is still laid out and marked faded, and a building replaces it;
  - foundry peaks equal mine peaks;
  - the mill keeps the camp's grove;
  - the field buildings leave the tile bare.
- `input.test.tsx`:
  - jewels and fish, fresh or harvested, are in the SVG with 3D off and absent with it on;
  - all nine buildings stay in the SVG with 3D on;
  - a harvest changes the map signature.

## Screenshots (`shots/rules8-3d/`)

`scripts/rules8-3d-shots.ts` takes the shots (`npx tsx scripts/rules8-3d-shots.ts`, after `vite build`). It uses
seed 7 at 915 x 412 and rewrites the two rings round the first capital into a showcase.

- `showcase-3d.png` and `showcase-svg.png`: the whole showcase in both looks.
- Close crops, each as `<name>-3d.png` and `<name>-svg.png`:
  - resources: jewels, jewels-harvested, fish, fish-harvested;
  - harvested resources: harvested-orchard, harvested-cropland, harvested-game, harvested-ore;
  - unharvested references: orchard, game, ore;
  - new buildings: orchard-building, plantation, lumber-mill, foundry, granary.

The crops are centred on each tile's centre and catch some of the neighbouring tiles. The showcase shots are the
clearest view.

## Test results

- `npx tsc -b`: clean.
- `npm run lint`: clean.
- `npx vitest run`: 1221 passed, 124 skipped, 1 failed. The failure is `src/ui/text.test.ts` "rules 8: whatsNew is
  three sentences". It also fails without this work: the 0.5.3 merge appended a fourth sentence about the 3D look to
  `whatsNew` in `src/ui/text.ts`. I left the text and its test alone because they are a wording decision.
- `GITHUB_PAGES_BASE=/warbanners/ npx vite build`: ok.
- `npm run test:browser` (with the sub-path): ai 6 passed; the rest 50 passed and 2 skipped.
- `npm run test:emu`: not run, because nothing in src/net or src/online changed.

## Concerns

- The SVG foundry's grey chimney sits against the grey 3D peak behind it, so it reads less well than in the SVG look.
  The mine has the same problem. Ways to fix it: tint the peak, or give the chimney an outline.
- When a city stands next to a fish tile, the city's flag can cover one of the fish.
