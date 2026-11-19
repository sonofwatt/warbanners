import type { ReactElement } from 'react';
import type { DigestLine } from '../../app/digest';
import { T, digestText, fill } from '../text';

const MAX_LINES = 6;

export function DigestCard({ lines }: { lines: DigestLine[] }): ReactElement {
  const more = lines.length - MAX_LINES;
  return (
    <section className="digest">
      <ul>{lines.slice(0, MAX_LINES).map((l, i) => <li key={i}>{digestText(l)}</li>)}</ul>
      {more > 0 ? <p>{fill(T.ui.andMore, { n: more })}</p> : null}
    </section>
  );
}
