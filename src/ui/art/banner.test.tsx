import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { UNITS } from '../../engine';
import type { UnitTypeId } from '../../engine';
import { BANNER_MID, bannerRight, GLYPH, GLYPHS, WarBanner } from './banner';
import type { WarBannerProps } from './banner';
import { playerColour } from './palette';

const html = (el: ReactElement) => renderToStaticMarkup(<svg>{el}</svg>);
const RED = playerColour('spartans');
const BLUE = playerColour('mongols');
const banner = (p: Partial<WarBannerProps> = {}) => html(
  <WarBanner type="warrior" colour={RED} hp={10} maxHp={10} spent={false} fresh={false} taunted={false} blinded={false} {...p} />,
);
const TYPES = Object.keys(UNITS) as UnitTypeId[];

/** The balanced `<g ...>...</g>` element that starts at `from`. */
function groupAt(s: string, from: number): string {
  const tag = /<g[\s>]|<\/g>/g;
  tag.lastIndex = from;
  let depth = 0;
  for (let m = tag.exec(s); m !== null; m = tag.exec(s)) {
    depth += m[0] === '</g>' ? -1 : 1;
    if (depth === 0) return s.slice(from, m.index + 4);
  }
  throw new Error('unbalanced markup');
}
const part = (s: string, attr: string): string => groupAt(s, s.lastIndexOf('<g', s.indexOf(attr)));
/** Every number pair a shape's coordinates hold (absolute paths only). */
function points(s: string): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const m of s.matchAll(/<(polygon|path|line|rect|circle|ellipse)((?:\s[\w-]+="[^"]*")*)/g)) {
    const a: Record<string, number | string> = {};
    for (const q of m[2]!.matchAll(/([\w-]+)="([^"]*)"/g)) a[q[1]!] = q[2]!;
    const n = (k: string): number => Number(a[k] ?? 0);
    const pairs = (t: string): void => {
      const v = (t.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      for (let i = 0; i + 1 < v.length; i += 2) out.push({ x: v[i]!, y: v[i + 1]! });
    };
    if (m[1] === 'polygon') pairs(String(a.points));
    if (m[1] === 'path') pairs(String(a.d));
    if (m[1] === 'line') pairs(`${n('x1')} ${n('y1')} ${n('x2')} ${n('y2')}`);
    if (m[1] === 'rect') pairs(`${n('x')} ${n('y')} ${n('x') + n('width')} ${n('y') + n('height')}`);
    if (m[1] === 'circle') pairs(`${n('cx') - n('r')} ${n('cy') - n('r')} ${n('cx') + n('r')} ${n('cy') + n('r')}`);
    if (m[1] === 'ellipse') pairs(`${n('cx') - n('rx')} ${n('cy') - n('ry')} ${n('cx') + n('rx')} ${n('cy') + n('ry')}`);
  }
  return out;
}

test('every unit type has its own glyph on its banner, drawn light on the owner colour', () => {
  expect(new Set(Object.keys(GLYPHS))).toEqual(new Set(TYPES));
  const glyphs = TYPES.map((t) => {
    const b = banner({ type: t });
    expect(b, t).toContain(`data-banner="${t}"`);
    const g = part(b, `data-glyph="${t}"`);
    expect(g, t).toContain(GLYPH);
    return g.replace(`data-glyph="${t}"`, '');
  });
  expect(new Set(glyphs).size, 'no two types share a glyph').toBe(glyphs.length);
});

test('each glyph stays in its slot at the banner\'s left end, inside the banner', () => {
  for (const t of TYPES) {
    for (const hp of [5, 10, 20]) {
      const b = banner({ type: t, hp, maxHp: hp });
      const left = -bannerRight(hp);
      const pts = points(part(b, `data-glyph="${t}"`));
      expect(pts.length, t).toBeGreaterThan(2);
      for (const p of pts) {
        expect(p.x, `${t} ${hp}`).toBeGreaterThanOrEqual(left + 0.5);
        expect(p.x, `${t} ${hp}`).toBeLessThanOrEqual(left + 11);
        expect(Math.abs(p.y - BANNER_MID), `${t} ${hp}`).toBeLessThanOrEqual(5);
      }
    }
  }
});

test('the banner is the owner\'s colour, a hero\'s has a gold edge', () => {
  expect(banner()).toContain(RED.main);
  expect(banner({ colour: BLUE })).toContain(BLUE.main);
  expect(banner({ colour: BLUE })).not.toContain(RED.main);
  expect(banner()).not.toContain('data-hero-banner');
  const hero = banner({ hero: true });
  expect(hero).toContain('data-hero-banner');
  expect(hero).toContain('#FFDA4D');
  expect(banner()).not.toContain('#FFDA4D');
});

test('health pips beside the glyph: one per 5 health, full for health left', () => {
  const pips = (hp: number, maxHp: number) => banner({ hp, maxHp });
  expect((pips(15, 15).match(/data-pip="full"/g) ?? []).length).toBe(3);
  expect((pips(6, 15).match(/data-pip="full"/g) ?? []).length).toBe(2);
  expect((pips(1, 10).match(/data-pip="full"/g) ?? []).length).toBe(1);
  expect((pips(6, 15).match(/data-pip=/g) ?? []).length).toBe(3);
  expect((pips(0, 10).match(/data-pip="full"/g) ?? []).length).toBe(0);
  // The pips are right of the glyph's slot.
  const b = banner({ type: 'defender', hp: 20, maxHp: 20 });
  const glyphRight = Math.max(...points(part(b, 'data-glyph=')).map((p) => p.x));
  for (const m of b.matchAll(/<rect data-pip="\w+" x="([-\d.]+)"/g)) expect(Number(m[1])).toBeGreaterThan(glyphRight);
});

test('the marks are all still there round the banner, above the head', () => {
  const plain = banner();
  const all = [plain, banner({ taunted: true }), banner({ blinded: true }), banner({ fresh: true }), banner({ hunkered: true }), banner({ hidden: true })];
  expect(new Set(all).size).toBe(all.length);
  expect(banner({ hunkered: true })).toContain('data-hunker-mark');
  for (const p of points(banner({ taunted: true, blinded: true, hunkered: true, hidden: true }))) expect(p.y).toBeLessThan(-37);
  for (const p of points(banner({ taunted: true, blinded: true, fresh: true }))) expect(p.y).toBeLessThan(-37);
  // Taunted and blinded to the left of the banner, the glint and the shield to its right.
  const left = -bannerRight(10);
  const extra = (b: string) => points(b).filter((p) => !points(plain).some((q) => q.x === p.x && q.y === p.y));
  for (const p of extra(banner({ taunted: true, blinded: true }))) expect(p.x).toBeLessThan(left);
  for (const p of extra(banner({ fresh: true }))) expect(p.x).toBeGreaterThan(-left);
  for (const p of extra(banner({ hunkered: true }))) expect(p.x).toBeGreaterThan(-left);
});

test('a spent unit\'s banner is darker (the shade class), and its marks are not', () => {
  const marks = { taunted: true, fresh: false, hunkered: true } as const;
  const fresh = banner(marks);
  const spent = banner({ ...marks, spent: true });
  expect(part(fresh, 'data-banner=')).toMatch(/^<g class="unit-shade"/);
  expect(part(spent, 'data-banner=')).toMatch(/^<g class="unit-shade spent"/);
  // Apart from the class, nothing changes: the marks keep their colours.
  expect(spent.replace('unit-shade spent', 'unit-shade')).toBe(fresh);
  expect(part(spent, 'data-hunker-mark')).not.toContain('unit-shade');
});

test('a hidden unit\'s banner carries the slashed eye after its glyph, and is wider for it', () => {
  expect(banner({ type: 'scout', hp: 5, maxHp: 5 })).not.toContain('data-hidden-eye');
  const b = banner({ type: 'scout', hp: 5, maxHp: 5, hidden: true });
  const eye = part(b, 'data-hidden-eye');
  expect(eye).toContain(GLYPH);
  const glyphRight = Math.max(...points(part(b, 'data-glyph=')).map((p) => p.x));
  const eyePts = points(eye);
  expect(Math.min(...eyePts.map((p) => p.x))).toBeGreaterThan(glyphRight);
  const firstPip = Number(/<rect data-pip="\w+" x="([-\d.]+)"/.exec(b)![1]);
  expect(Math.max(...eyePts.map((p) => p.x))).toBeLessThan(firstPip);
  expect(bannerRight(5, true)).toBeGreaterThan(bannerRight(5));
  // Spent and hidden: darker, and the eye is on it still (it darkens with the banner).
  const both = banner({ type: 'scout', hp: 5, maxHp: 5, hidden: true, spent: true });
  expect(part(both, 'data-banner=')).toMatch(/^<g class="unit-shade spent"/);
  expect(part(both, 'data-banner=')).toContain('data-hidden-eye');
});
