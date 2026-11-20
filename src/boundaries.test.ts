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
  return tracked('src/ui', 'src/app', 'src/browser', 'src/main.tsx', 'src/ai', 'src/net', 'src/online', 'scripts');
}

test('the app reaches the engine only through its index', () => {
  const files = uiFiles();
  expect(files).toContain('src/ui/App.tsx');
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const spec = m[1] ?? '';
      if (!spec.includes('/engine')) continue;
      const testkitOk = (/\.test\.tsx?$/.test(file) || file === 'src/ai/scenarios.ts') && spec.endsWith('/engine/testkit');
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

const isTest = (f: string): boolean => /\.test\.tsx?$/.test(f);

// Any import of Firebase: `from 'firebase/...'`, a bare `'firebase'`, a side-effect `import 'firebase/...'`, a dynamic
// `import('firebase/...')`, a `require`, and the `@firebase/...` packages.
const NAMES_FIREBASE = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]@?firebase(?:\/[^'"]*)?['"]/;

test('the Firebase import check catches every import form', () => {
  const forms = [
    "import { ref } from 'firebase/database';", "import firebase from 'firebase';", "import 'firebase/auth';",
    "const m = await import('firebase/database');", 'const m = await import("firebase");', "export * from 'firebase/app';",
    "import { x } from '@firebase/database';", "const f = require('firebase/app');",
  ];
  for (const form of forms) expect(NAMES_FIREBASE.test(form), form).toBe(true);
  for (const fine of ["import { fb } from '../net/firebase';", "const net = await import('../net/firebaseNet');", '// firebase is loaded lazily'])
    expect(NAMES_FIREBASE.test(fine), fine).toBe(false);
});

test('only src/net imports Firebase', () => {
  for (const file of tracked('src').filter((f) => !f.startsWith('src/net/') && f !== 'src/boundaries.test.ts')) {
    expect(NAMES_FIREBASE.test(readFileSync(file, 'utf8')), file).toBe(false);
  }
});

test('the app and src/online reach src/net only through import type or a dynamic import', () => {
  const files = tracked('src/ui', 'src/app', 'src/main.tsx', 'src/online').filter((f) => !isTest(f));
  expect(files).toContain('src/app/store.ts');
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*['"]([^'"]+)['"]/g)) {
      const spec = m[1] ?? '';
      const typeOnly = /^\s*(?:import|export)\s+type\b/.test(m[0]);
      expect(typeOnly || !/(^|\/)net(\/|$)/.test(spec), `${file} imports ${spec}`).toBe(true);
    }
  }
});

test('netReady holds no URL and imports nothing, so the main chunk never names the database', () => {
  const source = readFileSync('src/netReady.ts', 'utf8');
  expect(source).not.toMatch(/firebaseio|googleapis|https?:\/\//);
  expect(source).not.toMatch(/^\s*import\s/m);
});
