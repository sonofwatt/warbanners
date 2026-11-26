import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ACCENT, playerColour } from './palette';
import { SHARED_FIGURES, Shadow } from './units';
import type { FigureProps } from './units';

const P: FigureProps = { colour: playerColour('spartans'), accent: ACCENT.spartans };
const html = (el: ReactElement) => renderToStaticMarkup(<svg>{el}</svg>);

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

test('nine figures, each different', () => {
  const ids = Object.keys(SHARED_FIGURES);
  expect(ids).toHaveLength(9);
  expect(new Set(ids.map((id) => html(SHARED_FIGURES[id as keyof typeof SHARED_FIGURES](P)))).size).toBe(9);
});

test('each figure wears the colour it is given and no other player colour', () => {
  for (const f of Object.values(SHARED_FIGURES)) {
    const red = html(f(P));
    const blue = html(f({ colour: playerColour('mongols'), accent: ACCENT.mongols }));
    expect(red).toContain('#B3261E');
    expect(red).not.toContain('#2D6DB5');
    expect(blue).toContain('#2D6DB5');
    expect(blue).not.toContain('#B3261E');
  }
});

test('each figure has a shadow, no gradient, and stays in its box', () => {
  for (const [id, f] of Object.entries(SHARED_FIGURES)) {
    const h = html(f(P));
    expect(h, id).toContain('fill-opacity="0.18"');
    expect(h, id).not.toMatch(/Gradient|filter/);
    const pts = extents(h);
    expect(pts.length, id).toBeGreaterThan(20);
    for (const p of pts) {
      expect(p.x, `${id} x in ${p.where}`).toBeGreaterThanOrEqual(-20);
      expect(p.x, `${id} x in ${p.where}`).toBeLessThanOrEqual(20);
      expect(p.y, `${id} y in ${p.where}`).toBeGreaterThanOrEqual(-36);
      expect(p.y, `${id} y in ${p.where}`).toBeLessThanOrEqual(8);
    }
  }
});

test('the shadow is a soft black blob, wider for a wide figure', () => {
  const narrow = html(<Shadow />);
  const wide = html(<Shadow wide />);
  for (const h of [narrow, wide]) {
    expect(h).toContain('fill="#000000"');
    expect(h).toContain('fill-opacity="0.18"');
  }
  const rx = (h: string) => Number(/rx="([\d.]+)"/.exec(h)?.[1]);
  expect(rx(wide)).toBeGreaterThan(rx(narrow));
});
