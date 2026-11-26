// Territory borders in the 3D scene. The svg draws each border as a 2.4 unit line just inside the tile's top face;
// over the 3D terrain that line would run across the front of a mountain, a city or a tree standing in front of it.
// Here the same lines lie on the ground as flat strips, built in board space (so on screen they have exactly the svg
// line's width and round caps) and lifted onto the ground's height. They are drawn twice with the depth test: where
// nothing stands in front, at full strength; where something does, faintly (HIDDEN_ALPHA), so the border reads as
// passing behind it. One mesh for the whole map, rebuilt only when the borders change.
import {
  BufferGeometry, DoubleSide, Float32BufferAttribute, GreaterDepth, Group, LessEqualDepth, Mesh, ShaderMaterial,
} from 'three';
import { bordersKey, tileCode } from './codes';
import type { GlMap } from './input';
import { centre, COS_E, EDGE_NB, heightFn, parse, SQUASH, tileSetup } from './layout';

/** How strongly the hidden part of a border shows through what stands in front of it. */
export const HIDDEN_ALPHA = 0.25;
/** How far above the ground the strip floats, in world units, so the ground never cuts into it. */
const LIFT = 0.35;
const STEPS = 8; // pieces per line, so the strip follows the ground's rise and fall
const CAP = 6; // sides of each round cap's half fan
/** The border line's width on screen, in board units: art/tiles.tsx BORDER_WIDTH (a test keeps them equal). */
export const STRIP_WIDTH = 2.4;

export interface BorderStrip {
  /** Triangle corners in board space (x, y) and their ground point's world height, flat: x, y, h per corner. */
  tris: number[];
  colour: string;
}

/**
 * The strips for the map's borders, in board units round the board origin, with the ground's height under each
 * corner. Pure (no three.js objects), so it can be tested.
 */
export function borderStrips(map: GlMap): BorderStrip[] {
  const out: BorderStrip[] = [];
  const half = STRIP_WIDTH / 2;
  for (const b of map.borders ?? []) {
    const t = map.tiles[b.key];
    if (t === undefined) continue;
    const { q, r } = parse(b.key);
    const c = centre(q, r);
    const bx = c.x, by = c.z * SQUASH; // the tile centre on the board
    const height = heightFn(tileSetup(map, b.key));
    const base = t.terrain === 'water' ? -2.2 : 0;
    // A board point (tile-local) on the ground: the strip's world height there. The point drawn at board (x, y) with
    // height h is world (x, h, (y + h COS_E) / SQUASH), so the height is found by a few rounds of a fixed point.
    const hAt = (x: number, y: number): number => {
      let h = base;
      for (let i = 0; i < 24; i++) h = (h + base + height(x, (y + (h + LIFT) * COS_E) / SQUASH)) / 2; // damped: the scree is steep
      return h;
    };
    const tris: number[] = [];
    const push = (x: number, y: number): void => { tris.push(bx + x, by + y, hAt(x, y) + LIFT); };
    for (const [ax, ay, bx, by] of b.lines) {
      const a = { x: ax, y: ay }, e = { x: bx, y: by };
      const dx = e.x - a.x, dy = e.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * half, ny = (dx / len) * half;
      for (let i = 0; i < STEPS; i++) {
        const u0 = i / STEPS, u1 = (i + 1) / STEPS;
        const x0 = a.x + dx * u0, y0 = a.y + dy * u0, x1 = a.x + dx * u1, y1 = a.y + dy * u1;
        push(x0 + nx, y0 + ny); push(x0 - nx, y0 - ny); push(x1 + nx, y1 + ny);
        push(x1 + nx, y1 + ny); push(x0 - nx, y0 - ny); push(x1 - nx, y1 - ny);
      }
      // Round caps, as the svg line's.
      for (const [px, py, sx, sy] of [[a.x, a.y, -dx / len, -dy / len], [e.x, e.y, dx / len, dy / len]] as const) {
        const a0 = Math.atan2(ny, nx);
        const turn = Math.atan2(sy, sx) - a0 > 0 ? 1 : -1;
        for (let k = 0; k < CAP; k++) {
          const t0 = a0 + (turn * Math.PI * k) / CAP, t1 = a0 + (turn * Math.PI * (k + 1)) / CAP;
          push(px, py);
          push(px + half * Math.cos(t0), py + half * Math.sin(t0));
          push(px + half * Math.cos(t1), py + half * Math.sin(t1));
        }
      }
    }
    out.push({ tris, colour: b.colour });
  }
  return out;
}

