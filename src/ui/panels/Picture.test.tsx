import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { PLAYER_COLOURS } from '../art/palette';
import { CityPicture, TilePicture, UnitPicture } from './Picture';

const RED = PLAYER_COLOURS.spartans.main;
const BLUE = PLAYER_COLOURS.mongols.main;

test('a unit picture draws the figure in the owner colour it is given', () => {
  const red = renderToStaticMarkup(<UnitPicture type="warrior" faction="spartans" />);
  const blue = renderToStaticMarkup(<UnitPicture type="warrior" faction="mongols" />);
  expect(red).toContain(RED); expect(red).not.toContain(BLUE);
  expect(blue).toContain(BLUE); expect(blue).not.toContain(RED);
});
test('a city picture flies its owner colour', () => {
  const html = renderToStaticMarkup(<CityPicture faction="mongols" level={2} capital walls={false} />);
  expect(html).toContain(BLUE); expect(html).not.toContain(RED);
});
test('the pictures are decoration: hidden from a reader, the card heading names the thing', () => {
  for (const html of [
    renderToStaticMarkup(<UnitPicture type="archer" faction="spartans" />),
    renderToStaticMarkup(<TilePicture terrain="forest" resource={null} building={null} />),
  ]) {
    expect(html).toMatch(/^<svg class="picture"[^>]*aria-hidden="true"/);
  }
});
