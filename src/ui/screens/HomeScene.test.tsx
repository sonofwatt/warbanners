import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { PLAYER_COLOURS } from '../art/palette';
import { HomeScene } from './HomeScene';

test('the Home scene is a hidden strip of board with a piece of each people in their own colours', () => {
  const html = renderToStaticMarkup(<HomeScene />);
  expect(html).toMatch(/^<svg class="home-scene"[^>]*aria-hidden="true"/);
  expect(html).toContain(PLAYER_COLOURS.spartans.main);
  expect(html).toContain(PLAYER_COLOURS.mongols.main);
  expect(html.match(/<g transform="translate\(/g)?.length).toBe(9);
});
