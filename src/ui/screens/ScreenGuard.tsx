import { Component } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useApp } from '../../app/useApp';
import { HomeIcon } from '../icons';
import { T } from '../text';

interface GuardState { failed: boolean }

// A screen that throws while drawing would otherwise leave an empty page. This shows one plain line and a way Home
// instead, and Home keeps every save.
export class ScreenGuard extends Component<{ children: ReactNode }, GuardState> {
  override state: GuardState = { failed: false };

  static getDerivedStateFromError(): GuardState { return { failed: true }; }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return <GuardFallback onHome={() => this.setState({ failed: false })} />;
  }
}

function GuardFallback({ onHome }: { onHome(): void }): ReactElement {
  const recover = useApp((s) => s.recover);
  return (
    <main className="app">
      <div className="screen guard" role="alert">
        <p>{T.ui.screenFailed}</p>
        <button type="button" className="primary big" data-testid="guard-home" onClick={() => { recover(); onHome(); }}>
          <HomeIcon />{T.ui.homeButton}
        </button>
      </div>
    </main>
  );
}
