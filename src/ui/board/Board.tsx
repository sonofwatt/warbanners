import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { isHero, maxHpOf, parseKey, UNITS } from '../../engine';
import type { City, FactionId, HexKey, PlayerId, Tile } from '../../engine';
import { FIGURES } from '../art/factionUnits';
import { BuildingMark, CityMark, Grove, ResourceMark, Road, TerrainFeature, Treasure, Village } from '../art/features';
import { ACCENT, playerColour } from '../art/palette';
import { Border, groundFor, Highlight, ReadyGlow, TileBase, Veil } from '../art/tiles';
import { HeroMark, ItemBadge, itemBadgeX } from '../art/hero';
import { StatusOverlay } from '../art/units';
import { centreOn, keepCorner, keepInView, refit, screenToBoard, startCamera, panBy, zoomAt } from './camera';
import type { Camera, Viewport } from './camera';
import { prefersReducedMotion } from './Effects';
import { boardBounds, hexToBoard, tileBox } from './layout';
import type { Box, Pt } from './layout';
import { pick } from './scene';
import type { SceneItem, SceneTile, SceneUnit } from './scene';
import { sameData } from './same';
import { useGestures } from './useGestures';
import { glMapOf, svgLayers } from '../terrain3d/input';
import type { SvgLayers } from '../terrain3d/input';
import { startTerrain3d } from '../terrain3d/lifecycle';
import { webgl2Available } from '../terrain3d/option';
import type { Terrain3d } from '../terrain3d/terrain3d';

