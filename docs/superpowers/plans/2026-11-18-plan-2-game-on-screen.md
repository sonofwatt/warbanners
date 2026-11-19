# Banners Plan 2: The Game On Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two people can play a full Spartans against Mongols match on one phone, passing it between turns, in the diorama look, installed to the home screen, working with no connection, and deployed to GitHub Pages.

**Architecture:** A React app sits on top of the finished rules engine and never changes a match except through `applyAction`. A small store holds the match record (settings plus the ordered list of actions, the same shape online play will use) and saves it to the phone after every action. The board is one SVG drawn back to front from the fog-limited `playerView`; geometry, camera, gestures, picking and the tap-to-action logic are pure functions tested without a browser. A service worker caches the whole build so the game opens offline.

**Tech Stack:** React ^19.2, Zustand ^5, Vite ^8.2, @vitejs/plugin-react ^6, vite-plugin-pwa ^2.0 (with workbox-build and workbox-window ^7.4.1), Playwright ^1.62 (browser tests and icon rendering), cross-env ^10.1, on top of plan 1's TypeScript ~6.0, Vitest ^4.1, oxlint ^1.75, Node 24. Versions match `~/projects/deutsch-dash` where that project uses the same package.

**Spec:** `docs/superpowers/specs/2026-11-18-banners-design.md` (sections 5.1, 8.1 to 8.4, 8.7, 9) and `docs/rules/stage1-rules.md`. The look is fixed by `docs/design/look-b-diorama.html` and the list in it. Executors read all three. `docs/superpowers/plans/2026-11-18-plan-1-followups.md` lists what plan 1 handed to this plan.

**Where this sits:** Stage 1 of the design is four plans. This is the second.

1. Rules engine (done, on `main`).
2. The game on screen (this plan): diorama board, touch controls, two players on one phone, saves on the phone, offline install, first deploy.
3. AI: easy, normal, hard, adaptive, plus bulk simulated matches to tune the numbers.
4. Live online play: lobby, invite link, turn clock, rejoin, version check.

**Not in this plan:** any AI, any Firebase or network play, hero traits, tuning of game numbers, music.

## Decisions this plan makes

Each is the planner's call unless marked. Each is cheap to reverse.

- **SVG, not canvas.** About 2,000 shapes, turn-based, so SVG is fast enough, stays sharp at any zoom, and lets browser tests find a tile by attribute. Panning and zooming move one transform and never re-render React.
- **Art is drawn in code** as React components that emit SVG shapes. No image files except the app icon.
- **Saves use `localStorage`** behind a small interface. A whole match is well under 1 MB. The interface lets tests use a fake and lets plan 4 swap the store.
- **A saved match from another rules version cannot be resumed.** It is listed as "from an older version" and can only be deleted. (Spec 8.3 left this to the builder.)
- **A new build is never applied during a match.** The home screen offers it. (Spec 8.3.)
- **An unseen enemy can show as a gap in the move highlights**, because the engine refuses moves onto any occupied tile. Accepted for stage 1; plan 3 revisits it when the AI gets its fog-limited view. (Handed over by plan 1.)
- **Fog on screen [David, 2026-11-18]:** a revealed tile stays live. Tiles the player cannot currently see get a light veil so it is clear where enemy units may be standing unseen. The veil is the planner's call.
- **The digest of what happened on the other player's turn is kept in memory only.** After a reload it is empty.

## Global Constraints

- Never write an em dash or an en dash anywhere: code, comments, tests, commit messages, docs, text the game shows. Use a hyphen, a colon, or a new sentence.
- Nothing is copied from Hexonia or any other game: no names, text, numbers, art or layouts. Art follows only `docs/design/look-b-diorama.html`.
- Code outside `src/engine` imports the engine only through `src/engine/index.ts`.
- Nothing outside the engine changes a `MatchState`. Every change is an `Action` given to `applyAction`. The screen only ever offers actions that `legalActions` lists.
- The board draws only what `playerView(state, viewer)` returns. It never reads `state.units`, `state.cities` or `state.tiles` to draw.
- The engine stays pure: no DOM, no `Date`, no `Math.random`, no imports from outside `src/engine`. App code may use `Date` and `Math.random`.
- No DOM, `window`, `localStorage` or `navigator` access when a module loads. Tests run in Node with no DOM. Reach for them inside functions, components or effects, and guard with `typeof`.
- No request leaves the phone at run time except for the app's own files: no CDN, no web fonts, no analytics. Use the system font stack.
- Every display string lives in `src/ui/text.ts`. Wording is our own.
- Art: flat fills, no gradients, no outlines except thin props (a spear, a bow string). A figure never hard-codes its owner's colour: it takes it as a prop.
- Every control a finger must hit is at least 44 by 44 CSS pixels.
- It must work from 360 by 640 portrait to 915 by 412 landscape, with safe-area insets respected.
- Dependencies are limited to the Tech Stack list. Adding one needs the controller's ruling.
- Tests sit beside the code as `*.test.ts` or `*.test.tsx`. Write the failing test first. Component tests render with `renderToStaticMarkup` from `react-dom/server`. Tests that need a real browser live in `src/browser/` and run only when `BROWSER=1`.
- `npm test`, `npm run typecheck` and `npm run lint` are clean at every commit. All 208 engine tests keep passing.
- Every commit message ends with a `Co-Authored-By:` trailer naming the model that wrote the commit, with the address `noreply@anthropic.com`.
- Work on branch `plan-2-game-on-screen` in `~/projects/banners`. Git identity is already set locally. Do not push: the controller pushes in Task 16.

## Review Focus

1. A save that is damaged, half written, from another rules version, or missing because storage is full or blocked: the game still opens, says what happened in plain words, and never shows a blank screen or throws. Pinned in Tasks 9 and 11.
2. Clumsy touches: a tap that drifts a few pixels, a second finger landing mid-pan, a tap while an animation plays, a double tap on End turn. No stray action, no turn ended twice, no stuck gesture. Pinned in Tasks 3, 10 and 11.
3. Hot-seat secrecy: after End turn, after resuming a save, and after a reload mid-turn, nothing of a player's hidden view is drawn until that player dismisses the curtain. Pinned in Tasks 11 and 13.
4. Phone shapes: 360 pixels wide, landscape with a notch, rotating mid-match. Nothing clipped, no sideways scroll, every button reachable. Pinned in Task 13.
5. Offline and updates: the first open with no connection after install works; losing the connection mid-match changes nothing; a new build never swaps in under a running match. Pinned in Task 15.

---

## File Structure

```
index.html, vite.config.ts, .github/workflows/deploy.yml
public/icon.svg, favicon.svg, icon-180.png, icon-192.png, icon-512.png, icon-maskable-512.png
scripts/make-icons.mjs        renders the SVG icons to PNG with Playwright
src/main.tsx                  mounts the app
src/version.ts                APP_VERSION and the build label
src/boundaries.test.ts        import rules between engine, app and ui
src/engine/data/freeze.ts     deepFreeze for the data tables
src/engine/purity.test.ts     the engine stays pure
src/app/record.ts             MatchRecord: create, append, restore
src/app/saves.ts              list, write, read, delete on a key-value store
src/app/digest.ts             what happened to you on the other player's turn
src/app/store.ts              the app store: screens, the match, taps, saving
src/app/update.ts             service worker registration and update state
src/app/platform.ts           install advice per phone
src/ui/text.ts                every display string
src/ui/theme.css              colours, type, layout, safe areas
src/ui/App.tsx                picks the screen
src/ui/board/layout.ts        hex to board coordinates, bounds, depth order
src/ui/board/camera.ts        pan, zoom, clamp, screen to board
src/ui/board/gesture.ts       pointer events to tap, pan, zoom (pure)
src/ui/board/useGestures.ts   wires gesture.ts to an element
src/ui/board/scene.ts         a player's view to an ordered draw list, and picking
src/ui/board/Board.tsx        the SVG board
src/ui/board/effects.ts       game events to timed effects
src/ui/board/Effects.tsx      plays them
src/ui/art/palette.ts         colours from the look reference
src/ui/art/tiles.tsx          terrain, fog, veil, highlights, borders
src/ui/art/features.tsx       trees, peaks, resources, buildings, roads, villages, treasure, cities
src/ui/art/units.tsx          the eight shared figures and the status overlay
src/ui/art/factionUnits.tsx   the eight faction figures
src/ui/art/ArtSheet.tsx       every tile and figure on one page (open with ?sheet=1)
src/ui/interaction.ts         selection and tap logic (pure)
src/ui/panels/                Hud, UnitPanel, CityPanel, TilePanel, TechSheet, RewardSheet, Menu, DigestCard
src/ui/screens/               Home, Setup, Pass, Match, Result
src/ui/sound.ts               a few generated sound effects
src/browser/harness.ts        serves the built app and opens a phone-sized page
src/browser/*.test.ts         board, flow, offline, coverage
```

Coordinates used by every board and art file: **board units**. A tile's top face is centred on its board point, the tile radius is 30, and y grows down the screen.

---

### Task 1: Toolchain, app shell and engine hand-over items

**Files:**
- Modify: `package.json`, `tsconfig.json`, `.gitignore`, `src/engine/index.ts`, `src/engine/data/{config,units,techs,factions}.ts`, `README.md`, `CLAUDE.md`
- Create: `index.html`, `vite.config.ts`, `src/main.tsx`, `src/version.ts`, `src/ui/App.tsx`, `src/ui/theme.css`, `src/engine/data/freeze.ts`, `src/engine/data/freeze.test.ts`, `src/engine/purity.test.ts`, `src/boundaries.test.ts`

**Interfaces:**
- Produces: `deepFreeze<T>(value: T): T`; `APP_VERSION: string` (`'0.2.0'`) and `BUILD: string` in `src/version.ts`; the `App` component; these extra exports from `src/engine/index.ts`:

```ts
export { key, parseKey, distance, neighbors, range } from './hex';
export type { Hex, HexKey } from './hex';
export type { PlayerView } from './vision';
export { trainRefusal, campTrainRefusal, unitsOf } from './training';
export { harvestRefusal, buildRefusal, roadRefusal, wallsRefusal } from './economy';
```

- Scripts in `package.json`: `dev` (`vite`), `build` (`tsc --noEmit && vite build`), `preview` (`vite preview`), `test`, `test:browser` (`vite build && cross-env BROWSER=1 vitest run src/browser`), `typecheck`, `lint`, `sim`, `icons`.

- [ ] **Step 1: Branch and install**

```bash
git checkout -b plan-2-game-on-screen
npm install react@^19.2 react-dom@^19.2 zustand@^5
npm install -D vite@^8.2 @vitejs/plugin-react@^6 @types/react@^19.2 @types/react-dom@^19.2 playwright@^1.62 cross-env@^10.1
```

- [ ] **Step 2: Write the failing tests**

`src/engine/data/freeze.test.ts`:

```ts
test('the data tables cannot be changed', () => {
  expect(Object.isFrozen(UNITS.hoplite.traits)).toBe(true);
  expect(Object.isFrozen(CONFIG.terrain.field)).toBe(true);
  expect(Object.isFrozen(TECHS.bronze)).toBe(true);
  expect(Object.isFrozen(FACTIONS.mongols)).toBe(true);
  expect(() => { (UNITS.warrior as { atk: number }).atk = 99; }).toThrow(TypeError);
  expect(UNITS.warrior.atk).toBe(4);
});
```

`src/engine/purity.test.ts` reads every tracked non-test file under `src/engine` (from `git ls-files`), strips comments, and expects: no import that resolves outside `src/engine`; no match for `/\b(document|window|localStorage|navigator|fetch|Date|Math\.random)\b/`. It also expects the file list to include `src/engine/apply.ts`, so an empty list cannot pass.

`src/boundaries.test.ts` reads every tracked file under `src/ui`, `src/app` and `src/browser`, and `src/main.tsx`, and expects every import specifier that contains `/engine` to end in `/engine` or `/engine/index`. It expects the file list to include `src/ui/App.tsx`.

- [ ] **Step 3: Run them and see them fail**

Run: `npm test`
Expected: the three new files fail (tables not frozen, `src/ui/App.tsx` missing). The 208 engine tests pass.

- [ ] **Step 4: Freeze the tables**

`deepFreeze` freezes an object and everything reachable from it, and returns it with its type unchanged. Wrap the exported value in each of the four data files. If any engine test now fails, the engine was writing to a table: fix the engine code, not the test.

- [ ] **Step 5: Configure the build**

- `tsconfig.json`: add `"lib": ["ES2023", "DOM", "DOM.Iterable"]`, `"jsx": "react-jsx"`, `"types": ["node", "vite/client"]`; include `src`, `scripts`, `vite.config.ts`.
- `vite.config.ts`: `base: process.env.GITHUB_PAGES_BASE ?? '/'`; the React plugin; `define: { __BUILD__: JSON.stringify((process.env.GITHUB_SHA ?? 'dev').slice(0, 7)) }`; `test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}'] }`.
- `index.html`: `lang="en"`, viewport `width=device-width, initial-scale=1, viewport-fit=cover`, title `Banners`, a `#root`, the module script `/src/main.tsx`. No external links.
- `src/version.ts`: `APP_VERSION = '0.2.0'`; `BUILD` reads `__BUILD__` behind a `typeof` guard and falls back to `'dev'`.
- `.gitignore`: add `dist/` if missing, `test-results/`.

- [ ] **Step 6: The shell**

`App` renders a `<main>` with the heading `Banners` and a footer line `v0.2.0 (dev) rules 1` built from `APP_VERSION`, `BUILD` and `RULES_VERSION`. `theme.css` sets the system font stack, `margin: 0`, `min-height: 100dvh`, and padding from `env(safe-area-inset-*)`. Add to `src/ui/App.test.tsx`:

```tsx
test('the shell names the game and its versions', () => {
  const html = renderToStaticMarkup(<App />);
  expect(html).toContain('Banners');
  expect(html).toContain(`v${APP_VERSION}`);
  expect(html).toContain(`rules ${RULES_VERSION}`);
});
```

- [ ] **Step 7: Verify**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all pass; `dist/index.html` exists.

- [ ] **Step 8: Update the docs and commit**

`README.md`: replace "This repository holds plan 1 only" with what the repo now holds and add `npm run dev` and `npm run build`. `CLAUDE.md`: add the import rule and the "no DOM when a module loads" rule under a "Code layout" heading.

```bash
git add -A && git commit -m "Add the app shell, freeze the data tables, guard the engine boundary"
```

---

### Task 2: Board geometry

