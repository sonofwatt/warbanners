import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { PLAYER_COLOURS } from '../art/palette';
import { T } from '../text';
import { CardHead, Stats } from './Card';

test('a card head shows its picture, its title and the owner people in their colour', () => {
  const html = renderToStaticMarkup(<CardHead picture={<svg data-pic="1" />} title="Archer" faction="mongols"><p>blurb</p></CardHead>);
  expect(html).toContain('data-pic="1"');
  expect(html).toContain('<h2>Archer<span class="tag"');
  expect(html).toContain(T.faction.mongols);
  expect(html).toContain(`--tag:${PLAYER_COLOURS.mongols.main}`);
  expect(html).toContain('<p>blurb</p>');
});
test('a card head without an owner has no people tag', () => {
  expect(renderToStaticMarkup(<CardHead picture={<svg />} title="Forest" />)).not.toContain('class="tag"');
});
test('stats keep one dt and dd per number, so a reader announces the pair', () => {
  const html = renderToStaticMarkup(<Stats stats={[{ icon: <svg />, label: 'Health', value: '7/10' }, { icon: <svg />, label: 'Range', value: 2 }]} />);
  expect(html.match(/<dt>/g)).toHaveLength(2);
  expect(html).toContain('Health</dt><dd>7/10</dd>');
  expect(html).toContain('Range</dt><dd>2</dd>');
});
test('each stat carries the length of its value\'s longest word, so the value can shrink to fit unbroken', () => {
  const html = renderToStaticMarkup(<Stats stats={[
    { icon: <svg />, label: 'Resource', value: 'Cropland' }, { icon: <svg />, label: 'Building', value: 'Lumber camp' }, { icon: <svg />, label: 'Range', value: 2 },
  ]} />);
  expect(html).toContain('<div class="stat" style="--chars:8">');
  expect(html).toContain('<div class="stat" style="--chars:6">');
  expect(html).toContain('<div class="stat" style="--chars:1">');
});
