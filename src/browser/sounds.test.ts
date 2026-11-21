import { describe, expect, test } from 'vitest';
import { sampleUrl } from '../ui/sound';
import { openApp } from './harness';

// The recorded sounds are served under the deployed base path (run with GITHUB_PAGES_BASE=/warbanners/ to check
// the sub-path): the URL the game builds for a take answers 200 with audio.

describe.runIf(process.env.BROWSER === '1')('Recorded sounds', () => {
  test('a sound file resolves under the base path', async () => {
    const app = await openApp();
    try {
      const res = await app.page.evaluate(async (path: string) => {
        const r = await fetch(path);
        return { status: r.status, type: r.headers.get('content-type') ?? '', size: (await r.arrayBuffer()).byteLength };
      }, sampleUrl('hit', 1));
      expect(res.status).toBe(200);
      expect(res.type).not.toContain('text/html');
      expect(res.size).toBeGreaterThan(1000);
    } finally {
      await app.close();
    }
  });
});
