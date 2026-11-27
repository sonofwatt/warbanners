// Where the 3D tile buildings (the farm, granary, orchard, plantation, lumber camp, lumber mill and market) and the
// treasure chest stand, how the chest opens when a unit claims it, and how the lumber mill's wheel turns. Pure maths,
// no three.js, so it can be tested in Node. World units around the tile centre, as layout.ts (+z toward the viewer).
//
// A unit stands in the middle of a tile, so every building keeps the middle low or open, as the cities keep their
// square: a farm's ploughed rows, a market's square, the lane between an orchard's rows. Tall pieces stand toward the
// back and the sides. In a forest the grove along the back stays, and the camp or mill stands in front of it.
import type { BuildingId, HexKey } from '../../engine';
import type { GlMap, GlTile } from './input';
import { centre, COS_E, edgeDist, hash2, heightFn, parse, SQUASH, tileSetup } from './layout';
import { FURNACE, townSpills } from './townLayout';

/** The buildings this file lays out; the mine and the foundry are built into the mountain (townLayout.ts). */
export type FieldBuilding = Exclude<BuildingId, 'mine' | 'foundry'>;
export const FIELD_BUILDINGS: readonly FieldBuilding[] = ['farm', 'granary', 'orchard', 'plantation', 'lumberCamp', 'lumberMill', 'market'];

export type PieceKind =
  | 'plot' | 'wheatPlot' | 'barn' | 'granary' | 'sheaf' | 'bale' // farm and granary
  | 'tree' | 'fullTree' | 'ladder' | 'basket' | 'crates' | 'fence' | 'rows' // orchard and plantation
  | 'cabin' | 'logPile' | 'bigLogPile' | 'sawhorse' | 'stump' | 'mill' | 'race' | 'planks' // lumber camp and mill
  | 'stall' | 'barrel' | 'sack' // market
  // rules 11, on Woodland land: a wigwam by the farm, a raised storage longhouse, berry thickets and drying racks,
  // a lean-to and a larger one with a saw-pit, a trading lodge
  | 'wigwamHut' | 'storehouse' | 'thicket' | 'rack' | 'leanTo' | 'bigLeanTo' | 'sawPit' | 'tradeLodge';

export interface BuildingPiece {
  kind: PieceKind;
  x: number;
  z: number;
  /** Turn about the vertical, radians. */
  rot: number;
  /** Radius of the ground it takes, world units (grove trees standing in it make way). */
  foot: number;
  /** Height of its top, world units. */
  h: number;
  seed: number;
  /** A size or a length, where the piece takes one (a fence's length, a tree's scale). */
  s: number;
}

export interface BuildingPlan { building: FieldBuilding; pieces: BuildingPiece[]; wheel: WheelSpot | null }

/** The lumber mill's water wheel: its hub (local to the tile), radius and which way it is mirrored. */
export interface WheelSpot { x: number; y: number; z: number; r: number }
export const WHEEL = { x: 12, y: 7.8, z: 2, r: 7.5 } as const;

/**
 * Each piece is shaped at a modest size and drawn larger, so it reads at the phone's default zoom as boldly as the
 * svg mark does. Trees take their size from the layout; plots, strips, fences and the race are laid out to size.
 */
export const PIECE_SIZE: Partial<Record<PieceKind, number>> = {
  plot: 1.25, wheatPlot: 1.25, barn: 1.45, bale: 1.45, granary: 1.3, sheaf: 1.4, ladder: 1.35, basket: 1.45, crates: 1.4,
  cabin: 1.45, stump: 1.45, logPile: 1.4, bigLogPile: 1.35, sawhorse: 1.4, mill: 1.3, planks: 1.35, stall: 1.35, barrel: 1.5, sack: 1.5,
  wigwamHut: 1.6, storehouse: 1.55, rack: 1.45, leanTo: 1.7, bigLeanTo: 1.6, sawPit: 1.4, tradeLodge: 1.3,
};

/** How far from the middle a tall piece must keep, so a unit standing there never stands inside it. */
export const CLEAR = 8;

const piece = (kind: PieceKind, x: number, z: number, foot: number, h: number, seed: number, rot = 0, s = 1): BuildingPiece => ({ kind, x, z, rot, foot, h, seed, s });

/**
 * The pieces of a building on its tile. `m` mirrors the layout left to right (by the tile's turn), so neighbouring
 * farms or camps differ; the market and the mill are not mirrored (the mill's race runs out to the right).
 */
