import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { FIGURES } from './factionUnits';
import { ACCENT, playerColour } from './palette';
import type { FigureProps, WearProps } from './units';
import { BLOOD } from './wear';

const html = (el: ReactElement) => renderToStaticMarkup(<svg>{el}</svg>);
const SAMPLES = [
  ['warrior', 'spartans'],
  ['warrior', 'mongols'],
  ['hoplite', 'spartans'],
  ['horseArcher', 'mongols'],
] as const;
const draw = (id: (typeof SAMPLES)[number][0], f: (typeof SAMPLES)[number][1], wear?: WearProps): string => {
  const p: FigureProps = { colour: playerColour(f), accent: ACCENT[f], ...(wear ? { wear } : {}) };
  return html(FIGURES[id](p));
};

test('no wear draws the same markup as a clean, unbloodied figure', () => {
  for (const [id, f] of SAMPLES) expect(draw(id, f, { stage: 0, blood: 0 }), `${id} ${f}`).toBe(draw(id, f));
});

test('each stage adds marks to the one before', () => {
  for (const [id, f] of SAMPLES) {
    const stages = ([0, 1, 2, 3, 4] as const).map((stage) => draw(id, f, { stage, blood: 0 }));
    for (let i = 1; i < stages.length; i++) expect(stages[i], `${id} ${f} stage ${i}`).not.toBe(stages[i - 1]);
  }
});

test('blood 1 and 2 add dark-red fills, and none shows without blood', () => {
  const count = (h: string): number => h.split(`fill="${BLOOD}"`).length - 1;
  for (const [id, f] of SAMPLES) {
    for (const stage of [0, 3, 4] as const) {
      const none = draw(id, f, { stage, blood: 0 });
      const one = draw(id, f, { stage, blood: 1 });
      const two = draw(id, f, { stage, blood: 2 });
      expect(count(none), `${id} ${f} ${stage}`).toBe(0);
      expect(count(one), `${id} ${f} ${stage}`).toBeGreaterThan(0);
      expect(count(two), `${id} ${f} ${stage}`).toBeGreaterThan(count(one));
    }
  }
});

test('worn figures stay flat, use only plain paths, and keep inside their box', () => {
  for (const [id, f] of SAMPLES) {
    const h = draw(id, f, { stage: 4, blood: 2 });
    expect(h).not.toMatch(/Gradient|filter|transform/);
    for (const m of h.matchAll(/ d="([^"]*)"/g)) expect(m[1]).toMatch(/^[MLQCZ\d\s.,-]+$/);
    for (const m of h.matchAll(/(?:cx|x1|x2|x)="(-?[\d.]+)"/g)) expect(Math.abs(Number(m[1])), id).toBeLessThanOrEqual(20);
    for (const m of h.matchAll(/(?:cy|y1|y2|y)="(-?[\d.]+)"/g)) {
      expect(Number(m[1]), id).toBeGreaterThanOrEqual(-36);
      expect(Number(m[1]), id).toBeLessThanOrEqual(8);
    }
  }
});
