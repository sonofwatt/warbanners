import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// The emulator suites gate on EMULATOR=1 and otherwise skip, which reports green. CI runs
// `npm run test:emu` in place of `npm test`; this guard runs in the plain `npm test` and fails if that stops.

const runs = (): string[] => readFileSync('.github/workflows/deploy.yml', 'utf8').split('\n')
  .map(l => /^\s*(?:-\s+)?run:\s*(.+?)\s*$/.exec(l)?.[1]).filter((c): c is string => c !== undefined);

test('CI runs the emulator suite, with a JVM and a cached jar', () => {
  const wf = readFileSync('.github/workflows/deploy.yml', 'utf8');
  expect(runs()).toContain('npm run test:emu');
  expect(runs()).not.toContain('npm test');          // test:emu is a strict superset
  expect(wf).toContain('actions/setup-java');
  expect(wf).toContain('~/.cache/firebase/emulators');
});
test('every emulator suite gates on EMULATOR, and there are some', () => {
  const files = execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8' }).split('\n').filter(f => f.endsWith('.emu.test.ts'));
  expect(files).toContain('src/net/firebase.emu.test.ts');
  for (const f of files) expect(readFileSync(f, 'utf8'), f).toContain("describe.runIf(process.env.EMULATOR === '1')");
});
test('the emulator ports cannot collide with Deutsch Dash', () => {
  const cfg = JSON.parse(readFileSync('firebase.json', 'utf8'));
  expect(cfg.emulators.database.port).toBe(9010); expect(cfg.emulators.auth.port).toBe(9110);
  expect(cfg.emulators.hub.port).toBe(4410); expect(cfg.auth.providers.anonymous).toBe(true);
});