export function buildingPlan(b: FieldBuilding, turn: number, q: number, r: number, woodland = false): BuildingPlan {
  if (woodland) return woodlandPlan(b, turn, q, r);
  const m = turn % 2 === 0 ? 1 : -1;
  const sd = (i: number): number => hash2(q * 1.9 + i, r * 3.3 - i);
  const P = (kind: PieceKind, x: number, z: number, foot: number, h: number, i: number, rot = 0, s = 1): BuildingPiece => piece(kind, x * m, z, foot, h, sd(i), rot * m, s);
  const pieces: BuildingPiece[] = [];
  let wheel: WheelSpot | null = null;
  switch (b) {
    case 'farm':
      // Fenced ploughed rows at the front left with young shoots, a small barn at the back right, a hay bale.
      pieces.push(P('plot', -8, 7, 11, 2.5, 0), P('barn', 12, -8, 8, 18, 1), P('bale', 18, 4, 3, 4.2, 2));
      break;
    case 'granary':
      // The farm grown: its rows now ripe wheat, the barn, and a tall round stone granary with sheaves by it.
      pieces.push(
        P('wheatPlot', -6, 8, 11, 4, 0), P('barn', 13, -6, 8, 18, 1), P('granary', -10, -10, 7, 28, 2),
        P('sheaf', 17, 7, 2.2, 6, 3), P('sheaf', 20.5, 3, 2.2, 6, 4), P('sheaf', 9, 16, 2.2, 6, 5),
      );
      break;
    case 'orchard':
      // Tidy rows: three trees at the back, two at the sides, a lane down the middle; a ladder, two baskets, a fence.
      for (const [x, z, i] of [[-13, -12, 0], [0, -15, 1], [13, -12, 2], [-17, 4, 3], [17, 4, 4]] as const) pieces.push(P('tree', x, z, 6, 14, i, 0, 1.3));
      pieces.push(P('ladder', 13, 6.5, 2, 11, 5, -0.3), P('basket', -5, 15, 2.6, 3.6, 6), P('basket', 5, 15.5, 2.6, 3.6, 7));
      pieces.push(P('fence', 0, 21, 2, 2.6, 8, 0, 22));
      break;
    case 'plantation':
      // The orchard grown: seven heavier trees in three straight rows on mown strips, crates of fruit at the front.
      pieces.push(P('rows', 0, -1, 0, 0.2, 9));
      for (const [x, z, i] of [[-12, -14, 0], [0, -16, 1], [12, -14, 2], [-18, 0, 3], [18, 0, 4], [-10, 13, 5], [10, 13, 6]] as const) {
        pieces.push(P('fullTree', x, z, 6, 15, i, 0, 1.2));
      }
      pieces.push(P('crates', 0, 19, 4, 4, 7), P('basket', 7, 22, 2.4, 3.4, 8));
      break;
    case 'lumberCamp':
      // At the forest's front edge, before the grove: a log cabin, a stump with an axe, a pile of cut logs, a sawhorse.
      pieces.push(P('cabin', -14, 2, 7, 14, 0), P('stump', 15, 2, 3.2, 8, 1), P('logPile', 6, 13, 6, 6, 2), P('sawhorse', -5, 15, 4.5, 4, 3, 0.2));
      break;
    case 'lumberMill':
      // The camp grown: a two storey timber mill on a stone footing beside a race, its water wheel turning, a bigger
      // pile of logs and a stack of sawn planks; the grove stands behind.
      pieces.push(
        piece('mill', -13, 3, 9, 25, sd(0)), piece('race', 15, WHEEL.z, 3, 1, sd(1), 0, 20),
        piece('bigLogPile', -4, 16, 6, 8, sd(2)), piece('planks', 14, 15, 5, 4, sd(3), -0.2),
      );
      wheel = { ...WHEEL };
      break;
    case 'market':
      // Three stalls round an open square, their awnings striped in the owner's colour; a barrel and sacks.
      pieces.push(
        piece('stall', 0, -15, 8, 13, sd(0), 0), piece('stall', -16, 2, 8, 13, sd(1), 0.75), piece('stall', 16, 2, 8, 13, sd(2), -0.75),
        piece('barrel', -8, 16, 2.2, 4.8, sd(3)), piece('sack', 7, 15, 2.2, 3.6, sd(4)), piece('sack', 10, 17, 2, 3.2, sd(5)),
      );
      break;
  }
  return { building: b, pieces, wheel };
}

