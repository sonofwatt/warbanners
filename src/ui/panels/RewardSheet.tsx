import type { ReactElement } from 'react';
import type { RewardId } from '../../engine';
import { StarIcon } from '../icons';
import { T } from '../text';

// Two big choices, each a button with its name and what it does, and a quiet Later.
export function RewardSheet({ pair, onPick, onLater }: { pair: readonly [RewardId, RewardId]; onPick: (choice: 0 | 1) => void; onLater: () => void }): ReactElement {
  return (
    <section className="sheet reward-sheet" aria-label={T.ui.chooseReward}>
      <div className="sheet-head"><h2><StarIcon />{T.ui.chooseReward}</h2></div>
      {([0, 1] as const).map((choice) => (
        <div className="reward" key={choice}>
          <button type="button" className="reward-choice" data-testid={`reward-${choice}`} onClick={() => onPick(choice)}>
            <strong>{T.reward[pair[choice]].name}</strong>
            <span>{T.reward[pair[choice]].blurb}</span>
          </button>
        </div>
      ))}
      <button type="button" className="quiet" data-testid="reward-later" onClick={onLater}>{T.ui.later}</button>
    </section>
  );
}
