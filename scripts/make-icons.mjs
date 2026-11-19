#!/usr/bin/env node
// Renders public/icon.svg to the PNGs that phones and the web manifest need.
// Plain Node, run with `npm run icons`; the PNGs are committed.
//
// - icon-180 (iOS touch icon), icon-192 and icon-512 are full-bleed squares:
//   iOS and Android round the corners themselves.
// - icon-maskable-512 has the drawing scaled into the middle 80%, so a
//   round or squircle mask never cuts into it.
// The background colour is read from the rendered #tile rect, so recolouring
// the icon means editing the SVG only. A missing #tile is a hard error.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const svg = readFileSync(path.join(root, 'public', 'icon.svg'), 'utf8');

const JOBS = [
  { name: 'icon-180.png', px: 180, scale: 1 },
  { name: 'icon-192.png', px: 192, scale: 1 },
  { name: 'icon-512.png', px: 512, scale: 1 },
  { name: 'icon-maskable-512.png', px: 512, scale: 0.8 },
];

const browser = await chromium.launch();
try {
  for (const { name, px, scale } of JOBS) {
    const page = await browser.newPage({ viewport: { width: px, height: px }, deviceScaleFactor: 1 });
    const inner = Math.round(px * scale);
    await page.setContent(
      `<style>html,body{margin:0;width:${px}px;height:${px}px;display:grid;place-items:center}` +
      `svg{display:block;width:${inner}px;height:${inner}px}</style>${svg}`,
    );
    const fill = await page.evaluate(() => {
      const tile = document.getElementById('tile');
      return tile ? getComputedStyle(tile).fill : null;
    });
    if (!fill) throw new Error('public/icon.svg has no #tile rect to take the background colour from');
    await page.evaluate(c => { document.body.style.background = c; document.documentElement.style.background = c; }, fill);
    await page.screenshot({ path: path.join(root, 'public', name) });
    await page.close();
    console.log(`wrote public/${name}`);
  }
} finally {
  await browser.close();
}