/**
 * rules 11: the same buildings on Woodland Nations land, in their own look (spec section 6): the farm's rows beside a
 * wigwam, a raised storage longhouse for the granary, berry thickets with drying racks, a lean-to with a woodpile and a
 * larger one over a saw-pit, and a trading lodge. Laid out as the others: the middle kept low, tall pieces back.
 */
function woodlandPlan(b: FieldBuilding, turn: number, q: number, r: number): BuildingPlan {
  const m = turn % 2 === 0 ? 1 : -1;
  const sd = (i: number): number => hash2(q * 1.9 + i, r * 3.3 - i);
  const P = (kind: PieceKind, x: number, z: number, foot: number, h: number, i: number, rot = 0, s = 1): BuildingPiece => piece(kind, x * m, z, foot, h, sd(i), rot * m, s);
  const pieces: BuildingPiece[] = [];
  switch (b) {
    case 'farm':
      pieces.push(P('plot', -8, 7, 11, 2.5, 0), P('wigwamHut', 12, -8, 7, 10, 1), P('basket', 17, 5, 2.6, 3.6, 2));
      break;
    case 'granary':
      pieces.push(P('wheatPlot', -6, 8, 11, 4, 0), P('wigwamHut', 13, -6, 7, 10, 1), P('storehouse', -11, -10, 8, 16, 2), P('basket', 16, 8, 2.6, 3.6, 3));
      break;
    case 'orchard':
      for (const [x, z, i] of [[-13, -12, 0], [0, -15, 1], [13, -12, 2], [-17, 4, 3], [17, 4, 4]] as const) pieces.push(P('thicket', x, z, 6, 7, i, 0, 1.2));
      pieces.push(P('rack', 9, 14, 4, 8, 5, -0.2), P('basket', -5, 15, 2.6, 3.6, 6));
      break;
    case 'plantation':
      pieces.push(P('rows', 0, -1, 0, 0.2, 9));
      for (const [x, z, i] of [[-12, -14, 0], [0, -16, 1], [12, -14, 2], [-18, 0, 3], [18, 0, 4]] as const) pieces.push(P('thicket', x, z, 6, 8, i, 0, 1.35));
      pieces.push(P('rack', -9, 14, 4, 8, 5, 0.2), P('rack', 9, 14, 4, 8, 6, -0.2), P('basket', 0, 20, 2.4, 3.4, 7));
      break;
    case 'lumberCamp':
      pieces.push(P('leanTo', -14, 2, 7, 10, 0), P('stump', 15, 2, 3.2, 8, 1), P('logPile', 6, 13, 6, 6, 2), P('sawhorse', -5, 15, 4.5, 4, 3, 0.2));
      break;
    case 'lumberMill':
      pieces.push(P('bigLeanTo', -13, 3, 9, 13, 0), P('sawPit', 13, 4, 6, 5, 1), P('bigLogPile', -4, 16, 6, 8, 2), P('planks', 14, 15, 5, 4, 3, -0.2));
      break;
    case 'market':
      pieces.push(
        piece('tradeLodge', 0, -14, 9, 13, sd(0), 0),
        piece('barrel', -10, 14, 2.2, 4.8, sd(3)), piece('sack', 8, 14, 2.2, 3.6, sd(4)), piece('basket', 12, 16, 2.4, 3.4, sd(5)),
      );
      break;
  }
  return { building: b, pieces, wheel: null };
}

/** Whether a piece stands on the tile and, if tall, clear of the middle; for tests. */
export function buildingPieceFits(p: BuildingPiece): boolean {
  const onTile = edgeDist(p.x, p.z) >= Math.min(p.foot, 6) * 0.6;
  const low = p.h <= 6 || p.kind === 'plot' || p.kind === 'wheatPlot' || p.kind === 'rows' || p.kind === 'fence' || p.kind === 'race';
  return onTile && (low || Math.hypot(p.x, p.z) >= CLEAR + p.foot * 0.5);
}

// ---------------------------------------------------------------------------------------------------------------
// The treasure chest

/** Where the chest stands, as the svg places it: in the middle, in front of a forest's grove, in front of a peak, or
 * small beside a unit standing on the tile. x, z local to the tile, s its scale. */
export interface ChestSpot { x: number; z: number; s: number }
export const CHEST_BESIDE: ChestSpot = { x: 16, z: 5, s: 1.25 };

