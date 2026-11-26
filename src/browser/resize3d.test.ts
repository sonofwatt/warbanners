import type { Page } from 'playwright';
import { describe, expect, test } from 'vitest';
import { cameraStill, frames, openApp, tapTile } from './harness';

// The 3D look keeps every layer of the board aligned when the board's slot changes size: a rotation, a browser bar
// showing or hiding (and, in 0.6.2's portrait layout, a card opening, changing height or closing under it; since
// 0.7.0 the cards lie over a slot that keeps its size, which this test also checks). The canvases
// resize their drawing buffers only when they draw, and CSS stretches a canvas that keeps its old buffer to its new
// box, so a resize that is not redrawn at once leaves the 3D terrain squashed or stretched off the svg marks above
// it (0.6.2 on a phone: a selection ring a tile away from the city it marks, blurry ground, ghosted figures).
//
// Every WebGL draw is recorded with the board camera's transform at that moment and the buffer's size, so the test
// can check, every frame and at rest, that each canvas was drawn for the camera the svg shows and at its CSS size
// times the pixel ratio the renderer uses (capped at 2, terrain3d.ts MAX_DPR). At rest it also checks that the
// selected tile's svg centre lands where the terrain canvas draws that board point. Seed 7: Player 1's unit stands
// on its capital at -2,5. Set SHOT_DIR to save a picture of each step.

const MAX_DPR = 2;

const RECORD_DRAWS = `(() => {
  const P = WebGL2RenderingContext.prototype;
  for (const m of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
    const f = P[m];
    if (typeof f !== 'function') continue;
    P[m] = function (...a) {
      const c = this.canvas;
      c.__drawn = { t: document.querySelector('[data-camera="true"]')?.getAttribute('transform') ?? '', w: c.width, h: c.height };
      return f.apply(this, a);
    };
  }
  // A sampler: each frame, just after it is painted (a message posted from the frame's animation callbacks runs as
  // the next task, after the rendering step), what was painted.
  window.__bad = [];
  window.__sampling = false;
  const look = () => {
    if (window.__sampling) {
      const cam = document.querySelector('[data-camera="true"]')?.getAttribute('transform') ?? '';
      const ratio = Math.min(devicePixelRatio, ${MAX_DPR});
      for (const id of ['board-terrain', 'board-units3d']) {
        const c = document.querySelector('[data-testid=' + id + ']');
        if (c === null || c.__drawn === undefined) continue;
        const r = c.getBoundingClientRect();
        const bad = [];
        if (Math.abs(c.width - r.width * ratio) > 1 || Math.abs(c.height - r.height * ratio) > 1) bad.push('buffer ' + c.width + 'x' + c.height + ' for ' + r.width + 'x' + r.height);
        if (c.__drawn.w !== c.width || c.__drawn.h !== c.height) bad.push('cleared since its last draw');
        if (c.__drawn.t !== cam) bad.push('drawn at ' + c.__drawn.t + ' under ' + cam);
        if (bad.length > 0 && window.__bad.length < 20) window.__bad.push(id + ': ' + bad.join(', '));
      }
    }
    requestAnimationFrame(post);
  };
  const ch = new MessageChannel();
  ch.port1.onmessage = look;
  const post = () => ch.port2.postMessage(0);
  requestAnimationFrame(post);
})()`;

type Check = { slot: number; ring: number | null; buffers: string[] };

/** At rest: each canvas's buffer against its CSS box, and the selected tile's svg centre against the 3D layer's. */
async function check(page: Page): Promise<Check> {
  return page.evaluate((maxDpr) => {
    type Drawn = { t: string; w: number; h: number };
    const ratio = Math.min(devicePixelRatio, maxDpr);
    const slot = document.querySelector('[data-testid=board-slot]')!.getBoundingClientRect();
    const buffers: string[] = [];
    for (const id of ['board-terrain', 'board-units3d']) {
      const c = document.querySelector(`[data-testid=${id}]`) as HTMLCanvasElement & { __drawn?: Drawn };
      const r = c.getBoundingClientRect();
      if (Math.abs(c.width - r.width * ratio) > 1 || Math.abs(c.height - r.height * ratio) > 1) buffers.push(`${id} ${c.width}x${c.height} for ${r.width}x${r.height}`);
    }
    const parse = (t: string) => {
      const m = /translate\(([-\d.e]+)[ ,]+([-\d.e]+)\)\s*scale\(([\d.e]+)\)/.exec(t);
      if (m === null) throw new Error(`no camera in ${t}`);
      return { tx: Number(m[1]), ty: Number(m[2]), s: Number(m[3]) };
    };
    let ring: number | null = null;
    const sel = document.querySelector('svg.board [data-hex]:has(> [data-mark="selected"]) [data-centre]');
    if (sel !== null) {
      // Where the svg draws the tile's centre, back to board units under the svg's camera.
      const b = sel.getBoundingClientRect();
      const svg = document.querySelector('svg.board')!.getBoundingClientRect();
      const now = parse(document.querySelector('[data-camera="true"]')!.getAttribute('transform')!);
      const bx = (b.x + b.width / 2 - svg.x - now.tx) / now.s, by = (b.y + b.height / 2 - svg.y - now.ty) / now.s;
      // Where the terrain canvas draws that board point: its camera at its last draw, over a viewport of its buffer
      // size, shown stretched to its CSS box (the 3D camera puts a ground point on exactly the svg's board point).
      const c = document.querySelector('[data-testid=board-terrain]') as HTMLCanvasElement & { __drawn: Drawn };
      const r = c.getBoundingClientRect();
      const was = parse(c.__drawn.t);
      const x = r.x + (was.tx + bx * was.s) * r.width / (c.width / ratio);
      const y = r.y + (was.ty + by * was.s) * r.height / (c.height / ratio);
      ring = Math.hypot(x - (b.x + b.width / 2), y - (b.y + b.height / 2));
    }
    return { slot: slot.height, ring, buffers };
  }, MAX_DPR);
}