**Files:**
- Create: `src/ui/board/layout.ts`, `src/ui/board/layout.test.ts`

**Interfaces:**
- Consumes: `parseKey`, `key`, `range`, `HexKey` from the engine.
- Produces:

```ts
export const R = 30;          // tile radius, centre to corner, in board units
export const SQUASH = 0.62;   // vertical scale of the tilt
export const THICK = 9;       // height of the tile's side wall (0.3 of R)
export const FIGURE_H = 34;   // how far a figure stands above its tile centre
export interface Pt { x: number; y: number }
export interface Box { minX: number; minY: number; maxX: number; maxY: number }
export function hexToBoard(k: HexKey): Pt;          // centre of the tile's top face
export function tileCorners(k: HexKey): Pt[];       // six corners of the top face, clockwise from lower right
export function boardToHex(p: Pt): HexKey;          // the hex whose top face holds p (nearest by cube rounding)
export function boardKeys(radius: number): HexKey[]; // every hex of the board, back to front
export function depthOrder(a: HexKey, b: HexKey): number; // sort comparator: smaller y first, then smaller x
export function boardBounds(radius: number): Box;   // includes side walls below and figure height above
export function edgeDirs(): readonly Pt[];          // unit direction to each of the six neighbours, same order as the engine's DIRS
```

Pointy-top axial layout: `x = R * sqrt(3) * (q + r / 2)`, `y = R * 1.5 * SQUASH * r`. Corner `i` sits at angle `30 + 60 * i` degrees: `(x + R * cos, y + R * sin * SQUASH)`.

- [ ] **Step 1: Write the failing test**

```ts
test('tile centres', () => {
  expect(hexToBoard('0,0').x).toBeCloseTo(0, 5);
  expect(hexToBoard('0,0').y).toBeCloseTo(0, 5);
  expect(hexToBoard('1,0').x).toBeCloseTo(51.96, 2);
  expect(hexToBoard('1,0').y).toBeCloseTo(0, 5);
  expect(hexToBoard('0,1').x).toBeCloseTo(25.98, 2);
  expect(hexToBoard('0,1').y).toBeCloseTo(27.9, 5);
  expect(hexToBoard('-2,5').x).toBeCloseTo(25.98, 2);
  expect(hexToBoard('-2,5').y).toBeCloseTo(139.5, 5);
});
test('tiles meet with no gap', () => {
  const a = tileCorners('0,0')[0]!, b = tileCorners('0,1')[4]!;
  expect(a.x).toBeCloseTo(25.98, 2); expect(a.y).toBeCloseTo(9.3, 5);
  expect(b.x).toBeCloseTo(a.x, 5); expect(b.y).toBeCloseTo(a.y, 5);
});
test('every tile of the stage 1 board is found from its centre and from 10 units off it', () => {
  const keys = boardKeys(6);
  expect(keys).toHaveLength(127);
  for (const k of keys) {
    const c = hexToBoard(k);
    expect(boardToHex(c)).toBe(k);
    expect(boardToHex({ x: c.x + 10, y: c.y })).toBe(k);
    expect(boardToHex({ x: c.x, y: c.y - 10 })).toBe(k);
  }
});
test('back to front order', () => {
  const keys = boardKeys(6);
  for (let i = 1; i < keys.length; i++) {
    expect(hexToBoard(keys[i]!).y).toBeGreaterThanOrEqual(hexToBoard(keys[i - 1]!).y - 1e-9);
  }
});
test('bounds of the stage 1 board', () => {
  const b = boardBounds(6);
  expect(b.minX).toBeCloseTo(-337.75, 1); expect(b.maxX).toBeCloseTo(337.75, 1);
  expect(b.minY).toBeCloseTo(-220.0, 1);  expect(b.maxY).toBeCloseTo(195.0, 1);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/ui/board/layout.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `layout.ts`** to the signatures above. `boardToHex` divides `y` by `SQUASH`, converts to fractional axial coordinates, and rounds in cube coordinates.

- [ ] **Step 4: Run it and see it pass**, then commit:

```bash
git add src/ui/board && git commit -m "Add board geometry for the tilted hex layout"
```

---

### Task 3: Camera and gestures

**Files:**
- Create: `src/ui/board/camera.ts`, `src/ui/board/camera.test.ts`, `src/ui/board/gesture.ts`, `src/ui/board/gesture.test.ts`

**Interfaces:**
- Consumes: `Pt`, `Box`, `R` from `layout.ts`.
- Produces:

```ts
// camera.ts
export interface Camera { cx: number; cy: number; scale: number } // board point at the viewport centre; pixels per board unit
export interface Viewport { w: number; h: number }
export const DEFAULT_TILE_PX = 64;   // tile width on screen when a match opens
export const MAX_TILE_PX = 110;      // closest zoom
export function fitScale(bounds: Box, vp: Viewport): number;   // whole board visible with a 16 px margin; this is the farthest zoom
export function startCamera(focus: Pt, bounds: Box, vp: Viewport): Camera; // DEFAULT_TILE_PX, centred on focus, clamped
export function panBy(c: Camera, dxPx: number, dyPx: number, bounds: Box, vp: Viewport): Camera;
export function zoomAt(c: Camera, factor: number, atPx: Pt, bounds: Box, vp: Viewport): Camera; // the board point under atPx stays under it
export function refit(c: Camera, bounds: Box, vp: Viewport): Camera;   // after a rotation or resize: same centre, scale re-clamped
export function screenToBoard(c: Camera, vp: Viewport, px: Pt): Pt;
export function boardToScreen(c: Camera, vp: Viewport, p: Pt): Pt;

// gesture.ts
export const TAP_SLOP_PX = 10;
export const TAP_MAX_MS = 350;
export type PointerInput = { type: 'down' | 'move' | 'up' | 'cancel'; id: number; x: number; y: number; t: number };
export type GestureOut = { kind: 'tap'; at: Pt } | { kind: 'pan'; dx: number; dy: number } | { kind: 'zoom'; factor: number; at: Pt } | null;
export interface GestureState { /* opaque to callers */ }
export const IDLE: GestureState;
export function gesture(s: GestureState, e: PointerInput): { state: GestureState; out: GestureOut };
```

The tile width on screen is `R * sqrt(3) * scale`. Scale is clamped between `fitScale` and `MAX_TILE_PX / (R * sqrt(3))`; if the fit scale is the larger, use it for both. The camera centre is clamped inside `bounds`.

Gesture rules: one pointer that lifts within `TAP_MAX_MS` having moved no more than `TAP_SLOP_PX` is a tap. Once it moves farther it is a pan and can never become a tap; the first `pan` output carries the whole movement since the touch began. A second pointer starts a pinch: each move reports `zoom` with the ratio of the new finger distance to the previous one, at the midpoint, and no tap can come from either finger. When one of two fingers lifts, the other carries on as a pan from where it is, with no jump. `cancel` returns to `IDLE` with no output. A third pointer is ignored.

- [ ] **Step 1: Write the failing tests**

```ts
// camera.test.ts
const B = boardBounds(6), VP = { w: 412, h: 915 };
test('fit shows the whole board', () => { expect(fitScale(B, VP)).toBeCloseTo(380 / 675.5, 3); });
test('a match opens at the default zoom on its focus', () => {
  const c = startCamera(hexToBoard('-2,5'), B, VP);
  expect(R * Math.sqrt(3) * c.scale).toBeCloseTo(64, 5);
  expect(c.cx).toBeCloseTo(25.98, 2); expect(c.cy).toBeCloseTo(139.5, 2);
});
test('zoom keeps the point under the finger', () => {
  const vp = { w: 400, h: 800 };
  const c = zoomAt({ cx: 0, cy: 0, scale: 1 }, 2, { x: 300, y: 400 }, B, vp);
  expect(c.cx).toBeCloseTo(50, 5); expect(c.cy).toBeCloseTo(0, 5); expect(c.scale).toBeCloseTo(2, 5);
});
test('zoom and pan are clamped', () => {
  expect(zoomAt({ cx: 0, cy: 0, scale: 1 }, 100, { x: 0, y: 0 }, B, VP).scale).toBeCloseTo(110 / (30 * Math.sqrt(3)), 5);
  expect(zoomAt({ cx: 0, cy: 0, scale: 1 }, 0.001, { x: 0, y: 0 }, B, VP).scale).toBeCloseTo(fitScale(B, VP), 5);
  const far = panBy({ cx: 0, cy: 0, scale: 1 }, -99999, -99999, B, VP);
  expect(far.cx).toBeCloseTo(B.maxX, 5); expect(far.cy).toBeCloseTo(B.maxY, 5);
});
test('screen and board convert both ways', () => {
  const c = { cx: 12, cy: -7, scale: 1.3 };
  const p = screenToBoard(c, VP, { x: 100, y: 500 });
  const back = boardToScreen(c, VP, p);
  expect(back.x).toBeCloseTo(100, 5); expect(back.y).toBeCloseTo(500, 5);
});

// gesture.test.ts
const run = (events: PointerInput[]) => { let s = IDLE; const outs: GestureOut[] = []; for (const e of events) { const r = gesture(s, e); s = r.state; if (r.out) outs.push(r.out); } return outs; };
const ev = (type: PointerInput['type'], id: number, x: number, y: number, t: number): PointerInput => ({ type, id, x, y, t });
test('a short still touch is a tap', () => {
  expect(run([ev('down', 1, 50, 50, 0), ev('move', 1, 54, 53, 40), ev('up', 1, 54, 53, 120)])).toEqual([{ kind: 'tap', at: { x: 54, y: 53 } }]);
});
test('a long touch is not a tap', () => { expect(run([ev('down', 1, 50, 50, 0), ev('up', 1, 50, 50, 500)])).toEqual([]); });
test('a drag pans and never taps', () => {
  const o = run([ev('down', 1, 50, 50, 0), ev('move', 1, 80, 50, 30), ev('move', 1, 90, 60, 60), ev('up', 1, 90, 60, 90)]);
  expect(o.every(x => x!.kind === 'pan')).toBe(true);
  expect(o.reduce((n, x) => n + (x as { dx: number }).dx, 0)).toBe(40);
});
test('two fingers zoom and no tap follows', () => {
  const o = run([ev('down', 1, 100, 100, 0), ev('down', 2, 200, 100, 10), ev('move', 2, 300, 100, 30), ev('up', 2, 300, 100, 50), ev('up', 1, 100, 100, 60)]);
  expect(o).toEqual([{ kind: 'zoom', factor: 2, at: { x: 200, y: 100 } }]);
});
test('lifting one finger of a pinch does not jump the board', () => {
  const o = run([ev('down', 1, 100, 100, 0), ev('down', 2, 200, 100, 10), ev('up', 1, 100, 100, 20), ev('move', 2, 210, 100, 40)]);
  expect(o).toEqual([{ kind: 'pan', dx: 10, dy: 0 }]);
});
test('cancel resets', () => { expect(run([ev('down', 1, 5, 5, 0), ev('cancel', 1, 5, 5, 10), ev('up', 1, 5, 5, 20)])).toEqual([]); });
```

- [ ] **Step 2: Run them and see them fail.** Run: `npx vitest run src/ui/board`. Expected: FAIL, modules not found.
- [ ] **Step 3: Implement `camera.ts` and `gesture.ts`.** Both are pure: no DOM.
- [ ] **Step 4: Run them and see them pass**, then commit:

```bash
git add src/ui/board && git commit -m "Add the camera and the touch gesture reducer"
```

---

### Task 4: Palette, tiles and map features

**Files:**
- Create: `src/ui/art/palette.ts`, `src/ui/art/tiles.tsx`, `src/ui/art/features.tsx`, `src/ui/art/ArtSheet.tsx`, `src/ui/art/tiles.test.tsx`, `src/ui/art/features.test.tsx`
- Modify: `src/ui/App.tsx` (render `ArtSheet` when the page URL has `?sheet=1`)

**Interfaces:**
- Consumes: `R`, `SQUASH`, `THICK`, `tileCorners`, `edgeDirs` from `layout.ts`; engine types.
- Produces (every component draws around the origin, in board units; the caller places it with a `<g transform>`):

```tsx
// palette.ts: [top, left wall, right wall]
export const GROUND: Record<'grass' | 'water' | 'rock' | 'sand' | 'fog', readonly [string, string, string]>;
export const SKIN = '#E8B88A';
export const PLAYER_COLOURS: Record<FactionId, { main: string; dark: string }>;   // spartans crimson, mongols blue
export const ACCENT: Record<FactionId, string>;                                    // spartans bronze, mongols gold
export function playerColour(faction: FactionId): { main: string; dark: string }; // stage 1: a player's colour is their faction's

// tiles.tsx
export function TileBase(p: { ground: 'grass' | 'water' | 'rock' | 'sand' | 'fog' }): ReactElement; // top face and two side walls
export function Veil(): ReactElement;                                  // dark top-face overlay at 22% for explored tiles out of sight
export function Highlight(p: { mark: Mark }): ReactElement;            // drawn on the top face, under figures
export function Border(p: { edges: readonly number[]; colour: string }): ReactElement; // territory edge lines
export type Mark = 'move' | 'attack' | 'ability' | 'selected' | 'capture';
export function groundFor(tile: Tile, hasCity: boolean): 'grass' | 'water' | 'rock' | 'sand';

// features.tsx
export function TerrainFeature(p: { terrain: Terrain; variant: number }): ReactElement | null; // trees, peak with white cap, two wave strokes; null for field
export function ResourceMark(p: { resource: Resource }): ReactElement;
export function BuildingMark(p: { building: BuildingId }): ReactElement;
export function Road(p: { links: readonly number[] }): ReactElement;  // a path from the centre toward each linked neighbour; a dot when links is empty
export function Village(): ReactElement;
export function Treasure(): ReactElement;
export function CityMark(p: { faction: FactionId; colour: { main: string; dark: string }; level: number; capital: boolean; walls: boolean; pending: boolean }): ReactElement;
```

Colours come from the look reference: grass `#A9D975 #86B957 #74A54A`, water `#7CC8EE #57A6CF #4792BB`, rock `#CFC8B6 #ABA493 #989181`, sand `#EAD7A0 #C9B47A #B5A069`, crimson `#B3261E` with dark `#8E1D17`, blue `#2D6DB5` with dark `#1F4F87`, bronze `#C8963E`, gold `#D4A72C`. Fog is `#E9EEF2 #CBD3DA #B9C2CA`.

What each piece shows, so it reads at a 40 pixel tile:

