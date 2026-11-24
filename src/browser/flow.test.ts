import type { Page } from 'playwright';
import { describe, expect, test } from 'vitest';
import { frames, openApp, tapTile } from './harness';

// The whole game in a real browser, opened with ?seed=7. Facts about seed 7, checked against the engine:
// Player 1 (Spartans) moves first with 10 gold and one Krypteia Scout (unit 0) on the capital at -2,5, which can
// move to -1,4, or use its whole move going to 0,3 in the fog. Training a Warrior then costs 2. Player 2 (Mongols)
// starts its turn with 10 gold.

const SEED = '?seed=7';

const count = (page: Page, selector: string): Promise<number> => page.locator(selector).count();
const text = async (page: Page, id: string): Promise<string> => (await page.getByTestId(id).textContent()) ?? '';
const bodyText = async (page: Page): Promise<string> => (await page.locator('body').textContent()) ?? '';

/** The curtain is up and nothing of the board is in the page, then the named player takes the phone. */
async function throughCurtain(page: Page, name: string): Promise<void> {
  await page.getByTestId('pass').waitFor();
  expect(await bodyText(page)).toContain(name);
  expect(await count(page, '[data-hex]')).toBe(0);
  expect(await count(page, '[data-unit]')).toBe(0);
  await page.getByTestId('ready').tap();
  await page.getByTestId('match').waitFor();
  await page.locator('[data-centre]').first().waitFor({ state: 'attached' });
  await frames(page);
}

/** End turn is locked for a moment after the match appears; wait until it can be tapped. */
async function endTurnReady(page: Page): Promise<void> {
  await expect.poll(() => page.getByTestId('end-turn').isEnabled()).toBe(true);
}

async function startMatch(page: Page): Promise<void> {
  await page.getByTestId('new-match').tap();
  await page.getByTestId('start').tap();
}

/**
 * Moves seed 7's Warrior (unit 0) from one tile to the next and checks the slide: the unit's node is the
 * same node throughout, its screen position passes through points between the two tiles rather than
 * jumping, and once it has arrived it sits in the draw order after its own tile and before the tile in
 * front of it, so the back-to-front overlap holds.
 */
