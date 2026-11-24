/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, test } from 'vitest';

// The default path never loads three.js: no module the app imports statically (from src/main.tsx, following every
// static import and skipping `import type` and dynamic `import()`) imports three or the terrain renderer.

const SRC = resolve(__dirname, '..', '..');
const STATIC = /^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;

function resolveLocal(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) if (existsSync(base + ext) && !base.endsWith('/') && (ext !== '' || /\.(ts|tsx)$/.test(base))) return base + ext;
  return null;
}

function staticGraph(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const todo = [entry];
  while (todo.length) {
    const f = todo.pop()!;
    if (files.has(f)) continue;
    files.add(f);
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(STATIC)) {
      const spec = m[1]!;
      if (spec.startsWith('.')) {
        const r = resolveLocal(f, spec);
        if (r !== null) todo.push(r);
      } else packages.add(spec);
    }
  }
  return { files, packages };
}

test('three.js and the terrain renderer are not in the statically loaded app', () => {
  const { files, packages } = staticGraph(resolve(SRC, 'main.tsx'));
  expect(files.size).toBeGreaterThan(50);
  expect(files.has(resolve(SRC, 'ui/board/Board.tsx'))).toBe(true);
  expect([...packages].filter((p) => p === 'three' || p.startsWith('three/'))).toEqual([]);
  for (const f of ['terrain3d.ts', 'build.ts', 'shaders.ts', 'layout.ts']) expect(files.has(resolve(SRC, 'ui/terrain3d', f)), f).toBe(false);
});

test('the board reaches the renderer only through a dynamic import', () => {
  const board = readFileSync(resolve(SRC, 'ui/board/Board.tsx'), 'utf8');
  expect(board).toMatch(/import\('\.\.\/terrain3d\/terrain3d'\)/);
  expect(board).toMatch(/import type \{ Terrain3d \} from '\.\.\/terrain3d\/terrain3d'/);
});