- Forest: two or three cone trees on brown trunks; `variant` (0 to 2) moves them so forests do not look stamped. Mountain: one grey peak, lighter left face, darker right face, white cap. Water: two short white wave strokes.
- Orchard: a round tree with red fruit dots. Cropland: three rows of yellow stalks. Game: a small brown deer. Ore: a dark rock with two pale glints.
- Farm: a small barn with furrows. Lumber camp: a log pile and a lean-to. Mine: a timber-framed dark doorway. Market: a stall with a striped awning.
- Village: two neutral huts with grey-brown roofs. Treasure: a small chest with a glint.
- City: a sand tile's worth of buildings whose number grows with level (level 1 is two, each level adds one, at most six), roofs in the owner's colour. Spartan cities are blocky pale houses with a pediment; Mongol cities are round tents with one hall. A capital flies a banner on a pole. Walls are a low palisade arc across the front. `pending` adds a small bright star above the city.
- Highlights: `move` is a white dot, `attack` a red ring, `ability` a gold ring, `capture` a gold flag mark, `selected` a white ring around the whole top face.

- [ ] **Step 1: Write the failing tests**

```tsx
// tiles.test.tsx
const html = (el: ReactElement) => renderToStaticMarkup(<svg>{el}</svg>);
test('a tile has a top and two walls in its three colours', () => {
  const h = html(<TileBase ground="grass" />);
  for (const c of GROUND.grass) expect(h).toContain(c);
  expect((h.match(/<polygon/g) ?? []).length).toBe(3);
});
test('ground follows terrain, and a city tile is sand', () => {
  const t = (terrain: Terrain): Tile => ({ terrain, resource: null, building: null, road: false, village: false, treasure: false, cityId: null });
  expect(groundFor(t('field'), false)).toBe('grass'); expect(groundFor(t('forest'), false)).toBe('grass');
  expect(groundFor(t('mountain'), false)).toBe('rock'); expect(groundFor(t('water'), false)).toBe('water');
  expect(groundFor(t('field'), true)).toBe('sand');
});
test('each mark draws something different', () => {
  const marks: Mark[] = ['move', 'attack', 'ability', 'selected', 'capture'];
  expect(new Set(marks.map(m => html(<Highlight mark={m} />))).size).toBe(5);
});
test('a border draws one line per edge', () => {
  expect((html(<Border edges={[0, 3, 4]} colour="#B3261E" />).match(/<line/g) ?? []).length).toBe(3);
});

// features.test.tsx
test('no gradients anywhere', () => {
  const all = [<TerrainFeature terrain="forest" variant={0} />, <TerrainFeature terrain="mountain" variant={0} />, <Village />, <Treasure />,
    <CityMark faction="spartans" colour={playerColour('spartans')} level={3} capital walls={false} pending={false} />];
  for (const el of all) expect(html(el)).not.toMatch(/Gradient|filter=/);
});
test('a field has no feature and the others do', () => {
  expect(TerrainFeature({ terrain: 'field', variant: 0 })).toBeNull();
  for (const t of ['forest', 'mountain', 'water'] as const) expect(html(<TerrainFeature terrain={t} variant={0} />).length).toBeGreaterThan(20);
});
test('every resource and building has its own drawing', () => {
  const r = (['orchard', 'cropland', 'game', 'ore'] as const).map(x => html(<ResourceMark resource={x} />));
  const b = (['farm', 'lumberCamp', 'mine', 'market'] as const).map(x => html(<BuildingMark building={x} />));
  expect(new Set([...r, ...b]).size).toBe(8);
});
test('a city carries its owner colour, grows with level, and shows capital, walls and pending', () => {
  const city = (o: Partial<Parameters<typeof CityMark>[0]>) => html(<CityMark faction="spartans" colour={playerColour('spartans')} level={1} capital={false} walls={false} pending={false} {...o} />);
  expect(city({})).toContain('#B3261E');
  expect(city({ colour: playerColour('mongols') })).toContain('#2D6DB5');
  expect(city({ level: 4 }).length).toBeGreaterThan(city({ level: 1 }).length);
  expect(city({ level: 9 })).toBe(city({ level: 5 }));
  expect(new Set([city({}), city({ capital: true }), city({ walls: true }), city({ pending: true }), city({ faction: 'mongols' })]).size).toBe(5);
});
test('a road reaches toward each linked neighbour', () => {
  expect(html(<Road links={[0, 3]} />)).not.toBe(html(<Road links={[1]} />));
  expect(html(<Road links={[]} />).length).toBeGreaterThan(10);
});
test('art stays inside its tile footprint', () => {
  // every number in every points, x, y, cx, cy, x1..y2 attribute of every feature is within -40..40
});
```

Write the last test out in full: collect the numeric coordinates from the markup of every component in this task and expect each within `[-40, 40]`.

- [ ] **Step 2: Run them and see them fail.** Run: `npx vitest run src/ui/art`. Expected: FAIL, modules not found.
- [ ] **Step 3: Implement the palette, tiles and features.**
- [ ] **Step 4: The art sheet.** `ArtSheet` lays out, on a plain background at 2 pixels per board unit: each ground, each terrain feature variant, each resource, each building, road with 0, 1, 2 and 3 links, village, treasure, a fog tile, a veiled tile, each highlight, and cities for both factions at levels 1, 3 and 5 with capital, walls and pending shown once each. Each has a small text label under it. `App` shows it when `new URLSearchParams(location.search).has('sheet')`, read inside the component.
- [ ] **Step 5: Run the tests and see them pass.** Then look at the sheet: `npm run dev`, open `/?sheet=1`, and check every piece against the look reference list. Fix what does not read.
- [ ] **Step 6: Commit**

```bash
git add src/ui && git commit -m "Draw the tiles, terrain, buildings and cities"
```

---

### Task 5: The eight shared figures

**Files:**
- Create: `src/ui/art/units.tsx`, `src/ui/art/units.test.tsx`
- Modify: `src/ui/art/ArtSheet.tsx`

**Interfaces:**
- Consumes: `palette.ts`.
- Produces:

```tsx
export interface FigureProps { colour: { main: string; dark: string }; accent: string }
export const SHARED_FIGURES: Record<'warrior' | 'spearman' | 'swordsman' | 'defender' | 'archer' | 'horseman' | 'knight' | 'catapult', (p: FigureProps) => ReactElement>;
export function Shadow(p: { wide?: boolean }): ReactElement;   // the soft blob under a figure: black at 18%
export function StatusOverlay(p: { hp: number; maxHp: number; spent: boolean; fresh: boolean; taunted: boolean; blinded: boolean }): ReactElement;
```

A figure stands with its feet at about `(0, 4)` and fits the box x from -20 to 20, y from -36 to 8. It is about one tile tall with a big head, a simple body in the owner's colour, and one or two props that tell it apart at a glance:

| Figure | What makes it readable |
|---|---|
| Warrior | small round wooden shield, short sword |
| Spearman | tall upright spear, oval shield |
| Swordsman | a sword in each hand, helmet with a plume in `accent` |
| Defender | a tower shield that hides most of the body |
| Archer | drawn bow, quiver on the back |
| Horseman | rider on a brown horse, short spear, no armour |
| Knight | rider on a horse wearing a cloth in the owner's colour, long lance, closed helm |
| Catapult | a wooden frame on two wheels with a raised throwing arm, a pennant in the owner's colour, no rider |

`StatusOverlay` draws above the figure: a row of health pips (one pip per 5 health, filled for health remaining, so a 15 health unit has three), and small marks for `taunted` and `blinded`. `spent` is not drawn here: the caller dims the whole figure. `fresh` draws a small "new" spark.

- [ ] **Step 1: Write the failing test**

```tsx
const P: FigureProps = { colour: playerColour('spartans'), accent: ACCENT.spartans };
const html = (el: ReactElement) => renderToStaticMarkup(<svg>{el}</svg>);
test('eight figures, each different', () => {
  const ids = Object.keys(SHARED_FIGURES);
  expect(ids).toHaveLength(8);
  expect(new Set(ids.map(id => html(SHARED_FIGURES[id as keyof typeof SHARED_FIGURES](P)))).size).toBe(8);
});
test('each figure wears the colour it is given and no other player colour', () => {
  for (const f of Object.values(SHARED_FIGURES)) {
    const red = html(f(P)), blue = html(f({ colour: playerColour('mongols'), accent: ACCENT.mongols }));
    expect(red).toContain('#B3261E'); expect(red).not.toContain('#2D6DB5');
    expect(blue).toContain('#2D6DB5'); expect(blue).not.toContain('#B3261E');
  }
});
test('each figure has a shadow, no gradient, and stays in its box', () => {
  // for each: contains fill-opacity="0.18"; no Gradient or filter; every coordinate within x -20..20 and y -36..8
});
test('health pips', () => {
  const pips = (hp: number, maxHp: number) => html(<StatusOverlay hp={hp} maxHp={maxHp} spent={false} fresh={false} taunted={false} blinded={false} />);
  expect((pips(15, 15).match(/data-pip="full"/g) ?? []).length).toBe(3);
  expect((pips(6, 15).match(/data-pip="full"/g) ?? []).length).toBe(2);
  expect((pips(1, 10).match(/data-pip="full"/g) ?? []).length).toBe(1);
  expect((pips(6, 15).match(/data-pip=/g) ?? []).length).toBe(3);
});
```

Write the third test out in full. Full pips are `ceil(hp / 5)`; total pips are `maxHp / 5`.

- [ ] **Step 2: Run it and see it fail.** Run: `npx vitest run src/ui/art/units.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement the figures and the overlay.**
- [ ] **Step 4: Add them to the art sheet** in both player colours, each on a grass tile, labelled. Look at the sheet at `/?sheet=1` and at a phone-sized window. Each figure must be told apart from the others at 40 pixels tall.
- [ ] **Step 5: Run the tests, see them pass, commit**

```bash
git add src/ui/art && git commit -m "Draw the eight shared unit figures"
```

---

### Task 6: The eight faction figures

**Files:**
- Create: `src/ui/art/factionUnits.tsx`, `src/ui/art/factionUnits.test.tsx`
- Modify: `src/ui/art/ArtSheet.tsx`

**Interfaces:**
- Consumes: `FigureProps`, `Shadow` from `units.tsx`.
- Produces:

```tsx
export const FACTION_FIGURES: Record<'hoplite' | 'kingsGuard' | 'piper' | 'scout' | 'horseArcher' | 'khansGuard' | 'skyCaller' | 'camp', (p: FigureProps) => ReactElement>;
export const FIGURES: Record<UnitTypeId, (p: FigureProps) => ReactElement>;   // shared and faction together
```

Same box and rules as Task 5, except the two champions, which may reach y -40.

| Figure | What makes it readable |
|---|---|
| Hoplite | large round bronze shield with a chevron in the owner's dark colour, crested helmet, long spear (the look reference shows this one) |
| King's Guard | taller than a hoplite, a cape in the owner's colour, a crest that runs side to side, bronze shield |
| Piper | no weapon, a double pipe held to the mouth, a short cloak |
| Krypteia Scout | crouched, hooded cloak in the owner's dark colour, a dagger |
| Horse Archer | rider with a drawn bow, a cap with a gold point (the look reference shows this one) |
| Khan's Guard | armoured horse, a lance with a horse-tail standard, taller than other riders |
| Sky Caller | rider with a staff hung with streamers in the owner's colour, a wide hat |
| Camp | a round felt tent on a two-wheeled cart, a small pennant in the owner's colour, no figure |

These are real peoples. Draw them from their history with respect: no caricature, one neutral skin tone (`SKIN`) for every figure.

- [ ] **Step 1: Write the failing test**

```tsx
test('all sixteen unit types have a figure, each different', () => {
  const ids = Object.keys(UNITS);
  expect(Object.keys(FIGURES).sort()).toEqual([...ids].sort());
  expect(new Set(ids.map(id => html(FIGURES[id as UnitTypeId](P)))).size).toBe(16);
});
```

Plus the colour, shadow, gradient and box tests of Task 5 run over `FACTION_FIGURES` (champions allowed to y -40).

- [ ] **Step 2: Run it and see it fail.** Expected: FAIL.
- [ ] **Step 3: Implement the eight figures.**
- [ ] **Step 4: Add them to the art sheet**, then add a last row: a small diorama of nine tiles that mirrors the look reference scene (Spartan city in the middle, hoplite, horse archer, mountain, forest, water, orchard) drawn with the real components, so the whole look can be judged against `docs/design/look-b-diorama.html`.
- [ ] **Step 5: Run the tests, see them pass, commit**

```bash
git add src/ui/art && git commit -m "Draw the Spartan and Mongol figures"
```

**Controller, after this task (not a subagent's job):** build, open `/?sheet=1` in a phone-sized browser, take a screenshot, and show it to David in the conversation. Do not wait for an answer: carry on with Task 7 and fold any feedback into a later fix.

---

### Task 7: Scene and picking

**Files:**
- Create: `src/ui/board/scene.ts`, `src/ui/board/scene.test.ts`

**Interfaces:**
- Consumes: `PlayerView`, `MatchState` types, `neighbors`, `parseKey`, `key` from the engine; `layout.ts`; `Mark` from `tiles.tsx`.
- Produces:

```ts
export interface SceneTile {
  kind: 'tile'; key: HexKey; at: Pt;
  fog: boolean;                    // never explored: nothing else about the tile is set
  tile: Tile | null; veiled: boolean;
  city: City | null;               // a city standing on this tile
  owner: PlayerId | null;          // owner of the city whose territory this tile is in
  borderEdges: number[];           // directions (engine DIRS order) where the neighbour has a different owner
  roadLinks: number[];             // directions where the neighbour has a road or a city
  mark: Mark | null;
}
export interface SceneUnit { kind: 'unit'; unit: Unit; at: Pt; mine: boolean; spent: boolean; selected: boolean }
export type SceneItem = SceneTile | SceneUnit;
export interface SceneInput {
  view: PlayerView; radius: number;
  marks: Readonly<Record<HexKey, Mark>>;
  selectedUnit: number | null;
  spentUnits: ReadonlySet<number>;   // own units with nothing left to do this turn
}
export function buildScene(input: SceneInput): SceneItem[];     // back to front; a tile comes before the unit standing on it
export function pick(items: readonly SceneItem[], p: Pt, radius: number): { unit: number | null; hex: HexKey | null };
```

Rules:

- One `SceneTile` for every hex of the board. A hex missing from `view.tiles` is `fog: true` with `tile: null`, no city, no owner, no edges.
- `veiled` is true for an explored tile that is not in `view.visible`.
- `owner` comes from `tile.cityId` and the matching city in `view.cities`. A border edge is listed where this tile has an owner and the neighbour in that direction is fog, off the board, or has a different owner.
- A road link is listed toward a neighbour that is explored and has `road` or a city on it. Only tiles with `road` get links.
- `pick` tests units first, front to back: a unit is hit when `p` is within 13 board units of its `at.x` and between `at.y - FIGURE_H` and `at.y + 6`. If no unit is hit, `hex` is `boardToHex(p)` when that hex is on the board, else null. When a unit is hit, `hex` is that unit's hex.

- [ ] **Step 1: Write the failing test** using the engine's real opening position:

```ts
const s = createMatch({ seed: 7, factions: ['spartans', 'mongols'] });
const input = (over: Partial<SceneInput> = {}): SceneInput => ({ view: playerView(s, 0), radius: s.radius, marks: {}, selectedUnit: null, spentUnits: new Set(), ...over });
const tiles = (items: SceneItem[]) => items.filter((i): i is SceneTile => i.kind === 'tile');
const units = (items: SceneItem[]) => items.filter((i): i is SceneUnit => i.kind === 'unit');

