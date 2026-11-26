// tracks3d: how worn each road is for one viewer, kept up with the match record. Each new action is taken in at once
// (one engine step); a long history (a resumed save, a rejoined online match) is replayed in short slices between
// frames, so opening a match never stalls, and busy roads widen when the replay has caught up.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Action, HexKey, MatchSettings, PlayerId } from '../../engine';
import { advance, extends_, startTraffic, wearOf } from './roadWear';
import type { Traffic } from './roadWear';

/** At most this many new actions are taken in at once; more are replayed in slices. */
export const AT_ONCE = 6;
/** How long one slice of a replay may run, in ms. */
export const SLICE_MS = 8;

export function useRoadWear(settings: MatchSettings | null, actions: readonly Action[] | null, viewer: PlayerId | null): ReadonlyMap<HexKey, number> | undefined {
  const traffic = useRef<Traffic | null>(null);
  const [version, setVersion] = useState(0); // bumped when the wear may have changed: an action, a replay ended, a new match

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
      if (traffic.current !== t) return;
      if (advance(t, actions, SLICE_MS, () => performance.now())) setVersion((v) => v + 1);
      else timer = setTimeout(tick, 0);
    };
    timer = setTimeout(tick, 0);
    return () => { if (timer !== null) clearTimeout(timer); };
  }, [settings, actions]);

  // `version` stands for the traffic's progress, which lives in the ref. The map's content only changes when a road
  // crosses a step, so the scene's 3D signature (and the ground) changes only then.
  return useMemo(() => {
    const t = traffic.current;
    if (t === null || viewer === null || t.count === 0) return undefined;
    return wearOf(t.passes[viewer === 0 ? 0 : 1]);
  }, [version, viewer]);
}
