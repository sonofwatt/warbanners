import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { RULES_VERSION } from '../engine';
import { APP_VERSION } from '../version';
import { App } from './App';

test('the shell names the game and its versions', () => {
  const html = renderToStaticMarkup(<App />);
  expect(html).toContain('Banners');
  expect(html).toContain(`v${APP_VERSION}`);
  expect(html).toContain(`rules ${RULES_VERSION}`);
});
