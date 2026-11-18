import { CONFIG } from './data/config';
import { distance, key, mirror, neighbors, parseKey, range } from './hex';
import type { Hex, HexKey } from './hex';
import { rngInt } from './rng';
import type { Resource, Terrain, Tile } from './types';

export interface GeneratedMap { tiles: Record<HexKey, Tile>; villages: HexKey[]; treasures: HexKey[]; rng: number; attempts: number; }

// Algorithm constant (not a game number): spreads attempt seeds apart.
const ATTEMPT_SEED_STEP = 0x9e3779b9;

const CENTER: Hex = { q: 0, r: 0 };

function inHalf(h: Hex): boolean {
  return h.r > 0 || (h.r === 0 && h.q < 0);
}

function makeTile(terrain: Terrain, resource: Resource | null): Tile {
  return { terrain, resource, building: null, road: false, village: false, treasure: false, cityId: null };
}

function attemptSeed(seed: number, n: number): number {
  return (seed + Math.imul(n, ATTEMPT_SEED_STEP)) >>> 0;
}

function terrainFor(roll: number): Terrain {
  const m = CONFIG.mapgen;
  if (roll < m.field) return 'field';
  if (roll < m.forest) return 'forest';
  if (roll < m.mountain) return 'mountain';
  return 'water';
}

function resourceFor(terrain: Terrain, roll: number): Resource | null {
  const m = CONFIG.mapgen;
  if (terrain === 'field') {
    if (roll < m.orchard) return 'orchard';
    if (roll < m.cropland) return 'cropland';
  } else if (terrain === 'forest') {
    if (roll < m.game) return 'game';
  } else if (terrain === 'mountain') {
    if (roll < m.ore) return 'ore';
  }
  return null;
}

