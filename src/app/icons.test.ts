import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

test.each([['icon-180.png', 180], ['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable-512.png', 512]])(
  '%s is a %i pixel square PNG', (name, size) => {
    const bytes = readFileSync(new URL(`../../public/${name}`, import.meta.url));
    expect([...bytes.subarray(0, 8)]).toEqual(SIGNATURE);
    expect(bytes.readUInt32BE(16)).toBe(size);
    expect(bytes.readUInt32BE(20)).toBe(size);
  });