test('one tile per hex, unexplored ones are fog and carry nothing', () => {
  const t = tiles(buildScene(input()));
  expect(t).toHaveLength(127);
  const explored = new Set(s.players[0]!.explored);
  for (const x of t) {
    expect(x.fog).toBe(!explored.has(x.key));
    if (x.fog) { expect(x.tile).toBeNull(); expect(x.city).toBeNull(); expect(x.owner).toBeNull(); expect(x.borderEdges).toEqual([]); }
  }
});
test('the opening shows only my own unit and my capital', () => {
  const items = buildScene(input());
  expect(units(items).map(u => u.unit.owner)).toEqual([0]);
  const cap = tiles(items).find(t => t.city !== null)!;
  expect(cap.key).toBe('-2,5'); expect(cap.owner).toBe(0);
});
test('the items are back to front and a unit follows its tile', () => {
  const items = buildScene(input());
  for (let i = 1; i < items.length; i++) expect(items[i]!.at.y).toBeGreaterThanOrEqual(items[i - 1]!.at.y - 1e-9);
  const u = items.findIndex(i => i.kind === 'unit'), t = items.findIndex(i => i.kind === 'tile' && i.key === (items[u] as SceneUnit).unit.pos);
  expect(t).toBeLessThan(u);
});
test('territory has a closed border', () => {
  const t = tiles(buildScene(input()));
  const owned = t.filter(x => x.owner === 0);
  expect(owned).toHaveLength(7);
  expect(owned.reduce((n, x) => n + x.borderEdges.length, 0)).toBe(18);   // the outline of a radius 1 hexagon
  expect(t.find(x => x.key === '-2,5')!.borderEdges).toEqual([]);
});
test('a tile seen once and then left is veiled, not fogged', () => {
  const view = playerView(s, 0);
  const one = view.visible[0]!;
  const t = tiles(buildScene(input({ view: { ...view, visible: view.visible.filter(k => k !== one) } })));
  expect(t.find(x => x.key === one)!.veiled).toBe(true);
  expect(t.find(x => x.key === one)!.fog).toBe(false);
});
test('marks, selection and spent flags pass through', () => {
  const me = s.units.find(u => u.owner === 0)!;
  const items = buildScene(input({ marks: { '-2,4': 'move' }, selectedUnit: me.id, spentUnits: new Set([me.id]) }));
  expect(tiles(items).find(t => t.key === '-2,4')!.mark).toBe('move');
  expect(units(items)[0]).toMatchObject({ selected: true, spent: true, mine: true });
});
test('picking: the figure wins over the tile behind it, the tile wins elsewhere, off the board is nothing', () => {
  const items = buildScene(input());
  const me = units(items)[0]!;
  expect(pick(items, { x: me.at.x, y: me.at.y - 25 }, 6)).toEqual({ unit: me.unit.id, hex: me.unit.pos });
  expect(pick(items, hexToBoard('0,0'), 6)).toEqual({ unit: null, hex: '0,0' });
  expect(pick(items, { x: 5000, y: 5000 }, 6)).toEqual({ unit: null, hex: null });
});
```

- [ ] **Step 2: Run it and see it fail.** Expected: FAIL, module not found.
- [ ] **Step 3: Implement `scene.ts`.** Pure: no React, no DOM.
- [ ] **Step 4: Run it and see it pass**, then commit:

```bash
git add src/ui/board && git commit -m "Build the draw list from a player's view, with picking"
```

---

### Task 8: The board on screen

**Files:**
- Create: `src/ui/board/Board.tsx`, `src/ui/board/useGestures.ts`, `src/ui/board/Board.test.tsx`, `src/browser/harness.ts`, `src/browser/board.test.ts`
- Modify: `src/ui/App.tsx` (show a demo board when the URL has `?board=<seed>`), `src/ui/theme.css`

**Interfaces:**
- Consumes: Tasks 2 to 7.
- Produces:

```tsx
export interface BoardProps {
  items: readonly SceneItem[]; radius: number;
  factions: readonly FactionId[];            // faction of each player id, for colours and city style
  focus: HexKey;                             // where the camera starts; changing it re-centres
  onTap(hit: { unit: number | null; hex: HexKey | null }): void;
  children?: ReactNode;                      // effects, drawn inside the camera transform
}
export function Board(p: BoardProps): ReactElement;
export function useGestures(ref: RefObject<Element | null>, on: (out: NonNullable<GestureOut>) => void): void;

// src/browser/harness.ts
export async function openApp(query?: string, opts?: { width?: number; height?: number }): Promise<{ page: Page; close(): Promise<void> }>;
```

How it is built:

- One `<svg>` filling its container, with one `<g>` that carries the camera transform. Each tile is a `<g data-hex="q,r">` (with `data-fog="true"` when it is fog) holding an invisible `<circle r="1" data-centre="q,r">` at its centre, which is what browser tests tap. Each unit is a `<g data-unit="id" data-at="q,r">`. Items are drawn in scene order.
- Before the element has been measured (and in tests, which have no DOM) the board assumes a 412 by 915 viewport.
- The camera lives in a ref, not in React state. A pan or zoom writes the `<g>`'s `transform` attribute directly, at most once per animation frame. React is not re-rendered by a gesture.
- A tap is turned into board coordinates with `screenToBoard`, then `pick`, then `onTap`.
- A mouse wheel zooms at the pointer (for desktop and tests). The element has `touch-action: none`.
- On resize or rotation the camera is re-clamped with `refit`.
- A unit's group moves with a CSS transition of 180 ms on its transform, switched off under `prefers-reduced-motion`. Spent own units are drawn at 55% opacity. An enemy's hidden unit is never in the list, and the owner's own hidden unit is drawn at 70% opacity.
- `harness.ts` starts `vite preview` on a free port from `dist`, launches Chromium with a 412 by 915 touch viewport at device scale 2.6 (or the size given), opens the base path plus the query, and returns the page. The base path is `process.env.GITHUB_PAGES_BASE ?? '/'`.

- [ ] **Step 1: Write the failing tests**

```tsx
// Board.test.tsx (Node, static markup)
test('the board draws every tile and visible unit, and no fog tile leaks terrain', () => {
  const s = createMatch({ seed: 7, factions: ['spartans', 'mongols'] });
  const items = buildScene({ view: playerView(s, 0), radius: 6, marks: {}, selectedUnit: null, spentUnits: new Set() });
  const html = renderToStaticMarkup(<Board items={items} radius={6} factions={['spartans', 'mongols']} focus="-2,5" onTap={() => {}} />);
  expect((html.match(/data-hex=/g) ?? []).length).toBe(127);
  expect((html.match(/data-unit=/g) ?? []).length).toBe(1);
  expect((html.match(/data-fog="true"/g) ?? []).length).toBe(127 - s.players[0]!.explored.length);
});
```

```ts
// src/browser/board.test.ts
describe.runIf(process.env.BROWSER === '1')('the board in a browser', () => {
  test('tapping a tile reports that tile, before and after a zoom and a pan', async () => {
    // open ?board=7; the demo board writes the last tap to <output data-testid="last-tap">
    // tap the centre of [data-centre="-2,4"]: output reads hex -2,4
    // wheel-zoom in two steps, drag the board 80 px, tap the centre of [data-centre="-1,4"]: output reads hex -1,4
  });
  test('a drag does not count as a tap, and the page never scrolls', async () => {
    // drag 80 px: output unchanged; window.scrollX and scrollY are 0; document width equals viewport width
  });
  test('rotating keeps the board on screen', async () => {
    // set the viewport to 915 by 412: the capital tile's box is inside the viewport
  });
}, 60_000);
```

Write the three browser tests out in full against the harness.

- [ ] **Step 2: Run and see them fail.** Run: `npm test` (Board test fails) and `npm run test:browser` (board suite fails).
- [ ] **Step 3: Implement `useGestures`, `Board`, the demo route and the harness.** The demo route builds a match from the seed in the URL, shows player 0's view, and writes each tap to the `<output>`. The `?sheet=1`, `?board=` and (from Task 11) `?seed=` addresses are developer aids that stay in the build.
- [ ] **Step 4: Run both suites and see them pass.** Then try it by hand: `npm run dev`, open `/?board=7` in a phone-sized window: drag, pinch or wheel, tap.
- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Show the board: draw, pan, zoom and tap"
```

---

### Task 9: Match record and saves

**Files:**
- Create: `src/app/record.ts`, `src/app/record.test.ts`, `src/app/saves.ts`, `src/app/saves.test.ts`

**Interfaces:**
- Consumes: `createMatch`, `applyAction`, `replay`, `hashState`, `RULES_VERSION` and types from the engine.
- Produces:

```ts
// record.ts: the same shape online play will store in plan 4
export interface MatchRecord {
  id: string; rulesVersion: number; settings: MatchSettings;
  players: { name: string; kind: 'human' }[];          // plan 3 adds 'ai'
  actions: Action[];
  snapshot: { count: number; hash: string; state: MatchState } | null;   // the state after `count` actions
  createdAt: number; updatedAt: number;
}
export function newRecord(id: string, settings: MatchSettings, names: [string, string], now: number): MatchRecord;
export function append(rec: MatchRecord, action: Action, stateAfter: MatchState, now: number): MatchRecord; // a new record; rec is not changed
export type Restored = { ok: true; record: MatchRecord; state: MatchState; repaired: boolean } | { ok: false; reason: 'version' | 'corrupt' };
export function restore(value: unknown): Restored;    // never throws
export function roundOf(state: MatchState): number;   // floor(stamp / 2) + 1: the turn number players see

// saves.ts
export interface KeyValue { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
export interface SaveSummary { id: string; names: [string, string]; factions: [FactionId, FactionId]; round: number; current: PlayerId; over: boolean; resumable: boolean; updatedAt: number }
export const MAX_SAVES = 5;
export function listSaves(kv: KeyValue): SaveSummary[];                       // newest first; never throws
export function writeSave(kv: KeyValue, rec: MatchRecord, state: MatchState): boolean; // false when the phone refused; never throws
export function readSave(kv: KeyValue, id: string): unknown;                  // the parsed body, or null; never throws
export function deleteSave(kv: KeyValue, id: string): void;                   // never throws
```

Rules:

- `restore` checks the shape first (an object with a numeric `rulesVersion`, a `settings` object, an `actions` array). Wrong shape is `corrupt`. A `rulesVersion` other than `RULES_VERSION` is `version`.
- The snapshot is trusted only if `count === actions.length` and `hashState(state) === hash`. Otherwise the match is rebuilt with `replay(settings, actions)`, the returned record carries a fresh snapshot, and `repaired` is true. A null snapshot is rebuilt the same way with `repaired` false. If `replay` throws, the result is `corrupt`.
- Keys: `banners.saves.v1` holds the list of summaries as JSON; `banners.save.<id>` holds one record as JSON.
- `writeSave` writes the body first, then the list. When the list would exceed `MAX_SAVES`, the entry with the oldest `updatedAt` is removed along with its body. If any write throws, it returns false and leaves the previous list in place.
- `listSaves` drops any entry whose body is missing or is not JSON, and marks `resumable: false` when the body's `rulesVersion` differs from `RULES_VERSION`.

- [ ] **Step 1: Write the failing tests**

