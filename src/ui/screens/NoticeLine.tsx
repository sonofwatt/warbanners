import type { ReactElement } from 'react';
import type { Notice } from '../../app/store';
import { InfoIcon } from '../icons';
import { T } from '../text';

// One plain line about saving, with a button to put it away.
export function NoticeLine({ notice, onDismiss, className }: { notice: Notice; onDismiss: () => void; className?: string }): ReactElement {
  return (
    <p className={className === undefined ? 'notice' : `notice ${className}`} data-testid="notice" role="status">
      <InfoIcon />
      <span>{T.ui[notice]}</span>
      <button type="button" className="quiet" data-testid="dismiss-notice" onClick={onDismiss}>{T.ui.dismiss}</button>
    </p>
  );
}
