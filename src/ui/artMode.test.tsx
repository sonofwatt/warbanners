import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { getArtMode, setArtMode } from './artMode';
import { Settings } from './screens/Settings';
import { T } from './text';

afterEach(() => { setArtMode('bright'); vi.unstubAllGlobals(); });

test('Bright is the default and Gritty is kept in storage', () => {
  const map = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } });
  expect(getArtMode()).toBe('bright');
  setArtMode('gritty');
  expect(map.get('banners.artMode')).toBe('gritty');
  expect(getArtMode()).toBe('gritty');
  map.set('banners.artMode', 'neon');   // anything else reads as the remembered choice, never a broken style
  expect(['bright', 'gritty']).toContain(getArtMode());
});

test('blocked storage keeps the choice in memory', () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
  setArtMode('gritty');
  expect(getArtMode()).toBe('gritty');
});

test('Settings offers both styles and marks the current one', () => {
  const html = renderToStaticMarkup(<Settings onClose={() => {}} />);
  expect(html).toContain(T.ui.artBright);
  expect(html).toContain(T.ui.artGritty);
  expect(html).toMatch(/aria-pressed="true"[^>]*data-testid="art-bright"/);
  expect(html).toMatch(/aria-pressed="false"[^>]*data-testid="art-gritty"/);
});
