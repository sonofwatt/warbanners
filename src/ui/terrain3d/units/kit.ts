// A tiny geometry kit for the 3D unit figures: low-poly faceted parts with vertex colours, merged into one fill mesh
// and one hull mesh (the dark back-face outline), the way the terrain's props are drawn. Pure geometry from numbers:
// no model files, no textures, no randomness, so a figure built twice is the same to the last vertex.
//
// Figure space: feet on y = 0, x to the right of the screen, z toward the viewer, y up, in world units.
// `H(svgY)` turns a height from the SVG figures (feet near y 4, up negative) into world units, so a part placed at
// H(y) lands on the same screen pixel as the SVG part at y under the board's camera (elevation whose sine is 0.62).
import {
  BoxGeometry, BufferGeometry, Color, CylinderGeometry, Euler, ExtrudeGeometry, Float32BufferAttribute,
  IcosahedronGeometry, Matrix4, Quaternion, Shape, ShapeUtils, SphereGeometry, Vector2, Vector3,
} from 'three';

import { COS_E, SQUASH } from '../layout';

export { COS_E, SQUASH };
/** An SVG figure height (feet near y 4, up negative) as world units above the feet. */
export const H = (svgY: number): number => (4 - svgY) / COS_E;

export type V3 = readonly [number, number, number];
/** A flat polygon as [x0, y0, x1, y1, ...]. */
export type Poly = readonly number[];

interface Part {
  geo: BufferGeometry;
  colour: Color;
  gloss: number;
  /** How far the dark hull reaches out, as a multiple of the outline width; 0 = no hull. */
  hull: number;
  /** Decals bring their own normals (the surface they lie on); solids are faceted. */
  ownNormals: boolean;
  /** The moving piece the part belongs to (a trebuchet's arm), or null for the figure's fixed body. */
  piece: string | null;
}

export interface PartOpts { gloss?: number; hull?: number }

/** A part of a figure that moves on its own, about a pivot: its geometry is in figure space, as built. */
export interface BuiltPiece {
  fill: BufferGeometry;
  hull: BufferGeometry;
  /** The pivot point and the axis it turns about (unit length), in figure space. */
  pivot: V3;
  axis: V3;
}

export interface BuiltFigure {
  fill: BufferGeometry;
  hull: BufferGeometry;
  triangles: number;
  /** The moving pieces by name; their triangles are counted in `triangles`. */
  pieces: Record<string, BuiltPiece>;
}

const tmpQ = new Quaternion();
const tmpE = new Euler();

export class Kit {
  private readonly parts: Part[] = [];
  private mat = new Matrix4();
  private readonly stack: Matrix4[] = [];
  private decals = 0;
  private piece: string | null = null;
  private readonly pivots = new Map<string, { pivot: V3; axis: V3 }>();

  /**
   * Run `f` with every part it adds going to the moving piece `name`, which turns about `at` (in this frame) and
   * this frame's z axis (toward the viewer before any turn, so the piece swings in the figure's own plane).
   */
  pivot(name: string, at: V3, f: () => void): void {
    const p = new Vector3(...at).applyMatrix4(this.mat);
    const ax = new Vector3(0, 0, 1).transformDirection(this.mat);
    this.pivots.set(name, { pivot: [p.x, p.y, p.z], axis: [ax.x, ax.y, ax.z] });
    const was = this.piece;
    this.piece = name;
    f();
    this.piece = was;
  }

  /** Run `f` with a local frame: translate by t, then rotate (Euler XYZ radians, applied as Y then X then Z), then scale. */
  frame(t: V3, rot: V3, f: () => void, s: V3 = [1, 1, 1]): void {
    this.stack.push(this.mat.clone());
    tmpE.set(rot[0], rot[1], rot[2], 'YXZ');
    tmpQ.setFromEuler(tmpE);
    const local = new Matrix4().compose(new Vector3(...t), tmpQ, new Vector3(...s));
    this.mat = this.mat.clone().multiply(local);
    f();
    this.mat = this.stack.pop()!;
  }

