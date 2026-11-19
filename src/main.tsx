import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { appStore, setUpdater } from './app/useApp';
import { startUpdates } from './app/update';
import { App } from './ui/App';
import './ui/theme.css';

// Chrome's install offer; it is not in the DOM typings.
interface InstallPromptEvent extends Event { prompt(): Promise<void> }

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = createRoot(rootEl);
  const store = appStore();
  const updater = startUpdates((s) => store.getState().setUpdate(s), () => store.getState().screen === 'home');
  setUpdater(updater);

  let saved: InstallPromptEvent | null = null;
  const render = (): void => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const install = {
      ua: navigator.userAgent, standalone, canPrompt: saved !== null,
      prompt: () => { const e = saved; saved = null; render(); void e?.prompt(); },
    };
    root.render(<StrictMode><App onCheck={updater.check} install={install} /></StrictMode>);
  };
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); saved = e as InstallPromptEvent; render(); });
  window.addEventListener('appinstalled', () => { saved = null; render(); });

  // Ask the phone to keep the saves once the first match exists.
  let asked = false;
  store.subscribe((s) => {
    if (asked || s.record === null) return;
    asked = true;
    void navigator.storage?.persist?.();
  });
  render();
}
