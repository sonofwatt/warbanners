import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import type { ArtMode } from '../art/mode';
import { setArtMode, useArtMode } from '../artMode';
import { T } from '../text';

// Settings, opened from Home: a card over the screen. One choice for now, the art style; it applies at once and is
// kept on this phone only, so two phones in one online match may each use their own.
export function Settings({ onClose }: { onClose: () => void }): ReactElement {
  const mode = useArtMode();
  const done = useRef<HTMLButtonElement>(null);
  useEffect(() => { done.current?.focus(); }, []);
  const choice = (m: ArtMode, name: string, blurb: string): ReactElement => (
    <li>
      <button type="button" className="paper style-choice" aria-pressed={mode === m} data-testid={`art-${m}`} onClick={() => setArtMode(m)}>
        <span className="style-name">{name}</span>
        <span className="style-blurb">{blurb}</span>
      </button>
    </li>
  );
  return (
    <div className="settings-scrim" onClick={onClose}>
      <section className="settings" role="dialog" aria-modal="true" aria-labelledby="settings-title" data-testid="settings" onClick={(e) => e.stopPropagation()}>
        <h2 id="settings-title">{T.ui.settingsTitle}</h2>
        <h3>{T.ui.artStyle}</h3>
        <ul className="style-choices">
          {choice('bright', T.ui.artBright, T.ui.artBrightBlurb)}
          {choice('gritty', T.ui.artGritty, T.ui.artGrittyBlurb)}
        </ul>
        <button type="button" className="primary" ref={done} data-testid="settings-done" onClick={onClose}>{T.ui.settingsDone}</button>
      </section>
    </div>
  );
}