describe.runIf(process.env.BROWSER === '1')('the 3D layers when the board slot changes size', () => {
  test.each([2.625, 1])('stay aligned at pixel ratio %f through selections, a rotation and a browser bar', async (scale) => {
    const { page, close } = await openApp('?seed=7', { width: 412, height: 915, webgl: true, scale });
    const shots = process.env.SHOT_DIR;
    let n = 0;
    const step = async (what: string): Promise<Check> => {
      await cameraStill(page);
      await frames(page);
      const c = await check(page);
      if (shots !== undefined) await page.screenshot({ path: `${shots}/resize3d-${scale}-${n++}-${what}.png` });
      expect(c.buffers, `${what}: each canvas buffer is its CSS size times the pixel ratio`).toEqual([]);
      if (c.ring !== null) expect(c.ring, `${what}: the selection ring sits on the 3D tile`).toBeLessThan(1.5);
      expect(await page.evaluate(() => (window as unknown as { __bad: string[] }).__bad), `${what}: every frame painted is aligned`).toEqual([]);
      return c;
    };
    // A tap as a player would make it: when the card or the bar lies over the tile, the board is dragged first.
    const tap = (hex: string): Promise<void> => tapTile(page, hex);
    try {
      await page.addInitScript(RECORD_DRAWS);
      await page.reload();
      await page.getByTestId('new-match').tap();
      await page.getByTestId('start').tap();
      await page.getByTestId('ready').tap();
      await page.getByTestId('match').waitFor();
      await page.getByTestId('open-menu').tap();
      await page.getByTestId('toggle-terrain3d').tap();
      await page.getByTestId('close-sheet').tap();
      await page.locator('[data-units3d="on"]').waitFor({ state: 'attached', timeout: 60_000 });
      await cameraStill(page);
      await frames(page);
      await page.evaluate(() => { (window as unknown as { __sampling: boolean }).__sampling = true; });
      const open = await step('none');

      // A tile in the middle of the slot (no pan needed) and the capital's cycle: unit, city, closed. Each opens,
      // changes or closes the card over the board, which keeps its slot's size throughout.
      const middle = await page.evaluate(() => {
        const s = document.querySelector('[data-testid=board-slot]')!.getBoundingClientRect();
        return [...document.querySelectorAll('svg.board [data-hex]:not([data-fog]) [data-centre]')]
          .map((e) => { const b = e.getBoundingClientRect(); return { k: e.getAttribute('data-centre')!, d: Math.hypot(b.x - s.x - s.width / 2, b.y - s.y - s.height * 0.35) }; })
          .filter((t) => t.k !== '-2,5')
          .sort((a, b) => a.d - b.d)[0]!.k;
      });
      await tap(middle);
      const tile = await step('tile');
      expect(tile.slot, 'the tile card lies over the board: the slot keeps its size').toBe(open.slot);
      await tap('-2,5');
      const unit = await step('unit');
      expect(unit.slot).toBe(open.slot);
      await tap('-2,5');
      const city = await step('city');
      expect(city.slot).toBe(open.slot);
      await tap(middle);
      await step('tile-again');
      await tap(middle);
      const closed = await step('closed');
      expect(closed.slot).toBe(open.slot);

      // With a selection: a rotation, back, and a browser bar showing and hiding.
      await tap(middle);
      await step('tile-before-turn');
      const slots: Record<string, number> = {};
      for (const [w, h, what] of [[915, 412, 'landscape'], [412, 915, 'portrait'], [412, 860, 'bar'], [412, 915, 'no-bar']] as const) {
        // The sampler pauses for the change itself: the new viewport is applied between frames, so a sample taken
        // before the next frame would see the new layout over a canvas that has not had a frame to redraw in.
        await page.evaluate(() => { (window as unknown as { __sampling: boolean }).__sampling = false; });
        await page.setViewportSize({ width: w, height: h });
        await frames(page);
        await page.evaluate(() => { (window as unknown as { __sampling: boolean }).__sampling = true; });
        slots[what] = (await step(what)).slot;
      }
      // These do resize the slot, so the redraw-at-once path is what kept the layers aligned.
      expect(slots['landscape']).toBeLessThan(open.slot);
      expect(slots['portrait']).toBe(open.slot);
      expect(slots['bar']).toBeLessThan(open.slot);
      expect(slots['no-bar']).toBe(open.slot);
    } finally {
      await close();
    }
  }, 180_000); // software WebGL draws the board on the CPU
});
