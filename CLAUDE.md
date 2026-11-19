# Banners

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

Banners is a new game in the same genre as Hexonia, not a copy of it. All art, sound, names, text and numbers are our own, and nothing is taken from the Hexonia APK.

## Code layout

- The engine lives in `src/engine` and is reached from the app only through its index. Any import from `src/ui`, `src/app`, `src/browser` or `src/main.tsx` that names the engine must end in `/engine` or `/engine/index`. Inside the engine, nothing imports from outside it. `src/boundaries.test.ts` and `src/engine/purity.test.ts` enforce both.
- No DOM, storage, clock or randomness access when a module loads. Importing a module must have no side effects; touch `document`, `window`, `localStorage` and the like only inside functions that the app calls.
