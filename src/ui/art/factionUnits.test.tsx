import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { UNITS } from '../../engine';
import type { UnitTypeId } from '../../engine';
import { FACTION_FIGURES, FIGURES } from './factionUnits';
import { ACCENT, playerColour } from './palette';
import type { FigureProps } from './units';

const P: FigureProps = { colour: playerColour('spartans'), accent: ACCENT.spartans };
const html = (el: ReactElement) => renderToStaticMarkup(<svg>{el}</svg>);
// Stand-ins until Tasks 15 and 16 draw the Woodland figures and glyphs: they reuse an existing one.
const WOODLAND_STAND_INS = ['skirmisher', 'woodlandHunter', 'warChief', 'smokeKeeper', 'trapper'];
const CHAMPIONS = new Set(['kingsGuard', 'khansGuard']);

/** Every point a shape reaches, read from its attributes. Paths may use only absolute M, L, Q, C and Z. */
function extents(markup: string): { x: number; y: number; where: string }[] {
  const out: { x: number; y: number; where: string }[] = [];
  for (const m of markup.matchAll(/<(\w+)((?:\s[\w-]+="[^"]*")*)\s*\/?>/g)) {
    const tag = m[1]!;
    const where = m[0];
    const a: Record<string, string> = {};
    for (const q of (m[2] ?? '').matchAll(/([\w-]+)="([^"]*)"/g)) a[q[1]!] = q[2]!;
    const n = (k: string): number => Number(a[k] ?? 0);
    const pairs = (s: string): void => {
      const v = (s.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      expect(v.length % 2, where).toBe(0);
      for (let i = 0; i < v.length; i += 2) out.push({ x: v[i]!, y: v[i + 1]!, where });
    };
    expect(a.transform, where).toBeUndefined();
    if (tag === 'polygon') pairs(a.points ?? '');
    if (tag === 'path') {
      expect(a.d ?? '', where).toMatch(/^[MLQCZ\d\s.,-]+$/);
      pairs(a.d ?? '');
    }
    if (tag === 'line') pairs(`${n('x1')} ${n('y1')} ${n('x2')} ${n('y2')}`);
    if (tag === 'rect') pairs(`${n('x')} ${n('y')} ${n('x') + n('width')} ${n('y') + n('height')}`);
    if (tag === 'circle') pairs(`${n('cx') - n('r')} ${n('cy') - n('r')} ${n('cx') + n('r')} ${n('cy') + n('r')}`);
    if (tag === 'ellipse') pairs(`${n('cx') - n('rx')} ${n('cy') - n('ry')} ${n('cx') + n('rx')} ${n('cy') + n('ry')}`);
  }
  return out;
}

test('all seventeen unit types have a figure, each different', () => {
  const ids = Object.keys(UNITS);
  expect(Object.keys(FIGURES).sort()).toEqual([...ids].sort());
  const own = ids.filter((id) => !WOODLAND_STAND_INS.includes(id));
  expect(new Set(own.map((id) => html(FIGURES[id as UnitTypeId](P)))).size).toBe(17);
});

test('the eight faction figures are the faction units of the engine', () => {
  const faction = Object.entries(UNITS).filter(([id, u]) => u.faction !== null && !WOODLAND_STAND_INS.includes(id)).map(([id]) => id);
  expect(Object.keys(FACTION_FIGURES).sort()).toEqual(faction.sort());
});

test('each faction figure wears the colour it is given and no other player colour', () => {
  for (const [id, f] of Object.entries(FACTION_FIGURES)) {
    const red = html(f(P));
    const blue = html(f({ colour: playerColour('mongols'), accent: ACCENT.mongols }));
    expect(red, id).toContain('#B3261E');
    expect(red, id).not.toContain('#2D6DB5');
    expect(blue, id).toContain('#2D6DB5');
    expect(blue, id).not.toContain('#B3261E');
  }
});

test('each faction figure has a shadow, no gradient, and stays in its box', () => {
  for (const [id, f] of Object.entries(FACTION_FIGURES)) {
    const h = html(f(P));
    const top = CHAMPIONS.has(id) ? -40 : -36;
    expect(h, id).toContain('fill-opacity="0.18"');
    expect(h, id).not.toMatch(/Gradient|filter/);
    const pts = extents(h);
    expect(pts.length, id).toBeGreaterThan(20);
    for (const p of pts) {
      expect(p.x, `${id} x in ${p.where}`).toBeGreaterThanOrEqual(-20);
      expect(p.x, `${id} x in ${p.where}`).toBeLessThanOrEqual(20);
      expect(p.y, `${id} y in ${p.where}`).toBeGreaterThanOrEqual(top);
      expect(p.y, `${id} y in ${p.where}`).toBeLessThanOrEqual(8);
    }
  }
});

test('the champions stand taller than the units they lead', () => {
  const topOf = (f: (p: FigureProps) => ReactElement): number => Math.min(...extents(html(f(P))).map((p) => p.y));
  expect(topOf(FIGURES.kingsGuard)).toBeLessThan(topOf(FIGURES.hoplite));
  for (const rider of ['horseArcher', 'skyCaller', 'horseman', 'knight'] as const) {
    expect(topOf(FIGURES.khansGuard), rider).toBeLessThan(topOf(FIGURES[rider]));
  }
});
