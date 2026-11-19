import type { ReactElement } from 'react';
import { RULES_VERSION } from '../engine';
import { APP_VERSION, BUILD } from '../version';
import { ArtSheet } from './art/ArtSheet';

/** True when the page URL asks for the art sheet (?sheet=1). False in Node, where there is no location. */
function wantsArtSheet(): boolean {
  return typeof location !== 'undefined' && new URLSearchParams(location.search).has('sheet');
}

export function App(): ReactElement {
  if (wantsArtSheet()) return <ArtSheet />;
  return (
    <main>
      <h1>Banners</h1>
      <footer>v{APP_VERSION} ({BUILD}) rules {RULES_VERSION}</footer>
    </main>
  );
}