```ts
// record.test.ts
const SETTINGS: MatchSettings = { seed: 42, factions: ['spartans', 'mongols'] };
function playSome(n: number): { rec: MatchRecord; state: MatchState } {
  let state = createMatch(SETTINGS);
  let rec = newRecord('m1', SETTINGS, ['Ann', 'Ben'], 1000);
  for (let i = 0; i < n; i++) {
    const legal = legalActions(state).filter(a => a.type !== 'resign');
    const action = legal[(i * 7) % legal.length]!;
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(r.reason);
    state = r.state; rec = append(rec, action, state, 1001 + i);
  }
  return { rec, state };
}
const ok = (r: Restored) => { if (!r.ok) throw new Error(r.reason); return r; };

test('a new record restores to the opening position', () => {
  const rec = newRecord('m1', SETTINGS, ['Ann', 'Ben'], 1000);
  expect(rec).toMatchObject({ rulesVersion: RULES_VERSION, actions: [], snapshot: null, createdAt: 1000, updatedAt: 1000 });
  const r = ok(restore(rec));
  expect(hashState(r.state)).toBe(hashState(createMatch(SETTINGS)));
  expect(r.repaired).toBe(false);
});
test('a record survives being written as JSON and read back', () => {
  const { rec, state } = playSome(40);
  const r = ok(restore(JSON.parse(JSON.stringify(rec))));
  expect(hashState(r.state)).toBe(hashState(state));
  expect(r.repaired).toBe(false);
  expect(rec.updatedAt).toBe(1040);
});
test('append does not change the record it was given', () => {
  const { rec } = playSome(3); const copy = JSON.stringify(rec);
  append(rec, { type: 'endTurn' }, createMatch(SETTINGS), 5);
  expect(JSON.stringify(rec)).toBe(copy);
});
test('a damaged snapshot is rebuilt from the actions', () => {
  const { rec, state } = playSome(40);
  const bad = JSON.parse(JSON.stringify(rec)); bad.snapshot.state.players[0].gold += 50;
  const r = ok(restore(bad));
  expect(r.repaired).toBe(true);
  expect(hashState(r.state)).toBe(hashState(state));
  expect(r.record.snapshot!.hash).toBe(hashState(state));
  const stale = JSON.parse(JSON.stringify(rec)); stale.snapshot.count = 3;
  expect(ok(restore(stale)).repaired).toBe(true);
});
test('another rules version is refused as such', () => {
  const { rec } = playSome(5);
  expect(restore({ ...rec, rulesVersion: RULES_VERSION + 1 })).toEqual({ ok: false, reason: 'version' });
});
test('rubbish is refused and nothing throws', () => {
  const { rec } = playSome(5);
  const illegal = { ...rec, snapshot: null, actions: [...rec.actions, { type: 'move', unit: 999, to: '0,0' }] };
  for (const v of [null, undefined, 'x', 7, [], {}, { rulesVersion: RULES_VERSION }, illegal]) {
    expect(restore(v)).toEqual({ ok: false, reason: 'corrupt' });
  }
});

// saves.test.ts
function fake(): KeyValue & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: k => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: k => { map.delete(k); } };
}
const rec = (id: string, at: number) => ({ ...newRecord(id, SETTINGS, ['Ann', 'Ben'], at) });
const start = createMatch(SETTINGS);
test('a save is listed with what the home screen needs', () => {
  const kv = fake();
  expect(writeSave(kv, rec('a', 10), start)).toBe(true);
  expect(listSaves(kv)).toEqual([{ id: 'a', names: ['Ann', 'Ben'], factions: ['spartans', 'mongols'], round: 1, current: 0, over: false, resumable: true, updatedAt: 10 }]);
  expect(restore(readSave(kv, 'a')).ok).toBe(true);
});
test('newest first, and the oldest goes when there are more than five', () => {
  const kv = fake();
  for (const [id, at] of [['a', 10], ['b', 30], ['c', 20], ['d', 40], ['e', 50], ['f', 60]] as const) writeSave(kv, rec(id, at), start);
  expect(listSaves(kv).map(s => s.id)).toEqual(['f', 'e', 'd', 'b', 'c']);
  expect(kv.map.has('banners.save.a')).toBe(false);
});
test('writing the same match again replaces it', () => {
  const kv = fake(); writeSave(kv, rec('a', 10), start); writeSave(kv, rec('a', 99), start);
  expect(listSaves(kv).map(s => s.updatedAt)).toEqual([99]);
});
test('a phone that refuses to store does not break anything', () => {
  const full: KeyValue = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
  expect(writeSave(full, rec('a', 10), start)).toBe(false);
  const blocked: KeyValue = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); }, removeItem: () => { throw new Error('SecurityError'); } };
  expect(listSaves(blocked)).toEqual([]); expect(readSave(blocked, 'a')).toBeNull(); expect(() => deleteSave(blocked, 'a')).not.toThrow();
});
test('broken entries are dropped and old versions are marked', () => {
  const kv = fake(); writeSave(kv, rec('a', 10), start); writeSave(kv, rec('b', 20), start); writeSave(kv, rec('c', 30), start);
  kv.map.set('banners.save.a', '{not json'); kv.map.delete('banners.save.b');
  kv.map.set('banners.save.c', JSON.stringify({ ...rec('c', 30), rulesVersion: RULES_VERSION + 1 }));
  expect(listSaves(kv).map(s => [s.id, s.resumable])).toEqual([['c', false]]);
  kv.map.set('banners.saves.v1', 'rubbish'); expect(listSaves(kv)).toEqual([]);
});
test('delete removes the body and the entry', () => {
  const kv = fake(); writeSave(kv, rec('a', 10), start); deleteSave(kv, 'a');
  expect(listSaves(kv)).toEqual([]); expect(kv.map.has('banners.save.a')).toBe(false);
});
```

- [ ] **Step 2: Run them and see them fail.** Run: `npx vitest run src/app`. Expected: FAIL, modules not found.
- [ ] **Step 3: Implement `record.ts` and `saves.ts`.**
- [ ] **Step 4: Run them and see them pass**, then commit:

```bash
git add src/app && git commit -m "Add the match record and saves that survive damage"
```

---

### Task 10: Selection and tap logic

**Files:**
- Create: `src/ui/interaction.ts`, `src/ui/interaction.test.ts`
- Modify: `src/boundaries.test.ts` (test files may also import `engine/testkit`)

**Interfaces:**
- Consumes: engine types and `legalActions`; `Mark` from `tiles.tsx`.
- Produces:

```ts
export type Hit = { unit: number | null; hex: HexKey | null };
export type Armed = { kind: 'ability'; ability: AbilityId } | { kind: 'campTrain'; unitType: UnitTypeId };
export type Selection =
  | { kind: 'none' }
  | { kind: 'unit'; id: number; armed: Armed | null; askLure: HexKey | null }
  | { kind: 'city'; id: number }
  | { kind: 'tile'; at: HexKey };
export const NONE: Selection;
export interface ActionIndex {
  moves: Record<number, HexKey[]>; attacks: Record<number, HexKey[]>; lures: Record<number, HexKey[]>;
  abilities: Record<number, Partial<Record<AbilityId, HexKey[]>>>;
  captures: number[]; campTrain: Record<number, Partial<Record<UnitTypeId, HexKey[]>>>;
  train: Record<number, UnitTypeId[]>; walls: number[]; rewards: number[];
  harvest: HexKey[]; build: Record<HexKey, BuildingId[]>; road: HexKey[]; research: TechId[];
  activeUnits: number[];   // own units with a move, attack, ability, capture or camp training left
}
export function indexActions(actions: readonly Action[]): ActionIndex;
export function marksFor(sel: Selection, view: PlayerView, ix: ActionIndex): Record<HexKey, Mark>;
export function tap(sel: Selection, hit: Hit, view: PlayerView, ix: ActionIndex): { selection: Selection; action: Action | null };
export function afterAction(sel: Selection, view: PlayerView, ix: ActionIndex): Selection;
export function spentUnits(view: PlayerView, ix: ActionIndex): Set<number>;   // my units not in activeUnits
```

`tap` applies the first rule that fits:

1. `hit.hex` is null: selection becomes `NONE`.
2. One of my units is selected:
   - armed with an ability and the hex is one of its targets: the `ability` action. The unit stays selected, disarmed.
   - armed with camp training and the hex is one of its targets: the `campTrain` action. Disarmed.
   - armed and the hex is not a target: disarm, no action, stop here.
   - the hex is an attack target: if it is also in `lures`, set `askLure` to the hex and send no action; otherwise the `attack` action.
   - the hex is a move target: the `move` action.
3. One of my units stands on the hex (or `hit.unit` is mine): if it is already selected, select my city on that hex if there is one, else `NONE`; otherwise select the unit.
4. `hit.unit` is an enemy unit in my view: select it (information only).
5. A city in my view stands on the hex: if it is already selected, `NONE`; otherwise select it.
6. The hex is explored: if that tile is already selected, `NONE`; otherwise select the tile.
7. Otherwise (fog): `NONE`.

`marksFor`: with nothing selected, a `capture` mark on the hex of each of my units in `captures`. With my unit selected and not armed: `selected` on its hex, `move` on its moves, `attack` on its attacks; with `askLure` set, only `selected` and `attack` on that one hex. Armed: `selected` plus `ability` on the armed targets. City or tile selected: `selected` on that hex.

`afterAction` keeps a unit selection (disarmed, `askLure` null) when the unit is still in view, is mine and is in `activeUnits`; keeps a city or tile selection as it is; otherwise `NONE`.

- [ ] **Step 1: Write the failing test**

```ts
const open = createMatch({ seed: 7, factions: ['spartans', 'mongols'] });   // my warrior (id 0) stands on my capital at -2,5
const V = playerView(open, 0), IX = indexActions(legalActions(open));
const unitSel = (id: number, o: Partial<Extract<Selection, { kind: 'unit' }>> = {}): Selection => ({ kind: 'unit', id, armed: null, askLure: null, ...o });
const seeAll = (s: MatchState) => { for (const p of s.players) p.explored = Object.keys(s.tiles).sort(); return s; };

test('the index groups what the engine allows', () => {
  expect([...IX.moves[0]!].sort()).toEqual(['-1,4', '-1,5', '-2,4', '-2,6', '-3,5', '-3,6']);
  expect(IX.build['-2,4']).toEqual(['mine']);
  expect(IX.research).toEqual(['foraging', 'riding', 'hunting', 'shieldwork']);
  expect(IX.activeUnits).toEqual([0]);
  expect(IX.train[0]).toBeUndefined();          // the capital tile is occupied
});
test('tap my unit, then its tile again for the city, then again for nothing', () => {
  const a = tap(NONE, { unit: 0, hex: '-2,5' }, V, IX);
  expect(a).toEqual({ selection: unitSel(0), action: null });
  const b = tap(a.selection, { unit: null, hex: '-2,5' }, V, IX);
  expect(b.selection).toEqual({ kind: 'city', id: 0 });
  expect(tap(b.selection, { unit: null, hex: '-2,5' }, V, IX).selection).toEqual(NONE);
});
test('with a unit selected, a highlighted tile moves it', () => {
  expect(tap(unitSel(0), { unit: null, hex: '-1,4' }, V, IX).action).toEqual({ type: 'move', unit: 0, to: '-1,4' });
});
test('other taps change the selection and never act', () => {
  expect(tap(unitSel(0), { unit: null, hex: '-2,3' }, V, IX)).toEqual({ selection: { kind: 'tile', at: '-2,3' }, action: null });
  expect(tap(unitSel(0), { unit: null, hex: '0,0' }, V, IX)).toEqual({ selection: NONE, action: null });   // fog
  expect(tap(unitSel(0), { unit: null, hex: null }, V, IX)).toEqual({ selection: NONE, action: null });
});
test('marks for a selected unit', () => {
  const m = marksFor(unitSel(0), V, IX);
  expect(m['-2,5']).toBe('selected'); expect(m['-1,4']).toBe('move');
  expect(Object.values(m).filter(x => x === 'move')).toHaveLength(6);
});
test('an attack that can lure asks first', () => {
  const s = seeAll(blankMatch({ factions: ['mongols', 'spartans'] }));
  addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  const rider = addUnit(s, 'horseArcher', 0, 0, 0); addUnit(s, 'warrior', 1, 1, 0);
  const v = playerView(s, 0), ix = indexActions(legalActions(s));
  expect(ix.lures[rider.id]).toEqual(['1,0']);
  const r = tap(unitSel(rider.id), { unit: null, hex: '1,0' }, v, ix);
  expect(r).toEqual({ selection: unitSel(rider.id, { askLure: '1,0' }), action: null });
  expect(marksFor(r.selection, v, ix)).toEqual({ '0,0': 'selected', '1,0': 'attack' });
});
test('an armed ability fires on a target and disarms on anything else', () => {
  const s = seeAll(blankMatch());
  addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  const piper = addUnit(s, 'piper', 0, 0, 0); addUnit(s, 'hoplite', 0, 1, 0, { hp: 7 }); addUnit(s, 'warrior', 1, -1, 0);
  const v = playerView(s, 0), ix = indexActions(legalActions(s));
  const armed = unitSel(piper.id, { armed: { kind: 'ability', ability: 'heal' } });
  expect(marksFor(armed, v, ix)).toEqual({ '0,0': 'selected', '1,0': 'ability' });
  expect(tap(armed, { unit: null, hex: '1,0' }, v, ix)).toEqual({ selection: unitSel(piper.id), action: { type: 'ability', unit: piper.id, ability: 'heal', target: '1,0' } });
  expect(tap(armed, { unit: null, hex: '0,1' }, v, ix)).toEqual({ selection: unitSel(piper.id), action: null });   // a move target, but armed: no move
});
test('a camp trains onto the tapped tile, and a waiting capture is marked', () => {
  const s = seeAll(blankMatch({ factions: ['mongols', 'spartans'] }));
  addCity(s, 0, 0, 3); addCity(s, 1, 0, -3); give(s, 0, 'riding', 'roads');
  const camp = addUnit(s, 'camp', 0, 0, 0);
  s.tiles['2,0']!.village = true; const taker = addUnit(s, 'warrior', 0, 2, 0);
  const v = playerView(s, 0), ix = indexActions(legalActions(s));
  const armed = unitSel(camp.id, { armed: { kind: 'campTrain', unitType: 'warrior' } });
  expect(tap(armed, { unit: null, hex: '1,-1' }, v, ix).action).toEqual({ type: 'campTrain', unit: camp.id, unitType: 'warrior', to: '1,-1' });
  expect(ix.captures).toEqual([taker.id]);
  expect(marksFor(NONE, v, ix)).toEqual({ '2,0': 'capture' });
});
test('an enemy unit can be looked at but not ordered', () => {
  const s = seeAll(blankMatch()); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  addUnit(s, 'warrior', 0, 0, 0); const foe = addUnit(s, 'warrior', 1, 1, -1);   // next to my warrior, so I can see it
  const v = playerView(s, 0), ix = indexActions(legalActions(s));
  const r = tap(NONE, { unit: foe.id, hex: '1,-1' }, v, ix);
  expect(r).toEqual({ selection: unitSel(foe.id), action: null });
  expect(tap(r.selection, { unit: null, hex: '2,-2' }, v, ix).action).toBeNull();
});
test('after an action the selection is kept only while the unit can still do something', () => {
  const moved = must(applyAction(open, { type: 'move', unit: 0, to: '-1,4' }));
  const v = playerView(moved, 0), ix = indexActions(legalActions(moved));
  expect(afterAction(unitSel(0), v, ix)).toEqual(ix.activeUnits.includes(0) ? unitSel(0) : NONE);
  expect(afterAction(unitSel(77), v, ix)).toEqual(NONE);
  expect(spentUnits(V, IX).size).toBe(0);
});
```

- [ ] **Step 2: Run it and see it fail.** Expected: FAIL, module not found.
- [ ] **Step 3: Implement `interaction.ts`.** Pure: no React, no DOM. Extend the boundary test so a `*.test.ts` or `*.test.tsx` file may also import a path ending in `/engine/testkit`.
- [ ] **Step 4: Run it and see it pass**, then commit:

```bash
git add src && git commit -m "Add selection and tap logic driven by the engine's legal actions"
```

---

### Task 11: The app store and the turn digest

**Files:**
- Create: `src/app/store.ts`, `src/app/store.test.ts`, `src/app/digest.ts`, `src/app/digest.test.ts`

**Interfaces:**
- Consumes: Tasks 9 and 10; `createStore` from `zustand/vanilla`.
- Produces:

