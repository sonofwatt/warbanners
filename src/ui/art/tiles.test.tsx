/// <reference types="node" />
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import type { Terrain, Tile } from '../../engine';
import { GROUND } from './palette';
import { readFileSync } from 'node:fs';
import { Border, groundFor, Highlight, ReadyGlow, TileBase } from './tiles';
import type { Mark } from './tiles';

const html = (el: ReactElement) => renderToStaticMarkup(<svg>{el}</svg>);

test('a tile has a top and two walls in its three colours', () => {
  const h = html(<TileBase ground="grass" />);
  for (const c of GROUND.grass) expect(h).toContain(c);
  expect((h.match(/<polygon/g) ?? []).length).toBe(3);
});

test('ground follows terrain, and a city tile is sand', () => {
  const t = (terrain: Terrain): Tile => ({ terrain, resource: null, building: null, harvested: false, road: false, village: false, treasure: false, cityId: null });
  expect(groundFor(t('field'), false)).toBe('grass');
  expect(groundFor(t('forest'), false)).toBe('grass');
  expect(groundFor(t('mountain'), false)).toBe('rock');
  expect(groundFor(t('water'), false)).toBe('water');
  expect(groundFor(t('field'), true)).toBe('sand');
});

test('each mark draws something different', () => {
  const marks: Mark[] = ['move', 'moveEnds', 'attack', 'ability', 'selected'];
  expect(new Set(marks.map((m) => html(<Highlight mark={m} />))).size).toBe(5);
});

test('the ready glow fills the whole top face in translucent gold and pulses unless motion is reduced', () => {
  const glow = html(<ReadyGlow />);
  expect(glow).toContain('class="ready-glow"');
  expect(glow).toContain('fill="#FFC81A"');
  expect(glow).toContain('fill-opacity="0.3"');
  expect((glow.match(/<polygon/g) ?? []).length).toBe(1);
  const css = readFileSync(new URL('../theme.css', import.meta.url), 'utf8');
  expect(css).toMatch(/\.ready-glow \{ animation: ready-pulse/);
  expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.ready-glow \{ animation: none; \}/);
});

test('a border draws one line per edge', () => {
  expect((html(<Border edges={[0, 3, 4]} colour="#B3261E" />).match(/<line/g) ?? []).length).toBe(3);
});
