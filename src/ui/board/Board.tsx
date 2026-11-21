import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { isHero, maxHpOf, parseKey, UNITS } from '../../engine';
import type { City, FactionId, HexKey, PlayerId, Tile } from '../../engine';
import { FIGURES } from '../art/factionUnits';
import { BuildingMark, CityMark, Grove, ResourceMark, Road, TerrainFeature, Treasure, Village } from '../art/features';
import { ACCENT, playerColour } from '../art/palette';
import { Border, groundFor, Highlight, TileBase, Veil } from '../art/tiles';
import { HeroMark, ItemBadge, itemBadgeX } from '../art/hero';
import { StatusOverlay } from '../art/units';
import { keepCorner, keepInView, refit, screenToBoard, startCamera, panBy, zoomAt } from './camera';
import type { Camera, Viewport } from './camera';
import { prefersReducedMotion } from './Effects';
import { boardBounds, hexToBoard, tileBox } from './layout';
import type { Box, Pt } from './layout';
import { pick } from './scene';
import type { SceneItem, SceneTile, SceneUnit } from './scene';
import { sameData } from './same';
import { useGestures } from './useGestures';

export interface BoardProps {
  items: readonly SceneItem[];
  radius: number;
  factions: readonly FactionId[]; // faction of each player id, for colours and city style
  focus: HexKey; // where the camera starts; changing it re-centres
  onTap(hit: { unit: number | null; hex: HexKey | null }): void;
  children?: ReactNode; // effects, drawn inside the camera transform
  viewer?: PlayerId; // whose board this is: only their own cities show a reward waiting
  reveal?: { n: number; at: HexKey } | null; // each new n pans, the least it must, to bring the tile at `at` into view
}

/** The screen the board assumes before it has been measured, and in Node. */
export const ASSUMED_VIEWPORT: Viewport = { w: 412, h: 915 };
// Below this many pixels on a side the camera maths has no room (fitScale goes to zero), so
// the board waits for a real size.
const MIN_SIDE = 48;

const r2 = (n: number): number => Math.round(n * 100) / 100;

/** How long a unit takes to slide from one tile to the next. */
export const SLIDE_MS = 180;
// A moved unit is drawn on top while it slides and goes back into the draw order a little after it arrives.
const SETTLE_MS = SLIDE_MS + 40;

const unitTransform = (at: Pt): string => `translate(${r2(at.x)}px, ${r2(at.y)}px)`;

/** Where every unit stands, as one string ("id@q,r" by id), so equal placements compare equal however often the scene is rebuilt. */
function placesKey(items: readonly SceneItem[]): string {
  const out: string[] = [];
  for (const it of items) if (it.kind === 'unit') out.push(`${it.unit.id}@${it.unit.pos}`);
  return out.sort().join(' ');
}

function parsePlaces(k: string): Map<number, HexKey> {
  const m = new Map<number, HexKey>();
  for (const part of k === '' ? [] : k.split(' ')) {
    const at = part.indexOf('@');
    m.set(Number(part.slice(0, at)), part.slice(at + 1));
  }
  return m;
}

export function cameraTransform(c: Camera, vp: Viewport): string {
  return `translate(${r2(vp.w / 2 - c.cx * c.scale)} ${r2(vp.h / 2 - c.cy * c.scale)}) scale(${Math.round(c.scale * 10000) / 10000})`;
}

/** The terrain look picked per tile, so neighbouring forests and mountains differ. */
function variantOf(k: HexKey): number {
  const { q, r } = parseKey(k);
  return (((q * 7 + r * 13) % 3) + 3) % 3;
}

// Pieces drawn smaller toward the back of a tile, and in front of it, when two share a tile.
const BACK = 'translate(1 -5) scale(0.8)';
const FRONT = 'translate(2 6) scale(0.72)';
const BESIDE = 'translate(17 1) scale(0.75)';    // a treasure under a unit: off to the side, clear of the figure
const BEFORE_GROVE = 'translate(1 5) scale(0.8)'; // what stands in a forest, in front of the trees along the back

/**
 * What stands on an explored, non-city tile, composed so each tile reads at a glance:
 * - a building replaces what it was built on (a farm its cropland, a mine its ore and
 *   mountain); a lumber camp (only ever built in a forest) stands in front of a grove along
 *   the back of its forest.
 * - a village replaces the terrain feature; it only stands on field or forest.
 * - game or a treasure in a forest stands in front of a grove along the back of the tile;
 *   ore or a treasure on a mountain shares the tile: the mountain smaller at the back,
 *   the ore or chest smaller in front.
 * - a road is drawn under everything.
 * - a treasure under a unit is drawn small beside the figure, so a unit waiting to claim it never hides it.
 */
