import type { ReactElement } from 'react';
import { T } from '../text';
import { rewardPair } from './commands';

export function RewardSheet({ level, onPick, onLater }: { level: number; onPick: (choice: 0 | 1) => void; onLater: () => void }): ReactElement {
  const pair = rewardPair(level);
  return (
    <section className="sheet reward-sheet">
      <h2>{T.ui.chooseReward}</h2>
      {([0, 1] as const).map((choice) => (
        <div className="reward" key={choice}>
          <button type="button" data-testid={`reward-${choice}`} onClick={() => onPick(choice)}>{T.reward[pair[choice]].name}</button>
          <p>{T.reward[pair[choice]].blurb}</p>
        </div>
      ))}
      <button type="button" data-testid="reward-later" onClick={onLater}>{T.ui.later}</button>
    </section>
  );
}
