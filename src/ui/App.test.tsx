import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { versionLine } from './Version';
import { App } from './App';

test('the shell names the game and its versions', () => {
  const html = renderToStaticMarkup(<App />);
  expect(html).toContain('Warbanners');
  expect(html).toContain(versionLine());
});