export function TileArt(p: { k: HexKey; tile: Tile; occupied?: boolean }): ReactElement {
  const { tile } = p;
  const v = variantOf(p.k);
  const feature = tile.terrain === 'water' || tile.terrain === 'field' ? null : <TerrainFeature terrain={tile.terrain} variant={v} />;
  let art: ReactNode;
  if (tile.building !== null) {
    art =
      tile.building === 'lumberCamp' ? (
        <>
          <Grove variant={v} />
          <g transform={BEFORE_GROVE}><BuildingMark building="lumberCamp" /></g>
        </>
      ) : (
        <BuildingMark building={tile.building} />
      );
  } else if (tile.village) {
    art = <Village />;
  } else {
    const beside = tile.treasure && p.occupied === true;
    const item = tile.treasure
      ? <g data-treasure={beside ? 'beside' : 'centre'}><Treasure /></g>
      : tile.resource !== null ? <ResourceMark resource={tile.resource} /> : null;
    if (beside) {
      art = (
        <>
          {feature}
          <g transform={BESIDE}>{item}</g>
        </>
      );
    } else if (tile.terrain === 'forest' && item !== null) {
      art = (
        <>
          <Grove variant={v} />
          <g transform={BEFORE_GROVE}>{item}</g>
        </>
      );
    } else if (feature !== null && item !== null) {
      art = (
        <>
          <g transform={BACK}>{feature}</g>
          <g transform={FRONT}>{item}</g>
        </>
      );
    } else {
      art = item ?? feature;
    }
  }
  return (
    <>
      {tile.terrain === 'water' ? <TerrainFeature terrain="water" variant={v} /> : null}
      {art}
    </>
  );
}

function CityArt(p: { city: City; factions: readonly FactionId[]; viewer: PlayerId | undefined }): ReactElement | null {
  const faction = p.factions[p.city.owner];
  if (faction === undefined) return null;
  return (
    <CityMark
      faction={faction}
      colour={playerColour(faction)}
      level={p.city.level}
      capital={p.city.capital}
      walls={p.city.walls}
      pending={p.city.owner === p.viewer && p.city.pendingRewards.length > 0}
    />
  );
}

function TileViewOf(p: { t: SceneTile; factions: readonly FactionId[]; viewer: PlayerId | undefined }): ReactElement {
  const { t } = p;
  const mark = t.mark === null ? null : <g data-mark={t.mark}><Highlight mark={t.mark} /></g>;
  const centre = <circle r={1} fill="none" pointerEvents="none" data-centre={t.key} />;
  const at = `translate(${r2(t.at.x)} ${r2(t.at.y)})`;
  if (t.fog || t.tile === null) {
    return (
      <g data-hex={t.key} data-fog="true" transform={at}>
        <TileBase ground="fog" />
        {mark}
        {centre}
      </g>
    );
  }
  const ownerFaction = t.owner === null ? undefined : p.factions[t.owner];
  const body = (
    <>
      <TileBase ground={groundFor(t.tile, t.city !== null)} />
      {t.tile.road && t.city === null ? <Road links={t.roadLinks} /> : null}
      {t.city !== null ? <CityArt city={t.city} factions={p.factions} viewer={p.viewer} /> : <TileArt k={t.key} tile={t.tile} occupied={t.occupied} />}
    </>
  );
  return (
    <g data-hex={t.key} transform={at}>
      {body}
      {t.veiled ? <Veil>{body}</Veil> : null}
      {ownerFaction !== undefined && t.borderEdges.length > 0 ? (
        <Border edges={t.borderEdges} colour={playerColour(ownerFaction).main} />
      ) : null}
      {mark}
      {centre}
    </g>
  );
}

function UnitViewOf(p: { u: SceneUnit; factions: readonly FactionId[] }): ReactElement | null {
  const { unit } = p.u;
  const faction = p.factions[unit.owner];
  if (faction === undefined) return null;
  const hidden = UNITS[unit.type].traits.includes('hidden');
  const maxHp = maxHpOf(unit);
  const opacity = p.u.mine && p.u.spent ? 0.55 : p.u.mine && hidden ? 0.7 : undefined;
  return (
    <g
      data-unit={unit.id}
      data-at={unit.pos}
      className="board-unit"
      style={{ transform: unitTransform(p.u.at) }}
    >
      {/* The body is what a lunge nudges, inside the group that places the unit. The hero's pennant stands behind the figure and dims with it. */}
      <g className="unit-body">
        <g opacity={opacity}>
          {isHero(unit) ? <HeroMark accent={ACCENT[faction]} /> : null}
          {FIGURES[unit.type]({ colour: playerColour(faction), accent: ACCENT[faction] })}
        </g>
        <StatusOverlay
          hp={unit.hp}
          maxHp={maxHp}
          spent={p.u.spent}
          fresh={unit.fresh}
          taunted={unit.taunted}
          blinded={unit.blinded}
        />
        {unit.item !== null ? (
          <g transform={`translate(${r2(itemBadgeX(maxHp, unit.fresh))} 0)`}><ItemBadge item={unit.item} /></g>
        ) : null}
      </g>
    </g>
  );
}