const vert = /* glsl */ `
attribute vec3 aColour;
varying vec3 vColour;
void main() {
  vColour = aColour;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}`;
const frag = /* glsl */ `
uniform float uAlpha;
varying vec3 vColour;
void main() { gl_FragColor = vec4(vColour, uAlpha); }`;

function geometryOf(strips: readonly BorderStrip[]): BufferGeometry {
  const pos: number[] = [], col: number[] = [];
  for (const s of strips) {
    const hex = s.colour.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16) / 255, g = parseInt(hex.slice(2, 4), 16) / 255, b = parseInt(hex.slice(4, 6), 16) / 255;
    for (let i = 0; i < s.tris.length; i += 3) {
      const x = s.tris[i]!, y = s.tris[i + 1]!, h = s.tris[i + 2]!;
      pos.push(x, h, (y + h * COS_E) / SQUASH);
      col.push(r, g, b);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('aColour', new Float32BufferAttribute(col, 3));
  return geo;
}

export interface Borders {
  readonly group: Group;
  setMap(map: GlMap): void;
  /** Triangles in the border mesh, for tests and the report. */
  triangles(): number;
  dispose(): void;
}

export function createBorders(): Borders {
  // Both passes leave the depth buffer alone; the front pass draws where the strip is the nearest thing, the hidden
  // pass only where something already drawn stands in front of it. Overlapping caps never double up: the front pass
  // is opaque, and the hidden pass is faint enough that a doubled corner does not show.
  const mk = (alpha: number, front: boolean): ShaderMaterial => new ShaderMaterial({
    uniforms: { uAlpha: { value: alpha } }, vertexShader: vert, fragmentShader: frag,
    // The strips' triangles wind either way, so both sides are drawn.
    transparent: !front, depthWrite: false, side: DoubleSide, depthFunc: front ? LessEqualDepth : GreaterDepth,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  const frontMat = mk(1, true), hiddenMat = mk(HIDDEN_ALPHA, false);
  const group = new Group();
  const front = new Mesh(new BufferGeometry(), frontMat);
  const hidden = new Mesh(front.geometry, hiddenMat);
  for (const m of [front, hidden]) m.frustumCulled = false;
  // After the ground and the props, so the depth buffer already holds everything that can stand in front.
  front.renderOrder = 5;
  hidden.renderOrder = 6;
  group.add(front, hidden);
  let sig: string | null = null;
  return {
    group,
    setMap(map) {
      // The strips follow the ground, which depends on the tile and its neighbours: they rebuild when those change.
      const ground = (map.borders ?? []).map((b) => {
        const { q, r } = parse(b.key);
        return [b.key, ...EDGE_NB.map(([dq, dr]) => `${q + dq},${r + dr}`)].map((k) => { const t = map.tiles[k]; return t === undefined ? 'x' : tileCode(t, false); }).join(',');
      }).join(' ');
      const k = `${bordersKey(map.borders)}|${ground}`;
      if (k === sig) return;
      sig = k;
      front.geometry.dispose();
      front.geometry = geometryOf(borderStrips(map));
      hidden.geometry = front.geometry;
    },
    triangles: () => (front.geometry.attributes.position?.count ?? 0) / 3,
    dispose() {
      front.geometry.dispose();
      frontMat.dispose();
      hiddenMat.dispose();
      group.clear();
    },
  };
}
