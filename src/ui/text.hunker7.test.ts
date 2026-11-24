import { expect, test, vi } from 'vitest';
import { T } from './text';

// With the rules 8 hunker switches off (rules 7), the hunker texts say the heal waits for the next turn and a drink ends it.
vi.mock('../engine', async (orig) => {
  const m = await orig<typeof import('../engine')>();
  return { ...m, CONFIG: { ...m.CONFIG, hunker: { ...m.CONFIG.hunker, healAtTurnEnd: false, drinkKeepsHunker: false } } };
});

test('the hunker help text and card follow the rules 7 timing when the switches are off', () => {
  expect(T.ui.hunkerHint).toContain('heals at the start of your next turn');
  expect(T.ui.hunkerHint).not.toContain('end of this turn');
  expect(T.ui.hunkeredBlurb).toContain('heals at the start of its next turn');
  expect(T.ui.hunkeredBlurb).toContain('or drinks a draught');
  expect(T.ui.hunkeredBlurb).not.toContain('does not end it');
});
