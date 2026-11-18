/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * The dash rule in CLAUDE.md, made mechanical.
 *
 * The file list comes from `git ls-files`, so the rule covers the whole repo
 * (docs, config, code) and a new file is covered the moment it is staged.
 *
 * The two characters are written as escapes below. Spelled literally they would
 * make this file the thing it forbids and the guard would flag itself.
 */
const BANNED = /[\u2014\u2013]/; // U+2014 EM DASH, U+2013 EN DASH

const BINARY_EXTENSIONS = /\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|otf|zip|gz|mp3|ogg|wav|mp4)$/i;

/** Tracked files only, so `node_modules` and `dist` are excluded by definition. */
function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
}

describe('no em dashes', () => {
  it('no tracked file contains one', () => {
    const files = trackedFiles();
    // An empty list would pass the sweep below without looking at anything.
    expect(files).toContain('CLAUDE.md');

    const hits: string[] = [];
    for (const file of files) {
      if (BINARY_EXTENSIONS.test(file)) continue;
      const bytes = readFileSync(file);
      if (bytes.includes(0)) continue;
      bytes
        .toString('utf8')
        .split('\n')
        .forEach((line, i) => {
          if (BANNED.test(line)) hits.push(`${file}:${i + 1}`);
        });
    }
    expect(hits).toEqual([]);
  });

  it('still recognises the characters it is looking for', () => {
    expect(BANNED.test(String.fromCharCode(0x2014))).toBe(true);
    expect(BANNED.test(String.fromCharCode(0x2013))).toBe(true);
    expect(BANNED.test('a plain - hyphen is the replacement')).toBe(false);
  });

  it('the rule is still written down, which is what this guard enforces', () => {
    expect(readFileSync('CLAUDE.md', 'utf8')).toContain('Never use an em dash');
  });
});
