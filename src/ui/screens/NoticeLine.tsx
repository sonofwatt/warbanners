import type { ReactElement } from 'react';
import type { Notice } from '../../app/store';
import { InfoIcon } from '../icons';
import { T, fill } from '../text';

export interface NoticeAction { label: string; testid: string; onClick: () => void }

// One plain line, with a button to put it away. `values` fills the line's {placeholders}; `action` adds a button
// that answers it (Update now, say).
export function NoticeLine({ notice, onDismiss, className, values, action }: {
  notice: Notice; onDismiss: () => void; className?: string; values?: Record<string, string | number>; action?: NoticeAction;
}): ReactElement {
  return (
    <p className={['notice', action !== undefined ? 'asks' : '', className ?? ''].filter((c) => c !== '').join(' ')} data-testid="notice" role="status">
      <InfoIcon />
      <span>{fill(T.ui[notice], values ?? {})}</span>
      {action !== undefined ? <button type="button" className="primary" data-testid={action.testid} onClick={action.onClick}>{action.label}</button> : null}
      <button type="button" className="quiet" data-testid="dismiss-notice" onClick={onDismiss}>{T.ui.dismiss}</button>
    </p>
  );
}
