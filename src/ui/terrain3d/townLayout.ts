// Where the 3D cities, villages and mines put their buildings, and how the mine's lantern flickers. Pure maths, no
// three.js, so it can be tested in Node. World units around the tile centre, as layout.ts (+z toward the viewer).
//
// A city keeps the middle of its tile as an open square, where a unit stands, and grows around it: the hall at the
// back, houses on either side and in front, and with the levels taller houses and towers. The capital's hall is the
// grand one and it flies the tall banner, as the svg city does.
import type { FactionId, HexKey } from '../../engine';
import type { GlMap, GlTown } from './input';
import { centre, COS_E, edgeDist, parse, SQUASH } from './layout';

export type TownKind =
  | 'hall' | 'grandHall' // Spartans: a columned hall; the capital's is a temple with six columns
  | 'yurtHall' | 'greatYurt' // Mongols: a large felt tent with a gold band; the capital's has a second tier
  | 'house' | 'tall' // a house, or a two storey one
  | 'yurt' | 'tallYurt'
  | 'tower' // a stone tower (Spartans) or a timber watchtower (Mongols)
  | 'hut' | 'woodpile'; // a village

export interface TownPiece {
  kind: TownKind;
  x: number;
  z: number;
  /** Turn about the vertical, radians. */
  rot: number;
  /** Radius of the ground it takes, world units. */
  foot: number;
  /** Height of its top, world units (the roof's ridge, the tent's crown or the tower's top). */
  h: number;
  seed: number;
}

export interface WallPlan {
  /** Runs of wall between towers: [x0, z0, x1, z1]. */
  runs: [number, number, number, number][];
  towers: [number, number][];
  /** The gate, in the middle of the front right side: its centre and the run's direction (radians). */
  gate: { x: number; z: number; rot: number };
}

export interface TownPlan {
  faction: FactionId | null; // null: a neutral village
  pieces: TownPiece[];
  /** The tall capital banner, standing beside the hall: foot x, z and the pole's height. */
  banner: { x: number; z: number; h: number } | null;
  /** A small pennant on the hall's roof, for a city that is not the capital. */
  pennant: { x: number; y: number; z: number } | null;
  walls: WallPlan | null;
}

/** The open square in the middle of a city, where a unit stands: no building reaches into it. */
export const SQUARE = 8;
/** The most houses a city shows (level 6 and up); the towers keep coming to level 6. */
export const MAX_HOUSES = 7;

// The hall, then the houses in the order a growing city adds them, then the towers.
const HALL: [number, number] = [0, -13];
const HOUSE_SLOTS: readonly [number, number, number][] = [
  [-14, 1, 0.35], [14, 0, -0.3], [-9, 13, 0.15], [10, 13, -0.2], [-17, -10, 0.5], [17, -10, -0.45], [0, 18, 0],
];
// The towers stand at the back corners, on the line of the walls when there are walls, so they read as part of them.
const TOWER_SLOTS: readonly [number, number][] = [[-13, -18], [13, -18]];

/** Houses for a city of level L: two at level 1, one more a level, up to MAX_HOUSES. */
export const housesFor = (level: number): number => Math.max(2, Math.min(MAX_HOUSES, Math.trunc(level) + 1));
/** Towers: one from level 4, two from level 6. */
export const towersFor = (level: number): number => (level >= 6 ? 2 : level >= 4 ? 1 : 0);
/** Houses that stand two storeys tall: from level 3, one more a level. */
export const tallFor = (level: number): number => Math.max(0, Math.trunc(level) - 2);

// The corner radius of the wall ring: inside the tile, clear of its edge.
export const WALL_R = 25.5;

