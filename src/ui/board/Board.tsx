import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { isHero, maxHpOf, parseKey, UNITS } from '../../engine';
import type { City, FactionId, HexKey, PlayerId, Tile } from '../../engine';
import { FIGURES } from '../art/factionUnits';
import { BuildingMark, CityMark, Grove, PendingStar, ResourceMark, Road, TerrainFeature, Tracks, Treasure, Village } from '../art/features';
import { ACCENT, playerColour } from '../art/palette';
import { Border, CityGlow, groundFor, Highlight, ReadyGlow, TileBase, Veil } from '../art/tiles';
import { HeroMark, ItemBadge, itemBadgeX } from '../art/hero';
import { WarBanner } from '../art/banner';
import {
  cameraBetween, centreOn, easeInOut, followAction, keepCorner, keepInView, NO_INSETS, panMs, refit, screenToBoard, slackFor, startCamera, panBy, zoomAt,
} from './camera';
import type { Camera, Insets, Viewport } from './camera';
import { prefersReducedMotion } from './Effects';
import { boardBounds, hexToBoard, R, SQUASH, THICK, tileBox } from './layout';
import type { Box, Pt } from './layout';
import { pick } from './scene';
import type { SceneItem, SceneTile, SceneUnit } from './scene';
import { sameData } from './same';
import { useGestures } from './useGestures';
import { glMapOf, svgLayers, THICK_3D } from '../terrain3d/input';
import { glUnitsOf, unitShown } from '../terrain3d/unitsInput';
import type { SvgLayers } from '../terrain3d/input';
import { createAmbientLoop, domAmbientEnv } from '../terrain3d/ambient';
import type { AmbientLoop } from '../terrain3d/ambient';
import { startTerrain3d } from '../terrain3d/lifecycle';
import { setUnits3dDrawing, webgl2Available } from '../terrain3d/option';
import type { Terrain3d } from '../terrain3d/terrain3d';
import { livePose, liveTransform } from './livePose';
import { hexesBetween, SLIDE_MS, slideFrames, slideMs3d } from './motion';

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
  // The match's seed, for the 3D look's choices made from the map alone (mountain ridges): every viewer agrees.
  seed?: number;
  // A sheet, menu or dialog covers the board: the 3D board's idle animation pauses until it is gone.
  covered?: boolean;
  // The attacks of the action just shown (its lunges, with their delays) and the units it killed: each new seq turns
  // the 3D figure of each attacker to face its target, in order, and forgets the facings of the dead. UI only; moves
  // and hunkers are seen in the scene itself.
  attacks?: BoardAttacks | null;
  // What a panel lying over the board covers of it now (the unit card at the bottom in portrait, the side column in
  // landscape), read when the board decides where to look. The slot keeps its size while panels open and close, so
  // only this tells the camera what the player cannot see. `coverN` changes each time that may have changed.
  cover?: () => Insets;
  coverN?: number;
}

/**
 * One action as the board plays it, for this viewer's eyes (effects.ts effectsFor): who attacks which unit on which
 * tile from which, when its lunge starts (ms from now), and whether the unit attacked struck back; the ids of the
 * units it killed; when each seen move starts (an advance waits for its blow); and the tiles where it all happened,
 * which the view follows when they leave the middle of the screen. Each new seq is one new action.
 */
export interface BoardAttacks {
  seq: number;
  list: readonly { unit: number; from: HexKey; toward: HexKey; delay: number; target?: number; counter?: boolean }[];
  fallen?: readonly number[];
  moves?: readonly { unit: number; delay: number }[];
  tiles?: readonly HexKey[];
  // Treasure claimed in sight (effects.ts claimsOf): the 3D chest there swings its lid open, then goes.
  chests?: readonly { at: HexKey; delay: number }[];
}

/** The screen the board assumes before it has been measured, and in Node. */
export const ASSUMED_VIEWPORT: Viewport = { w: 412, h: 915 };
// Below this many pixels on a side the camera maths has no room (fitScale goes to zero), so
// the board waits for a real size.
const MIN_SIDE = 48;

const r2 = (n: number): number => Math.round(n * 100) / 100;

export { SLIDE_MS };
// A moved unit is drawn on top while it slides and goes back into the draw order a little after it arrives.
const SETTLE_AFTER_MS = 40;
/** The distance between neighbouring tile centres, in board units. */
const TILE_STEP = R * Math.sqrt(3);

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
 *   mountain); a lumber camp or mill (only ever built in a forest) stands in front of a grove
 *   along the back of its forest. rules 8: a harvested resource is drawn faded.
 * - a village replaces the terrain feature; it only stands on field or forest.
 * - game or a treasure in a forest stands in front of a grove along the back of the tile;
 *   ore or a treasure on a mountain shares the tile: the mountain smaller at the back,
 *   the ore or chest smaller in front.
 * - a road is drawn under everything.
 * - a treasure under a unit is drawn small beside the figure, so a unit waiting to claim it never hides it.
 * With the 3D terrain on (`layers`), each layer the 3D look draws (terrain features, groves, resources, buildings,
 * villages, the treasure chest) is left out here; anything left keeps the place it has today.
 */
