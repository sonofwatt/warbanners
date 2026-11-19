import type { ReactElement } from 'react';
import { StarIcon } from '../icons';
import { T } from '../text';
import { rewardPair } from './commands';

// Two big choices, each a button with its name and what it does, and a quiet Later.
export function RewardSheet({ level, onPick, onLater }: { level: number; onPick: (choice: 0 | 1) => void; onLater: () => void }): ReactElement {
  const pair = rewardPair(level);
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