export interface BoardProps {
  items: readonly SceneItem[];
  radius: number;
  factions: readonly FactionId[]; // faction of each player id, for colours and city style
  focus: HexKey; // where the camera starts; changing it re-centres
  onTap(hit: { unit: number | null; hex: HexKey | null }): void;
  children?: ReactNode; // effects, drawn inside the camera transform
  viewer?: PlayerId; // whose board this is: only their own cities show a reward waiting
  reveal?: { n: number; at: HexKey } | null; // each new n pans, the least it must, to bring the tile at `at` into view
  centre?: { n: number; at: HexKey } | null; // each new n puts the tile at `at` in the middle of the slot (the turn report)
  // The 3D terrain: a WebGL canvas under the svg draws the ground, roads, terrain features and resources, loaded
  // only when this is on. When the device cannot draw it, or loses the context, the board shows SVG instead.
  terrain3d?: boolean;
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
 * With the 3D terrain on (`layers`), the terrain features, groves and resources are left out, and what stays (a
 * building, a village, a treasure) keeps the place it has today, so it sits where the 3D art leaves room for it.
 */
export function TileArt(p: { k: HexKey; tile: Tile; occupied?: boolean; layers?: SvgLayers }): ReactElement {
  const { tile } = p;
  const v = variantOf(p.k);
  const drawFeature = p.layers?.feature ?? true;
  const drawResource = p.layers?.resource ?? true;
  const hasFeature = tile.terrain !== 'water' && tile.terrain !== 'field';
  const feature = hasFeature && drawFeature ? <TerrainFeature terrain={tile.terrain} variant={v} /> : null;
  const grove = drawFeature ? <Grove variant={v} /> : null;
  let art: ReactNode;
  if (tile.building !== null) {
    art =
      tile.building === 'lumberCamp' ? (
        <>
          {grove}
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
      : tile.resource !== null && drawResource ? <ResourceMark resource={tile.resource} /> : null;
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
          {grove}
          <g transform={BEFORE_GROVE}>{item}</g>
        </>
      );
    } else if (hasFeature && item !== null) {
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
      {tile.terrain === 'water' && drawFeature ? <TerrainFeature terrain="water" variant={v} /> : null}
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

function TileViewOf(p: { t: SceneTile; factions: readonly FactionId[]; viewer: PlayerId | undefined; gl: boolean }): ReactElement {
  const { t } = p;
  const layers = svgLayers(t, p.gl);
  const mark = t.mark === null ? null : <g data-mark={t.mark}><Highlight mark={t.mark} /></g>;
  const glow = t.ready ? <g data-ready="true"><ReadyGlow /></g> : null;
  const centre = <circle r={1} fill="none" pointerEvents="none" data-centre={t.key} />;
  const at = `translate(${r2(t.at.x)} ${r2(t.at.y)})`;
  if (t.fog || t.tile === null) {
    return (
      <g data-hex={t.key} data-fog="true" transform={at}>
        {layers.base ? <TileBase ground="fog" /> : null}
        {glow}
        {mark}
        {centre}
      </g>
    );
  }
  const ownerFaction = t.owner === null ? undefined : p.factions[t.owner];
  const body = (
    <>
      {layers.base ? <TileBase ground={groundFor(t.tile, t.city !== null)} /> : null}
      {layers.road && t.tile.road && t.city === null ? <Road links={t.roadLinks} /> : null}
      {t.city !== null ? <CityArt city={t.city} factions={p.factions} viewer={p.viewer} /> : <TileArt k={t.key} tile={t.tile} occupied={t.occupied} layers={layers} />}
    </>
  );
  return (
    <g data-hex={t.key} transform={at}>
      {body}
      {t.veiled ? <Veil>{body}</Veil> : null}
      {ownerFaction !== undefined && t.borderEdges.length > 0 ? (
        <Border edges={t.borderEdges} colour={playerColour(ownerFaction).main} />
      ) : null}
      {glow}
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
          hunkered={unit.hunkered}
        />
        {unit.item !== null ? (
          <g transform={`translate(${r2(itemBadgeX(maxHp, unit.fresh || unit.hunkered))} 0)`}><ItemBadge item={unit.item} /></g>
        ) : null}
      </g>
    </g>
  );
}

// A tile or a unit is drawn again only when what it shows has changed. The scene is rebuilt from a fresh view after
// every action, so its objects are always new: they are compared by value. Each draw of a whole board is thousands
// of svg nodes, and on a phone redrawing them all after every action held the screen still for over 100 ms.
/** One tile as the board draws it, for tests. */
export const BoardTile = TileViewOf;
const TileView = memo(TileViewOf, (a, b) => a.viewer === b.viewer && a.gl === b.gl && sameData(a.factions, b.factions) && sameData(a.t, b.t));
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
  const latest = useRef({ items: p.items, radius: p.radius, onTap: p.onTap, focus: p.focus, bounds, reveal: p.reveal ?? null, centre: p.centre ?? null });
  // A layout effect, so a resize observed in the same frame as a new selection already sees it.
  useLayoutEffect(() => {
    latest.current = { items: p.items, radius: p.radius, onTap: p.onTap, focus: p.focus, bounds, reveal: p.reveal ?? null, centre: p.centre ?? null };
  });

  // The 3D terrain, when on and loaded: it is aimed and drawn in the same frame the svg camera moves.
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const terrain = useRef<Terrain3d | null>(null);
  const frame = useRef(0);
  const write = useCallback((): void => {
    if (cam.current === null) return;
    camRef.current?.setAttribute('transform', cameraTransform(cam.current, vp.current));
    terrain.current?.draw(cam.current, vp.current);
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

  // A request to look at a tile (a line of the turn report): the tile goes to the middle of the slot, zoom kept.
  const centreN = p.centre?.n ?? 0;
  useEffect(() => {
    const { centre, bounds: b } = latest.current;
    if (centreN === 0 || centre === null || cam.current === null || !measured.current) return;
    cam.current = centreOn(cam.current, hexToBoard(centre.at), b, vp.current);
    touched.current = true;
    schedule();
  }, [centreN, schedule]);

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

  // The 3D terrain. three.js is only downloaded once the option is on (a dynamic import, its own chunk), and the
  // svg keeps drawing the ground until the terrain has drawn its first frame. No WebGL 2 or a chunk that cannot
  // load leaves this board all SVG; a lost context shows SVG until the context is restored. Neither touches the
  // stored option.
  const glWanted = p.terrain3d === true;
  const [glReady, setGlReady] = useState(false);
  const glData = useMemo(() => (glWanted ? glMapOf(p.items, p.radius) : null), [glWanted, p.items, p.radius]);
  const glLatest = useRef(glData);
  useLayoutEffect(() => {
    glLatest.current = glData;
  });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!glWanted || canvas === null) return undefined;
    const stop = startTerrain3d({
      canvas,
      load: () => import('../terrain3d/terrain3d'),
      hasWebgl2: webgl2Available,
      ready: (t) => {
        const d = glLatest.current;
        if (d !== null) {
          t.setMap(d.map);
          t.setVeil(d.veiled);
        }
        terrain.current = t;
        shownGl.current = d === null ? null : { key: d.key, veilKey: d.veilKey };
        write();
        setGlReady(true);
      },
      fallback: () => {
        terrain.current = null;
        setGlReady(false);
      },
    });
    return () => {
      terrain.current = null;
      stop();
      setGlReady(false);
    };
  }, [glWanted, write]);
  // A new map (a road, a harvest, a building, fog lifting) rebuilds the tiles that changed; a new veil only repaints.
  // Before the browser paints, so the canvas and the svg change in the same frame.
  const shownGl = useRef<{ key: string; veilKey: string } | null>(null);
  const glKey = glData?.key ?? '';
  const glVeilKey = glData?.veilKey ?? '';
  useLayoutEffect(() => {
    const t = terrain.current;
    const d = glLatest.current;
    if (!glReady || t === null || d === null) return;
    const was = shownGl.current;
    if (was?.key !== d.key) t.setMap(d.map);
    if (was?.veilKey !== d.veilKey) t.setVeil(d.veiled);
    if (was?.key === d.key && was.veilKey === d.veilKey) return;
    shownGl.current = { key: d.key, veilKey: d.veilKey };
    write();
  }, [glReady, glKey, glVeilKey, write]);
  const gl = glWanted && glReady;

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
        <TileView key={`t${it.key}`} t={it} factions={factions} viewer={viewer} gl={gl} />
      ) : (
        <UnitView key={`u${it.unit.id}`} u={it} factions={factions} />
      );
    const sliding = (it: SceneItem): boolean => {
      if (it.kind !== 'unit') return false;
      const was = settled.get(it.unit.id);
      return was !== undefined && was !== it.unit.pos;
    };
    return [...items.filter((it) => !sliding(it)).map(view), ...items.filter(sliding).map(view)];
  }, [items, factions, viewer, settled, gl]);

  const board = (
    <svg
      ref={svgRef} className="board" width="100%" height="100%" data-testid="board" data-terrain3d={gl ? 'on' : undefined}
      style={glWanted ? { touchAction: 'none', position: 'relative' } : { touchAction: 'none' }}
    >
      {/* The camera ref holds the live transform; a render writes the same value back. */}
      <g ref={camRef} data-camera="true" transform={cameraTransform(cam.current, vp.current)}>
        {drawn}
        {p.children}
      </g>
    </svg>
  );
  // The svg keeps its place in the tree whether the canvas is there or not, so turning the option on or off never
  // remounts it (its size observer and gestures stay attached).
  return (
    <>
      {glWanted ? <canvas ref={canvasRef} className="board-terrain" data-testid="board-terrain" aria-hidden="true" /> : null}
      {board}
    </>
  );
}
