/// <reference types="node" />
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import type { Terrain, Tile } from '../../engine';
import { GROUND } from './palette';
import { readFileSync } from 'node:fs';
import { Border, CITY_GLOW_FADE, CITY_GLOW_MAX, CityGlow, groundFor, Highlight, ReadyGlow, TileBase } from './tiles';
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

test('the selected city\'s glow: half strength at each outer edge, nothing 60% of a tile in, the stronger fade where two meet', () => {
  expect(CITY_GLOW_MAX).toBe(0.5);
  expect(html(<CityGlow id="g" edges={[]} colour="#c33" />)).toBe('<svg></svg>');
  const h = html(<CityGlow id="land-1,2" edges={[0, 1]} colour="#c33" />);
  // One colour fill at half strength, through the mask; no line.
  expect(h).toMatch(/<polygon[^>]*fill="#c33"[^>]*fill-opacity="0.5"[^>]*mask="url\(#land-1,2\)"/);
  expect(h).not.toMatch(/<line[\s>]/);
  // One fade per outer edge: white (full) at the edge, black (none) at the far side of the tile.
  const grads = [...h.matchAll(/<linearGradient[^>]*x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"[^>]*>(.*?)<\/linearGradient>/g)];
  expect(grads).toHaveLength(2);
  for (const g of grads) {
    expect(g[5]).toMatch(/offset="0" stop-color="#FFFFFF".*offset="0.6" stop-color="#000000"/);
    expect(CITY_GLOW_FADE).toBe(0.6);
    // It runs from one side's middle to the opposite side's, through the tile's centre: one tile width.
    const [x1, y1, x2, y2] = g.slice(1, 5).map(Number) as [number, number, number, number];
    expect(x1 + x2).toBeCloseTo(0, 0); expect(y1 + y2).toBeCloseTo(0, 0);
    expect(Math.hypot(x1, y1)).toBeGreaterThan(10);
  }
  // The fades combine by the stronger one (lighten), so a corner never passes half strength.
  expect((h.match(/mix-blend-mode:lighten/g) ?? []).length).toBe(2);
  expect(h).toContain('isolation:isolate');
});
