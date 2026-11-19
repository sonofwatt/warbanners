import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import type { Terrain, Tile } from '../../engine';
import { GROUND } from './palette';
import { Border, groundFor, Highlight, TileBase } from './tiles';
import type { Mark } from './tiles';

const html = (el: ReactElement) => renderToStaticMarkup(<svg>{el}</svg>);

test('a tile has a top and two walls in its three colours', () => {
  const h = html(<TileBase ground="grass" />);
  for (const c of GROUND.grass) expect(h).toContain(c);
  expect((h.match(/<polygon/g) ?? []).length).toBe(3);
});

test('ground follows terrain, and a city tile is sand', () => {
  const t = (terrain: Terrain): Tile => ({ terrain, resource: null, building: null, road: false, village: false, treasure: false, cityId: null });
  expect(groundFor(t('field'), false)).toBe('grass');
  expect(groundFor(t('forest'), false)).toBe('grass');
  expect(groundFor(t('mountain'), false)).toBe('rock');
  expect(groundFor(t('water'), false)).toBe('water');
  expect(groundFor(t('field'), true)).toBe('sand');
});

test('each mark draws something different', () => {
  const marks: Mark[] = ['move', 'attack', 'ability', 'selected', 'capture'];
  expect(new Set(marks.map((m) => html(<Highlight mark={m} />))).size).toBe(5);
});

test('a border draws one line per edge', () => {
  expect((html(<Border edges={[0, 3, 4]} colour="#B3261E" />).match(/<line/g) ?? []).length).toBe(3);
});