export function wallPlan(): WallPlan {
  const corner = (i: number): [number, number] => {
    const a = ((30 + 60 * i) * Math.PI) / 180;
    return [WALL_R * Math.cos(a), WALL_R * Math.sin(a)];
  };
  const runs: WallPlan['runs'] = [];
  const towers: WallPlan['towers'] = [];
  let gate: WallPlan['gate'] = { x: 0, z: 0, rot: 0 };
  for (let i = 0; i < 6; i++) {
    const a = corner(i), b = corner((i + 1) % 6);
    towers.push(a);
    // Side i + 1 runs from corner i to corner i + 1 (normal at 60 (i + 1) degrees). The gate is in side 1, the front
    // right one, so it faces the viewer and a road can come in.
    if ((i + 1) % 6 === 1) {
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const gap = 7 / len;
      runs.push([a[0], a[1], a[0] + (b[0] - a[0]) * (0.5 - gap / 2), a[1] + (b[1] - a[1]) * (0.5 - gap / 2)]);
      runs.push([a[0] + (b[0] - a[0]) * (0.5 + gap / 2), a[1] + (b[1] - a[1]) * (0.5 + gap / 2), b[0], b[1]]);
      gate = { x: mx, z: mz, rot: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    } else {
      runs.push([a[0], a[1], b[0], b[1]]);
    }
  }
  return { runs, towers, gate };
}

const hash = (a: number, b: number): number => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** A city's buildings, banner and walls. */
export function townPlan(town: GlTown, q: number, r: number): TownPlan {
  const spartan = town.faction === 'spartans';
  const L = Math.max(1, Math.trunc(town.level));
  const pieces: TownPiece[] = [];
  const seed = (i: number): number => hash(q * 3.1 + i, r * 1.7 - i);
  const hallKind: TownKind = spartan ? (town.capital ? 'grandHall' : 'hall') : (town.capital ? 'greatYurt' : 'yurtHall');
  const hallFoot = town.capital ? 9.5 : 8;
  const hallH = spartan ? (town.capital ? 22 : 17) : (town.capital ? 21 : 15);
  pieces.push({ kind: hallKind, x: HALL[0], z: HALL[1], rot: 0, foot: hallFoot, h: hallH, seed: seed(0) });
  const n = housesFor(L), tall = tallFor(L);
  for (let i = 0; i < n; i++) {
    const [x, z, rot] = HOUSE_SLOTS[i]!;
    const high = i < tall;
    const kind: TownKind = spartan ? (high ? 'tall' : 'house') : (high ? 'tallYurt' : 'yurt');
    const h = spartan ? (high ? 17 : 11.5) : (high ? 13 : 10);
    pieces.push({ kind, x, z, rot: rot + (seed(i + 1) - 0.5) * 0.2, foot: 4.8, h, seed: seed(i + 1) });
  }
  for (let i = 0; i < towersFor(L); i++) {
    const [x, z] = TOWER_SLOTS[i]!;
    pieces.push({ kind: 'tower', x, z, rot: 0, foot: 3.4, h: spartan ? 26 : 24, seed: seed(20 + i) });
  }
  const banner = town.capital ? { x: 9, z: -7, h: 40 } : null;
  const pennant = town.capital ? null : { x: HALL[0], y: hallH + 1, z: HALL[1] };
  return { faction: town.faction, pieces, banner, pennant, walls: town.walls ? wallPlan() : null };
}

/** A village: two humble huts and a woodpile, mirrored by the tile's turn. */
export function villagePlan(v: number, turn: number, q: number, r: number): TownPlan {
  const m = turn % 2 === 0 ? 1 : -1;
  const s = (i: number): number => hash(q * 2.3 + i, r * 4.1 - i);
  const A: readonly [number, number, number, number][][] = [
    [[-11, -5, 0.3, 1], [11, 6, -0.4, 0.88]],
    [[-10, 5, 0.5, 0.92], [9, -7, -0.2, 1]],
    [[-12, -2, 0.1, 1], [8, 9, -0.6, 0.85]],
    [[-8, -9, 0.4, 0.95], [12, 3, -0.3, 0.9]],
  ];
  const pieces: TownPiece[] = A[v % 4]!.map(([x, z, rot, k], i) => ({ kind: 'hut', x: x * m, z, rot: rot * m, foot: 6.5 * k, h: 15 * k, seed: s(i) }));
  pieces.push({ kind: 'woodpile', x: 2 * m, z: 13, rot: 0.2 * m, foot: 3, h: 3, seed: s(9) });
  return { faction: null, pieces, banner: null, pennant: null, walls: null };
}

// ---------------------------------------------------------------------------------------------------------------
// The mine

/**
 * The mine's rock face, its front a cliff with the tunnel in it: the face's front plane (z), its middle (x), half its
 * width at the foot, its height, and how deep the tunnel runs into the mountain. The opening is a timber frame,
 * OPEN_W half wide and OPEN_H tall.
 */
export const MINE = { x: -3, z: 9, halfW: 14.5, h: 17.5, depth: 9, openW: 5.2, openH: 11.5 } as const;
/** Where the lantern hangs inside the tunnel (local to the tile), placed so the camera sees it through the frame. */
export const LANTERN = { x: MINE.x - MINE.openW + 1.4, y: 5.6, z: MINE.z - 3 } as const;
/** The foundry's furnace: beside the mine face, its glowing mouth facing the viewer. */
export const FURNACE = { x: 13, z: 5, mouthY: 2.6 } as const;

/** The mine's rock face must clear the main peak, which a mine moves back (layout.ts peaksFor). */
export const MINE_FLAT = { x0: MINE.x - MINE.halfW - 2, x1: MINE.x + MINE.halfW + 2, z0: MINE.z - MINE.depth - 2, z1: MINE.z + 10 } as const;

export interface LanternSpot {
  key: HexKey;
  kind: 'lantern' | 'furnace';
  /** World position of the light. */
  x: number;
  y: number;
  z: number;
  /** 0 or 1: which of the two flicker voices it follows, so most neighbouring mines do not flicker together. */
  voice: 0 | 1;
  box: { x0: number; x1: number; y0: number; y1: number };
}

/** Every mine lantern and foundry furnace on the map, in a stable order. */
export function lanternSpots(map: GlMap): LanternSpot[] {
  const out: LanternSpot[] = [];
  for (const k of Object.keys(map.tiles).sort()) {
    const t = map.tiles[k]!;
    if (t.city || t.terrain !== 'mountain' || (t.building !== 'mine' && t.building !== 'foundry')) continue;
    const { q, r } = parse(k);
    const c = centre(q, r);
    const voice = (((q * 3 + r) % 2) + 2) % 2 === 0 ? 0 : 1;
    const add = (kind: LanternSpot['kind'], x: number, y: number, z: number, v: 0 | 1): void => {
      const bx = c.x + x, by = (c.z + z) * SQUASH - y * COS_E;
      out.push({ key: k, kind, x: c.x + x, y, z: c.z + z, voice: v, box: { x0: bx - 8, x1: bx + 8, y0: by - 8, y1: by + 8 } });
    };
    add('lantern', LANTERN.x, LANTERN.y, LANTERN.z, voice);
    if (t.building === 'foundry') add('furnace', FURNACE.x, FURNACE.mouthY, FURNACE.z + 4.6, voice === 0 ? 1 : 0);
  }
  return out;
}

/**
 * The lantern's brightness at `t` seconds, with the motion level (0 still, 1 full): 1 is its steady glow. A flame's
 * slow breathing and two quicker wavers, never more than LANTERN_SWING either way and never faster than about 3 Hz,
 * so it flickers without strobing. Each frequency is a whole number of cycles per LANTERN_PERIOD, so the clock can
 * wrap seamlessly. Level 0 (reduced motion, or the board at rest) is the steady glow exactly.
 */
export const LANTERN_PERIOD = 1000;
export const LANTERN_SWING = 0.22;
const WAVES: readonly [number, number, number][] = [
  // [cycles per period, amplitude, phase]
  [430, 0.09, 0.0], [1270, 0.07, 1.3], [2930, 0.045, 2.1], [2210, 0.035, 4.4],
];
export function lanternFlicker(t: number, level: number, voice: 0 | 1 = 0): number {
  const lv = Math.min(1, Math.max(0, level));
  if (lv === 0) return 1;
  const tw = ((t % LANTERN_PERIOD) + LANTERN_PERIOD) % LANTERN_PERIOD;
  let s = 0;
  for (const [n, a, ph] of WAVES) s += a * Math.sin((2 * Math.PI * n * tw) / LANTERN_PERIOD + ph + voice * 2.7 * (1 + n / 3000));
  return 1 + lv * Math.max(-LANTERN_SWING, Math.min(LANTERN_SWING, s));
}

/** Whether a piece stands fully on the tile and clear of the square; for tests. */
export function pieceFits(p: TownPiece): boolean {
  return edgeDist(p.x, p.z) >= p.foot * 0.75 && Math.hypot(p.x, p.z) >= SQUARE + p.foot * 0.5;
}
