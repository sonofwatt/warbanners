import type { ReactElement } from 'react';
import { RULES_VERSION } from '../engine';
import { APP_VERSION, BUILD } from '../version';
import { T } from './text';

export function App(): ReactElement {
  return (
    <main>
      <h1>{T.ui.appName}</h1>
      <footer>v{APP_VERSION} ({BUILD}) {T.ui.rulesWord} {RULES_VERSION}</footer>
    </main>
  );
}
