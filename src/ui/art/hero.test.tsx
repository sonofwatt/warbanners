import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { CONFIG, UNITS } from '../../engine';
import { HeroMark, ItemBadge, itemBadgeX } from './hero';
import { ACCENT, playerColour } from './palette';
import { BANNER_MID, MARK_R, MARK_STEP, WarBanner } from './banner';
import type { WarBannerProps } from './banner';

/** A war banner with nothing on it but what is given. */
const banner = (p: Partial<WarBannerProps>) => (
  <WarBanner type="warrior" colour={playerColour('spartans')} hp={10} maxHp={10} spent={false} fresh={false} taunted={false} blinded={false} {...p} />
);
/**
 * The banner row's reach either side: taunted and blinded beside a 5-pip banner on the left, the glint and a draught
 * on the right. The emblem badge (2026-11-26) made the banner 7 units wider than the glyph slot did, 3.5 a side.
 */
const REACH = 37.5;
/** The banner row, top to bottom: the banner with its edge, and every mark and badge on it. */
const ROW_TOP = -50, ROW_BOTTOM = -38;

/** The markup without the banner's emblem badge, whose shapes are drawn in the emblem's own units and moved there. */
function withoutBadge(s: string): string {
  const from = s.indexOf('<g data-glyph');
  if (from < 0) return s;
  const tag = /<g[\s>]|<\/g>/g;
  tag.lastIndex = from;
  let depth = 0;
  for (let m = tag.exec(s); m !== null; m = tag.exec(s)) {
    depth += m[0] === '</g>' ? -1 : 1;
    if (depth === 0) return s.slice(0, from) + s.slice(m.index + 4);
  }
  throw new Error('unbalanced markup');
}
const html = (el: ReactElement) => withoutBadge(renderToStaticMarkup(<svg>{el}</svg>));

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

// The largest health any unit can have: the biggest type plus Fierce.
const MOST_HP = Math.max(...Object.values(UNITS).map((u) => u.hp)) + CONFIG.heroes.fierceHp;

test('the hero mark and the draught badge stay inside the unit box and use only absolute paths', () => {
  // The mark rises behind the figure, inside x -20..20, and its top stays below the taunted and blinded badges,
  // which hang beside the banner down to BANNER_MID + MARK_R.
  const belowMarks = BANNER_MID + MARK_R;
  for (const accent of Object.values(ACCENT)) {
    const mark = html(<HeroMark accent={accent} />);
    expect(mark).toContain('data-hero-mark');
    expect(mark).toContain(accent);
    expect(mark).not.toMatch(/Gradient|filter/);
    const pts = extents(mark);
    expect(pts.length).toBeGreaterThan(4);
    for (const p of pts) {
      expect(p.x, p.where).toBeGreaterThanOrEqual(-20);
      expect(p.x, p.where).toBeLessThanOrEqual(20);
      expect(p.y, p.where).toBeGreaterThan(belowMarks);
      expect(p.y, p.where).toBeLessThanOrEqual(8);
    }
  }
  // The badge sits on the banner's row, never wider than the row's own reach on the left (taunted and blinded beside
  // a 5-pip banner), fresh or not.
  const badge = html(<ItemBadge item="draught" />);
  expect(badge).toContain('data-item="draught"');
  for (const hp of [5, 10, 15, 20, MOST_HP]) {
    for (const fresh of [false, true]) {
      for (const p of extents(badge)) {
        const x = p.x + itemBadgeX(hp, fresh);
        expect(x, `${hp} ${fresh} ${p.where}`).toBeLessThanOrEqual(REACH);
        expect(x, `${hp} ${fresh} ${p.where}`).toBeGreaterThan(0);
        expect(p.y, p.where).toBeGreaterThanOrEqual(ROW_TOP);
        expect(p.y, p.where).toBeLessThan(ROW_BOTTOM);
      }
    }
  }
  for (const p of extents(html(banner({ hp: MOST_HP, maxHp: MOST_HP, taunted: true, blinded: true })))) {
    expect(p.x, p.where).toBeGreaterThanOrEqual(-REACH);
  }
});

test('the draught badge takes the glint\'s slot, and moves one slot right when the unit is also fresh', () => {
  expect(itemBadgeX(10, true) - itemBadgeX(10, false)).toBeCloseTo(MARK_STEP);
  // The glint and the badge never overlap: the badge's leftmost point is right of the glint's rightmost.
  const glint = extents(html(banner({ fresh: true })));
  const glintRight = Math.max(...glint.map((p) => p.x));
  const badgeLeft = Math.min(...extents(html(<ItemBadge item="draught" />)).map((p) => p.x)) + itemBadgeX(10, true);
  expect(badgeLeft).toBeGreaterThan(glintRight);
  // Not fresh, it sits where the glint would, clear of the banner.
  const plateRight = Math.max(...extents(html(banner({}))).map((p) => p.x));
  expect(Math.min(...extents(html(<ItemBadge item="draught" />)).map((p) => p.x)) + itemBadgeX(10, false)).toBeGreaterThan(plateRight);
});

test('the hunker shield takes the glint\'s slot, stays on the plate\'s row, and the draught badge moves past it', () => {
  const shield = extents(html(banner({ hp: MOST_HP, maxHp: MOST_HP, hunkered: true })));
  const plain = extents(html(banner({ hp: MOST_HP, maxHp: MOST_HP })));
  const plateRight = Math.max(...plain.map((p) => p.x));
  const extra = shield.filter((p) => p.x > plateRight);
  expect(extra.length).toBeGreaterThan(0);
  for (const p of extra) {
    expect(p.x, p.where).toBeLessThan(itemBadgeX(MOST_HP, true) + Math.min(...extents(html(<ItemBadge item="draught" />)).map((q) => q.x)));
    expect(p.y, p.where).toBeGreaterThanOrEqual(ROW_TOP);
    expect(p.y, p.where).toBeLessThan(ROW_BOTTOM);
  }
});

test('the hero mark is unlike the taunted, blinded and fresh marks', () => {
  const mark = html(<HeroMark accent={ACCENT.spartans} />);
  for (const colour of ['#E0563F', '#6F6A80', '#FFC93C']) expect(mark).not.toContain(colour);
});
