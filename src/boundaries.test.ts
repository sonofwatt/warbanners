/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

function tracked(...paths: string[]): string[] {
  return execFileSync('git', ['ls-files', ...paths], { encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.tsx?$/.test(f));
}

function uiFiles(): string[] {
  return tracked('src/ui', 'src/app', 'src/browser', 'src/main.tsx', 'src/ai', 'scripts');
}

test('the app reaches the engine only through its index', () => {
  const files = uiFiles();
  expect(files).toContain('src/ui/App.tsx');
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const spec = m[1] ?? '';
      if (!spec.includes('/engine')) continue;
      const testkitOk = /\.test\.tsx?$/.test(file) && spec.endsWith('/engine/testkit');
      expect(testkitOk || /\/engine(\/index)?$/.test(spec), `${file} imports ${spec}`).toBe(true);
    }
  }
});

test('the AI module does not import the app or the UI', () => {
  for (const file of tracked('src/ai')) {
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const spec = m[1] ?? '';
      expect(/(^|\/)(app|ui)(\/|$)/.test(spec), `${file} imports ${spec}`).toBe(false);
    }
  }
});
