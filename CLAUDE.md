# Warbanners

## Writing

**Never use an em dash.** Not in code comments, not in commit messages, not in
docs, not in anything the game itself prints, and not in replies. Use a plain
hyphen with spaces around it, a colon, or a full stop and a new sentence.

That covers its lookalikes too. Out: U+2014 EM DASH and U+2013 EN DASH. In: the
ordinary hyphen-minus, U+002D. Named rather than shown, because a sweep for the
characters would otherwise eat this line.

## Where things are written down

- The design spec: `docs/superpowers/specs/2026-11-18-banners-design.md`.
- The game rules and every number: `docs/rules/stage1-rules.md`.
- The implementation plans: `docs/superpowers/plans/`.

## Originality

Warbanners is a new game in the same genre as Hexonia, not a copy of it. All art, sound, names, text and numbers are our own, and nothing is taken from the Hexonia APK.

## Code layout

- The engine lives in `src/engine` and is reached from the app only through its index. Any import from `src/ui`, `src/app`, `src/browser` or `src/main.tsx` that names the engine must end in `/engine` or `/engine/index`. Inside the engine, nothing imports from outside it. `src/boundaries.test.ts` and `src/engine/purity.test.ts` enforce both.
- The AI lives in `src/ai`. It imports the engine only through its index (plus `src/engine/testkit` in tests and `src/ai/scenarios.ts`) and never imports `src/app` or `src/ui`. It touches no clock, randomness or ambient state, except `src/ai/worker.ts`, which alone may read the clock. `src/boundaries.test.ts` and `src/engine/purity.test.ts` enforce this.
- The planner takes only an `AiInput`, built by `aiInputFor(state, player)`. Never pass it a `MatchState`, so the AI cannot see what its player could not.
- No DOM, storage, clock or randomness access when a module loads. Importing a module must have no side effects; touch `document`, `window`, `localStorage` and the like only inside functions that the app calls.

## Testing and releases

- The browser suites in `src/browser` gate on `BROWSER=1` (`describe.runIf(process.env.BROWSER === '1')`) and otherwise skip, which reports green. `npm run test:browser` sets it. CI must run that script and install Chromium first; `src/browser/coverage.test.ts` fails if the workflow stops doing so or a browser test file loses its gate.
- A new version of the app is never applied mid-match. The service worker waits, and the update is offered and applied only from Home, after the match has ended or been left.
- The deployed site lives under `/warbanners/`, so browser tests are run with `GITHUB_PAGES_BASE=/warbanners/` to check it under the sub-path.
