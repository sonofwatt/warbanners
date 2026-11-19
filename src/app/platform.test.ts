import { expect, test } from 'vitest';
import { installAdvice } from './platform';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const PIXEL = 'Mozilla/5.0 (Linux; Android 16; Pixel 10 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

test('install advice', () => {
  expect(installAdvice({ ua: IPHONE, standalone: false, canPrompt: false })).toBe('iosShare');
  expect(installAdvice({ ua: IPHONE, standalone: true, canPrompt: false })).toBe('installed');
  expect(installAdvice({ ua: PIXEL, standalone: false, canPrompt: true })).toBe('prompt');
  expect(installAdvice({ ua: PIXEL, standalone: false, canPrompt: false })).toBe('none');
  expect(installAdvice({ ua: PIXEL, standalone: true, canPrompt: true })).toBe('installed');
});
