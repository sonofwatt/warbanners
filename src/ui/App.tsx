import type { ReactElement } from 'react';
import { RULES_VERSION } from '../engine';
import { useApp } from '../app/useApp';
import { APP_VERSION, BUILD } from '../version';
import { T } from './text';
import { ArtSheet } from './art/ArtSheet';
import { BoardDemo } from './board/BoardDemo';
import { Home } from './screens/Home';
import type { HomeProps } from './screens/Home';
import { Match } from './screens/Match';
import { Pass } from './screens/Pass';
import { Result } from './screens/Result';
import { ScreenGuard } from './screens/ScreenGuard';
import { Setup } from './screens/Setup';

/** True when the page URL asks for the art sheet (?sheet=1). False in Node, where there is no location. */
function wantsArtSheet(): boolean {
  return typeof location !== 'undefined' && new URLSearchParams(location.search).has('sheet');
}

/** The demo board's seed and turns when the URL asks for one (?board=<seed>&turns=<n>), else null. Null in Node. */
function wantsBoard(): { seed: number; turns: number } | null {
  if (typeof location === 'undefined') return null;
  const q = new URLSearchParams(location.search);
  const seed = Number.parseInt(q.get('board') ?? '', 10);
  if (!Number.isFinite(seed)) return null;
  const turns = Number.parseInt(q.get('turns') ?? '0', 10);
  return { seed, turns: Number.isFinite(turns) ? Math.max(0, Math.min(turns, 200)) : 0 };
}

// The art sheet and the demo board are developer pages; everything else is the game.
export function App(home: HomeProps = {}): ReactElement {
  if (wantsArtSheet()) return <ArtSheet />;
  const board = wantsBoard();
  if (board !== null) return <BoardDemo seed={board.seed} turns={board.turns} />;
  return <ScreenGuard><Screens {...home} /></ScreenGuard>;
}

// Shows the screen the store names. Home's updater and install hooks come from main.tsx.
function Screens(home: HomeProps): ReactElement {
  const screen = useApp((s) => s.screen);
  const version = <footer className="version">v{APP_VERSION} ({BUILD}) {T.ui.rulesWord} {RULES_VERSION}</footer>;
  if (screen === 'home') return <main className="app"><Home {...home} />{version}</main>;
  if (screen === 'setup') return <main className="app"><Setup /></main>;
  if (screen === 'pass') return <main className="app"><Pass /></main>;
  if (screen === 'match') return <main className="app"><Match /></main>;
  return <main className="app"><Result /></main>;
}
