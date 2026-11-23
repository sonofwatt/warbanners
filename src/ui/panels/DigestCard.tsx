import type { ReactElement } from 'react';
import type { DigestLine } from '../../app/digest';
import { T, digestText, fill } from '../text';

const MAX_LINES = 6;

// The turn report. Each line is a button: tapping it shows that line's tile on the board (`onShow`).
export function DigestCard({ lines, onShow }: { lines: DigestLine[]; onShow?: (i: number) => void }): ReactElement {
  const more = lines.length - MAX_LINES;
  return (
    <section className="digest">
      <h2>{T.ui.digestTitle}</h2>
      <ul>
        {lines.slice(0, MAX_LINES).map((l, i) => (
          <li key={i}>
            <button type="button" className="digest-line" data-testid="digest-line" onClick={() => onShow?.(i)}>
              <span>{digestText(l)}</span><span className="digest-go" aria-hidden="true">›</span>
            </button>
          </li>
        ))}
      </ul>
      {more > 0 ? <p>{fill(T.ui.andMore, { n: more })}</p> : null}
    </section>
  );
}