async function slide(page: Page, from: string, to: string): Promise<void> {
  await tapTile(page, from);
  // Every move off a mountain ends the turn (rules 8), so a unit on one has only moveEnds marks.
  await page.locator(`[data-mark="move"], [data-mark="moveEnds"]`).first().waitFor({ state: 'attached' });
  await page.evaluate(() => {
    const w = window as unknown as { unitNode: Element | null; track: { x: number; y: number }[]; tracking: boolean };
    w.unitNode = document.querySelector('[data-unit="0"]');
    w.track = [];
    w.tracking = true;
    const sample = (): void => {
      // Where the unit's own origin (its feet) is on the board: its screen matrix with the camera's taken
      // out, so neither the box of what it draws nor a camera refit (the selection panel opening or closing
      // resizes the board) counts as the unit moving.
      const unit = document.querySelector('[data-unit="0"]') as SVGGraphicsElement | null;
      const cam = document.querySelector('[data-camera]') as SVGGraphicsElement | null;
      const m = unit?.getScreenCTM();
      const c = cam?.getScreenCTM();
      if (m && c) {
        const b = c.inverse().multiply(m);
        w.track.push({ x: b.e, y: b.f });
      }
      if (w.tracking) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await tapTile(page, to);
  await expect.poll(() => page.locator('[data-unit="0"]').getAttribute('data-at')).toBe(to);
  await page.waitForTimeout(500);
  const out = await page.evaluate((k) => {
    const w = window as unknown as { unitNode: Element | null; track: { x: number; y: number }[]; tracking: boolean };
    w.tracking = false;
    const node = document.querySelector('[data-unit="0"]');
    const tile = document.querySelector(`[data-hex="${k.to}"]`);
    const front = document.querySelector(`[data-hex="${k.front}"]`);
    const follows = (a: Element | null, b: Element | null): boolean =>
      a !== null && b !== null && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    return { same: node !== null && node === w.unitNode, track: w.track, afterTile: follows(tile, node), beforeFront: follows(node, front) };
  }, { to, front: `${Number(to.split(',')[0]) - 1},${Number(to.split(',')[1]) + 1}` });
  expect(out.same).toBe(true);
  const first = out.track[0]!;
  const last = out.track[out.track.length - 1]!;
  expect(Math.hypot(last.x - first.x, last.y - first.y)).toBeGreaterThan(30); // one tile is about 38 board units away
  const between = out.track.filter((p) => {
    const t = ((p.x - first.x) * (last.x - first.x) + (p.y - first.y) * (last.y - first.y)) /
      ((last.x - first.x) ** 2 + (last.y - first.y) ** 2);
    return t > 0.1 && t < 0.9;
  });
  expect(between.length, JSON.stringify(out.track)).toBeGreaterThanOrEqual(2);
  expect(out.afterTile).toBe(true);
  expect(out.beforeFront).toBe(true);
}

interface Problem { what: string; box: { x: number; y: number; w: number; h: number } }

/**
 * Layout problems on the current screen: sideways scroll, and any button a finger cannot fully reach.
 *
 * Each rendered button is clipped by every clipping ancestor (overflow other than visible) and by the
 * viewport. A button that is not wholly visible is acceptable only when the ancestor that cuts it is a real
 * scroller (overflow auto or scroll, with more content than room; the page itself counts when it scrolls):
 * it is then scrolled into view and must pass the same checks there. Anything cut by a clipping ancestor
 * that cannot scroll, or by the viewport with no scroller to bring it in, is a problem.
 * The checks: at least 44 by 44, fully inside the viewport, and fully inside every clipping ancestor.
 */
function layoutProblems(page: Page): Promise<Problem[]> {
  return page.evaluate(() => {
    const out: { what: string; box: { x: number; y: number; w: number; h: number } }[] = [];
    const vw = window.innerWidth, vh = window.innerHeight;
    const page = document.scrollingElement ?? document.documentElement;
    if (page.scrollWidth > vw) {
      out.push({ what: `page scrolls sideways (${page.scrollWidth} > ${vw})`, box: { x: 0, y: 0, w: 0, h: 0 } });
    }
    const scrolls = (el: Element): boolean => {
      if (el === page) return el.scrollHeight > el.clientHeight;
      const o = getComputedStyle(el);
      return ((o.overflowY === 'auto' || o.overflowY === 'scroll') && el.scrollHeight > el.clientHeight)
        || ((o.overflowX === 'auto' || o.overflowX === 'scroll') && el.scrollWidth > el.clientWidth);
    };
    const clips = (el: Element): boolean => {
      const o = getComputedStyle(el);
      return o.overflowX !== 'visible' || o.overflowY !== 'visible';
    };
    const within = (r: DOMRect, c: { left: number; top: number; right: number; bottom: number }): boolean =>
      r.left >= c.left - 0.5 && r.top >= c.top - 0.5 && r.right <= c.right + 0.5 && r.bottom <= c.bottom + 0.5;
    const viewport = { left: 0, top: 0, right: vw, bottom: vh };

    // The first box (from the button outward) that does not fully contain the button: the viewport counts
    // as the page's box. Null when nothing cuts it.
    const cutter = (b: Element): Element | null => {
      const r = b.getBoundingClientRect();
      for (let el = b.parentElement; el !== null && el !== document.body && el !== document.documentElement; el = el.parentElement) {
        if (clips(el) && !within(r, el.getBoundingClientRect())) return el;
      }
      return within(r, viewport) ? null : page;
    };
    const nameOf = (b: HTMLElement): string => b.dataset.testid ?? b.textContent ?? '?';
    const boxOf = (r: DOMRect) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
    const check = (b: HTMLElement, when: string): void => {
      const r = b.getBoundingClientRect();
      if (r.width < 44 || r.height < 44) out.push({ what: `${nameOf(b)} is smaller than 44 by 44${when}`, box: boxOf(r) });
      const c = cutter(b);
      if (c !== null) {
        const by = c === page ? 'the screen' : `${c.className || c.tagName} (${scrolls(c) ? 'scrolls' : 'cannot scroll'})`;
        out.push({ what: `${nameOf(b)} is cut by ${by}${when}`, box: boxOf(r) });
      }
    };

    const reachable: { b: HTMLElement; scroller: Element }[] = [];
    for (const b of Array.from(document.querySelectorAll('button'))) {
      const r = b.getBoundingClientRect();
      const st = getComputedStyle(b);
      if (r.width === 0 || r.height === 0 || st.visibility === 'hidden' || st.display === 'none') continue;
      const c = cutter(b);
      if (c !== null && scrolls(c)) reachable.push({ b, scroller: c });
      else check(b, '');
    }
    // Each button a scroller cuts or hides: scroll it into view, check it there, put the scroll back.
    for (const { b, scroller } of reachable) {
      const saved = Array.from(new Set([scroller, page])).map((el) => ({ el, top: el.scrollTop, left: el.scrollLeft }));
      b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      check(b, ' after scrolling it into view');
      for (const s of saved) { s.el.scrollTop = s.top; s.el.scrollLeft = s.left; }
    }
    return out;
  });
}

async function expectTidy(page: Page, screen: string): Promise<void> {
  await frames(page);
  const problems = await layoutProblems(page);
  expect(problems, screen).toEqual([]);
}

/** The Home title sits on one line: no word is split and nothing spills past its box. */
async function expectTitleOnOneLine(page: Page): Promise<void> {
  const title = await page.evaluate(() => {
    const h = document.querySelector('.home-hero h1');
    if (!(h instanceof HTMLElement)) return null;
    const lineHeight = parseFloat(getComputedStyle(h).lineHeight);
    return { scrollWidth: h.scrollWidth, clientWidth: h.clientWidth, height: h.getBoundingClientRect().height, lineHeight };
  });
  expect(title).not.toBeNull();
  if (title === null) return;
  expect(title.scrollWidth, 'the title spills sideways').toBeLessThanOrEqual(title.clientWidth);
  expect(title.height, 'the title wraps onto a second line').toBeLessThan(title.lineHeight * 1.5);
}

/** End turn is on screen and nothing covers its centre. */
async function expectEndTurnUncovered(page: Page): Promise<void> {
  const ok = await page.evaluate(() => {
    const b = document.querySelector('[data-testid="end-turn"]');
    if (b === null) return 'missing';
    const r = b.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return 'off screen';
    const hit = document.elementFromPoint(x, y);
    return hit !== null && (hit === b || b.contains(hit)) ? 'ok' : `covered by ${hit?.className ?? 'nothing'}`;
  });
  expect(ok).toBe('ok');
}

describe.runIf(process.env.BROWSER === '1')('the whole game in a browser', () => {
  test('a whole hot-seat exchange, a reload, and a resignation', async () => {
    const { page, close } = await openApp(SEED);
    try {
      await startMatch(page);
      await throughCurtain(page, 'Player 1');

      expect(await text(page, 'gold')).toBe('10');
      expect(await text(page, 'turn')).toBe('Turn 1');
      expect(await text(page, 'who')).toBe('Player 1');

      await tapTile(page, '-2,5'); // the scout
      await expect.poll(() => count(page, '[data-mark="move"]')).toBeGreaterThan(0);
      await tapTile(page, '0,3');  // its whole move, so it is no longer selected
      await expect.poll(() => page.locator('[data-unit="0"]').getAttribute('data-at')).toBe('0,3');

      await tapTile(page, '-2,5'); // the city, now free
      await page.locator('[data-testid="shop-warrior"]').tap();    // its card opens with the train button
      await page.locator('[data-testid="cmd-train-warrior"]').tap();
      await expect.poll(() => text(page, 'gold')).toBe('8');
      expect(await count(page, '[data-unit]')).toBe(2);

      await endTurnReady(page);
      await page.getByTestId('end-turn').tap();
      await throughCurtain(page, 'Player 2');
      expect(await text(page, 'who')).toBe('Player 2');
      expect(await text(page, 'gold')).toBe('12');   // the second seat starts with 12 gold (rules 7)
      expect(await text(page, 'turn')).toBe('Turn 1');

      await page.reload();
      await page.getByTestId('new-match').waitFor();
      expect(await count(page, '[data-testid="save"]')).toBe(1);
      expect(await count(page, '[data-hex]')).toBe(0);
      await page.getByTestId('continue').tap();
      await throughCurtain(page, 'Player 2');
      expect(await text(page, 'gold')).toBe('12');

      await page.getByTestId('open-menu').tap();
      await page.getByTestId('resign').tap();
      await page.getByTestId('resign-yes').tap();
      await page.getByTestId('winner').waitFor();
      expect(await bodyText(page)).toContain('Player 1 wins');
      expect(await count(page, '[data-hex]')).toBe(0);
      await page.getByTestId('result-home').tap();
      await page.getByTestId('new-match').waitFor();
      expect(await count(page, '[data-testid="save"]')).toBe(0);
    } finally {
      await close();
    }
  });

  test.each([[360, 640], [412, 915], [915, 412], [568, 320]])('nothing is clipped at %i by %i', async (width, height) => {
    const { page, close } = await openApp(SEED, { width, height });
    try {
      await page.getByTestId('new-match').waitFor();
      await expectTidy(page, 'home');
      await expectTitleOnOneLine(page);
      await page.getByTestId('new-match').tap();
      await page.getByTestId('start').waitFor();
      await expectTidy(page, 'setup');
      await page.getByTestId('start').tap();
      await page.getByTestId('pass').waitFor();
      await expectTidy(page, 'curtain');
      await throughCurtain(page, 'Player 1');
      await endTurnReady(page);

      await tapTile(page, '-2,5');
      await page.locator('.selection').waitFor();
      await expectTidy(page, 'match with a unit selected');
      await expectEndTurnUncovered(page);

      await page.getByTestId('open-tech').tap();
      await page.locator('.tech-sheet').waitFor();
      await expectTidy(page, 'tech sheet');
      await expectEndTurnUncovered(page);
      await page.getByTestId('close-sheet').tap();

      await page.getByTestId('open-menu').tap();
      await page.locator('.menu').waitFor();
      await expectTidy(page, 'menu');
      await expectEndTurnUncovered(page);

      // Home with a save: the card (names, factions, turn, Continue, Delete) is the widest thing on Home.
      await page.getByTestId('go-home').tap();
      await page.getByTestId('save').waitFor();
      await expectTidy(page, 'home with a save');
      await page.getByTestId('delete').tap();
      await page.getByTestId('delete-no').waitFor();
      await expectTidy(page, 'home asking to delete a save');
      await page.getByTestId('delete-no').tap();
      await page.getByTestId('continue').tap();
      await throughCurtain(page, 'Player 1');
      await page.getByTestId('open-menu').tap();
      await page.getByTestId('resign').tap();
      await expectTidy(page, 'menu asking to resign');
      await page.getByTestId('resign-yes').tap();

      await page.getByTestId('winner').waitFor();
      await expectTidy(page, 'result');
      await page.getByTestId('result-home').tap();
      await page.getByTestId('new-match').waitFor();
      await expectTidy(page, 'home again');
    } finally {
      await close();
    }
  });

  test('a unit slides toward the back and toward the front, and keeps its node', async () => {
    const { page, close } = await openApp(SEED);
    try {
      await startMatch(page);
      await throughCurtain(page, 'Player 1');
      await slide(page, '-2,5', '-2,4'); // toward the back row
      await endTurnReady(page);
      await page.getByTestId('end-turn').tap();
      await throughCurtain(page, 'Player 2');
      await endTurnReady(page);
      await page.getByTestId('end-turn').tap();
      await throughCurtain(page, 'Player 1');
      await slide(page, '-2,4', '-2,5'); // toward the front row
    } finally {
      await close();
    }
  });

  test('a double tap on End turn ends one turn', async () => {
    const { page, close } = await openApp(SEED);
    try {
      await startMatch(page);
      await throughCurtain(page, 'Player 1');
      await endTurnReady(page);
      // Both clicks land on the same button in one task, faster than any finger.
      await page.evaluate(() => {
        const b = document.querySelector<HTMLButtonElement>('[data-testid="end-turn"]');
        if (b === null) throw new Error('no End turn');
        b.click();
        b.click();
      });
      await throughCurtain(page, 'Player 2');
      expect(await text(page, 'who')).toBe('Player 2');
      expect(await text(page, 'turn')).toBe('Turn 1');
    } finally {
      await close();
    }
  });

  test('choosing the AI hides the second name, and the match has no curtain', async () => {
    const { page, close } = await openApp(SEED);
    try {
      await page.getByTestId('new-match').tap();
      expect(await page.getByTestId('second-human').getAttribute('aria-checked')).toBe('true');
      expect(await count(page, '[data-testid="name-1"]')).toBe(1);
      await page.getByTestId('second-hard').tap();
      expect(await page.getByTestId('second-hard').getAttribute('aria-checked')).toBe('true');
      expect(await page.getByTestId('second-human').getAttribute('aria-checked')).toBe('false');
      expect(await count(page, '[data-testid="name-1"]')).toBe(0);
      expect(await bodyText(page)).toContain('Hard AI');
      await page.getByTestId('second-human').tap();
      expect(await count(page, '[data-testid="name-1"]')).toBe(1);
      await page.getByTestId('second-easy').tap();
      await page.getByTestId('start').tap();
      await page.getByTestId('match').waitFor();
      expect(await count(page, '[data-testid="pass"]')).toBe(0);
      expect(await text(page, 'who')).toBe('Player 1');
      await endTurnReady(page);
      await page.getByTestId('end-turn').tap();
      // The AI plays its turn on this screen and gives the phone straight back.
      await expect.poll(() => text(page, 'turn'), { timeout: 15_000 }).toBe('Turn 2');
      expect(await count(page, '[data-testid="thinking"]')).toBe(0);
      expect(await text(page, 'who')).toBe('Player 1');
    } finally {
      await close();
    }
  });
}, 120_000);
