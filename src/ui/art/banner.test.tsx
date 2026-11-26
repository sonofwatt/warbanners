import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { UNITS } from '../../engine';
import type { UnitTypeId } from '../../engine';
import { BADGE_D, BADGE_Y, BANNER_H, BANNER_MID, bannerRight, GLYPH, WarBanner } from './banner';
import { EMBLEM_R, emblemPaint } from './emblems';
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

/** The emblem badge's group, and the banner without it (the badge's shapes are in the emblem's own units). */
const badgeOf = (b: string): string => part(b, 'data-glyph=');
const withoutBadge = (b: string): string => b.replace(badgeOf(b), '');
/** Where the badge is put: its middle and its scale from emblem units. */
function badgeAt(b: string): { x: number; y: number; s: number } {
  const m = /transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(([\d.]+)\)"/.exec(badgeOf(b))!;
  return { x: Number(m[1]), y: Number(m[2]), s: Number(m[3]) };
}

test('every unit type wears its own emblem badge on its banner, the small form in the owner colour', () => {
  const badges = TYPES.map((t) => {
    const b = banner({ type: t });
    expect(b, t).toContain(`data-banner="${t}"`);
    const g = badgeOf(b);
    expect(g, t).toContain(`data-emblem="${t}"`);
    expect(g, t).toContain(emblemPaint(RED).main);
    expect(badgeOf(banner({ type: t, colour: BLUE })), t).toContain(emblemPaint(BLUE).main);
    return g.replace(new RegExp(`data-(glyph|emblem)="${t}"`, 'g'), '');
  });
  expect(new Set(badges).size, 'no two types share an emblem').toBe(TYPES.length);
});

test('the badge is 1.6 times the banner\'s height, over the banner\'s left end, its foot near the banner\'s', () => {
  expect(BADGE_D).toBeCloseTo(1.6 * BANNER_H);
  for (const t of TYPES) {
    for (const hp of [5, 10, 20]) {
      for (const hidden of [false, true]) {
        const b = banner({ type: t, hp, maxHp: hp, hidden });
        const at = badgeAt(b);
        expect(at.s * EMBLEM_R * 2, t).toBeCloseTo(BADGE_D, 2);
        expect(at.y).toBe(BADGE_Y);
        // The badge's left edge is the banner's left end (inside its edge line).
        expect(at.x - BADGE_D / 2, `${t} ${hp}`).toBeCloseTo(-bannerRight(hp, hidden) + 0.8, 1);
      }
    }
  }
  // The emblem box reaches 56 units up and 52 down from its middle: the badge stays within a few units of the banner.
  expect(BADGE_Y - 56 * (BADGE_D / 2 / EMBLEM_R)).toBeGreaterThan(BANNER_MID - BANNER_H / 2 - 10);
  expect(BADGE_Y + 52 * (BADGE_D / 2 / EMBLEM_R)).toBeLessThan(-32);
});

test('the banner is the owner\'s colour, a hero\'s has a gold edge and a gold ring round its badge', () => {
  expect(banner()).toContain(RED.main);
  expect(banner({ colour: BLUE })).toContain(BLUE.main);
  expect(banner({ colour: BLUE })).not.toContain(RED.main);
  expect(banner()).not.toContain('data-hero-banner');
  const hero = banner({ hero: true });
  expect(hero).toContain('data-hero-banner');
  expect(hero).toContain('#FFDA4D');
  expect(badgeOf(hero)).toContain('fill="#FFDA4D"');
  expect(banner()).not.toContain('#FFDA4D');
});

test('health pips beside the badge: one per 5 health, full for health left', () => {
  const pips = (hp: number, maxHp: number) => banner({ hp, maxHp });
  expect((pips(15, 15).match(/data-pip="full"/g) ?? []).length).toBe(3);
  expect((pips(6, 15).match(/data-pip="full"/g) ?? []).length).toBe(2);
  expect((pips(1, 10).match(/data-pip="full"/g) ?? []).length).toBe(1);
  expect((pips(6, 15).match(/data-pip=/g) ?? []).length).toBe(3);
  expect((pips(0, 10).match(/data-pip="full"/g) ?? []).length).toBe(0);
  // The pips are right of the badge.
  const b = banner({ type: 'defender', hp: 20, maxHp: 20 });
  const badgeRight = badgeAt(b).x + BADGE_D / 2;
  for (const m of b.matchAll(/<rect data-pip="\w+" x="([-\d.]+)"/g)) expect(Number(m[1])).toBeGreaterThan(badgeRight);
});

test('the marks are all still there round the banner, above the head', () => {
  const plain = banner();
  const all = [plain, banner({ taunted: true }), banner({ blinded: true }), banner({ fresh: true }), banner({ hunkered: true }), banner({ hidden: true })];
  expect(new Set(all).size).toBe(all.length);
  expect(banner({ hunkered: true })).toContain('data-hunker-mark');
  for (const p of points(withoutBadge(banner({ taunted: true, blinded: true, hunkered: true, hidden: true })))) expect(p.y).toBeLessThan(-37);
  for (const p of points(withoutBadge(banner({ taunted: true, blinded: true, fresh: true })))) expect(p.y).toBeLessThan(-37);
  // Taunted and blinded to the left of the banner, the glint and the shield to its right.
  const left = -bannerRight(10);
  const extra = (b: string) => points(withoutBadge(b)).filter((p) => !points(withoutBadge(plain)).some((q) => q.x === p.x && q.y === p.y));
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

test('a hidden unit\'s banner carries the slashed eye after its badge, and is wider for it', () => {
  expect(banner({ type: 'scout', hp: 5, maxHp: 5 })).not.toContain('data-hidden-eye');
  const b = banner({ type: 'scout', hp: 5, maxHp: 5, hidden: true });
  const eye = part(b, 'data-hidden-eye');
  expect(eye).toContain(GLYPH);
  const badgeRight = badgeAt(b).x + BADGE_D / 2;
  const eyePts = points(eye);
  expect(Math.min(...eyePts.map((p) => p.x))).toBeGreaterThan(badgeRight);
  const firstPip = Number(/<rect data-pip="\w+" x="([-\d.]+)"/.exec(b)![1]);
  expect(Math.max(...eyePts.map((p) => p.x))).toBeLessThan(firstPip);
  expect(bannerRight(5, true)).toBeGreaterThan(bannerRight(5));
  // Spent and hidden: darker, and the eye is on it still (it darkens with the banner).
  const both = banner({ type: 'scout', hp: 5, maxHp: 5, hidden: true, spent: true });
  expect(part(both, 'data-banner=')).toMatch(/^<g class="unit-shade spent"/);
  expect(part(both, 'data-banner=')).toContain('data-hidden-eye');
});
