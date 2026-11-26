// Where the 3D tile buildings (the farm, granary, orchard, plantation, lumber camp, lumber mill and market) and the
// treasure chest stand, how the chest opens when a unit claims it, and how the lumber mill's wheel turns. Pure maths,
// no three.js, so it can be tested in Node. World units around the tile centre, as layout.ts (+z toward the viewer).
//
// A unit stands in the middle of a tile, so every building keeps the middle low or open, as the cities keep their
// square: a farm's ploughed rows, a market's square, the lane between an orchard's rows. Tall pieces stand toward the
// back and the sides. In a forest the grove along the back stays, and the camp or mill stands in front of it.
import type { BuildingId, HexKey } from '../../engine';
import type { GlMap, GlTile } from './input';
import { centre, COS_E, edgeDist, hash2, parse, SQUASH } from './layout';

/** The buildings this file lays out; the mine and the foundry are built into the mountain (townLayout.ts). */
export type FieldBuilding = Exclude<BuildingId, 'mine' | 'foundry'>;
export const FIELD_BUILDINGS: readonly FieldBuilding[] = ['farm', 'granary', 'orchard', 'plantation', 'lumberCamp', 'lumberMill', 'market'];

export type PieceKind =
  | 'plot' | 'wheatPlot' | 'barn' | 'granary' | 'sheaf' | 'bale' // farm and granary
  | 'tree' | 'fullTree' | 'ladder' | 'basket' | 'crates' | 'fence' | 'rows' // orchard and plantation
  | 'cabin' | 'logPile' | 'bigLogPile' | 'sawhorse' | 'stump' | 'mill' | 'race' | 'planks' // lumber camp and mill
  | 'stall' | 'barrel' | 'sack'; // market

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

/** How far from the middle a tall piece must keep, so a unit standing there never stands inside it. */
export const CLEAR = 8;

const piece = (kind: PieceKind, x: number, z: number, foot: number, h: number, seed: number, rot = 0, s = 1): BuildingPiece => ({ kind, x, z, rot, foot, h, seed, s });

/**
 * The pieces of a building on its tile. `m` mirrors the layout left to right (by the tile's turn), so neighbouring
 * farms or camps differ; the market and the mill are not mirrored (the mill's race runs out to the right).
 */
export function buildingPlan(b: FieldBuilding, turn: number, q: number, r: number): BuildingPlan {
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
    if (t.city || t.building !== 'lumberMill') continue;
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
