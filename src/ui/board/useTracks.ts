// tracks3d: the traffic marks one viewer sees, kept up with the match record. Each new action is taken in at once
// (one engine step); a long history (a resumed save, a rejoined online match) is replayed in short slices between
// frames, so opening a match never stalls, and the tracks appear when the replay has caught up.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Action, HexKey, MatchSettings, PlayerId } from '../../engine';
import { advance, extends_, looksOf, startTraffic } from './tracks';
import type { TrackLook, Traffic } from './tracks';

/** At most this many new actions are taken in at once; more are replayed in slices. */
export const AT_ONCE = 6;
/** How long one slice of a replay may run, in ms. */
export const SLICE_MS = 8;

export function useTracks(settings: MatchSettings | null, actions: readonly Action[] | null, viewer: PlayerId | null): ReadonlyMap<HexKey, TrackLook> | undefined {
  const traffic = useRef<Traffic | null>(null);
  const [version, setVersion] = useState(0); // bumped when the tracks change: an action taken in, a replay ended, a new match

  useEffect(() => {
    if (settings === null || actions === null) { traffic.current = null; setVersion((v) => v + 1); return undefined; }
    let t = traffic.current;
    if (t === null || !extends_(t, settings, actions)) {
      traffic.current = t = startTraffic(settings);
      setVersion((v) => v + 1);
    }
    if (actions.length - t.count <= AT_ONCE) {
      if (t.count < actions.length) { advance(t, actions); setVersion((v) => v + 1); }
      return undefined;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = (): void => {
      const cur = traffic.current;
      if (cur !== t) return;
      if (advance(t, actions, SLICE_MS, () => performance.now())) setVersion((v) => v + 1);
      else timer = setTimeout(tick, 0);
    };
    timer = setTimeout(tick, 0);
    return () => { if (timer !== null) clearTimeout(timer); };
  }, [settings, actions]);

  return useMemo(() => {
    const t = traffic.current;
    if (t === null || viewer === null || t.count === 0) return undefined;
    return looksOf(t.wears[viewer === 0 ? 0 : 1]);
    // `version` stands for the traffic's progress, which lives in the ref.
  }, [version, viewer]);
}