```ts
// digest.ts
export type DigestLine =
  | { kind: 'unitLost'; unitType: UnitTypeId; by: UnitTypeId | null }
  | { kind: 'unitHurt'; unitType: UnitTypeId; damage: number; by: UnitTypeId | null }
  | { kind: 'cityLost' };
export interface TurnStep { before: MatchState; events: GameEvent[] }
export function digestFor(viewer: PlayerId, log: readonly TurnStep[]): DigestLine[];   // only what happened to the viewer's own units and cities

// store.ts
export interface Deps { kv: KeyValue; now(): number; newSeed(): number; newId(): string }
export interface Setup { names: [string, string]; factions: [FactionId, FactionId] }
export type Screen = 'home' | 'setup' | 'pass' | 'match' | 'result';
export type Notice = 'saveFailed' | 'saveRepaired' | 'saveUnreadable' | 'saveOldVersion';
export interface AppState {
  screen: Screen;
  record: MatchRecord | null; state: MatchState | null;
  viewer: PlayerId | null;          // whose view may be drawn; null whenever the curtain is up or no match is open
  selection: Selection;
  last: { seq: number; events: GameEvent[]; before: MatchState } | null;   // the last accepted action, for effects and sound
  digest: DigestLine[];
  notice: Notice | null;
  saves: SaveSummary[];
  openSetup(): void; startMatch(setup: Setup): void; resume(id: string): void; removeSave(id: string): void;
  ready(): void;                    // the player named on the curtain now has the phone
  tap(hit: Hit): void; run(action: Action): void; arm(armed: Armed | null): void; select(sel: Selection): void;
  goHome(): void; dismissNotice(): void; dismissDigest(): void;
}
export function createAppStore(deps: Deps): StoreApi<AppState>;
export function browserDeps(): Deps;        // localStorage, Date.now, a random seed (or ?seed= from the URL), a random id
```

Rules:

- The store starts on `home` with `saves` read from `deps.kv`. A reload therefore always lands on `home`, never on a board.
- `startMatch`: builds the record and the opening state, saves, goes to `pass` with `viewer` null.
- `resume`: `restore(readSave(...))`. On success go to `pass` (or `result` if the match is over) with `viewer` null, and set `saveRepaired` if it was repaired. `version` sets `saveOldVersion`, `corrupt` or a missing body sets `saveUnreadable`; both stay on `home`.
- `ready`: only on `pass`. Sets `viewer` to `state.current`, goes to `match`, clears the turn log.
- `run`: ignored unless `screen` is `match` and `viewer === state.current`. A refused action changes nothing at all. An accepted one: append to the record, save (a false result sets `saveFailed`; play carries on), set `last` with `seq` one higher, add the step to the turn log. Then, if the match is over, go to `result` with `viewer` null. Else if the action was `endTurn`, compute the digest for the new current player from the turn log, go to `pass`, `viewer` null, selection `NONE`. Otherwise the selection becomes `afterAction(...)`.
- `tap`: ignored unless on `match`. Calls `interaction.tap`; runs the action if there is one, else stores the selection.
- `arm` and `select` only work on `match`. `arm` only applies to a selected unit of the viewer.
- `goHome`: if the match is over its save is deleted. Clears the match, refreshes `saves`, goes to `home`.
- `browserDeps` touches `localStorage` and `location` only inside its functions, guarded by `typeof`, and falls back to a store that keeps nothing.

`digestFor` reads each step in order. An `attacked` or `splashed` event whose target (looked up in `before`) belongs to the viewer gives `unitHurt`, or `unitLost` when a `died` event for that unit is in the same step. `by` is the attacker's type from the step's `attacked` event, or null. A `captured` event whose city (in `before`) belonged to the viewer gives `cityLost`. Nothing else is reported.

- [ ] **Step 1: Write the failing tests**

```ts
// store.test.ts
function deps(over: Partial<Deps> = {}) {
  const map = new Map<string, string>();
  const kv: KeyValue = { getItem: k => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: k => { map.delete(k); } };
  return { map, d: { kv, now: () => 1000, newSeed: () => 7, newId: () => 'm1', ...over } as Deps };
}
const SETUP: Setup = { names: ['Ann', 'Ben'], factions: ['spartans', 'mongols'] };
const started = (over: Partial<Deps> = {}) => { const x = deps(over); const store = createAppStore(x.d); store.getState().startMatch(SETUP); return { ...x, store, get: store.getState }; };

test('a new match starts behind the curtain and is saved at once', () => {
  const { get, d } = started();
  expect(get()).toMatchObject({ screen: 'pass', viewer: null, notice: null });
  expect(get().state!.current).toBe(0);
  expect(listSaves(d.kv).map(s => s.id)).toEqual(['m1']);
  get().ready();
  expect(get()).toMatchObject({ screen: 'match', viewer: 0 });
});
test('tap to select, tap to move, and the move is on the phone', () => {
  const { get, d } = started(); get().ready();
  get().tap({ unit: 0, hex: '-2,5' });
  expect(get().selection).toMatchObject({ kind: 'unit', id: 0 });
  get().tap({ unit: null, hex: '-1,4' });
  expect(get().state!.units.find(u => u.id === 0)!.pos).toBe('-1,4');
  expect(get().record!.actions).toEqual([{ type: 'move', unit: 0, to: '-1,4' }]);
  expect(get().last).toMatchObject({ seq: 1 }); expect(get().last!.events[0]!.type).toBe('moved');
  const saved = restore(readSave(d.kv, 'm1')); expect(saved.ok && saved.record.actions.length).toBe(1);
});
test('End turn raises the curtain, and a second End turn does nothing', () => {
  const { get } = started(); get().ready();
  get().run({ type: 'endTurn' });
  expect(get()).toMatchObject({ screen: 'pass', viewer: null, selection: NONE });
  expect(get().state!.current).toBe(1);
  get().run({ type: 'endTurn' });
  expect(get().state!.current).toBe(1); expect(get().record!.actions).toHaveLength(1);
});
test('nothing can be done while the curtain is up', () => {
  const { get } = started(); const before = get().state;
  get().tap({ unit: 0, hex: '-2,5' }); get().run({ type: 'move', unit: 0, to: '-1,4' }); get().arm({ kind: 'ability', ability: 'heal' });
  expect(get().state).toBe(before); expect(get().selection).toEqual(NONE); expect(get().record!.actions).toEqual([]);
});
test('a refused action changes nothing', () => {
  const { get } = started(); get().ready(); const before = get().state;
  get().run({ type: 'move', unit: 99, to: '0,0' });
  expect(get().state).toBe(before); expect(get().record!.actions).toEqual([]); expect(get().last).toBeNull();
});
test('resigning ends the match and going home clears its save', () => {
  const { get, d } = started(); get().ready();
  get().run({ type: 'resign' });
  expect(get()).toMatchObject({ screen: 'result', viewer: null }); expect(get().state!.winner).toBe(1);
  get().goHome();
  expect(get()).toMatchObject({ screen: 'home', record: null, state: null, saves: [] }); expect(listSaves(d.kv)).toEqual([]);
});
test('a reopened game starts at home and resumes through the curtain', () => {
  const first = started(); first.get().ready(); first.get().tap({ unit: 0, hex: '-2,5' }); first.get().tap({ unit: null, hex: '-1,4' });
  const again = createAppStore(first.d);
  expect(again.getState()).toMatchObject({ screen: 'home', viewer: null, state: null });
  expect(again.getState().saves).toHaveLength(1);
  again.getState().resume('m1');
  expect(again.getState()).toMatchObject({ screen: 'pass', viewer: null });
  expect(hashState(again.getState().state!)).toBe(hashState(first.get().state!));
});
test('damaged, unreadable and old saves are handled in plain terms', () => {
  const a = started(); const body = JSON.parse(a.map.get('banners.save.m1')!);
  body.snapshot = { count: 0, hash: 'wrong', state: body.snapshot?.state ?? {} };
  a.map.set('banners.save.m1', JSON.stringify(body));
  const s1 = createAppStore(a.d); s1.getState().resume('m1');
  expect(s1.getState()).toMatchObject({ screen: 'pass', notice: 'saveRepaired' });
  a.map.set('banners.save.m1', '{');
  const s2 = createAppStore(a.d); s2.getState().resume('m1');
  expect(s2.getState()).toMatchObject({ screen: 'home', notice: 'saveUnreadable', state: null });
  const b = started(); const old = JSON.parse(b.map.get('banners.save.m1')!); old.rulesVersion = 999;
  b.map.set('banners.save.m1', JSON.stringify(old));
  const s3 = createAppStore(b.d); s3.getState().resume('m1');
  expect(s3.getState()).toMatchObject({ screen: 'home', notice: 'saveOldVersion' });
  s3.getState().resume('no-such-id'); expect(s3.getState().notice).toBe('saveUnreadable');
});
test('when the phone refuses to save, play carries on and says so', () => {
  const kv: KeyValue = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
  const { get } = started({ kv });
  expect(get()).toMatchObject({ screen: 'pass', notice: 'saveFailed' });
  get().ready(); get().tap({ unit: 0, hex: '-2,5' }); get().tap({ unit: null, hex: '-1,4' });
  expect(get().record!.actions).toHaveLength(1);
});

// digest.test.ts
test('what the other player did to my units is reported, and nothing else', () => {
  const s = blankMatch(); addCity(s, 0, 0, 3); const mine = addCity(s, 1, 0, -3);
  const rider = addUnit(s, 'horseman', 0, 0, 0); addUnit(s, 'warrior', 1, 1, 0, { hp: 1 }); addUnit(s, 'defender', 1, 0, -1);
  const kill = applyAction(s, { type: 'attack', unit: rider.id, target: '1,0' }); if (!kill.ok) throw new Error(kill.reason);
  expect(digestFor(1, [{ before: s, events: kill.events }])).toEqual([{ kind: 'unitLost', unitType: 'warrior', by: 'horseman' }]);
  expect(digestFor(0, [{ before: s, events: kill.events }])).toEqual([]);
  const s2 = blankMatch(); addCity(s2, 0, 0, 3); addCity(s2, 1, 0, -3);
  const r2 = addUnit(s2, 'horseman', 0, 0, 0); addUnit(s2, 'defender', 1, 1, 0);
  const hit = applyAction(s2, { type: 'attack', unit: r2.id, target: '1,0' }); if (!hit.ok) throw new Error(hit.reason);
  const dmg = (hit.events.find(e => e.type === 'attacked') as { damage: number }).damage;
  expect(digestFor(1, [{ before: s2, events: hit.events }])).toEqual([{ kind: 'unitHurt', unitType: 'defender', damage: dmg, by: 'horseman' }]);
  expect(digestFor(1, [{ before: s, events: [{ type: 'captured', city: mine.id, by: 0 }] }])).toEqual([{ kind: 'cityLost' }]);
});
```

- [ ] **Step 2: Run them and see them fail.** Expected: FAIL, modules not found.
- [ ] **Step 3: Implement `digest.ts` and `store.ts`.**
- [ ] **Step 4: Run them and see them pass**, then commit:

```bash
git add src/app && git commit -m "Add the app store: turns, the curtain, saving and the turn digest"
```

---

### Task 12: Text, commands and panels

**Files:**
- Create: `src/ui/text.ts`, `src/ui/text.test.ts`, `src/ui/panels/commands.ts`, `src/ui/panels/commands.test.ts`, `src/ui/panels/{Hud,UnitPanel,CityPanel,TilePanel,TechSheet,RewardSheet,Menu,DigestCard}.tsx`, `src/ui/panels/panels.test.tsx`
- Modify: `src/ui/theme.css`

**Interfaces:**
- Consumes: the engine's data tables and query functions; `ActionIndex`, `Selection`, `Armed`; `DigestLine`; `roundOf`.
- Produces:

```ts
// text.ts
export const T: {
  unit: Record<UnitTypeId, { name: string; blurb: string }>;
  trait: Record<Trait, { name: string; blurb: string }>;
  ability: Record<AbilityId, { name: string; blurb: string }>;
  reward: Record<RewardId, { name: string; blurb: string }>;
  tech: Record<TechId, string>; building: Record<BuildingId, string>; resource: Record<Resource, string>;
  terrain: Record<Terrain, string>; faction: Record<FactionId, string>;
  reason: Record<string, string>;      // engine refusal reason to a line for the player
  ui: Record<string, string>;          // every other label, button and sentence
};
export function reasonText(reason: string): string;   // T.reason[reason], or the reason itself with a capital first letter
export function unlocks(tech: TechId): string[];      // names of what a tech opens, read from UNITS and CONFIG
export function digestText(line: DigestLine): string;

// commands.ts
export interface Command { id: string; label: string; cost: number | null; enabled: boolean; why: string | null; action: Action | null; arm: Armed | null }
export function unitCommands(sel: Extract<Selection, { kind: 'unit' }>, state: MatchState, ix: ActionIndex): Command[];
export function cityCommands(cityId: number, state: MatchState, ix: ActionIndex): Command[];
export function tileCommands(at: HexKey, state: MatchState, ix: ActionIndex): Command[];
export interface TechRow { tech: TechId; branch: number; tier: 1 | 2 | 3; status: 'owned' | 'ready' | 'costly' | 'locked'; price: number; unlocks: string[] }
export function techRows(state: MatchState, ix: ActionIndex): TechRow[];   // twelve rows in TECHS order; branch is floor(index / 3)
```

Names: Warrior, Spearman, Swordsman, Defender, Archer, Horseman, Knight, Catapult, Hoplite, King's Guard, Piper, Krypteia Scout, Horse Archer, Khan's Guard, Sky Caller, Camp. Techs: the id with a capital letter. Each blurb is one plain sentence written from `docs/rules/stage1-rules.md` sections 8 to 13; the reviewer checks each against the rules sheet.

Command rules (a command is an offer the player can tap; a disabled one says why):

- **Unit, mine:** `capture` when the unit is in `ix.captures`. One arming command per ability that has targets. For a camp, one arming command per unit type in `ix.campTrain`, with its cost. When `askLure` is set, exactly two commands instead: "Attack" and "Attack and lure", carrying the two attack actions. An armed command's label becomes "Cancel".
- **Unit, not mine:** no commands.
- **City, mine:** one train command for every unit type that has a cost and belongs to no faction or to mine. Enabled when the type is in `ix.train[cityId]`. Otherwise disabled: "Needs <tech>" when the player lacks the unit's tech, else `reasonText(trainRefusal(...))`. Walls when legal, or disabled when the refusal is `missing tech` or `not enough gold`; hidden for any other refusal. Two reward commands when the city is in `ix.rewards`, labelled with the two reward names for the oldest pending level.
- **Tile:** harvest, each building, and road. Each is shown when legal, and shown disabled when its refusal is `not enough gold`. Harvest and buildings are also shown disabled, as "Needs <tech>", when the refusal is `missing tech`; a road is not, because the engine gives that answer for almost every tile. Anything else is hidden.
- A command's `cost` is what the player would pay now: `unitCost` for units (it includes faction discounts), the data tables for the rest.
- **Tech rows:** `owned` if the player has it, `ready` if it is in `ix.research`, `locked` if its prerequisite is missing, else `costly`.

