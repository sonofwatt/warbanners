import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { PLAYER_COLOURS } from './art/palette';
import * as icons from './icons';
import { BannerMark, BannerTile, CoinIcon, SpeakerIcon } from './icons';

test('every icon is decoration: an svg the reader skips, sized by the icon class', () => {
  const plain = Object.entries(icons).filter(([name]) => name.endsWith('Icon') && name !== 'SpeakerIcon');
  expect(plain.length).toBeGreaterThan(20);
  for (const [name, Icon] of plain) {
    const html = renderToStaticMarkup((Icon as () => ReactElement)());
    expect(html, name).toMatch(/^<svg class="icon[^"]*"[^>]*aria-hidden="true"/);
  }
  expect(renderToStaticMarkup(<SpeakerIcon on />)).not.toBe(renderToStaticMarkup(<SpeakerIcon on={false} />));
  expect(renderToStaticMarkup(<CoinIcon />)).toContain('class="icon coin"');
});
test('a banner takes its colours from the player it stands for', () => {
  const colour = PLAYER_COLOURS.mongols;
  for (const html of [renderToStaticMarkup(<BannerMark colour={colour} accent="#123456" />), renderToStaticMarkup(<BannerTile colour={colour} accent="#123456" />)]) {
    expect(html).toContain(colour.main); expect(html).toContain(colour.dark); expect(html).toContain('#123456');
    expect(html).not.toContain(PLAYER_COLOURS.spartans.main);
  }
});