/** The chest on a tile, or null when there is none (a city, a village or a building hides it, as in the svg). */
export function chestSpot(t: GlTile): ChestSpot | null {
  if (!t.treasure || t.city || t.village || t.building !== null) return null;
  if (t.beside === true) return CHEST_BESIDE;
  if (t.terrain === 'mountain') return { x: 5, z: 12, s: 1.35 };
  if (t.terrain === 'forest') return { x: 1, z: 6, s: 1.5 };
  return { x: 0, z: 3, s: 1.65 };
}

/** Every chest on the map, by tile. */
export function chestSpots(map: GlMap): Map<HexKey, ChestSpot> {
  const out = new Map<HexKey, ChestSpot>();
  for (const k of Object.keys(map.tiles).sort()) {
    const s = chestSpot(map.tiles[k]!);
    if (s !== null) out.set(k, s);
  }
  return out;
}

/**
 * The chest's opening, timed from the claim effect (ms). The lid swings open over LID_MS with an ease out, a burst of
 * light and coins comes out as it opens, the open chest holds a moment, then shrinks and sinks away over FADE_MS.
 */
export const LID_MS = 360;
export const HOLD_MS = 200;
export const FADE_MS = 300;
export const CHEST_MS = LID_MS + HOLD_MS + FADE_MS;
/** How far the lid swings back, radians (a little past upright). */
export const LID_OPEN = 1.95;
/** The burst: when it starts and how long it lasts (ms from the claim). */
export const BURST_AT = 110;
export const BURST_MS = 520;
/** How far the chest sinks as it fades (world units). */
export const CHEST_SINK = 1.5;