Panels (each a plain component taking data and callbacks as props; no store access inside, so they render in tests):

- `Hud`: player colour chip and name, faction, gold with income as `+N`, `Turn N`, a tech button (`data-testid="open-tech"`, with a dot when any tech is `ready`), a menu button (`open-menu`), and End turn (`end-turn`) with a line above it saying how many units can still act.
- `UnitPanel`: name, health as `7/15`, attack, defence, movement, range, each trait's name and blurb, then the commands. An enemy unit shows the same card with no commands.
- `CityPanel`: level, growth as `0/2`, units as `1/2`, income, walls, then the commands.
- `TilePanel`: terrain, resource, building, road, then the commands.
- `TechSheet`: four branches of three, each row with its price, status and what it unlocks; `ready` rows have a research button.
- `RewardSheet`: the two rewards with their blurbs for the oldest pending level, and "Later".
- `Menu`: sound on or off, resign (asks "Resign this match?" first), back to home.
- `DigestCard`: the digest lines as text, at most six, then "and N more".

`T.ui` must hold at least these keys, which tests and other tasks use: `walls`, `road`, `cancel`, `offlineReady`, `updateReady`, `saveFailed`, `saveRepaired`, `saveUnreadable`, `saveOldVersion`, `oldVersion`. The Hud marks its numbers for tests: `data-testid="gold"`, `"turn"` and `"who"`.

Every command button has `data-testid="cmd-<id>"`. Command ids: `capture`, `ability-<id>`, `camp-<unitType>`, `attack`, `attack-lure`, `train-<unitType>`, `walls`, `reward-0`, `reward-1`, `harvest`, `build-<building>`, `road`.

- [ ] **Step 1: Write the failing tests**

```ts
// text.test.ts
test('every id the engine knows has a name', () => {
  for (const id of Object.keys(UNITS)) { expect(T.unit[id as UnitTypeId].name).toBeTruthy(); expect(T.unit[id as UnitTypeId].blurb.length).toBeGreaterThan(10); }
  for (const id of Object.keys(TECHS)) expect(T.tech[id as TechId]).toBeTruthy();
  for (const id of Object.keys(CONFIG.buildings)) expect(T.building[id as BuildingId]).toBeTruthy();
  for (const id of Object.keys(FACTIONS)) expect(T.faction[id as FactionId]).toBeTruthy();
  const traits = new Set(Object.values(UNITS).flatMap(u => u.traits));
  for (const t of traits) expect(T.trait[t].blurb.length).toBeGreaterThan(10);
  for (const pair of Object.values(CONFIG.rewards)) for (const r of pair) expect(T.reward[r].name).toBeTruthy();
});
test('every refusal a panel can show has a line', () => {
  for (const r of ['not enough gold', 'missing tech', 'city is at capacity', 'city tile is occupied', 'cannot train that',
    'not your territory', 'nothing to harvest', 'already built', 'wrong tile', 'city already has a market', 'already a road',
    'cannot build a road there', 'already walled', 'your faction cannot build walls', 'no city has room']) {
    expect(T.reason[r], r).toBeTruthy();
  }
  expect(reasonText('some new reason')).toBe('Some new reason');
});
test('what a tech unlocks comes from the data', () => {
  expect(unlocks('riding')).toEqual(expect.arrayContaining(['Horseman', 'Horse Archer']));
  expect(unlocks('bronze')).toEqual(expect.arrayContaining(['Spearman', 'Hoplite', T.building.mine]));
  expect(unlocks('shieldwork')).toEqual(expect.arrayContaining(['Defender', T.ui.walls!]));
  expect(unlocks('roads')).toEqual(expect.arrayContaining(['Camp', T.ui.road!]));
  for (const id of Object.keys(TECHS)) expect(unlocks(id as TechId).length, id).toBeGreaterThan(0);
});

// commands.test.ts
const open = createMatch({ seed: 7, factions: ['spartans', 'mongols'] });
const ixOf = (s: MatchState) => indexActions(legalActions(s));
const byId = (cs: Command[]) => Object.fromEntries(cs.map(c => [c.id, c]));
test('the opening city offers what Spartans can ever train, and says why not yet', () => {
  const c = byId(cityCommands(0, open, ixOf(open)));
  expect(Object.keys(c).sort()).toEqual(['train-archer', 'train-catapult', 'train-defender', 'train-hoplite', 'train-horseman', 'train-knight', 'train-scout', 'train-spearman', 'train-swordsman', 'train-warrior']);
  expect(c['train-warrior']).toMatchObject({ enabled: false, cost: 2, why: T.reason['city tile is occupied'] });
  expect(c['train-horseman']).toMatchObject({ enabled: false, why: `Needs ${T.tech.riding}` });
});
test('once the tile is free a warrior can be trained', () => {
  const moved = must(applyAction(open, { type: 'move', unit: 0, to: '-1,4' }));
  const c = byId(cityCommands(0, moved, ixOf(moved)));
  expect(c['train-warrior']).toMatchObject({ enabled: true, why: null, action: { type: 'train', city: 0, unitType: 'warrior' } });
});
test('tile commands: legal ones, blocked ones with a reason, and nothing irrelevant', () => {
  expect(byId(tileCommands('-2,4', open, ixOf(open)))['build-mine']).toMatchObject({ enabled: true, cost: 5, action: { type: 'build', at: '-2,4', building: 'mine' } });
  const s42 = createMatch({ seed: 42, factions: ['spartans', 'mongols'] });           // an orchard at -1,5, and no Foraging yet
  expect(tileCommands('-1,5', s42, ixOf(s42))).toEqual([expect.objectContaining({ id: 'harvest', enabled: false, why: `Needs ${T.tech.foraging}` })]);
  expect(tileCommands('-1,4', s42, ixOf(s42))).toEqual([expect.objectContaining({ id: 'build-market', enabled: false, why: `Needs ${T.tech.markets}` })]);   // a plain field of mine
  expect(tileCommands('-2,3', s42, ixOf(s42))).toEqual([]);                             // outside my territory: no road offer without Roads
});
test('tech rows', () => {
  const rows = techRows(open, ixOf(open));
  expect(rows).toHaveLength(12);
  const st = Object.fromEntries(rows.map(r => [r.tech, r.status]));
  expect(st).toMatchObject({ bronze: 'owned', foraging: 'ready', riding: 'ready', hunting: 'ready', shieldwork: 'ready', farming: 'locked', smithing: 'locked' });
  expect(rows.find(r => r.tech === 'foraging')!.price).toBe(techPrice(open, 0, 'foraging'));
  expect(rows.map(r => r.branch)).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3]);
});
test('unit commands: abilities arm, a camp lists what it can train, a lure asks, a capture is offered', () => {
  // build the four hand-made positions of Task 10's tests and expect:
  // piper: ids ['ability-heal', 'ability-taunt'], each with arm set and action null; with heal armed, that command's label is T.ui.cancel
  // camp (riding and roads known): ids start with 'camp-' and include 'camp-warrior' with cost 2
  // horse archer with askLure '1,0': ids exactly ['attack', 'attack-lure'] with actions { type: 'attack', unit, target: '1,0' } and the same with lure: true
  // warrior on a village: ids include 'capture' with action { type: 'capture', unit }
  // an enemy unit: []
});
```

Write the last test out in full. `panels.test.tsx` renders each panel with `renderToStaticMarkup` from the opening position and expects: the Hud shows `Ann`, `8`, `Turn 1` and has `data-testid="end-turn"`; the UnitPanel for the warrior shows `Warrior` and `10/10`; the CityPanel shows `0/2` growth and `1/2` units; the TechSheet shows all twelve tech names; the RewardSheet for a level 2 reward shows both `T.reward.gold.name` and `T.reward.scout.name`; the DigestCard with eight lines shows six and "and 2 more".

- [ ] **Step 2: Run them and see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement the text table, the commands and the panels.** Panels use `<button>` elements with a minimum size of 44 by 44 CSS pixels set in `theme.css`.
- [ ] **Step 4: Run them and see them pass**, then commit:

```bash
git add src/ui && git commit -m "Add the game text, the command lists and the match panels"
```

---

### Task 13: Screens and the whole flow

**Files:**
- Create: `src/ui/screens/{Home,Setup,Pass,Match,Result}.tsx`, `src/ui/screens/screens.test.tsx`, `src/app/useApp.ts`, `src/browser/flow.test.ts`
- Modify: `src/ui/App.tsx`, `src/ui/theme.css`, `src/main.tsx`

**Interfaces:**
- Consumes: everything so far.
- Produces: `useApp<T>(pick: (s: AppState) => T): T` and `appStore()` (one lazily created store using `browserDeps()`); the five screens; `App` showing the screen named by the store.

What each screen holds:

- **Home:** the name, "New match", then saved matches newest first. Each shows the two names and factions, the turn, and whose turn it is, with "Continue" (or "See result" when over, or "From an older version" with no button when not resumable) and a delete button that asks first. Any notice is shown here in a sentence with a dismiss button. The version line sits at the foot.
- **Setup:** two name fields (defaults "Player 1" and "Player 2", at most 16 characters, blank falls back to the default), a switch for which of them plays Spartans, a line saying the first name moves first and the second starts with 2 more gold, and "Start".
- **Pass (the curtain):** a full screen in the next player's colour: "<Name>'s turn", the faction, "Pass the phone to <Name>", and one button "I'm <Name>". It renders no board at all.
- **Match:** the board fills the screen (`100dvh`). The Hud is across the top. The selection panel is a sheet at the bottom in portrait (at most 40% of the height, scrolling inside) and a 300 pixel column on the right in landscape. End turn stays visible in both. After the curtain, the digest card shows if there are lines, then the reward sheet if one of the viewer's cities has a reward pending. The camera's `focus` is the viewer's capital when a turn begins (their first unit if they have no capital).
- **Result:** "<Name> wins", the turn it ended on, how it ended (resignation or last city taken), "Home".

The Match screen is the only place that calls `playerView`, and it calls it with `viewer`. End turn is disabled for 600 ms after the screen appears.

- [ ] **Step 1: Write the failing tests**

`screens.test.tsx` (Node, static markup, each screen given a store made with `createAppStore` and a fake key-value store):

```tsx
test('the curtain shows who is next and draws no board', () => {
  // start a match: Pass markup contains "Ann", T.faction.spartans and the button; it contains no "data-hex" and no "data-unit"
});
test('the match screen draws the viewer's view only', () => {
  // after ready(): Match markup has 127 data-hex, exactly one data-unit, and shows gold 8
});
test('home lists saves and explains notices', () => {
  // with one save: shows both names and a Continue button; with notice saveUnreadable: shows T.ui.saveUnreadable
  // with a save whose rulesVersion differs: shows T.ui.oldVersion and no Continue button for it
});
test('the result names the winner', () => { /* after a resignation by player 0: contains "Ben wins" */ });
```

`src/browser/flow.test.ts` (gated on `BROWSER=1`, opened with `?seed=7`):

```ts
test('a whole hot-seat exchange, a reload, and a resignation', async () => {
  // Home: tap "New match". Setup: tap "Start".
  // Curtain: text has "Player 1"; the page has no [data-hex]. Tap the button.
  // Match: Hud shows 8 gold and Turn 1. Tap the centre of tile -2,5 (the warrior). Tap the centre of tile -1,4.
  //   The warrior's group now has data-at="-1,4".
  // Tap tile -2,5 (the city). Tap [data-testid="cmd-train-warrior"]. The Hud shows 6 gold. Two [data-unit] groups exist.
  // Tap End turn. Curtain: text has "Player 2"; no [data-hex] and no [data-unit] in the page. Tap the button. The Hud shows 10 gold.
  // Reload the page. Home lists one save. Tap "Continue". Curtain again, no board in the page. Tap the button. The Hud shows 10 gold.
  // Open the menu, tap Resign, confirm. Result: text has "Player 1 wins". Tap "Home". No saves are listed.
});
test.each([[360, 640], [412, 915], [915, 412]])('nothing is clipped at %i by %i', async (w, h) => {
  // On Home, Setup, the curtain, the match with a unit selected, the tech sheet, the menu and the result:
  //   document.documentElement.scrollWidth <= window.innerWidth
  //   every visible button is at least 44 by 44 CSS pixels and lies fully inside the viewport
  //   with a unit selected, End turn is visible and is not covered by the panel (elementFromPoint at its centre is the button)
});
test('a double tap on End turn ends one turn', async () => {
  // tap End turn twice within 100 ms: the curtain names Player 2, and after the button the Hud shows Turn 1 for Player 2
});
```

Write every test out in full. Tiles are tapped at the centre of their `data-centre` marker.

- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement the screens, `useApp`, and the layout CSS.**
- [ ] **Step 4: Run `npm test` and `npm run test:browser` and see them pass.** Then play a few turns by hand at `npm run dev` in a phone-sized window, portrait and landscape.
- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add the screens and the hot-seat flow from home to result"
```

---

### Task 14: Effects and sound

**Files:**
- Create: `src/ui/board/effects.ts`, `src/ui/board/effects.test.ts`, `src/ui/board/Effects.tsx`, `src/ui/sound.ts`, `src/ui/sound.test.ts`
- Modify: `src/ui/screens/Match.tsx`, `src/ui/panels/Menu.tsx`, `src/ui/theme.css`

**Interfaces:**
- Produces:

```ts
// effects.ts
export type Effect =
  | { kind: 'number'; at: HexKey; text: string; tone: 'hurt' | 'heal' | 'gold'; delay: number }
  | { kind: 'lunge'; unit: number; toward: HexKey; delay: number }
  | { kind: 'fall'; unitType: UnitTypeId; owner: PlayerId; at: HexKey; delay: number }
  | { kind: 'burst'; at: HexKey; tone: 'build' | 'capture' | 'level' | 'treasure'; delay: number };
export const EFFECT_MS = 450;
export const MAX_TOTAL_MS = 1200;
export function effectsFor(events: readonly GameEvent[], before: MatchState, after: MatchState, visible: ReadonlySet<HexKey>): Effect[];

