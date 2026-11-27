import type { ReactElement } from 'react';
import type { DigestLine } from '../../app/digest';
import { T, digestText, fill } from '../text';

const MAX_LINES = 6;

/**
 * A skull and crossbones, marking a line where one of the player's own units was killed. Our own drawing: two
 * crossed bones behind a round skull with a narrow jaw, dark eye sockets and a nose notch, in the text's colour.
 */
export function SkullIcon(): ReactElement {
  return (
    <svg className="digest-skull" data-testid="digest-skull" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
        <line x1="4" y1="14" x2="20" y2="22" />
        <line x1="20" y1="14" x2="4" y2="22" />
      </g>
      <g fill="currentColor">
        {[[3.4, 13.2], [4.6, 15.2], [20.6, 13.2], [19.4, 15.2], [3.4, 22.8], [4.6, 20.8], [20.6, 22.8], [19.4, 20.8]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.5" />)}
        <path d="M12 1.6c-4.7 0-8 3.2-8 7.6 0 2.5 1.1 4.3 2.8 5.3v2.2c0 .8.6 1.3 1.3 1.3h7.8c.7 0 1.3-.5 1.3-1.3v-2.2c1.7-1 2.8-2.8 2.8-5.3 0-4.4-3.3-7.6-8-7.6z" />
      </g>
      <g fill="var(--paper-2)">
        <ellipse cx="8.9" cy="9.6" rx="2.1" ry="2.3" />
        <ellipse cx="15.1" cy="9.6" rx="2.1" ry="2.3" />
        <path d="M12 12.2l-1.2 2.1h2.4z" />
        <rect x="9.6" y="16" width="1" height="2" />
        <rect x="13.4" y="16" width="1" height="2" />
      </g>
    </svg>
  );
}

// The turn report. Each line is a button: tapping it shows that line's tile on the board (`onShow`). A line where one
// of the player's own units was killed starts with a skull and crossbones.
export function DigestCard({ lines, onShow }: { lines: DigestLine[]; onShow?: (i: number) => void }): ReactElement {
  const more = lines.length - MAX_LINES;
  return (
    <section className="digest">
      <h2>{T.ui.digestTitle}</h2>
      <ul>
        {lines.slice(0, MAX_LINES).map((l, i) => (
          <li key={i}>
            <button type="button" className="digest-line" data-testid="digest-line" onClick={() => onShow?.(i)}>
              {l.kind === 'unitLost' ? <SkullIcon /> : null}
              <span className="digest-text">{digestText(l)}</span><span className="digest-go" aria-hidden="true">›</span>
            </button>
          </li>
        ))}
      </ul>
      {more > 0 ? <p>{fill(T.ui.andMore, { n: more })}</p> : null}
    </section>
  );
}
