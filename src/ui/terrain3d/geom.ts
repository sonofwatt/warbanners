// Small helpers shared by the 3D props: vertex colour a part for the toon prop shader, and place it.
import { BufferGeometry, Color, Float32BufferAttribute, Vector3 } from 'three';

/**
 * Make a part ready for the merged prop mesh: faceted normals, one colour, a glint (gloss) and the outline's push
 * (each corner pushed out from the part's centre, so faceted parts keep a closed hull; 0 for no outline).
 */
export function coloured(geo: BufferGeometry, colour: string, gloss = 0, outline = 1): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.computeVertexNormals(); // faceted
  const col = new Color(colour);
  const p = g.attributes.position!;
  const n = p.count;
  const cols = new Float32Array(n * 3), gl = new Float32Array(n), od = new Float32Array(n * 3);
  g.computeBoundingBox();
  const mid = new Vector3();
  g.boundingBox!.getCenter(mid);
  const d = new Vector3();
  for (let i = 0; i < n; i++) {
    cols[i * 3] = col.r; cols[i * 3 + 1] = col.g; cols[i * 3 + 2] = col.b;
    gl[i] = gloss;
    // The outline pushes each corner out from the part's centre, so faceted parts keep a closed hull.
    d.set(p.getX(i) - mid.x, p.getY(i) - mid.y, p.getZ(i) - mid.z).normalize().multiplyScalar(outline);
    od[i * 3] = d.x; od[i * 3 + 1] = d.y; od[i * 3 + 2] = d.z;
  }
  g.setAttribute('color', new Float32BufferAttribute(cols, 3));
  g.setAttribute('aGloss', new Float32BufferAttribute(gl, 1));
  g.setAttribute('aOut', new Float32BufferAttribute(od, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'aGloss', 'aOut'].includes(k)) g.deleteAttribute(k);
  return g;
}
export function at<G extends BufferGeometry>(g: G, x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1): G {
  g.scale(sx, sy, sz);
  g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}


/** Repaint a coloured part triangle by triangle: `paint` gets each triangle's centre and normal, and returns a colour. */
export function repaint(g: BufferGeometry, paint: (cx: number, cy: number, cz: number, nx: number, ny: number, nz: number) => string | null): BufferGeometry {
  const p = g.attributes.position!, n = g.attributes.normal!, c = g.attributes.color as Float32BufferAttribute;
  const col = new Color();
  for (let i = 0; i + 2 < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const hex = paint(cx, cy, cz, n.getX(i), n.getY(i), n.getZ(i));
    if (hex === null) continue;
    col.set(hex);
    for (let k = 0; k < 3; k++) c.setXYZ(i + k, col.r, col.g, col.b);
  }
  return g;
}
