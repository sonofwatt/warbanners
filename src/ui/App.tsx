import type { ReactElement } from 'react';
import { RULES_VERSION } from '../engine';
import { useApp } from '../app/useApp';
import { APP_VERSION, BUILD } from '../version';
import { T } from './text';
import { Home } from './screens/Home';
import type { HomeProps } from './screens/Home';
import { Match } from './screens/Match';
import { Pass } from './screens/Pass';
import { Result } from './screens/Result';
import { Setup } from './screens/Setup';

// Shows the screen the store names. Home's updater and install hooks come from main.tsx.
export function App(home: HomeProps = {}): ReactElement {
  const screen = useApp((s) => s.screen);
  const version = <footer className="version">v{APP_VERSION} ({BUILD}) {T.ui.rulesWord} {RULES_VERSION}</footer>;
  if (screen === 'home') return <main className="app"><Home {...home} />{version}</main>;
  if (screen === 'setup') return <main className="app"><Setup /></main>;
  if (screen === 'pass') return <main className="app"><Pass /></main>;
  if (screen === 'match') return <main className="app"><Match /></main>;
  return <main className="app"><Result /></main>;
}