// A tile or a unit is drawn again only when what it shows has changed. The scene is rebuilt from a fresh view after
// every action, so its objects are always new: they are compared by value. Each draw of a whole board is thousands
// of svg nodes, and on a phone redrawing them all after every action held the screen still for over 100 ms.
const TileView = memo(TileViewOf, (a, b) => a.viewer === b.viewer && sameData(a.factions, b.factions) && sameData(a.t, b.t));
const UnitView = memo(UnitViewOf, (a, b) => sameData(a.factions, b.factions) && sameData(a.u, b.u));

/**
 * After the slot has changed size with something selected: the least pan that keeps the selected tile in the
 * slot, and with it every marked tile (where the selection can go or act) when they all fit.
 */
function keepSelection(c: Camera, vp: Viewport, bounds: Box, items: readonly SceneItem[]): Camera {
  const marked = items.filter((i): i is SceneTile => i.kind === 'tile' && i.mark !== null);
  const selected = marked.find((t) => t.mark === 'selected');
  if (selected === undefined) return c;
  const all = marked.map((t) => tileBox(t.key)).reduce((a, b) => ({
    minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY),
  }));
  const fits = (all.maxX - all.minX) * c.scale <= vp.w - 32 && (all.maxY - all.minY) * c.scale <= vp.h - 32;
  return keepInView(c, vp, fits ? all : tileBox(selected.key), bounds);
}

/**
 * The interactive board: one svg, one camera group, the scene items back to front.
 * The camera lives in a ref; a pan or zoom writes the camera group's transform at most
 * once per animation frame and never re-renders React.
 */
