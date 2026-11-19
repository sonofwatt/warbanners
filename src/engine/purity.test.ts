/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, posix } from 'node:path';
import { expect, test } from 'vitest';

const BANNED = /\b(document|window|localStorage|navigator|fetch|Date|Math\.random)\b/;
const BANNED_AI = /\b(document|window|localStorage|navigator|fetch|Date|Math\.random|performance)\b/;

function engineFiles(): string[] {
  return execFileSync('git', ['ls-files', 'src/engine'], { encoding: 'utf8' })
    .split('\n')
    .filter((f) => f.endsWith('.ts') && !/\.test\.tsx?$/.test(f));
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  for (const m of source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) specs.push(m[1] ?? '');
  return specs;
}

test('the engine imports nothing from outside itself and touches no ambient state', () => {
  const files = engineFiles();
  expect(files).toContain('src/engine/apply.ts');
  for (const file of files) {
    const code = stripComments(readFileSync(file, 'utf8'));
    for (const spec of importSpecifiers(code)) {
      if (!spec.startsWith('.')) continue;
      const resolved = posix.normalize(posix.join(dirname(file), spec));
      expect(resolved.startsWith('src/engine/'), `${file} imports ${spec}`).toBe(true);
    }
    expect(code.match(BANNED)?.[0], `${file} uses ambient state`).toBeUndefined();
  }
});

test('the AI module touches no ambient state, clock or randomness (the worker excepted)', () => {
  const files = execFileSync('git', ['ls-files', 'src/ai'], { encoding: 'utf8' })
    .split('\n')
    .filter((f) => f.endsWith('.ts') && !/\.test\.tsx?$/.test(f) && f !== 'src/ai/worker.ts');
  for (const file of files) {
    const code = stripComments(readFileSync(file, 'utf8'));
    expect(code.match(BANNED_AI)?.[0], `${file} uses ambient state`).toBeUndefined();
  }
});
