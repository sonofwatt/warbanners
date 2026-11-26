import { useEffect, useId, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { CHEST_CHOICES, TIME_CHOICES, WEATHER_CHOICES } from '../../app/advanced';
import type { Advanced } from '../../app/advanced';
import { ChevronIcon } from '../icons';
import { T } from '../text';

function ChoiceRow<K extends string>({ name, label, choices, chosen, words, onPick }: {
  name: string; label: string; choices: readonly K[]; chosen: K; words: Record<K, string>; onPick: (k: K) => void;
}): ReactElement {
  const id = useId();
  return (
    <div className="setup-seat advanced-row">
      <span id={id}>{label}</span>
      <div className="chips" role="radiogroup" aria-labelledby={id}>
        {choices.map((k) => (
          <button
            key={k} type="button" role="radio" aria-checked={k === chosen} className={k === chosen ? 'chip on' : 'chip'}
            data-testid={`${name}-${k}`} onClick={() => onPick(k)}
          >{words[k]}</button>
        ))}
      </div>
    </div>
  );
}

/** The new match screen's Advanced section: closed at first, it opens in place to show the chest, weather and
 * time of day choices. */
export function AdvancedSection({ value, onChange }: { value: Advanced; onChange: (a: Advanced) => void }): ReactElement {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const ref = useRef<HTMLElement>(null);
  // Opened, the choices and the Start button under them are brought into view (the screen scrolls on a phone).
  useEffect(() => {
    if (!open) return;
    const screen = ref.current?.closest('.screen');
    if (screen instanceof HTMLElement && screen.scrollHeight > screen.clientHeight) {
      const smooth = typeof matchMedia === 'function' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
      screen.scrollTo({ top: screen.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    }
  }, [open]);
  return (
    <section ref={ref} className={open ? 'advanced open' : 'advanced'}>
      <button
        type="button" className="advanced-toggle" data-testid="advanced-toggle" aria-expanded={open} aria-controls={open ? panel : undefined}
        onClick={() => setOpen(!open)}
      >
        <span>{T.ui.advanced}</span><ChevronIcon />
      </button>
      {open ? (
        <div className="advanced-body" id={panel} data-testid="advanced-body">
          <ChoiceRow name="chests" label={T.ui.chestsLabel} choices={CHEST_CHOICES} chosen={value.chests} words={T.ui.chests} onPick={(chests) => onChange({ ...value, chests })} />
          <ChoiceRow name="weather" label={T.ui.weatherLabel} choices={WEATHER_CHOICES} chosen={value.weather} words={T.ui.weather} onPick={(weather) => onChange({ ...value, weather })} />
          <ChoiceRow name="time" label={T.ui.timeLabel} choices={TIME_CHOICES} chosen={value.time} words={T.ui.timeOfDay} onPick={(time) => onChange({ ...value, time })} />
          <p className="advanced-note">{T.ui.advancedNote}</p>
        </div>
      ) : null}
    </section>
  );
}
