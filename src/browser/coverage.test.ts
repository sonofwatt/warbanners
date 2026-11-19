import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// The browser suites gate on BROWSER=1 and otherwise skip, which reports green. This guard runs in the plain
// `npm test` and fails if CI stops running them: the workflow must install Chromium and run `npm run test:browser`,
// and every file that drives a browser must carry the gate that `test:browser` switches on.

const GATE = /\b(?:describe|test)\.runIf\(process\.env\.BROWSER === '1'\)/;

function tracked(): string[] {
  return execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8' }).split('\n').filter((f) => /\.test\.tsx?$/.test(f));
}

describe('the browser suites cannot skip silently in CI', () => {
  const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');
  const runs = workflow
    .split('\n')
    .map((l) => /^\s*(?:-\s+)?run:\s*(.+?)\s*$/.exec(l)?.[1])
    .filter((c): c is string => c !== undefined);

  test('the workflow runs exactly `npm run test:browser`', () => {
    expect(runs).toContain('npm run test:browser');
  });

  test('the workflow installs Chromium', () => {
    expect(runs.some((c) => c.includes('playwright install'))).toBe(true);
  });

  test('every browser test file carries the BROWSER=1 gate', () => {
    const files = tracked().filter((f) => {
      const text = readFileSync(f, 'utf8');
      return /from '(?:playwright|\.\/harness)'/.test(text);
    });
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const f of files) expect(GATE.test(readFileSync(f, 'utf8')), f).toBe(true);
  });
});
