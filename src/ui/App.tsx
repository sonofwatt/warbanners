import type { ReactElement } from 'react';
import { RULES_VERSION } from '../engine';
import { APP_VERSION, BUILD } from '../version';

export function App(): ReactElement {
  return (
    <main>
      <h1>Banners</h1>
      <footer>v{APP_VERSION} ({BUILD}) rules {RULES_VERSION}</footer>
    </main>
  );
}
