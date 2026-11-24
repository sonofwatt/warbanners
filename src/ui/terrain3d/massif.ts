// Mountain options for David to choose from (exploration only, not shipped): three more natural mountain forms
// built as faceted heightfields over the tile, in place of the Matterhorn peaks.
//   A: a broad massif, rounded shoulders, one blunt summit and lower humps
//   B: a short range of linked peaks across the tile, saddles between, eroded faces
//   C: a lower rocky crag with cliffs and ledges, a flat top, boulders at its foot
// Tall parts stay at the back of the tile (negative z), so the middle front, where a unit stands, stays low.
import { BufferGeometry, Color, DodecahedronGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { edgeDist, hash2, smooth, vnoise } from './layout';

export type MountainStyle = 'peak' | 'A' | 'B' | 'C';

const ROCK = { light: '#9C958C', mid: '#918A81', dark: '#857F78', cliff: '#7A746D', scree: '#AEA597', snow: '#F6F8FB', snowShade: '#E9EEF4' };
const ORE_ROCK = { light: '#8E7A6C', mid: '#83705F', dark: '#6F5F55', cliff: '#63544A', scree: '#A68E7C', snow: '#F6F8FB', snowShade: '#E9EEF4' };

const softMax = (a: number, b: number, k = 3): number => {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return a * (1 - h) + b * h + k * h * (1 - h);
};

/** Height of the mountain above the tile at local (x, z), before the edge fade. */
function heightOf(style: MountainStyle, x: number, z: number, q: number, r: number): number {
  const n = (s: number, o = 0): number => vnoise(x * s + q * 3.1 + o, z * s + r * 1.7 - o);
  if (style === 'A') {
    // A broad massif: a wide base over most of the tile, one blunt summit at the back, three lower humps around
    // it, rounded shoulders and an irregular ridgeline.
    const bumps: [number, number, number, number][] = [[1, -9, 35, 16], [-16, -1, 21, 10.5], [15, -2, 18, 10], [-7, -17, 24, 10]];
    let h = 0;
    for (const [bx, bz, H, rad] of bumps) {
      const d = Math.hypot(x - bx, (z - bz) * 1.1);
      const k = Math.max(0, 1 - (d / rad) ** 2);
      h = softMax(h, H * Math.pow(k, 0.75), 1.5);
    }
    h = softMax(h, 8 * smooth(28, 6, Math.hypot(x * 0.85, z + 5)), 3); // the broad base
    h += 3.0 * (n(0.16) - 0.5) * smooth(3, 12, h);
    return Math.min(h, 32 + 1.5 * n(0.3, 5)); // a blunt top
  }
  if (style === 'B') {
    // A short range: four linked rounded peaks of varied heights across the back of the tile, gentle saddles.
    const zc = (px: number): number => -9 + 2.5 * Math.sin(px * 0.11 + q);
    const peaks: [number, number][] = [[-16, 22], [-5, 34], [7, 29], [17, 19]];
    let h = 0;
    for (const [px, H] of peaks) {
      const d = Math.hypot(x - px, (z - zc(px)) * 1.1);
      const k = Math.max(0, 1 - d / 14);
      h = softMax(h, H * k * k * (3 - 2 * k), 3); // smooth shoulders, a rounded top
    }
    // The ridge that links them: a saddle at about half the peaks' height.
    const across = Math.abs(z - zc(x));
    const along = smooth(25, 15, Math.abs(x));
    const kr = Math.max(0, 1 - across / 12);
    h = softMax(h, 17 * along * kr * kr * (3 - 2 * kr), 4);
    // Eroded faces: shallow gullies down the slopes, scree at the foot.
    h -= 1.6 * smooth(0.6, 0.85, vnoise(x * 0.25 + q, z * 0.07 + r)) * smooth(6, 18, h);
    h += 1.2 * (n(0.2) - 0.5) * smooth(2, 8, h);
    return Math.max(0, h);
  }
  // C: a rocky crag: a low, chunky mass of three blocks with cliffs between uneven ledges and a tilted flat top.
  const blocks: [number, number, number, number, number][] = [[-2, -7, 15, 10, 22], [-12, -2, 9, 7, 14], [11, -4, 9, 7, 16]];
  let raw = 0;
  for (const [bx, bz, rx, rz, H] of blocks) {
    const e = Math.hypot((x - bx) / rx, (z - bz) / rz) + 0.3 * (vnoise(x * 0.1 + bx, z * 0.1 + bz) - 0.5);
    raw = Math.max(raw, H * smooth(1.05, 0.62, e) + 0.12 * (bz - z));
  }
  const step = 6 + 1.5 * n(0.05, 3);
  const ledge = Math.floor(raw / step);
  const frac = raw / step - ledge;
  const h = (ledge + smooth(0.45, 0.8, frac)) * step + 1.4 * (n(0.25, 2) - 0.5) * smooth(1, 4, raw);
  return Math.max(0, Math.min(h, 24 + 1.2 * n(0.3, 9)));
}

export interface Massif { parts: BufferGeometry[]; deposits: { x: number; z: number; y: number; s: number; seed: number }[]; top: number }

/** The mountain for one tile, around its centre (cx, cz); `shift` moves it back when ore, a mine or a treasure shares the tile. */
export function massif(style: MountainStyle, cx: number, cz: number, q: number, r: number, ore: boolean, shift: number): Massif {
  const pal = ore ? ORE_ROCK : ROCK;
  const H = (x: number, z: number): number => {
    const fade = smooth(0.5, 7, edgeDist(x, z));
    return heightOf(style, x, z + shift, q, r) * (shift ? 0.92 : 1) * fade;
  };
  // A jittered triangle lattice over the tile, so the faces read as hand-cut facets.
  const STEP = 3.1;
  const rows: { x: number; z: number; y: number; ok: boolean }[][] = [];
  for (let j = -11; j <= 11; j++) {
    const row: { x: number; z: number; y: number; ok: boolean }[] = [];
    for (let i = -12; i <= 12; i++) {
      const jx = (hash2(i * 1.3 + q, j * 2.1 + r) - 0.5) * 1.2, jz = (hash2(j * 0.7 - q, i * 1.9 - r) - 0.5) * 1.2;
      const x = (i + (j % 2 ? 0.5 : 0)) * STEP + jx, z = j * STEP * 0.866 + jz;
      const inside = edgeDist(x, z) > 0.3;
      row.push({ x, z, y: inside ? H(x, z) : 0, ok: inside });
    }
    rows.push(row);
  }
  type P = { x: number; z: number; y: number; ok: boolean };
  const tris: [P, P, P][] = [];
  for (let j = 0; j + 1 < rows.length; j++) {
    const a = rows[j]!, b = rows[j + 1]!;
    const odd = (j - 11) % 2 !== 0;
    for (let i = 0; i + 1 < a.length; i++) {
      const t1: [P, P, P] = odd ? [a[i]!, b[i + 1]!, a[i + 1]!] : [a[i]!, b[i]!, a[i + 1]!];
      const t2: [P, P, P] = odd ? [a[i]!, b[i]!, b[i + 1]!] : [a[i + 1]!, b[i]!, b[i + 1]!];
      for (const t of [t1, t2]) if (t.every((p) => p.ok) && t.some((p) => p.y > 1.2)) tris.push(t);
    }
  }
  let top = 0;
  for (const row of rows) for (const p of row) top = Math.max(top, p.y);
  const pos: number[] = [], col: number[] = [], gl: number[] = [], od: number[] = [];
  const c = new Color();
  const u = new Vector3(), v = new Vector3(), nrm = new Vector3(), d = new Vector3();
  const snowLine = style === 'A' ? 27 : style === 'B' ? 27 : 21;
  for (const t of tris) {
    // Face up: wind each triangle so its normal points up (the camera never sees under the mountain).
    let [p0, p1, p2] = t;
    u.set(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
    v.set(p2.x - p0.x, p2.y - p0.y, p2.z - p0.z);
    nrm.crossVectors(u, v);
    if (nrm.y < 0) { [p1, p2] = [p2, p1]; nrm.negate(); }
    nrm.normalize();
    const hm = (p0.y + p1.y + p2.y) / 3;
    const mx = (p0.x + p1.x + p2.x) / 3, mz = (p0.z + p1.z + p2.z) / 3;
    const wob = 2.2 * (vnoise(mx * 0.2 + q, mz * 0.2 + r) - 0.5);
    let tone: string;
    if (hm > snowLine + wob && nrm.y > 0.32) tone = nrm.x > 0.15 ? pal.snowShade : pal.snow;
    else if (hm < 3.2 + wob * 0.5) tone = pal.scree;
    else if (nrm.y < 0.42) tone = pal.cliff;
    else { const k = hash2(Math.round(mx * 0.3) + q, Math.round(mz * 0.3) + r); tone = k < 0.33 ? pal.light : k < 0.66 ? pal.mid : pal.dark; }
    c.set(tone);
    for (const p of [p0, p1, p2]) {
      pos.push(cx + p.x, p.y - 0.4, cz + p.z);
      col.push(c.r, c.g, c.b);
      gl.push(-1);
      d.set(p.x, (p.y / Math.max(top, 1) - 0.5) * 8, p.z + 4).normalize().multiplyScalar(p.y > 2 ? 0.7 : 0.15);
      od.push(d.x, d.y, d.z);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setAttribute('aGloss', new Float32BufferAttribute(gl, 1));
  g.setAttribute('aOut', new Float32BufferAttribute(od, 3));
  const parts: BufferGeometry[] = [g];

  // C: boulders around the crag's foot, on the sides and back, not in the middle front.
  if (style === 'C') {
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI + (i / 8) * Math.PI * 1.9 + hash2(i, q) * 0.3;
      const x = Math.cos(a) * 19, z = -6 + Math.sin(a) * 14;
      if (Math.hypot(x, z) < 12 || edgeDist(x, z) < 3) continue;
      const s = 1.4 + 1.6 * hash2(q + i, r * 2 - i);
      const b = new DodecahedronGeometry(s, 0);
      b.rotateY(i * 1.7); b.scale(1.2, 0.75, 1);
      b.translate(cx + x, H(x, z) + s * 0.4, cz + z);
      parts.push(boulder(b, pal.dark));
    }
  }

  // Ore: deposits on the faces that look at the viewer, a little way up, off the middle of the tile.
  const deposits: Massif['deposits'] = [];
  if (ore) {
    for (let i = 0; i < 80 && deposits.length < 7; i++) {
      const x = (hash2(i * 1.7 + q, r - i) - 0.5) * 44, z = (hash2(r + i * 0.9, q * 1.3 - i) - 0.5) * 40;
      if (edgeDist(x, z) < 4 || Math.hypot(x, z) < 11) continue;
      const y = H(x, z);
      const slope = H(x, z + 1.5) - H(x, z - 1.5); // < 0: the face looks toward the viewer
      if (y < 2 || y > top * 0.6 || slope > 0.4) continue;
      if (deposits.some((o) => Math.hypot(o.x - x, o.z - z) < 7)) continue;
      deposits.push({ x, z, y, s: 0.38 + 0.3 * hash2(i, q + r), seed: hash2(q * 1.3 + i, r * 2.1 - i) });
    }
  }
  return { parts, deposits, top };
}

function boulder(g: BufferGeometry, colour: string): BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  n.computeVertexNormals();
  const p = n.attributes.position!;
  const c = new Color(colour);
  const cols = new Float32Array(p.count * 3), gl = new Float32Array(p.count).fill(-1), od = new Float32Array(p.count * 3);
  n.computeBoundingBox();
  const mid = new Vector3();
  n.boundingBox!.getCenter(mid);
  const d = new Vector3();
  for (let i = 0; i < p.count; i++) {
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    d.set(p.getX(i) - mid.x, p.getY(i) - mid.y, p.getZ(i) - mid.z).normalize().multiplyScalar(0.35);
    od[i * 3] = d.x; od[i * 3 + 1] = d.y; od[i * 3 + 2] = d.z;
  }
  n.setAttribute('color', new Float32BufferAttribute(cols, 3));
  n.setAttribute('aGloss', new Float32BufferAttribute(gl, 1));
  n.setAttribute('aOut', new Float32BufferAttribute(od, 3));
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'color', 'aGloss', 'aOut'].includes(k)) n.deleteAttribute(k);
  return n;
}
