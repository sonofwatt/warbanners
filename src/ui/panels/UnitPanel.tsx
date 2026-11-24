import type { ReactElement } from 'react';
import { CONFIG, DEEDS, FACTIONS, UNITS, canEarnTraits, isHero, momentumStart } from '../../engine';
import type { DeedId, FactionId, Unit, statsOf } from '../../engine';
import { BootIcon, HeartIcon, RangeIcon, ShieldIcon, SwordIcon } from '../icons';
import { T } from '../text';
import { CardHead, Stats } from './Card';
import { CommandList } from './CommandList';
import type { Command } from './commands';
import { UnitPicture } from './Picture';

export interface UnitPanelProps {
  unit: Unit; faction: FactionId; stats: ReturnType<typeof statsOf>; myth: boolean;
  braced?: boolean;                              // rules 7: a Hoplite with enough Hoplite mates beside it
  thresholds: Record<DeedId, number> | null;     // null for a unit the viewer does not own: its deeds stay hidden
  commands: Command[]; onCommand: (c: Command) => void;
}

// An enemy unit gets the same card with an empty command list.
export function UnitPanel({ unit, faction, stats, myth, braced = false, thresholds, commands, onCommand }: UnitPanelProps): ReactElement {
  const type = unit.type;
  const def = UNITS[type];
  // rules 8: relay riding, a faction rule rather than a trait (mounted units only, where the faction says so)
  const riding = FACTIONS[faction].relayRiders && (def.traits.includes('mounted') || !FACTIONS[faction].relayMountedOnly);
  const rows = thresholds !== null && canEarnTraits(unit) && unit.heroTraits.length < CONFIG.heroes.maxTraits
    ? DEEDS.filter((d) => !unit.heroTraits.includes(CONFIG.heroes.traitFor[d])) : [];
  return (
    <section className="panel unit-panel">
      <CardHead
        picture={<UnitPicture type={type} faction={faction} />} title={T.unit[type].name} faction={faction}
        badge={isHero(unit) ? <span className="hero-badge">{T.ui.hero}</span> : null}
        actions={<CommandList commands={commands} onCommand={onCommand} />}
      >
        <p className="blurb">{T.unit[type].blurb}</p>
      </CardHead>
      <Stats stats={[
        { icon: <HeartIcon />, label: T.ui.health, value: `${unit.hp}/${stats.maxHp}` },
        { icon: <SwordIcon />, label: T.ui.attackStat, value: stats.atk },
        { icon: <ShieldIcon />, label: T.ui.defence, value: stats.def },
        { icon: <BootIcon />, label: T.ui.movement, value: stats.move },
        { icon: <RangeIcon />, label: T.ui.range, value: stats.range > def.range ? T.ui.rangeOnMountain(stats.range) : stats.range },   // rules 8
      ]} />
      {def.traits.length > 0 ? (
        <ul className="traits" aria-label={T.ui.traits}>
          {def.traits.map((t) => <li key={t}><strong>{T.trait[t].name}</strong><span>{T.trait[t].blurb}</span></li>)}
          {riding ? <li key="relayRiding"><strong>{T.ui.relayRiding}</strong><span>{T.ui.relayRidingBlurb}</span></li> : null}
        </ul>
      ) : null}
      {unit.heroTraits.length > 0 ? (
        <ul className="traits earned" aria-label={T.ui.heroTraits}>
          {unit.heroTraits.map((t) => <li key={t}><strong>{T.heroTrait[t].name}</strong><span>{T.heroTrait[t].blurb}</span></li>)}
        </ul>
      ) : null}
      {def.traits.includes('chain') ? (
        <ul className="traits momentum" aria-label={T.ui.momentum}>
          <li><strong>{T.ui.momentumLeft(unit.momentum, momentumStart(type))}</strong><span>{T.ui.momentumBlurb}</span></li>
        </ul>
      ) : null}
      {unit.hunkered ? (
        <ul className="traits hunkered" aria-label={T.ui.hunkered}>
          <li><strong>{T.ui.hunkered}</strong><span>{T.ui.hunkeredBlurb}</span></li>
        </ul>
      ) : null}
      {braced ? (
        <ul className="traits braced" aria-label={T.ui.braced}>
          <li><strong>{T.ui.braced}</strong><span>{T.ui.bracedBlurb}</span></li>
        </ul>
      ) : null}
      {myth ? (
        <ul className="traits myth" aria-label={T.ui.mythTouch}>
          <li><strong>{T.ui.mythTouch}</strong><span>{T.ui.mythTouchBlurb}</span></li>
        </ul>
      ) : null}
      {unit.item !== null ? (
        <ul className="traits carried" aria-label={T.ui.carrying}>
          <li><strong>{T.ui.carrying}: {T.item[unit.item].name}</strong><span>{T.item[unit.item].blurb}</span></li>
        </ul>
      ) : null}
      {thresholds !== null && rows.length > 0 ? (
        <ul className="deeds" aria-label={T.ui.deeds}>
          {rows.map((d) => {
            const at = thresholds[d];
            const have = Math.min(unit.deeds[d], at);
            return (
              <li key={d} className="deed-row">
                <span className="deed-name">{T.deed[d]}</span>
                <meter min={0} max={at} value={have} />
                <span className="deed-count">{have}/{at}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