// Fisher-Yates from the end of the array down.
function shuffle<T>(items: T[], state: number): [T[], number] {
  const a = items.slice();
  let s = state;
  for (let i = a.length - 1; i > 0; i--) {
    const [j, next] = rngInt(s, i + 1);
    s = next;
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return [a, s];
}

// Place villages then treasures on the half-map `half` (terrain and resources already set).
// Returns the chosen half-keys and the rng state, or null when too few could be placed.
function placeFeatures(half: Map<HexKey, Tile>, halfOrder: Hex[], state: number, capitals: Hex[]): { villages: Hex[]; treasures: Hex[]; rng: number } | null {
  const m = CONFIG.mapgen;
  const farFromCapitals = (h: Hex, min: number): boolean => capitals.every((c) => distance(h, c) >= min);
  const clear = (h: Hex, placed: Hex[], min: number): boolean =>
    distance(h, mirror(h)) >= min && placed.every((p) => distance(h, p) >= min && distance(h, mirror(p)) >= min);

  let s = state;
  const villageCandidates = halfOrder.filter((h) => {
    const t = half.get(key(h))!;
    return (t.terrain === 'field' || t.terrain === 'forest') && farFromCapitals(h, m.villageMinDistance);
  });
  let shuffled: Hex[];
  [shuffled, s] = shuffle(villageCandidates, s);
  const villages: Hex[] = [];
  for (const h of shuffled) {
    if (villages.length >= m.villagesPerHalf) break;
    if (clear(h, villages, m.villageMinDistance)) villages.push(h);
  }
  if (villages.length < m.villagesPerHalf) return null;
  for (const v of villages) {
    const t = half.get(key(v))!;
    t.terrain = 'field';
    t.resource = null;
    t.village = true;
  }

  const treasureCandidates = halfOrder.filter((h) => {
    const t = half.get(key(h))!;
    return (t.terrain === 'field' || t.terrain === 'forest') && farFromCapitals(h, m.treasureMinCapitalDistance);
  });
  [shuffled, s] = shuffle(treasureCandidates, s);
  const treasures: Hex[] = [];
  for (const h of shuffled) {
    if (treasures.length >= m.treasuresPerHalf) break;
    if (clear(h, [...villages, ...treasures], m.treasureMinFeatureDistance)) treasures.push(h);
  }
  if (treasures.length < m.treasuresPerHalf) return null;
  for (const h of treasures) {
    const t = half.get(key(h))!;
    t.resource = null;
    t.treasure = true;
  }
  return { villages, treasures, rng: s };
}

function assemble(radius: number, half: Map<HexKey, Tile>, villages: Hex[], treasures: Hex[]): { tiles: Record<HexKey, Tile>; villages: HexKey[]; treasures: HexKey[] } {
  const tiles: Record<HexKey, Tile> = {};
  const order = range(CENTER, radius);
  for (const h of order) {
    const src = half.get(key(h)) ?? half.get(key(mirror(h)));
    tiles[key(h)] = src ? { ...src } : makeTile('field', null);
  }
  const vSet = new Set<HexKey>();
  const tSet = new Set<HexKey>();
  for (const v of villages) { vSet.add(key(v)); vSet.add(key(mirror(v))); }
  for (const t of treasures) { tSet.add(key(t)); tSet.add(key(mirror(t))); }
  const keys = order.map(key);
  return { tiles, villages: keys.filter((k) => vSet.has(k)), treasures: keys.filter((k) => tSet.has(k)) };
}

export function isConnected(tiles: Record<HexKey, Tile>, from: HexKey, targets: HexKey[]): boolean {
  const start = tiles[from];
  if (!start || start.terrain === 'water') return false;
  const seen = new Set<HexKey>([from]);
  const queue: HexKey[] = [from];
  for (let i = 0; i < queue.length; i++) {
    for (const n of neighbors(parseKey(queue[i]!))) {
      const k = key(n);
      const t = tiles[k];
      if (!t || t.terrain === 'water' || seen.has(k)) continue;
      seen.add(k);
      queue.push(k);
    }
  }
  return targets.every((t) => seen.has(t));
}

export function generateMap(seed: number, radius: number): GeneratedMap {
  const capitals = CONFIG.capitals.map(parseKey);
  const halfOrder = range(CENTER, radius).filter(inHalf);

  for (let n = 0; n < CONFIG.mapgen.maxAttempts; n++) {
    let s = attemptSeed(seed, n);
    const half = new Map<HexKey, Tile>();
    const terrains: Terrain[] = [];
    for (const _h of halfOrder) {
      let roll: number;
      [roll, s] = rngInt(s, CONFIG.mapgen.rollRange);
      terrains.push(terrainFor(roll));
    }
    halfOrder.forEach((h, i) => half.set(key(h), makeTile(terrains[i]!, null)));
    const capital = capitals[0]!;
    half.get(key(capital))!.terrain = 'field';
    for (const nb of neighbors(capital)) {
      const t = half.get(key(nb));
      if (t && t.terrain === 'water') t.terrain = 'field';
    }
    // One draw per tile of the half, so the stream does not depend on terrain.
    for (const h of halfOrder) {
      let roll: number;
      [roll, s] = rngInt(s, CONFIG.mapgen.rollRange);
      const t = half.get(key(h))!;
      t.resource = resourceFor(t.terrain, roll);
    }
    // The capital is a plain field: the draw above is kept so the stream is unchanged.
    half.get(key(capital))!.resource = null;
    const placed = placeFeatures(half, halfOrder, s, capitals);
    if (!placed) continue;
    const out = assemble(radius, half, placed.villages, placed.treasures);
    if (isConnected(out.tiles, CONFIG.capitals[0], [CONFIG.capitals[1], ...out.villages, ...out.treasures])) {
      return { ...out, rng: placed.rng, attempts: n + 1 };
    }
  }

  // Fallback: plain fields, features placed by the same steps from the last attempt's seed.
  const last = CONFIG.mapgen.maxAttempts - 1;
  const half = new Map<HexKey, Tile>();
  for (const h of halfOrder) half.set(key(h), makeTile('field', null));
  const placed = placeFeatures(half, halfOrder, attemptSeed(seed, last), capitals);
  const out = assemble(radius, half, placed?.villages ?? [], placed?.treasures ?? []);
  return { ...out, rng: placed?.rng ?? attemptSeed(seed, last), attempts: CONFIG.mapgen.maxAttempts };
}