export function Board(p: BoardProps): ReactElement {
  const svgRef = useRef<SVGSVGElement>(null);
  const camRef = useRef<SVGGElement>(null);
  const bounds = useMemo(() => boardBounds(p.radius), [p.radius]);
  const vp = useRef<Viewport>(ASSUMED_VIEWPORT);
  const measured = useRef(false);
  const cam = useRef<Camera | null>(null);
  const touched = useRef(false); // the player has panned or zoomed since the camera last aimed at the focus
  if (cam.current === null) cam.current = startCamera(hexToBoard(p.focus), bounds, vp.current);

  // The latest props for the event handlers, which are attached once.
  const latest = useRef({ items: p.items, radius: p.radius, onTap: p.onTap, focus: p.focus, bounds, reveal: p.reveal ?? null });
  // A layout effect, so a resize observed in the same frame as a new selection already sees it.
  useLayoutEffect(() => {
    latest.current = { items: p.items, radius: p.radius, onTap: p.onTap, focus: p.focus, bounds, reveal: p.reveal ?? null };
  });

  const frame = useRef(0);
  const write = useCallback((): void => {
    if (cam.current !== null) camRef.current?.setAttribute('transform', cameraTransform(cam.current, vp.current));
  }, []);
  const schedule = useCallback((): void => {
    if (frame.current !== 0) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      write();
    });
  }, [write]);
  useEffect(() => () => {
    if (frame.current !== 0) cancelAnimationFrame(frame.current);
    frame.current = 0;
  }, []);

  // Measure before the first paint, and again on every resize or rotation.
  useLayoutEffect(() => {
    const el = svgRef.current;
    if (el === null) return;
    const measure = (now: boolean): void => {
      const r = el.getBoundingClientRect();
      if (r.width <= MIN_SIDE || r.height <= MIN_SIDE) return;
      const was = vp.current;
      vp.current = { w: r.width, h: r.height };
      const { bounds: b, focus, items } = latest.current;
      const selecting = items.some((i) => i.kind === 'tile' && i.mark === 'selected');
      if (!measured.current || (!touched.current && !selecting)) {
        // Until the player pans, zooms or selects something, the camera keeps aiming at the focus: the clamp may
        // have moved the centre off it (a board shorter than the screen is centred), and a new size may let it aim closer.
        cam.current = startCamera(hexToBoard(focus), b, vp.current);
      } else {
        // A panel opening or closing changes the slot: the board stays still under the finger, and moves only as
        // far as it must to keep the selection in sight. From here on the camera no longer aims at the focus.
        cam.current = keepSelection(keepCorner(cam.current!, was, vp.current, b), vp.current, b, items);
        touched.current = true;
      }
      measured.current = true;
      if (now) write();
      else schedule();
    };
    measure(true);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure(false));
    ro.observe(el);
    return () => ro.disconnect();
  }, [write, schedule]);

  // A new focus re-centres; a new board size re-clamps. Both skip the first render, which already did it.
  const firstFocus = useRef(true);
  useEffect(() => {
    if (firstFocus.current) {
      firstFocus.current = false;
      return;
    }
    cam.current = startCamera(hexToBoard(p.focus), latest.current.bounds, vp.current);
    touched.current = false;
    schedule();
  }, [p.focus, schedule]);
  const firstBounds = useRef(true);
  useEffect(() => {
    if (firstBounds.current) {
      firstBounds.current = false;
      return;
    }
    cam.current = refit(cam.current!, bounds, vp.current);
    schedule();
  }, [bounds, schedule]);

  // A request to show a tile (Next unit): the least pan that brings it into the slot, none when it is already
  // there. Keyed on n alone, so a request is served once and a later move of the same unit does not pan again.
  const revealN = p.reveal?.n ?? 0;
  useEffect(() => {
    const { reveal, bounds: b } = latest.current;
    if (revealN === 0 || reveal === null || cam.current === null || !measured.current) return;
    const next = keepInView(cam.current, vp.current, tileBox(reveal.at), b);
    if (next === cam.current) return;
    cam.current = next;
    touched.current = true;
    schedule();
  }, [revealN, schedule]);

  useGestures(svgRef, (out) => {
    const c = cam.current;
    if (c === null || !measured.current) return;
    const { bounds: b, items, radius, onTap } = latest.current;
    if (out.kind === 'pan') cam.current = panBy(c, out.dx, out.dy, b, vp.current);
    else if (out.kind === 'zoom') cam.current = zoomAt(c, out.factor, out.at, b, vp.current);
    else {
      onTap(pick(items, screenToBoard(c, vp.current, out.at), radius));
      return;
    }
    touched.current = true;
    schedule();
  });

  // Units slide. A unit that has just moved is drawn last, on top of everything, while it slides: a
  // unit moving toward the back row would otherwise pass under the tiles in front of it. Once it has
  // arrived it goes back to its place in the draw order, behind whatever stands on the tile in front.
  // React moves the same node each time; the slide is played on that node, so a move never jumps.
  const { items, factions, viewer } = p;
  // The settle timer depends on where units stand, not on the scene object, so a rebuild for a new
  // selection or mark does not restart it.
  const places = useMemo(() => placesKey(items), [items]);
  const [settledKey, setSettledKey] = useState(places);
  const settled = useMemo(() => parsePlaces(settledKey), [settledKey]);
  useEffect(() => {
    if (places === settledKey) return undefined;
    const t = setTimeout(() => setSettledKey(places), SETTLE_MS);
    return () => clearTimeout(t);
  }, [places, settledKey]);

  const shownAt = useRef(new Map<number, Pt>());
  useLayoutEffect(() => {
    const g = camRef.current;
    const still = prefersReducedMotion();
    const next = new Map<number, Pt>();
    for (const it of items) {
      if (it.kind !== 'unit') continue;
      next.set(it.unit.id, it.at);
      const was = shownAt.current.get(it.unit.id);
      if (still || g === null || was === undefined || (was.x === it.at.x && was.y === it.at.y)) continue;
      const el = g.querySelector(`[data-unit="${it.unit.id}"]`);
      if (el !== null && typeof el.animate === 'function') {
        el.animate([{ transform: unitTransform(was) }, { transform: unitTransform(it.at) }], { duration: SLIDE_MS, easing: 'ease-out' });
      }
    }
    shownAt.current = next;
  }, [items]);

  const drawn = useMemo(() => {
    const view = (it: SceneItem): ReactElement =>
      it.kind === 'tile' ? (
        <TileView key={`t${it.key}`} t={it} factions={factions} viewer={viewer} />
      ) : (
        <UnitView key={`u${it.unit.id}`} u={it} factions={factions} />
      );
    const sliding = (it: SceneItem): boolean => {
      if (it.kind !== 'unit') return false;
      const was = settled.get(it.unit.id);
      return was !== undefined && was !== it.unit.pos;
    };
    return [...items.filter((it) => !sliding(it)).map(view), ...items.filter(sliding).map(view)];
  }, [items, factions, viewer, settled]);

  return (
    <svg ref={svgRef} className="board" width="100%" height="100%" style={{ touchAction: 'none' }} data-testid="board">
      {/* The camera ref holds the live transform; a render writes the same value back. */}
      <g ref={camRef} data-camera="true" transform={cameraTransform(cam.current, vp.current)}>
        {drawn}
        {p.children}
      </g>
    </svg>
  );
}