export interface ChestPose {
  /** The lid's turn back about its hinge, radians (0 shut). */
  lid: number;
  /** The light's strength, 0 to 1. */
  glow: number;
  /** How far through their flight the coins are, 0 to 1; null before they leave or after they are gone. */
  coins: number | null;
  /** How much of the chest is left as it goes, 1 to 0 (it shrinks into the ground as it sinks). */
  alpha: number;
  sink: number;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export function chestOpen(ms: number): ChestPose {
  const t = clamp01(ms / LID_MS);
  const lid = LID_OPEN * (1 - Math.pow(1 - t, 3));
  const b = (ms - BURST_AT) / BURST_MS;
  const glow = b <= 0 || b >= 1 ? 0 : Math.sin(Math.PI * Math.pow(b, 0.7));
  const coins = b <= 0 || b >= 1 ? null : b;
  const f = clamp01((ms - LID_MS - HOLD_MS) / FADE_MS);
  const alpha = 1 - f * f * (3 - 2 * f);
  return { lid, glow, coins, alpha, sink: (1 - alpha) * CHEST_SINK };
}

/** The coins of the burst: where coin i of COINS is at phase p (0 to 1), relative to the chest's open mouth. */
export const COINS = 7;
export function coinAt(i: number, p: number): [number, number, number] {
  const a = (i / COINS) * Math.PI * 2 + 0.4;
  const spread = 4.5 + 1.5 * ((i * 37) % 5) / 4;
  const up = 7 + 1.5 * ((i * 53) % 3); // how high it leaps, world units
  return [Math.cos(a) * spread * p, up * 4 * p * (1 - p), Math.sin(a) * spread * 0.6 * p];
}

/** One chest opening to play: the tile, its spot and ground height, and when it starts (ms on the frame clock). */
export interface ChestPlay { key: HexKey; x: number; y: number; z: number; s: number; start: number }

/**
 * The claims of an action turned into openings: each claim on a tile whose chest the map showed (`spots`, world
 * positions), from `nowMs` plus its delay. With reduced motion none plays: the chest is simply gone.
 */
export function chestPlays(
  claims: readonly { at: HexKey; delay: number }[], spots: ReadonlyMap<HexKey, { x: number; y: number; z: number; s: number }>, nowMs: number, reduced: boolean,
): ChestPlay[] {
  if (reduced) return [];
  const out: ChestPlay[] = [];
  for (const c of claims) {
    const s = spots.get(c.at);
    if (s === undefined || out.some((p) => p.key === c.at)) continue;
    out.push({ key: c.at, ...s, start: nowMs + c.delay });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The lumber mill's wheel

export interface WheelSpotOnMap { key: HexKey; x: number; y: number; z: number; r: number; phase: number; box: { x0: number; x1: number; y0: number; y1: number } }

/** Every lumber mill's wheel on the map, in world space, with the box it takes on the board. */
export function wheelSpots(map: GlMap): WheelSpotOnMap[] {
  const out: WheelSpotOnMap[] = [];
  for (const k of Object.keys(map.tiles).sort()) {
    const t = map.tiles[k]!;
    if (t.city || t.building !== 'lumberMill' || t.owner === 'woodland') continue;   // rules 11: their mill is a saw-pit
    const { q, r } = parse(k);
    const c = centre(q, r);
    const x = c.x + WHEEL.x, z = c.z + WHEEL.z;
    const bx = x, by = z * SQUASH - WHEEL.y * COS_E;
    out.push({ key: k, x, y: WHEEL.y, z, r: WHEEL.r, phase: hash2(q, r) * Math.PI, box: { x0: bx - 9, x1: bx + 9, y0: by - 9, y1: by + 9 } });
  }
  return out;
}

/** The wheel turns this many radians a second at full motion: slow and calm, a turn every 6 s or so. */
export const WHEEL_SPEED = 1.05;
/** The wheel's turn after `flow` seconds of the motion clock (which stands still at rest and under reduced motion). */
export const wheelAngle = (flow: number, phase: number): number => -(flow * WHEEL_SPEED + phase);

// ---------------------------------------------------------------------------------------------------------------
// Chimney smoke

/**
 * The chimney tops that smoke, local to their piece's place and before its size (buildings.ts SIZE): the lumber
 * camp's cabin stovepipe and the lumber mill's chimney. The foundry's chimney top is local to the tile.
 */
export const CABIN_PIPE = { x: 8.4 * 0.28, y: 5.2 + 0.6 + 4.6, z: -7 * 0.15 } as const;
export const MILL_CHIMNEY = { x: -4.5, y: 19.6, z: -1.6 } as const;
export const FOUNDRY_CHIMNEY = { x: FURNACE.x + 2.2, y: 19.5, z: FURNACE.z - 1.6 } as const;

/** A smoking chimney: where its smoke starts (world), how full it is (a thin wisp, or fuller), and its board box. */
export interface SmokeSpot { key: HexKey; x: number; y: number; z: number; kind: 'thin' | 'wisp' | 'full'; seed: number; box: { x0: number; x1: number; y0: number; y1: number } }

/** Puffs a chimney sends up at once: a wisp has fewer, smaller ones; a bonfire's thin wisp smaller ones still. */
export const SMOKE_PUFFS = { thin: 4, wisp: 4, full: 6 } as const;
/** Each kind's puff size (world units). */
export const SMOKE_SIZE = { thin: 1.9, wisp: 3.2, full: 4.4 } as const;
/** How see-through each kind's puffs are: a bonfire's wisp is faint, so it never hides the huts behind it. */
export const SMOKE_ALPHA = { thin: 0.45, wisp: 1, full: 1 } as const;
/** How high a puff rises over its life, and how far the wind carries it to the right (world units). */
export const SMOKE_RISE = 22;
export const SMOKE_DRIFT = 9;

/** Every smoking chimney on the map: lumber camps, lumber mills and foundries, and the villages' bonfires. */
export function smokeSpots(map: GlMap): SmokeSpot[] {
  const out: SmokeSpot[] = [];
  const fires = new Map(fireSpots(map).map((f) => [f.key, f]));
  for (const k of Object.keys(map.tiles).sort()) {
    const t = map.tiles[k]!;
    if (t.city) continue;
    const { q, r } = parse(k);
    const c = centre(q, r);
    let at: { x: number; y: number; z: number } | null = null;
    let kind: SmokeSpot['kind'] = 'full';
    const fire = fires.get(k);
    if (fire !== undefined) {
      at = { x: fire.x - c.x, y: fire.y + FLAME_TOP, z: fire.z - c.z };
      kind = 'thin';
    } else if (t.building === 'foundry' && t.terrain === 'mountain') at = FOUNDRY_CHIMNEY;
    else if (t.building === 'lumberCamp' || t.building === 'lumberMill') {
      const setup = tileSetup(map, k);
      const camp = t.building === 'lumberCamp';
      const p = setup.building?.pieces.find((x) => x.kind === (camp ? 'cabin' : 'mill'));
      if (p === undefined) continue;
      const top = camp ? CABIN_PIPE : MILL_CHIMNEY, size = PIECE_SIZE[p.kind] ?? 1;
      at = { x: p.x + top.x * size, y: heightFn(setup)(p.x, p.z) + top.y * size, z: p.z + top.z * size };
      kind = camp ? 'wisp' : 'full';
    }
    if (at === null) continue;
    const x = c.x + at.x, z = c.z + at.z;
    const bx = x + SMOKE_DRIFT / 2, by = z * SQUASH - (at.y + SMOKE_RISE / 2) * COS_E;
    out.push({ key: k, x, y: at.y, z, kind, seed: hash2(q * 2.9, r * 1.3), box: { x0: bx - 12, x1: bx + 12, y0: by - 16, y1: by + 16 } });
  }
  return out;
}

/** How high a bonfire's flames reach over its ground (world units): its smoke starts there. */
export const FLAME_TOP = 6.5;

export interface FireSpot {
  key: HexKey;
  /** World position of the fire's foot, on its ground. */
  x: number;
  y: number;
  z: number;
  seed: number;
  /** Board box round the flames and their light, for the ambient loop's in-view test. */
  box: { x0: number; x1: number; y0: number; y1: number };
}

/** Every village bonfire on the map, in a stable order (a captured village is a city: its fire is out). */
export function fireSpots(map: GlMap): FireSpot[] {
  const out: FireSpot[] = [];
  for (const k of Object.keys(map.tiles).sort()) {
    const t = map.tiles[k]!;
    if (t.city || !t.village || t.building !== null) continue;
    const setup = tileSetup(map, k);
    const f = setup.town?.fire;
    if (f == null) continue;
    const { q, r } = parse(k);
    const c = centre(q, r);
    const x = c.x + f.x, z = c.z + f.z, y = heightFn(setup)(f.x, f.z);
    const by = z * SQUASH - (y + FLAME_TOP / 2) * COS_E;
    out.push({ key: k, x, y, z, seed: hash2(q * 1.9, r * 2.7), box: { x0: x - 16, x1: x + 16, y0: by - 14, y1: by + 14 } });
  }
  return out;
}

/** The smoke's clock wraps every SMOKE_PERIOD seconds; each puff lives a whole number of times per period. */
export const SMOKE_PERIOD = 1000;
/** Lives per second of puff i of a chimney with seed w: a puff lasts about 3 to 4 s. */
export const smokeRate = (i: number, w: number): number => Math.floor(300 * (0.85 + 0.3 * ((i * 0.37 + w) % 1))) / SMOKE_PERIOD;

/**
 * Where puff i of n of a chimney is at clock `t` (seconds), as the vertex shader draws it: how far through its life,
 * its rise and drift from the chimney top, its size (as a share of the chimney's puff size) and its opacity. It
 * swells as it rises, drifts to the right more the higher it goes, and fades in quickly and out slowly.
 */
export function smokePuff(t: number, i: number, n: number, w: number): { life: number; x: number; y: number; size: number; alpha: number } {
  const tw = ((t % SMOKE_PERIOD) + SMOKE_PERIOD) % SMOKE_PERIOD;
  const life = (((tw * smokeRate(i, w) + i / n + w) % 1) + 1) % 1;
  const sway = Math.sin(life * 5.0 + i * 1.7) * 0.6;
  return {
    life,
    x: SMOKE_DRIFT * life * life + sway * life,
    y: SMOKE_RISE * life,
    size: 0.45 + 1.05 * Math.sqrt(life),
    alpha: Math.min(1, life / 0.12) * (1 - life) * (1 - life) * 1.15,
  };
}

/** The light a tile's lit windows throw on its ground (townLayout.ts townSpills), in world space. */
export interface WindowSpill { key: HexKey; lights: { x: number; z: number; dx: number; dz: number; weight: number }[] }

/** Every city's and village's lit windows' light on the ground, by tile, in a stable order. */
export function windowSpills(map: GlMap): WindowSpill[] {
  const out: WindowSpill[] = [];
  for (const k of Object.keys(map.tiles).sort()) {
    const t = map.tiles[k]!;
    if (!t.city && !(t.village && t.building === null)) continue;
    const plan = tileSetup(map, k).town;
    if (plan === null) continue;
    const lights = townSpills(plan);
    if (lights.length === 0) continue;
    const { q, r } = parse(k);
    const c = centre(q, r);
    out.push({ key: k, lights: lights.map((l) => ({ ...l, x: c.x + l.x, z: c.z + l.z })) });
  }
  return out;
}