export function TileArt(p: { k: HexKey; tile: Tile; occupied?: boolean; layers?: SvgLayers }): ReactElement {
  const { tile } = p;
  const drawBuilding = p.layers?.building ?? true;
  const v = variantOf(p.k);
  const drawFeature = p.layers?.feature ?? true;
  const drawResource = p.layers?.resource ?? true;
  const hasFeature = tile.terrain !== 'water' && tile.terrain !== 'field';
  const feature = hasFeature && drawFeature ? <TerrainFeature terrain={tile.terrain} variant={v} /> : null;
  const grove = drawFeature ? <Grove variant={v} /> : null;
  let art: ReactNode;
  if (tile.building !== null) {
    art = !drawBuilding ? null :
      tile.building === 'lumberCamp' || tile.building === 'lumberMill' ? (
        <>
          {grove}
          <g transform={BEFORE_GROVE}><BuildingMark building={tile.building} /></g>
        </>
      ) : (
        <BuildingMark building={tile.building} />
      );
  } else if (tile.village) {
    art = (p.layers?.village ?? true) ? <Village /> : null;
  } else {
    const beside = tile.treasure && p.occupied === true;
    const item = tile.treasure
      ? ((p.layers?.treasure ?? true) ? <g data-treasure={beside ? 'beside' : 'centre'}><Treasure /></g> : null)
      : tile.resource !== null && drawResource ? <ResourceMark resource={tile.resource} harvested={tile.harvested} /> : null;
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

function CityArt(p: { city: City; factions: readonly FactionId[]; viewer: PlayerId | undefined; town?: boolean }): ReactElement | null {
  const faction = p.factions[p.city.owner];
  if (faction === undefined) return null;
  const pending = p.city.owner === p.viewer && p.city.pendingRewards.length > 0;
  // With the 3D look the city itself is drawn in 3D; the reward star stays here, over everything.
  if (p.town === false) return pending ? <PendingStar /> : null;
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
      {layers.tracks && t.tracks != null && t.city === null ? <Tracks tracks={t.tracks} /> : null}
      {layers.road && t.tile.road && t.city === null ? <Road links={t.roadLinks} wear={t.tracks?.road ?? 0} edgeWear={t.roadWear} /> : null}
      {t.city !== null ? <CityArt city={t.city} factions={p.factions} viewer={p.viewer} town={layers.town} /> : <TileArt k={t.key} tile={t.tile} occupied={t.occupied} layers={layers} />}
    </>
  );
  return (
    <g data-hex={t.key} transform={at}>
      {body}
      {t.veiled ? <Veil>{body}</Veil> : null}
      {layers.border && ownerFaction !== undefined && t.borderEdges.length > 0 ? (
        <Border edges={t.borderEdges} colour={playerColour(ownerFaction).main} />
      ) : null}
      {ownerFaction !== undefined && t.cityEdges !== null ? (
        <g data-city-land="true"><CityGlow id={`land-${t.key.replace(',', '_')}`} edges={t.cityEdges} colour={playerColour(ownerFaction).main} /></g>
      ) : null}
      {glow}
      {mark}
      {centre}
    </g>
  );
}

// `figure` false: the 3D figures draw the unit (and a hero's pennant) on their canvas, and this draws only what
// stands around it: the war banner, its marks and the item badge, in the same places.
function UnitViewOf(p: { u: SceneUnit; factions: readonly FactionId[]; figure?: boolean }): ReactElement | null {
  const { unit } = p.u;
  const faction = p.factions[unit.owner];
  if (faction === undefined) return null;
  const maxHp = maxHpOf(unit);
  // Spent: darker, never see-through (theme.css .unit-shade); hidden: the eye on the banner (unitsInput.ts).
  const shown = unitShown({ mine: p.u.mine, spent: p.u.spent, hidden: UNITS[unit.type].traits.includes('hidden') });
  return (
    <g
      data-unit={unit.id}
      data-at={unit.pos}
      className="board-unit"
      style={{ transform: unitTransform(p.u.at) }}
    >
      {/* The body is what a lunge nudges, inside the group that places the unit. The hero's pennant stands behind the figure and darkens with it. */}
      <g className="unit-body">
        {p.figure === false ? null : (
          // A hunkered unit crouches: the figure sinks and squats about its feet (theme.css .unit-crouch).
          <g className={unit.hunkered ? 'unit-crouch hunkered' : 'unit-crouch'}>
            <g className={shown.shaded ? 'unit-shade spent' : 'unit-shade'}>
              {isHero(unit) ? <HeroMark accent={ACCENT[faction]} /> : null}
              {FIGURES[unit.type]({ colour: playerColour(faction), accent: ACCENT[faction] })}
            </g>
          </g>
        )}
        <WarBanner
          type={unit.type}
          colour={playerColour(faction)}
          hp={unit.hp}
          maxHp={maxHp}
          spent={shown.shaded}
          fresh={unit.fresh}
          taunted={unit.taunted}
          blinded={unit.blinded}
          hunkered={unit.hunkered}
          hero={isHero(unit)}
          hidden={shown.eye}
        />
        {unit.item !== null ? (
          <g transform={`translate(${r2(itemBadgeX(maxHp, unit.fresh || unit.hunkered, shown.eye))} 0)`}><ItemBadge item={unit.item} /></g>
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
const UnitView = memo(UnitViewOf, (a, b) => a.figure === b.figure && sameData(a.factions, b.factions) && sameData(a.u, b.u));

/**
 * After the slot has changed size (a rotation, a window or browser bar resize) with something selected: the view
 * follows the selected tile by the dead-zone rule (camera.ts followAction), measured in the part of the slot no
 * panel covers, so it does not move while the selection stays in the middle of what the player can see.
 */
function keepSelection(c: Camera, vp: Viewport, bounds: Box, items: readonly SceneItem[], cover: Insets): Camera {
  const selected = selectedKey(items);
  return selected === null ? c : followAction(c, vp, boxOf([selected])!, bounds, { cover, slack: slackFor(c, bounds, vp, cover) });
}

/** The tile ringed as selected, if any. */
function selectedKey(items: readonly SceneItem[]): HexKey | null {
  const selected = items.find((i): i is SceneTile => i.kind === 'tile' && i.mark === 'selected');
  return selected?.key ?? null;
}

/**
 * The board box round where some tiles' units stand: each tile's ground (not its wall, nor the figure's height
 * above it), so a unit near the middle counts as being there.
 */
function boxOf(keys: readonly HexKey[]): Box | null {
  if (keys.length === 0) return null;
  const foot = (k: HexKey): Box => {
    const c = hexToBoard(k);
    return { minX: c.x - TILE_STEP / 2, maxX: c.x + TILE_STEP / 2, minY: c.y - R * SQUASH, maxY: c.y + R * SQUASH };
  };
  return keys.map(foot).reduce((a, b) => ({
    minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY),
  }));
}

/**
 * The interactive board: one svg, one camera group, the scene items back to front.
 * The camera lives in a ref; a pan or zoom writes the camera group's transform at most
 * once per animation frame and never re-renders React.
 */
export function Board(p: BoardProps): ReactElement {
  const svgRef = useRef<SVGSVGElement>(null);
  const camRef = useRef<SVGGElement>(null);
  // The 3D terrain's state lives up here: its taller walls widen the board's bounds once it draws.
  const glWanted = p.terrain3d === true;
  const [glReady, setGlReady] = useState(false);
  const gl = glWanted && glReady;
  // The 3D unit figures, drawn when the terrain draws and its units canvas has a context too. Then the units' svg
  // (status, badges, effects) moves to a second svg above that canvas, and the svg figures are left out.
  const [glUnitsReady, setGlUnitsReady] = useState(false);
  const units3d = gl && glUnitsReady;
  // Tell the AI's pacing whether moves walk in 3D now (terrain3d/option.ts movesWalk3d).
  useEffect(() => {
    setUnits3dDrawing(units3d);
    return () => setUnits3dDrawing(false);
  }, [units3d]);
  const bounds = useMemo(() => boardBounds(p.radius, gl ? THICK_3D : THICK), [p.radius, gl]);
  const vp = useRef<Viewport>(ASSUMED_VIEWPORT);
  const measured = useRef(false);
  const cam = useRef<Camera | null>(null);
  const touched = useRef(false); // the player has panned or zoomed since the camera last aimed at the focus
  if (cam.current === null) cam.current = startCamera(hexToBoard(p.focus), bounds, vp.current);

  // The latest props for the event handlers, which are attached once.
  const latest = useRef({
    items: p.items, radius: p.radius, onTap: p.onTap, focus: p.focus, bounds, reveal: p.reveal ?? null, centre: p.centre ?? null, cover: p.cover,
  });
  // A layout effect, so a resize observed in the same frame as a new selection already sees it.
  useLayoutEffect(() => {
    latest.current = {
      items: p.items, radius: p.radius, onTap: p.onTap, focus: p.focus, bounds, reveal: p.reveal ?? null, centre: p.centre ?? null, cover: p.cover,
    };
  });
  // What the panels cover, as last read. Reading it measures the page's layout, which mid-frame forces a layout of
  // the whole board, so it is read again only when it may have changed (a selection, the card's top changing size,
  // a resize, a tap on Next unit or a report line); a drag, a pinch or a followed action (the AI's turn) uses it as
  // it was.
  const coverSeen = useRef<Insets>(NO_INSETS);
  const coverStale = useRef(true);
  const coverNow = useCallback((fresh = false): Insets => {
    if (fresh || coverStale.current) {
      coverSeen.current = latest.current.cover?.() ?? NO_INSETS;
      coverStale.current = false;
    }
    return coverSeen.current;
  }, []);

  // The 3D terrain, when on and loaded: it is aimed and drawn in the same frame the svg camera moves.
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const unitsCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCamRef = useRef<SVGGElement>(null);
  const terrain = useRef<Terrain3d | null>(null);
  const frame = useRef(0);
  // The ambient loop (idle life, waterfalls, terrain3d/ambient.ts): it redraws the units canvas alone, only while
  // something animates in view, at most 20 times a second; never in a hidden tab, under a sheet or with reduced
  // motion, and it rests after a quiet spell. Input and game events wake it. A camera frame (write) draws the
  // figures itself, posed for the moment, and tells the loop so, which then skips its own draw for a frame gap.
  const ambient = useRef<AmbientLoop | null>(null);
  const coveredRef = useRef(p.covered === true);
  coveredRef.current = p.covered === true;
  useEffect(() => {
    ambient.current?.cover(p.covered === true);
  }, [p.covered]);
  const write = useCallback((): void => {
    if (cam.current === null) return;
    const t = cameraTransform(cam.current, vp.current);
    camRef.current?.setAttribute('transform', t);
    overlayCamRef.current?.setAttribute('transform', t);
    const tt = terrain.current;
    if (tt !== null) {
      tt.tick(performance.now(), ambient.current?.level() ?? 0);
      tt.draw(cam.current, vp.current);
      ambient.current?.drew();
    }
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

  // An automatic pan (a followed action, Next unit, a turn report line, a slot that changed size): the camera eases
  // from where it is to `to` over 250 to 400 ms (camera.ts panMs, easeInOut), a frame at a time. Any touch on the
  // board stops it where it is, so it never fights a drag or a pinch. With reduced motion it moves at once.
  const glide = useRef<{ from: Camera; to: Camera; start: number; ms: number; raf: number } | null>(null);
  const stopGlide = useCallback((): void => {
    const g = glide.current;
    if (g === null) return;
    cancelAnimationFrame(g.raf);
    glide.current = null;
  }, []);
  // Whether a finger is on the board now (set once the gestures are attached, below).
  const fingerDown = useRef<() => boolean>(() => false);
  const panTo = useCallback((to: Camera): void => {
    stopGlide();
    const c = cam.current;
    if (c === null || to === c || (to.cx === c.cx && to.cy === c.cy && to.scale === c.scale)) return;
    // A finger on the board always wins: no automatic pan starts under it.
    if (fingerDown.current()) return;
    if (prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      cam.current = to;
      schedule();
      return;
    }
    const g = { from: c, to, start: performance.now(), ms: panMs(c, to, vp.current), raf: 0 };
    const step = (): void => {
      if (glide.current !== g) return;
      const t = Math.min(1, Math.max(0, (performance.now() - g.start) / g.ms));
      cam.current = cameraBetween(g.from, g.to, easeInOut(t));
      // A camera frame already waiting would draw the same; this one draws now.
      if (frame.current !== 0) { cancelAnimationFrame(frame.current); frame.current = 0; }
      write();
      if (t < 1) g.raf = requestAnimationFrame(step);
      else glide.current = null;
    };
    glide.current = g;
    g.raf = requestAnimationFrame(step);
  }, [schedule, stopGlide, write]);
  useEffect(() => stopGlide, [stopGlide]);

  // Measure before the first paint, and again on every resize or rotation.
  useLayoutEffect(() => {
    const el = svgRef.current;
    if (el === null) return;
    const measure = (): void => {
      const r = el.getBoundingClientRect();
      if (r.width <= MIN_SIDE || r.height <= MIN_SIDE) return;
      const was = vp.current;
      if (was.w === r.width && was.h === r.height && measured.current) return;
      vp.current = { w: r.width, h: r.height };
      coverStale.current = true;
      const { bounds: b, focus, items } = latest.current;
      const selecting = items.some((i) => i.kind === 'tile' && i.mark === 'selected');
      // Where a pan under way was going, so a new size starts from there (and the pan itself stops).
      const from = glide.current?.to ?? cam.current!;
      stopGlide();
      if (!measured.current) {
        cam.current = startCamera(hexToBoard(focus), b, vp.current, coverNow());
        measured.current = true;
        write();
        return;
      }
      // The slot changed size (a panel opening or closing, a rotation): first the board stays exactly where it was
      // on screen (its top-left corner kept, no clamp), so nothing jumps; then the view eases to where it belongs.
      const c0 = cam.current!;
      cam.current = { cx: c0.cx + (vp.current.w - was.w) / 2 / c0.scale, cy: c0.cy + (vp.current.h - was.h) / 2 / c0.scale, scale: c0.scale };
      let to: Camera;
      if (!touched.current && !selecting) {
        // Until the player pans, zooms or selects something, the camera keeps aiming at the focus: the clamp may
        // have moved the centre off it (a board shorter than the screen is centred), and a new size may let it aim closer.
        to = startCamera(hexToBoard(focus), b, vp.current, coverNow());
      } else {
        // The board stays still under the finger, and moves only as far as it must to keep the selection near the
        // middle. From here on the camera no longer aims at the focus.
        to = keepSelection(keepCorner(from, was, vp.current, b), vp.current, b, items, coverNow());
        touched.current = true;
      }
      // Every layer is redrawn for the new size now, before the browser paints this frame: the canvases' drawing
      // buffers are resized only when they draw, and CSS stretches a canvas that keeps its old buffer to the new
      // box, so the 3D board would be squashed or stretched off the svg until something moved the camera. The
      // eased pan below may not run at all (the selection already in view, or a finger down).
      write();
      panTo(to);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    // A new pixel ratio (browser zoom, a window moved to another screen) changes no size, so the observer above
    // misses it; the canvases draw at the new ratio on the next frame.
    let mq: MediaQueryList | null = null;
    const onRatio = (): void => {
      mq?.removeEventListener('change', onRatio);
      mq = typeof matchMedia === 'function' && typeof devicePixelRatio === 'number' ? matchMedia(`(resolution: ${devicePixelRatio}dppx)`) : null;
      mq?.addEventListener('change', onRatio);
      if (measured.current) schedule();
    };
    onRatio();
    return () => {
      ro.disconnect();
      mq?.removeEventListener('change', onRatio);
    };
  }, [write, schedule, panTo, stopGlide, coverNow]);

  // A new focus re-centres; a new board size re-clamps. Both skip the first render, which already did it.
  const firstFocus = useRef(true);
  useEffect(() => {
    if (firstFocus.current) {
      firstFocus.current = false;
      return;
    }
    panTo(startCamera(hexToBoard(p.focus), latest.current.bounds, vp.current, coverNow()));
    touched.current = false;
  }, [p.focus, panTo, coverNow]);
  const firstBounds = useRef(true);
  useEffect(() => {
    if (firstBounds.current) {
      firstBounds.current = false;
      return;
    }
    stopGlide();
    cam.current = refit(cam.current!, bounds, vp.current, slackFor(cam.current!, bounds, vp.current, coverSeen.current));
    schedule();
  }, [bounds, schedule, stopGlide]);

  // A request to show a tile (Next unit): none when it is already near the middle, else the least pan that brings
  // it there (the dead-zone rule), eased. Keyed on n alone, so a request is served once and a later move of the same
  // unit does not pan again.
  const revealN = p.reveal?.n ?? 0;
  useEffect(() => {
    const { reveal, bounds: b } = latest.current;
    if (revealN === 0 || reveal === null || cam.current === null || !measured.current) return;
    const from = glide.current?.to ?? cam.current;
    const cover = coverNow(true);
    const next = followAction(from, vp.current, boxOf([reveal.at])!, b, { cover, slack: slackFor(from, b, vp.current, cover) });
    if (next === from) return;
    touched.current = true;
    panTo(next);
  }, [revealN, panTo, coverNow]);

  // A request to look at a tile (a line of the turn report): the tile goes to the middle of the slot, zoom kept.
  const centreN = p.centre?.n ?? 0;
  useEffect(() => {
    const { centre, bounds: b } = latest.current;
    if (centreN === 0 || centre === null || cam.current === null || !measured.current) return;
    touched.current = true;
    const cover = coverNow(true);
    panTo(centreOn(cam.current, hexToBoard(centre.at), b, vp.current, cover, slackFor(cam.current, b, vp.current, cover)));
  }, [centreN, panTo, coverNow]);


  const held = useGestures(svgRef, (out) => {
    const c = cam.current;
    ambient.current?.kick(); // any touch wakes the 3D board's idle life
    stopGlide(); // the finger wins over any automatic pan
    if (c === null || !measured.current) return;
    const { bounds: b, items, radius, onTap } = latest.current;
    // The clamp gives room for what the panel covers, and never pulls in a view a closed panel left past the edge.
    if (out.kind === 'pan') cam.current = panBy(c, out.dx, out.dy, b, vp.current, slackFor(c, b, vp.current, coverSeen.current));
    else if (out.kind === 'zoom') cam.current = zoomAt(c, out.factor, out.at, b, vp.current, slackFor(c, b, vp.current, coverSeen.current));
    else {
      onTap(pick(items, screenToBoard(c, vp.current, out.at), radius));
      return;
    }
    touched.current = true;
    schedule();
  }, stopGlide);
  fingerDown.current = held;

  // Each new action: the view follows where it happened (its moves' ends, the attacker and the attacked, the falls,
  // the bursts) only when that leaves the middle of the slot, and then eases over just far enough. Never while a
  // finger is on the board: the player's own drag or pinch always wins.
  const followSeq = p.attacks?.seq ?? 0;
  const followTiles = p.attacks?.tiles;
  // Each action is followed once: a new array for the same action never pans back to it.
  const followed = useRef(followSeq);
  useEffect(() => {
    if (followSeq === followed.current) return;
    followed.current = followSeq;
    if (followSeq === 0 || followTiles === undefined || cam.current === null || !measured.current || held()) return;
    const box = boxOf(followTiles);
    if (box === null) return;
    const from = glide.current?.to ?? cam.current;
    const b = latest.current.bounds;
    const cover = coverNow();
    const next = followAction(from, vp.current, box, b, { cover, slack: slackFor(from, b, vp.current, cover) });
    if (next === from) return;
    touched.current = true;
    panTo(next);
  }, [followSeq, followTiles, held, panTo, coverNow]);

  // A new selection (or a panel that changed what it covers): the view stays exactly where it is while the selected
  // tile, with its figure, is wholly in sight in the part of the board no panel covers, a third of a tile clear of
  // its edges. Otherwise it eases over the least distance that brings it there. Deselecting never moves it: the
  // panel just goes, and the board under it was there all along. After the effects above, so a Next unit or a
  // followed action that is already panning is measured where it is going.
  const selKey = useMemo(() => selectedKey(p.items), [p.items]);
  const coverN = p.coverN ?? 0;
  useEffect(() => {
    const cover = coverNow(true);
    if (selKey === null || cam.current === null || !measured.current || held()) return;
    const from = glide.current?.to ?? cam.current;
    const b = latest.current.bounds;
    const margin = (TILE_STEP * from.scale) / 3;
    const next = keepInView(from, vp.current, tileBox(selKey, gl ? THICK_3D : THICK), b, { cover, margin, slack: slackFor(from, b, vp.current, cover) });
    if (next === from) return;
    touched.current = true;
    panTo(next);
  }, [selKey, coverN, held, panTo, coverNow]);

  // The 3D terrain. three.js is only downloaded once the option is on (a dynamic import, its own chunk), and the
  // svg keeps drawing the ground until the terrain has drawn its first frame. No WebGL 2 or a chunk that cannot
  // load leaves this board all SVG; a lost context shows SVG until the context is restored. Neither touches the
  // stored option.
  const glData = useMemo(() => (glWanted ? glMapOf(p.items, p.radius, p.factions, p.seed ?? 0) : null), [glWanted, p.items, p.radius, p.factions, p.seed]);
  const glLatest = useRef(glData);
  useLayoutEffect(() => {
    glLatest.current = glData;
  });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!glWanted || canvas === null) return undefined;
    const stop = startTerrain3d({
      canvas,
      unitsCanvas: unitsCanvasRef.current,
      load: () => import('../terrain3d/terrain3d'),
      hasWebgl2: webgl2Available,
      ready: (t) => {
        if (ambient.current === null) {
          ambient.current = createAmbientLoop(domAmbientEnv(), (now, level) => {
            const tt = terrain.current;
            if (tt === null || cam.current === null) return false;
            // A camera frame is waiting (it draws the terrain and the figures at the new camera together, so the
            // units canvas never runs ahead of the terrain), or a slide or lunge is being followed (that loop draws).
            if (frame.current !== 0 || unitsFrame.current !== 0) return true;
            tt.tick(now, level);
            tt.drawUnits(cam.current, vp.current);
            return tt.animating(cam.current, vp.current);
          }, () => {
            const tt = terrain.current;
            if (tt === null || cam.current === null) return;
            tt.tick(performance.now(), 0);
            tt.drawUnits(cam.current, vp.current);
          });
          ambient.current.cover(coveredRef.current);
        }
        t.tick(performance.now(), ambient.current.level());
        const d = glLatest.current;
        if (d !== null) {
          t.setMap(d.map);
          t.setVeil(d.veiled);
        }
        const u = unitsLatest.current;
        if (u !== null) t.units?.setUnits(u.units);
        terrain.current = t;
        shownGl.current = d === null ? null : { key: d.key, veilKey: d.veilKey };
        shownUnits.current = u?.key ?? null;
        write();
        setGlReady(true);
        setGlUnitsReady(t.units !== null);
      },
      fallback: () => {
        terrain.current = null;
        setGlReady(false);
        setGlUnitsReady(false);
      },
    });
    return () => {
      terrain.current = null;
      ambient.current?.stop();
      ambient.current = null;
      stop();
      setGlReady(false);
      setGlUnitsReady(false);
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

  // The 3D unit figures: exactly the scene's units (the viewer's own view, so fog hides them as it hides the svg
  // ones), rebuilt only when what they show or where they stand changes, before the browser paints.
  const unitsData = useMemo(() => (glWanted ? glUnitsOf(p.items, p.factions) : null), [glWanted, p.items, p.factions]);
  const unitsLatest = useRef(unitsData);
  useLayoutEffect(() => {
    unitsLatest.current = unitsData;
  });
  const shownUnits = useRef<string | null>(null);
  const unitsKey = unitsData?.key ?? '';
  useLayoutEffect(() => {
    const t = terrain.current;
    const u = unitsLatest.current;
    if (!units3d || t === null || t.units === null || u === null || cam.current === null) return;
    if (shownUnits.current === u.key) return;
    const now = performance.now();
    // When each move of the action shown starts (an advance waits for its blow), so its figure turns as it sets off.
    const delays = new Map<number, number>();
    for (const m of p.attacks?.moves ?? []) if (!delays.has(m.unit)) delays.set(m.unit, m.delay);
    t.units.setUnits(u.units, now, delays);
    shownUnits.current = u.key;
    t.tick(now, ambient.current?.level() ?? 0);
    t.drawUnits(cam.current, vp.current);
    ambient.current?.drew();
    // A move or a hunker turns a figure: follow the turn frame by frame (a move's slide is followed anyway).
    if (t.units.turning(now)) followUnits();
  }, [units3d, unitsKey]);

  // While the svg plays a slide, a lunge or a fall, the 3D figures follow it frame by frame: each frame reads where
  // the svg has the unit now (its animated transform), so the two cannot drift apart. Only the units canvas is
  // drawn; the loop stops when nothing on the units' svg is animating.
  const unitsFrame = useRef(0);
  const factionsRef = useRef(p.factions);
  factionsRef.current = p.factions;
  const followUnits = useCallback((): void => {
    if (unitsFrame.current !== 0) return;
    const step = (now: number): void => {
      unitsFrame.current = 0;
      const t = terrain.current;
      const g = overlayCamRef.current;
      if (t === null || t.units === null || g === null || cam.current === null) return;
      const live = livePose(g, factionsRef.current);
      t.units.pose(live.at, live.falls);
      t.tick(now, ambient.current?.level() ?? 0);
      t.drawUnits(cam.current, vp.current);
      // A slide or lunge is a game event: it wakes the loop; the frame just drawn counts as the loop's own.
      ambient.current?.drew();
      if (live.moving || t.units.turning(now) || t.playing(now)) unitsFrame.current = requestAnimationFrame(step);
    };
    unitsFrame.current = requestAnimationFrame(step);
  }, []);
  useEffect(() => () => {
    if (unitsFrame.current !== 0) cancelAnimationFrame(unitsFrame.current);
    unitsFrame.current = 0;
  }, []);
  // An attack turns the attacker's figure to face its target, round by the time its lunge starts. After the scene's
  // units are set (above), so a unit that has just appeared is there to turn. Once per action.
  const attacks = p.attacks ?? null;
  const shownAttacks = useRef(attacks?.seq ?? 0);
  useLayoutEffect(() => {
    if (attacks === null || attacks.seq === shownAttacks.current) return;
    shownAttacks.current = attacks.seq;
    const t = terrain.current;
    if (!units3d || t === null || t.units === null) return;
    const now = performance.now();
    for (const a of attacks.list) {
      const to = hexToBoard(a.toward);
      t.units.aim(a.unit, to.x, to.y, now, now + a.delay, hexToBoard(a.from));
    }
    // Each attacker strikes with its weapon; the unit attacked blocks or flinches if it lives, and strikes back if it does.
    const fallen = new Set(attacks.fallen ?? []);
    t.units.strikes(attacks.list.map((a) => ({
      unit: a.unit, target: a.target, from: hexToBoard(a.from), to: hexToBoard(a.toward), delay: a.delay,
      survives: a.target !== undefined && !fallen.has(a.target), counter: a.counter === true,
    })), now);
    t.units.forget(attacks.fallen ?? []);
    // A claimed chest opens where it stood, in this same frame (the terrain has just dropped it).
    if ((attacks.chests?.length ?? 0) > 0 && cam.current !== null) {
      t.chests(attacks.chests ?? [], now, prefersReducedMotion());
      t.tick(now, ambient.current?.level() ?? 0);
      t.drawUnits(cam.current, vp.current);
    }
    if (t.units.turning(now) || t.playing(now)) followUnits();
  }, [attacks, units3d, followUnits]);
  // Effects (a lunge, a fall) start in their own layout effects, which run before this one.
  useLayoutEffect(() => {
    if (units3d) followUnits();
  }, [units3d, p.children, followUnits]);

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
  // How long the slides just started run (set by the slide effect below, which runs first), so a moved unit goes
  // back into the draw order only once it has arrived.
  const settleAfter = useRef(SLIDE_MS + SETTLE_AFTER_MS);
  useEffect(() => {
    if (places === settledKey) return undefined;
    const t = setTimeout(() => setSettledKey(places), settleAfter.current);
    return () => clearTimeout(t);
  }, [places, settledKey]);

  // A move is played as a slide on the unit's group, in the svg the units are drawn in. The svg look slides quickly
  // (SLIDE_MS); the 3D look holds the unit while its figure turns, then travels at its own pace (motion.ts), and its
  // figure follows the slide and walks, trots, gallops or rolls along it (terrain3d/units). Either waits for the
  // action's own timing (an advance after its blow). A unit still sliding from an earlier move sets off from where it
  // is drawn now, never from where it was going. Reduced motion: no slide.
  const shownAt = useRef(new Map<number, { at: Pt; pos: HexKey }>());
  const attacksRef = useRef(p.attacks ?? null);
  attacksRef.current = p.attacks ?? null;
  useLayoutEffect(() => {
    const g = units3d ? overlayCamRef.current : camRef.current;
    const still = prefersReducedMotion();
    const delays = new Map<number, number>();
    for (const m of attacksRef.current?.moves ?? []) if (!delays.has(m.unit)) delays.set(m.unit, m.delay);
    const next = new Map<number, { at: Pt; pos: HexKey }>();
    let longest = SLIDE_MS;
    for (const it of items) {
      if (it.kind !== 'unit') continue;
      next.set(it.unit.id, { at: it.at, pos: it.unit.pos });
      const was = shownAt.current.get(it.unit.id);
      if (still || g === null || was === undefined || (was.at.x === it.at.x && was.at.y === it.at.y)) continue;
      const el = g.querySelector(`[data-unit="${it.unit.id}"]`);
      if (el === null || typeof el.animate !== 'function') continue;
      // Still sliding: start from where it is drawn this frame, and stop the old slide.
      const old = typeof el.getAnimations === 'function' ? el.getAnimations().filter((a) => a.playState === 'running') : [];
      const live = old.length > 0 ? liveTransform(el) : null;
      for (const a of old) a.cancel();
      const from: Pt = live ?? was.at;
      const hexes = live === null ? hexesBetween(was.pos, it.unit.pos) : Math.max(1, Math.round(Math.hypot(it.at.x - from.x, it.at.y - from.y) / TILE_STEP));
      const delay = live === null ? delays.get(it.unit.id) ?? 0 : 0;
      const total = units3d ? slideMs3d(it.unit.type, hexes) : SLIDE_MS;
      el.animate(slideFrames(unitTransform(from), unitTransform(it.at), total, units3d), {
        duration: total, delay, easing: units3d ? 'linear' : 'ease-out', fill: 'backwards',
      });
      longest = Math.max(longest, delay + total);
    }
    shownAt.current = next;
    settleAfter.current = longest + SETTLE_AFTER_MS;
    if (units3d) followUnits();
  }, [items, units3d, followUnits]);

  const [drawn, overlay] = useMemo(() => {
    const view = (it: SceneItem): ReactElement =>
      it.kind === 'tile' ? (
        <TileView key={`t${it.key}`} t={it} factions={factions} viewer={viewer} gl={gl} />
      ) : (
        <UnitView key={`u${it.unit.id}`} u={it} factions={factions} figure={!units3d} />
      );
    const sliding = (it: SceneItem): boolean => {
      if (it.kind !== 'unit') return false;
      const was = settled.get(it.unit.id);
      return was !== undefined && was !== it.unit.pos;
    };
    const all = [...items.filter((it) => !sliding(it)), ...items.filter(sliding)];
    // With the 3D figures, the tile svg keeps the tiles and the svg above the figures takes the units.
    if (!units3d) return [all.map(view), null];
    return [all.filter((it) => it.kind === 'tile').map(view), all.filter((it) => it.kind === 'unit').map(view)];
  }, [items, factions, viewer, settled, gl, units3d]);

  const board = (
    <svg
      ref={svgRef} className="board" width="100%" height="100%" data-testid="board" data-terrain3d={gl ? 'on' : undefined}
      style={glWanted ? { touchAction: 'none', position: 'relative' } : { touchAction: 'none' }}
    >
      {/* The camera ref holds the live transform; a render writes the same value back. */}
      <g ref={camRef} data-camera="true" transform={cameraTransform(cam.current, vp.current)}>
        {drawn}
        {glWanted ? null : p.children}
      </g>
    </svg>
  );
  // The svg keeps its place in the tree whether the canvas is there or not, so turning the option on or off never
  // remounts it (its size observer and gestures stay attached).
  return (
    <>
      {glWanted ? <canvas ref={canvasRef} className="board-terrain" data-testid="board-terrain" aria-hidden="true" /> : null}
      {board}
      {glWanted ? <canvas ref={unitsCanvasRef} className="board-terrain board-units3d" data-testid="board-units3d" aria-hidden="true" /> : null}
      {glWanted ? (
        // The units' status and badges (with the 3D figures on) and the effects, above the 3D figures. Taps go
        // through to the board's svg below. It stays while the option is on, so a fallback to svg figures or a
        // restored context never moves the effects and so never plays an action's effects twice.
        <svg className="board-overlay" width="100%" height="100%" data-testid="board-overlay" data-units3d={units3d ? 'on' : undefined}>
          <g ref={overlayCamRef} data-camera="units" transform={cameraTransform(cam.current, vp.current)}>
            {overlay}
            {p.children}
          </g>
        </svg>
      ) : null}
    </>
  );
}