  add(geo: BufferGeometry, colour: string | Color, o: PartOpts = {}, ownNormals = false): void {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.applyMatrix4(this.mat);
    this.parts.push({ geo: g, colour: new Color(colour), gloss: o.gloss ?? 0, hull: o.hull ?? 1, ownNormals, piece: this.piece });
  }

  // ---- solids ----

  /** A faceted ball (icosahedron), stretched by s. */
  ball(c: V3, r: number, colour: string, o: PartOpts & { s?: V3; detail?: number } = {}): void {
    const g = new IcosahedronGeometry(r, o.detail ?? 1);
    if (o.s) g.scale(...o.s);
    g.translate(...c);
    this.add(g, colour, o);
  }

  /** A tapered rod from a (radius r0) to b (radius r1), `seg` sided. */
  rod(a: V3, b: V3, r0: number, colour: string, o: PartOpts & { r1?: number; seg?: number; caps?: boolean } = {}): void {
    const va = new Vector3(...a), vb = new Vector3(...b);
    const len = va.distanceTo(vb);
    if (len < 1e-4) return;
    const g = new CylinderGeometry(o.r1 ?? r0, r0, len, o.seg ?? 6, 1, o.caps === false);
    g.translate(0, len / 2, 0);
    const dir = vb.clone().sub(va).normalize();
    g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir));
    g.translate(...a);
    this.add(g, colour, o);
  }

  /** A box centred on c, size s, turned by rot (YXZ). */
  box(c: V3, s: V3, colour: string, o: PartOpts & { rot?: V3 } = {}): void {
    const g = new BoxGeometry(...s);
    if (o.rot) g.applyQuaternion(tmpQ.setFromEuler(tmpE.set(o.rot[0], o.rot[1], o.rot[2], 'YXZ')).clone());
    g.translate(...c);
    this.add(g, colour, o);
  }

  /** A frustum standing on y0 up to y1, radii r0 (bottom) and r1 (top), squashed in z by sz. Turned so a flat face looks at +z. */
  frustum(c: V3, y0: number, y1: number, r0: number, r1: number, colour: string, o: PartOpts & { sz?: number; seg?: number; arc?: [number, number]; open?: boolean } = {}): void {
    const seg = o.seg ?? 8;
    // An arc (start, length in radians, 0 = toward +z, turning toward +x) leaves the rest open: a band with a gap.
    const g = new CylinderGeometry(r1, r0, y1 - y0, seg, 1, o.open ?? o.arc !== undefined, o.arc?.[0] ?? 0, o.arc?.[1] ?? Math.PI * 2);
    if (!o.arc) g.rotateY(Math.PI / seg);
    g.scale(1, 1, o.sz ?? 1);
    g.translate(c[0], (y0 + y1) / 2, c[2]);
    this.add(g, colour, o);
  }

  /** The upper part of a sphere (a cap or helmet dome), from the top down to polar angle `to` (pi/2 = a half). */
  dome(c: V3, r: number, colour: string, o: PartOpts & { to?: number; s?: V3; seg?: number } = {}): void {
    const g = new SphereGeometry(r, o.seg ?? 10, 4, 0, Math.PI * 2, 0, o.to ?? Math.PI / 2);
    if (o.s) g.scale(...o.s);
    g.translate(...c);
    this.add(g, colour, o);
  }

  /** A flat polygon extruded `depth` thick, centred on the z = 0 plane of a frame at `at` turned by `rot`. */
  slab(poly: Poly, depth: number, colour: string, at: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], o: PartOpts = {}): void {
    const shape = new Shape();
    shape.moveTo(poly[0]!, poly[1]!);
    for (let i = 2; i + 1 < poly.length; i += 2) shape.lineTo(poly[i]!, poly[i + 1]!);
    shape.closePath();
    const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
    g.translate(0, 0, -depth / 2);
    g.applyQuaternion(tmpQ.setFromEuler(tmpE.set(rot[0], rot[1], rot[2], 'YXZ')).clone());
    g.translate(...at);
    this.add(g, colour, o);
  }

  // ---- decals: texture-free marks, flat coloured polygons laid just over a surface, no hull ----

  /**
   * A flat mark: the polygon `poly` in this frame's x, y, lifted onto the surface by `surf`, which gives the surface
   * point and normal under (x, y). The mark floats 0.12 units over it so it never fights the surface for depth.
   */
  decal(poly: Poly, colour: string, surf: Surface): void {
    const contour: Vector2[] = [];
    for (let i = 0; i + 1 < poly.length; i += 2) contour.push(new Vector2(poly[i], poly[i + 1]));
    if (ShapeUtils.isClockWise(contour)) contour.reverse();
    const tris = ShapeUtils.triangulateShape(contour, []);
    // Later marks sit a hair higher, so marks laid over marks (an emblem's rings, a dent on a ring) never fight.
    const lift = 0.12 + Math.min(0.45, 0.012 * this.decals++);
    const pos: number[] = [], nor: number[] = [];
    for (const t of tris) {
      const vs = t.map((i) => {
        const v = contour[i]!;
        const s = surf(v.x, v.y);
        return { p: new Vector3(s.p[0] + s.n[0] * lift, s.p[1] + s.n[1] * lift, s.p[2] + s.n[2] * lift), n: s.n };
      });
      // Wind every triangle to face along the surface normal, whatever the surface maps x, y to.
      const face = vs[1]!.p.clone().sub(vs[0]!.p).cross(vs[2]!.p.clone().sub(vs[0]!.p));
      if (face.dot(new Vector3(...vs[0]!.n)) < 0) vs.reverse();
      for (const v of vs) { pos.push(v.p.x, v.p.y, v.p.z); nor.push(...v.n); }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
    this.add(g, colour, { hull: 0 }, true);
  }

  /** A painted line through the points, `w` wide, as a decal. */
  line(pts: Poly, w: number, colour: string, surf: Surface): void {
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const [x1, y1, x2, y2] = [pts[i]!, pts[i + 1]!, pts[i + 2]!, pts[i + 3]!];
      const l = Math.hypot(x2 - x1, y2 - y1) || 1;
      const nx = (-(y2 - y1) / l) * (w / 2), ny = ((x2 - x1) / l) * (w / 2);
      // Extend each segment by half a width so joints close.
      const ex = ((x2 - x1) / l) * (w / 2) * 0.8, ey = ((y2 - y1) / l) * (w / 2) * 0.8;
      this.decal([x1 - ex + nx, y1 - ey + ny, x2 + ex + nx, y2 + ey + ny, x2 + ex - nx, y2 + ey - ny, x1 - ex - nx, y1 - ey - ny], colour, surf);
    }
  }

  build(outlineScale = 1): BuiltFigure {
    let triangles = 0;
    const groups = new Map<string | null, { fills: BufferGeometry[]; hulls: BufferGeometry[] }>([[null, { fills: [], hulls: [] }]]);
    for (const p of this.parts) {
      let grp = groups.get(p.piece);
      if (grp === undefined) { grp = { fills: [], hulls: [] }; groups.set(p.piece, grp); }
      const { fills, hulls } = grp;
      const g = p.geo;
      // Solids are faceted (the geometry is non-indexed); decal normals were given and turned by applyMatrix4.
      if (!p.ownNormals) g.computeVertexNormals();
      const pos = g.attributes.position!;
      const n = pos.count;
      triangles += n / 3;
      const cols = new Float32Array(n * 3), gl = new Float32Array(n), out = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        cols[i * 3] = p.colour.r; cols[i * 3 + 1] = p.colour.g; cols[i * 3 + 2] = p.colour.b;
        gl[i] = p.gloss;
      }
      if (p.hull > 0) {
        // The hull pushes each corner out along the mean of the face normals that meet there, so a faceted part
        // keeps a closed, even outline (pushing from the part's centre thins it along long rods).
        const nor = g.attributes.normal!;
        const acc = new Map<string, [number, number, number]>();
        const key = (i: number): string => `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
        for (let i = 0; i < n; i++) {
          const k = key(i);
          const a = acc.get(k) ?? [0, 0, 0];
          a[0] += nor.getX(i); a[1] += nor.getY(i); a[2] += nor.getZ(i);
          acc.set(k, a);
        }
        for (let i = 0; i < n; i++) {
          const a = acc.get(key(i))!;
          const l = Math.hypot(a[0], a[1], a[2]) || 1;
          out[i * 3] = (a[0] / l) * p.hull * outlineScale;
          out[i * 3 + 1] = (a[1] / l) * p.hull * outlineScale;
          out[i * 3 + 2] = (a[2] / l) * p.hull * outlineScale;
        }
      }
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
      g.setAttribute('color', new Float32BufferAttribute(cols, 3));
      g.setAttribute('aGloss', new Float32BufferAttribute(gl, 1));
      g.setAttribute('aOut', new Float32BufferAttribute(out, 3));
      fills.push(g);
      if (p.hull > 0) hulls.push(g);
    }
    const mergeOf = (k: string | null): { fill: BufferGeometry; hull: BufferGeometry } => {
      const { fills, hulls } = groups.get(k)!;
      const fill = merge(fills);
      const hull = merge(hulls);
      for (const g of fills) g.dispose();
      return { fill, hull };
    };
    const pieces: Record<string, BuiltPiece> = {};
    for (const k of groups.keys()) {
      if (k === null) continue;
      const at = this.pivots.get(k)!;
      pieces[k] = { ...mergeOf(k), pivot: at.pivot, axis: at.axis };
    }
    return { ...mergeOf(null), triangles, pieces };
  }
}

function merge(list: BufferGeometry[]): BufferGeometry {
  // A plain concatenation (every part has the same four attributes and no index).
  const names = ['position', 'normal', 'color', 'aGloss', 'aOut'];
  const out = new BufferGeometry();
  for (const name of names) {
    const size = list[0]?.attributes[name]?.itemSize ?? (name === 'aGloss' ? 1 : 3);
    let total = 0;
    for (const g of list) total += g.attributes[name]!.array.length;
    const arr = new Float32Array(total);
    let o = 0;
    for (const g of list) { arr.set(g.attributes[name]!.array as Float32Array, o); o += g.attributes[name]!.array.length; }
    out.setAttribute(name, new Float32BufferAttribute(arr, size));
  }
  return out;
}

// ---- surfaces for decals ----

export interface SurfacePoint { p: V3; n: V3 }
export type Surface = (x: number, y: number) => SurfacePoint;

/** A flat face at depth z, facing +z (a shield's face in its own frame). */
export const flat = (z: number): Surface => (x, y) => ({ p: [x, y, z], n: [0, 0, 1] });

/** The front of a sphere of radius r centred on c, seen along +z: (x, y) are frame coordinates. */
export const onSphere = (c: V3, r: number): Surface => (x, y) => {
  const dx = x - c[0], dy = y - c[1];
  const dz = Math.sqrt(Math.max(0.0001, r * r - dx * dx - dy * dy));
  return { p: [x, y, c[2] + dz], n: [dx / r, dy / r, dz / r] };
};

/** The front of an upright elliptic frustum (a tunic): radius r0 at y0 to r1 at y1, depth squashed by sz. */
export const onFrustum = (c: V3, y0: number, y1: number, r0: number, r1: number, sz: number): Surface => (x, y) => {
  const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
  const r = r0 + (r1 - r0) * t;
  const dx = Math.max(-r * 0.98, Math.min(r * 0.98, x - c[0]));
  const z = sz * Math.sqrt(r * r - dx * dx) * Math.cos(Math.PI / 8);
  const n = new Vector3(dx / (r * r), (r0 - r1) / (y1 - y0) * 0.6 / r, z / (sz * sz * r * r) || 0).normalize();
  return { p: [x, y, c[2] + z], n: [n.x, n.y, n.z] };
};

/** Flat ground at height y (blood drops fallen at the feet). */
export const ground = (y = 0.05): Surface => (x, z) => ({ p: [x, y, z], n: [0, 1, 0] });

/** A colour mixed toward another by t (a dent's dark over the surface colour, without any blending at draw time). */
export function mix(a: string, b: string, t: number): string {
  return '#' + new Color(a).lerp(new Color(b), t).getHexString();
}