// sound.ts
export type SoundName = 'tap' | 'move' | 'hit' | 'fall' | 'build' | 'capture' | 'turn' | 'win';
export const SOUNDS: Record<SoundName, { wave: 'sine' | 'triangle' | 'square'; notes: readonly number[]; ms: number; gain: number }>;
export function soundFor(events: readonly GameEvent[]): SoundName | null;   // one sound per action: win, capture, fall, hit, build, move, in that order of preference
export function play(name: SoundName): void;       // does nothing when muted or where there is no AudioContext
export function isMuted(): boolean; export function setMuted(muted: boolean): void;   // remembered under 'banners.muted'
```

Effect rules: `attacked` gives a lunge of the attacker toward the target's tile and a `-N` hurt number on the target; a counter above zero gives a `-N` on the attacker 150 ms later. `splashed` gives a hurt number. `died` gives a fall with the unit's type and owner from `before`, at its last known tile (follow `moved` and `lured` events within the same list). A heal ability gives `+N` where N is the target's health gain between `before` and `after`. A gold treasure gives `+N` gold. `captured`, `built`, `cityLevel` and other treasure outcomes give a burst. Each event's effects start 120 ms after the previous event's. Any effect on a tile not in `visible` is dropped. Delays are pulled in so that no effect ends after `MAX_TOTAL_MS`.

`soundFor` maps events to sounds: `matchOver` is `win`; `captured` is `capture`; `died` is `fall`; `attacked` and `splashed` are `hit`; `built`, `trained`, `researched`, `reward`, `cityLevel`, `treasure` and `ability` are `build`; `moved` and `lured` are `move`; anything else is silent. When an action has several, the first in that order wins.

`Effects.tsx` plays the list for the store's `last` (keyed by `seq`) with CSS animations inside the board's camera group, and removes each when it ends. Under `prefers-reduced-motion` numbers are shown still for the same time and lunges, falls and bursts are skipped. Effects never block input: the state is already final when they play. Sounds are short generated tones (an oscillator through a gain envelope); the audio context is created on the first tap.

- [ ] **Step 1: Write the failing tests**

```ts
// effects.test.ts
test('a killing blow: lunge, number, fall, in order', () => {
  const s = blankMatch(); addCity(s, 0, 0, 3); addCity(s, 1, 0, -3);
  const rider = addUnit(s, 'horseman', 0, 0, 0); addUnit(s, 'warrior', 1, 1, 0, { hp: 1 }); addUnit(s, 'defender', 1, 0, -1);
  const r = applyAction(s, { type: 'attack', unit: rider.id, target: '1,0' }); if (!r.ok) throw new Error(r.reason);
  const dmg = (r.events.find(e => e.type === 'attacked') as { damage: number }).damage;
  const fx = effectsFor(r.events, s, r.state, new Set(Object.keys(s.tiles)));
  expect(fx).toContainEqual({ kind: 'lunge', unit: rider.id, toward: '1,0', delay: 0 });
  expect(fx).toContainEqual({ kind: 'number', at: '1,0', text: `-${dmg}`, tone: 'hurt', delay: 0 });
  expect(fx.find(f => f.kind === 'fall')).toMatchObject({ unitType: 'warrior', owner: 1, at: '1,0' });
  expect(effectsFor(r.events, s, r.state, new Set(['0,0'])).filter(f => 'at' in f && f.at === '1,0')).toEqual([]);
});
test('a long list still finishes in time', () => {
  const s = blankMatch();
  const many: GameEvent[] = Array.from({ length: 30 }, () => ({ type: 'built', at: '0,0', what: 'road' as const }));
  const fx = effectsFor(many, s, s, new Set(['0,0']));
  expect(fx).toHaveLength(30);
  expect(Math.max(...fx.map(f => f.delay)) + EFFECT_MS).toBeLessThanOrEqual(MAX_TOTAL_MS);
});

// sound.test.ts
test('the sounds are short and quiet', () => {
  for (const s of Object.values(SOUNDS)) {
    expect(s.ms).toBeLessThanOrEqual(400); expect(s.gain).toBeLessThanOrEqual(0.3);
    expect(s.notes.length).toBeGreaterThanOrEqual(1); expect(s.notes.length).toBeLessThanOrEqual(4);
    for (const n of s.notes) { expect(n).toBeGreaterThanOrEqual(100); expect(n).toBeLessThanOrEqual(2000); }
  }
});
test('one sound per action, the most important one', () => {
  expect(soundFor([{ type: 'moved', unit: 1, from: '0,0', to: '1,0' }])).toBe('move');
  expect(soundFor([{ type: 'attacked', unit: 1, target: 2, damage: 3, counter: 0 }, { type: 'died', unit: 2 }])).toBe('fall');
  expect(soundFor([{ type: 'died', unit: 2 }, { type: 'matchOver', winner: 0 }])).toBe('win');
  expect(soundFor([{ type: 'researched', tech: 'bronze' }])).toBe('build');
  expect(soundFor([])).toBeNull();
});
test('sound is safe where there is no audio', () => { expect(() => play('tap')).not.toThrow(); expect(isMuted()).toBe(false); });
```

- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement effects and sound, and wire them into the match screen and the menu.** `turn` plays when the curtain is dismissed.
- [ ] **Step 4: Run the tests and see them pass.** Then listen and watch by hand at `npm run dev`: a move, an attack, a kill, a build, with sound on and off.
- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add battle effects and a few generated sounds"
```

---

### Task 15: Install to the home screen and play offline

**Files:**
- Create: `public/icon.svg`, `public/favicon.svg`, `scripts/make-icons.mjs`, `public/icon-180.png`, `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`, `src/app/update.ts`, `src/app/platform.ts`, `src/app/platform.test.ts`, `src/app/icons.test.ts`, `src/browser/offline.test.ts`
- Modify: `vite.config.ts`, `tsconfig.json`, `index.html`, `package.json`, `src/app/store.ts`, `src/app/store.test.ts`, `src/ui/screens/Home.tsx`, `src/main.tsx`

**Interfaces:**
- Produces:

```ts
// update.ts
export interface UpdateState { offlineReady: boolean; updateReady: boolean }
export interface Updater { apply(): Promise<void>; check(): void }
export function startUpdates(onChange: (s: UpdateState) => void): Updater;   // imports 'virtual:pwa-register' inside the function

// platform.ts
export type InstallAdvice = 'installed' | 'prompt' | 'iosShare' | 'none';
export function installAdvice(env: { ua: string; standalone: boolean; canPrompt: boolean }): InstallAdvice;

// store.ts additions
// Deps gains: updater?: Updater
// AppState gains: update: UpdateState; setUpdate(s: UpdateState): void; applyUpdate(): void
```

- [ ] **Step 1: Install**

```bash
npm install -D vite-plugin-pwa@^2.0 workbox-build@^7.4.1 workbox-window@^7.4.1
```

- [ ] **Step 2: Write the failing tests**

```ts
// platform.test.ts
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const PIXEL = 'Mozilla/5.0 (Linux; Android 16; Pixel 10 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
test('install advice', () => {
  expect(installAdvice({ ua: IPHONE, standalone: false, canPrompt: false })).toBe('iosShare');
  expect(installAdvice({ ua: IPHONE, standalone: true, canPrompt: false })).toBe('installed');
  expect(installAdvice({ ua: PIXEL, standalone: false, canPrompt: true })).toBe('prompt');
  expect(installAdvice({ ua: PIXEL, standalone: false, canPrompt: false })).toBe('none');
  expect(installAdvice({ ua: PIXEL, standalone: true, canPrompt: true })).toBe('installed');
});

// store.test.ts additions
test('a new build is applied from home and never during a match', () => {
  let applied = 0; const updater: Updater = { apply: async () => { applied++; }, check: () => {} };
  const { get } = started({ updater });
  get().setUpdate({ offlineReady: true, updateReady: true });
  get().applyUpdate(); expect(applied).toBe(0);            // behind the curtain
  get().ready(); get().applyUpdate(); expect(applied).toBe(0);   // in the match
  get().run({ type: 'resign' }); get().applyUpdate(); expect(applied).toBe(0);   // on the result
  get().goHome(); get().applyUpdate(); expect(applied).toBe(1);
});

// icons.test.ts: each PNG exists, starts with the PNG signature, and its width and height (bytes 16 to 24) are 180, 192, 512 and 512
```

`src/browser/offline.test.ts` (gated on `BROWSER=1`):

```ts
test('installed files, then no network: open, play, reload, resume', async () => {
  // Record every request URL. Open the app with ?seed=7. Wait for navigator.serviceWorker.ready and for T.ui.offlineReady on Home.
  // context.setOffline(true). Reload: Home renders.
  // New match, Start, dismiss the curtain, move the warrior to -1,4, End turn.
  // Reload, still offline: Home lists the save. Continue, dismiss the curtain: the warrior's group has data-at="-1,4" and the Hud names Player 2.
  // Every recorded request went to the test server's own origin.
});
test('the manifest lets a phone install it', async () => {
  // fetch the manifest linked from the page: name "Banners", display "standalone", start_url and scope are relative,
  // icons include 192, 512 and a maskable 512, and each icon URL answers 200 with image/png
});
```

Write both out in full.

- [ ] **Step 3: Run and see them fail.**
- [ ] **Step 4: The icon.** `public/icon.svg`: a banner on a pole standing on one thick hex tile, in the palette's grass, crimson and bronze, flat fills, on a sky-blue tile background with id `tile`. `public/favicon.svg`: the banner alone. Both original. `scripts/make-icons.mjs` renders them with Playwright's Chromium: `icon-180.png`, `icon-192.png` and `icon-512.png` as full-bleed squares (iOS and Android round the corners themselves), and `icon-maskable-512.png` with the drawing scaled into the middle 80%. Run `npm run icons` and commit the PNGs.
- [ ] **Step 5: The service worker.** In `vite.config.ts` add `VitePWA` with `registerType: 'prompt'`, `injectRegister: false`, a manifest (`name` and `short_name` "Banners", `description` "A turn-based strategy game of banners and borders.", `start_url: './'`, `scope: './'`, `display: 'standalone'`, `orientation: 'any'`, `background_color` and `theme_color` `#7CC8EE`, the four icons with the maskable one marked `purpose: 'maskable'`), and `workbox: { globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'], navigateFallback: 'index.html', cleanupOutdatedCaches: true }`. Add `"vite-plugin-pwa/client"` to the `types` in `tsconfig.json`. In `index.html` add the favicon, the 180 pixel `apple-touch-icon`, and `theme-color`.
- [ ] **Step 6: Updates and install advice.** `startUpdates` registers the worker with `registerSW({ onNeedRefresh, onOfflineReady })` and reports through `onChange`; `apply` calls the returned function with `true`; `check` calls `registration.update()` when online. `main.tsx` starts it and feeds the store. `applyUpdate` acts only when `screen` is `home`. Home shows "Ready to play offline" once it is, "A new version is ready" with an "Update" button when there is one, and the install hint for the phone: an "Install" button on Android (using the saved `beforeinstallprompt` event), "Tap Share, then Add to Home Screen" on iPhone, nothing when installed. Home calls `check()` each time it appears. After the first match starts, call `navigator.storage?.persist?.()` so the phone keeps the saves.
- [ ] **Step 7: Run `npm test` and `npm run test:browser` and see them pass.**
- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "Install to the home screen and play with no connection"
```

---

### Task 16: Deploy

**Files:**
- Create: `.github/workflows/deploy.yml`, `src/browser/coverage.test.ts`
- Modify: `README.md`, `CLAUDE.md`

- [ ] **Step 1: Write the failing test.** `src/browser/coverage.test.ts` runs in the plain `npm test` and expects: the workflow has a step that runs exactly `npm run test:browser` and one that contains `playwright install`; at least three tracked test files import `playwright` or `./harness`; every one of them contains `describe.runIf(process.env.BROWSER === '1')` or `test.runIf(process.env.BROWSER === '1')`. This is what stops the browser suites from skipping silently and reporting green.
- [ ] **Step 2: Run it and see it fail** (no workflow yet).
- [ ] **Step 3: Write the workflow.** Model it on `~/projects/deutsch-dash/.github/workflows/deploy.yml` without the Java and emulator steps. On push to `main` and on manual run. Top-level `permissions: contents: read`; `concurrency: { group: pages, cancel-in-progress: false }`. Build job with `GITHUB_PAGES_BASE: /${{ github.event.repository.name }}/`: `actions/checkout@v7` with `persist-credentials: false`; `actions/setup-node@v7` with Node 24 and the npm cache; `actions/cache@v6` for `~/.cache/ms-playwright` keyed on the lockfile; `npm ci`; `npm run lint`; `npm run typecheck`; `npm test`; `npx playwright install --with-deps chromium`; `npm run test:browser` (this builds `dist` under the Pages base and tests it there); `actions/upload-pages-artifact@v5` with `path: dist`. Deploy job needing build, with `pages: write` and `id-token: write`, environment `github-pages`, running `actions/deploy-pages@v5`.
- [ ] **Step 4: Run `npm test` and see it pass.** Run `GITHUB_PAGES_BASE=/banners/ npm run test:browser` and see the browser suites pass under the sub-path.
- [ ] **Step 5: Docs.** `README.md`: where to play (`https://sonofwatt.github.io/banners/`), how to install on Android and on iPhone, the dev commands, and what this stage does and does not include. `CLAUDE.md`: the browser-test gate and the "never apply an update mid-match" rule.
- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Add the GitHub Pages deploy and guard the browser tests"
```

**Controller, after the final review and David's choice on merging (not a subagent's job):**

1. Push `main`. Enable Pages with GitHub Actions as the source: `gh api -X POST repos/sonofwatt/banners/pages -f build_type=workflow`. Watch the workflow run to green.
2. Open the live address in a phone-sized browser, play two turns, reload, continue.
3. On the Pixel over ADB: open the address in Chrome, take screenshots of home, the curtain, the board with a unit selected, and the tech sheet, and show them to David in the conversation.
4. Ask David to install it on the Pixel and on his iPhone, play a match with someone, and try it once in airplane mode.
5. Write `docs/superpowers/plans/2026-11-18-plan-2-followups.md`: the outcome, the rulings made, and what carries into plans 3 and 4.

---

## Plan 2 is done when

- `npm test`, `npm run typecheck`, `npm run lint` and `npm run test:browser` pass, locally and in the workflow.
- The live address opens on a phone, installs to the home screen, and opens again with no connection.
- Two people can play a match to a resignation or to the last city on one phone, passing it between turns, and neither sees the other's hidden view.
- Closing the game mid-match and opening it again offers the match and resumes it at the same turn.
- The board reads as the diorama David picked: tilted thick tiles, chunky figures, bright flat colours.

