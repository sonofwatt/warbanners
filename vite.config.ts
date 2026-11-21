/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// The day of the commit being built (its own date, so the same commit always gives the same day). 'dev' outside CI.
function buildDate(): string {
  const sha = process.env.GITHUB_SHA;
  if (sha === undefined || !/^[0-9a-f]{7,40}$/i.test(sha)) return 'dev';
  try {
    return execFileSync('git', ['show', '-s', '--format=%cs', sha], { encoding: 'utf8' }).trim() || 'dev';
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  base: process.env.GITHUB_PAGES_BASE ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        id: 'warbanners',
        name: 'Warbanners',
        short_name: 'Warbanners',
        description: 'A turn-based hex strategy game for two players: lead your army across the map and take the field.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#7CC8EE',
        theme_color: '#7CC8EE',
        icons: [
          { src: 'icon-180.png', sizes: '180x180', type: 'image/png' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,m4a}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  worker: { format: 'es' },
  define: {
    __BUILD__: JSON.stringify((process.env.GITHUB_SHA ?? 'dev').slice(0, 7)),
    __BUILD_DATE__: JSON.stringify(buildDate()),
  },
  // expect.poll waits up to 10 s: a CI runner is several times slower than a desk machine.
  test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}'], expect: { poll: { timeout: 10_000 } } },
});
