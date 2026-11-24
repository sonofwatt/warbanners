// The terrain's shaders: toon light in three soft bands, painted ground, packed earth roads, and today's flat fog.
// Veiled tiles are dimmed toward the board's veil colour by the same 0.3 the SVG veil uses.
import { INR, ROAD_HALF, WALL, WATER_Y } from './layout';

export const NOISE = /* glsl */ `
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;

export const LIGHT = /* glsl */ `
uniform vec3 uLightDir, uLightColor, uShadowColor, uTint, uVeilColor;
uniform float uTime;
// Three soft bands: shade, half light, full light.
float toon(vec3 n) {
  float d = dot(normalize(n), uLightDir);
  return 0.5 * smoothstep(-0.03, 0.03, d) + 0.5 * smoothstep(0.43, 0.48, d);
}
vec3 lightUp(vec3 albedo, float band) { return albedo * mix(uShadowColor, uLightColor, band); }
// The last step for every lit colour: a time of day grade, then the veil over tiles no unit sees now.
vec3 finish(vec3 col, float veil) { return mix(col * uTint, uVeilColor, veil); }
`;


// aVeil is 1 on a veiled tile's vertices (written in place when the veil changes), dimmed by the SVG veil's 0.3.
export const groundVert = /* glsl */ `
attribute vec4 aInfo; attribute vec4 aTile; attribute float aAO; attribute vec2 aLocal; attribute float aRoad; attribute float aVeil;
varying vec4 vInfo; varying vec4 vTile; varying float vAO; varying vec2 vLocal; varying vec3 vWorld; varying vec3 vNormal; varying float vRoad; varying float vVeil;
void main() {
  vInfo = aInfo; vTile = aTile; vAO = aAO; vLocal = aLocal; vNormal = normal; vRoad = aRoad;
  vVeil = aVeil * 0.3;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const groundFrag = /* glsl */ `
${NOISE}
${LIGHT}
varying vec4 vInfo; varying vec4 vTile; varying float vAO; varying vec2 vLocal; varying vec3 vWorld; varying vec3 vNormal; varying float vRoad; varying float vVeil;
const float INR = ${INR.toFixed(4)};
const float WALL = ${WALL.toFixed(4)};

// The side of a tile, painted by what it is made of. d is the depth below the tile's top, along the length of the
// edge. Ground shows a thin top lip, then brown soil with soft strata and a few pebbles; a mountain shows grey rock
// in flat faceted patches with strata lines; water is a water column, deeper blue toward the bottom.
vec3 side(int terrain, float d, float along) {
  float t = clamp(d / WALL, 0.0, 1.0);
  if (terrain == 3) {
    vec3 c = mix(vec3(0.43, 0.74, 0.90), vec3(0.11, 0.29, 0.52), smoothstep(0.0, 1.0, t));
    float streak = smoothstep(0.72, 0.8, noise(vec2(along * 0.22, d * 0.015)));
    c += vec3(0.06, 0.08, 0.09) * streak * (1.0 - t);
    c = mix(c, vec3(0.86, 0.95, 1.0), 1.0 - smoothstep(0.4, 1.1, d));
    return c;
  }
  if (terrain == 2) {
    float lip = 1.2 + 0.8 * noise(vec2(along * 0.3, 1.0));
    float facet = floor(noise(vec2(along * 0.07, d * 0.07) + 3.0) * 4.0) / 3.0;
    vec3 c = mix(vec3(0.50, 0.49, 0.47), vec3(0.67, 0.65, 0.61), facet);
    float strata = fract(d * 0.11 + 0.35 * noise(vec2(along * 0.05, d * 0.02)));
    c *= 1.0 - 0.16 * (1.0 - smoothstep(0.0, 0.07, strata));
    c *= 1.0 - 0.22 * t;
    return mix(vec3(0.78, 0.75, 0.67), c, smoothstep(lip - 0.2, lip + 0.2, d));
  }
  vec3 top = terrain == 4 ? vec3(0.91, 0.84, 0.63) : terrain == 1 ? vec3(0.43, 0.66, 0.33) : vec3(0.60, 0.79, 0.40);
  float lip = 1.8 + 0.9 * noise(vec2(along * 0.35, 2.0));
  float band = noise(vec2(along * 0.035, d * 0.22));
  vec3 soil = mix(vec3(0.50, 0.34, 0.21), vec3(0.62, 0.45, 0.28), smoothstep(0.42, 0.58, band));
  soil = mix(soil, vec3(0.42, 0.29, 0.18), 0.6 * smoothstep(0.62, 0.7, noise(vec2(along * 0.02, d * 0.09) + 7.0)));
  // A few pebbles: sparse, each a pale stone with a dark rim.
  float peb = noise(vec2(along, d) * 0.4 + 11.0) * step(0.55, noise(vec2(along, d) * 0.07 + 5.0));
  soil = mix(soil, vec3(0.66, 0.60, 0.52), smoothstep(0.90, 0.92, peb));
  soil = mix(soil, vec3(0.38, 0.27, 0.18), smoothstep(0.86, 0.89, peb) * (1.0 - smoothstep(0.90, 0.92, peb)));
  soil *= 1.0 - 0.25 * t;
  return mix(top, soil, smoothstep(lip - 0.25, lip + 0.25, d));
}

// Roads: distance from the track's centre line (x) and the signed offset across it (y), for the edges in the
// tile's bit mask (bit e = the edge whose normal is at 60e degrees; 64 = a road with no links, a bare patch).
vec2 roadField(vec2 l, float mask) {
  float bare = step(63.5, mask);
  vec2 best = vec2(length(l) - mix(3.4, 4.5, bare) + ${ROAD_HALF.toFixed(2)}, 0.0);
  float bit = 1.0;
  for (int e = 0; e < 6; e++) {
    bool on = mod(floor(mask / bit + 0.01), 2.0) > 0.5;
    bit *= 2.0;
    if (!on) continue;
    float a = float(e) * 1.0471976;
    vec2 d = vec2(cos(a), sin(a));
    float t = clamp(dot(l, d), 0.0, INR + 1.0);
    vec2 off = l - d * t;
    float dist = length(off);
    if (dist < best.x) best = vec2(dist, dot(off, vec2(-d.y, d.x)));
  }
  return best;
}

// Painted ground: two or three flat tones per terrain, broken into soft-edged patches by noise, the way a
// brush lays down colour, plus faint directional strokes.
vec3 patches(vec3 base, vec3 lightTone, vec3 darkTone, vec2 p, float seed) {
  vec2 warp = vec2(fbm(p * 0.03 + seed), fbm(p * 0.03 - seed));
  float n = fbm(p * 0.04 + warp * 1.6 + seed);
  vec3 c = base;
  c = mix(c, lightTone, 0.75 * smoothstep(0.57, 0.62, n));
  c = mix(c, darkTone, 0.7 * smoothstep(0.41, 0.36, n));
  float stroke = noise(vec2(p.x * 0.09 + p.y * 0.05, p.y * 0.5) + seed);
  c *= 0.97 + 0.06 * stroke;
  return c;
}

void main() {
  int terrain = int(vInfo.x + 0.5);
  bool wall = vInfo.y > 0.5;
  float edge = vInfo.z;
  float shore = vInfo.w;
  int res = int(vTile.z + 0.5);
  vec2 p = vWorld.xz;
  vec3 col;
  float h = vWorld.y;
  vec3 n = normalize(vNormal);
  if (n.y < 0.0 && !wall) n = -n;

  if (terrain == 5) {
    // Fog: today's flat fog tile exactly (art/palette.ts GROUND.fog), unlit: top, its thin rim, left and right walls.
    vec3 top = vec3(0.9137, 0.9333, 0.9490), left = vec3(0.7961, 0.8275, 0.8549), right = vec3(0.7255, 0.7608, 0.7922);
    col = wall ? (n.x < 0.0 ? left : right) : (edge < 0.35 ? left : top);
    gl_FragColor = vec4(col, 1.0);
    return;
  }

  if (terrain == 0) { // field
    col = patches(vec3(0.64, 0.82, 0.44), vec3(0.73, 0.87, 0.50), vec3(0.56, 0.75, 0.38), p, 1.0);
    float t = noise(p * 0.9 + 3.0);
    col *= 1.0 - 0.04 * smoothstep(0.8, 0.86, t);
  } else if (terrain == 1) { // forest floor: deeper, mossier
    col = patches(vec3(0.43, 0.66, 0.33), vec3(0.52, 0.73, 0.38), vec3(0.34, 0.55, 0.28), p, 4.0);
    col *= 1.0 - 0.08 * smoothstep(0.7, 0.8, noise(p * 0.7));
  } else if (terrain == 2) { // mountain ground: sandy scree, the peaks carry the rock and snow
    vec3 rockBase = vec3(0.62, 0.60, 0.56);
    vec3 ground = patches(vec3(0.78, 0.75, 0.67), vec3(0.83, 0.80, 0.72), vec3(0.71, 0.68, 0.61), p, 7.0);
    vec3 rock = mix(rockBase, vec3(0.67, 0.64, 0.59), smoothstep(9.0, 10.0, h + 3.0 * noise(p * 0.12)));
    col = mix(ground, rock, smoothstep(1.4, 2.6, h));
    if (res == 4) col = mix(col, vec3(0.62, 0.49, 0.40), 0.4); // ore: rust-tinted scree
  } else if (terrain == 3) { // water
    float depth = smoothstep(2.0, 16.0, shore);
    col = mix(vec3(0.53, 0.80, 0.93), vec3(0.41, 0.72, 0.89), depth);
    // Painted swells: short, soft highlight strokes running across the tile.
    vec2 q = vec2(p.x * 0.11 + 0.6 * sin(p.y * 0.09), p.y * 0.28);
    float band = noise(q + vec2(uTime * 0.05, 0.0));
    float crest = smoothstep(0.72, 0.76, band) * smoothstep(0.35, 0.6, noise(p * 0.06 + 9.0));
    col = mix(col, vec3(0.80, 0.93, 0.98), crest * 0.85);
    // Foam where the water meets land.
    float foam = 1.0 - smoothstep(1.0, 2.6, shore + 0.9 * (noise(p * 0.5) - 0.5));
    col = mix(col, vec3(0.93, 0.98, 1.0), foam * 0.9);
  } else { // sand: a city's ground
    col = patches(vec3(0.91, 0.84, 0.63), vec3(0.95, 0.89, 0.70), vec3(0.85, 0.77, 0.56), p, 11.0);
  }

  if (res == 1 && !wall) { // cropland: wild, unfarmed ground; straw and dry grass in loose patches under the tufts
    float wild = fbm(p * 0.07 + vTile.xy * 0.01);
    float reach = smoothstep(2.0, 9.0, edge + 6.0 * (fbm(p * 0.09 + 3.0) - 0.5));
    vec3 straw = mix(vec3(0.80, 0.74, 0.42), vec3(0.88, 0.79, 0.45), smoothstep(0.45, 0.6, wild));
    straw = mix(straw, vec3(0.62, 0.70, 0.36), smoothstep(0.42, 0.32, wild));
    straw *= 0.95 + 0.1 * noise(vec2(p.x * 0.35 + p.y * 0.2, p.y * 0.9));
    col = mix(col, straw, reach * smoothstep(0.3, 0.42, wild + 0.12));
  }

  if (!wall && terrain != 3) {
    // A wet, darker bank along water.
    col *= 1.0 - 0.12 * (1.0 - smoothstep(0.5, 3.5, shore));
  }

  float onRoad = 0.0;
  if (vRoad > 0.5 && !wall) {
    // A packed earth track: wobbly edges, a darker worn rim, two faint wheel ruts and a few pebbles.
    vec2 rf = roadField(vLocal, vRoad);
    float wob = 0.7 * (noise(p * 0.35) - 0.5) + 0.35 * (noise(p * 1.3) - 0.5);
    float d = rf.x + wob;
    float hw = ${ROAD_HALF.toFixed(2)};
    onRoad = 1.0 - smoothstep(hw - 0.35, hw + 0.35, d);
    vec3 earth = mix(vec3(0.80, 0.66, 0.42), vec3(0.86, 0.73, 0.48), noise(p * 0.5 + 2.0));
    earth = mix(earth, vec3(0.66, 0.52, 0.32), smoothstep(hw - 1.3, hw - 0.2, d)); // worn rim
    float rut = smoothstep(0.45, 0.0, abs(abs(rf.y) - 1.15) + 0.25 * (noise(p * 0.8) - 0.5));
    earth *= 1.0 - 0.13 * rut * step(0.5, abs(rf.y) + 0.5) * smoothstep(3.0, 6.0, length(vLocal));
    earth *= 1.0 - 0.18 * smoothstep(0.82, 0.88, noise(p * 1.7 + 5.0));
    col = mix(col, earth, onRoad);
    // The grass verge either side is trodden a little darker and drier.
    float verge = (1.0 - smoothstep(hw + 0.2, hw + 2.2, d)) * (1.0 - onRoad);
    col = mix(col, col * vec3(0.9, 0.88, 0.8), verge * 0.7);
  }

  float band = toon(n);
  if (!wall && terrain != 3) {
    // Soft relief light on the low ground, so rolling hills and foothills read without leaving the toon bands.
    col *= clamp(1.0 + 1.25 * (dot(n, uLightDir) - dot(vec3(0.0, 1.0, 0.0), uLightDir)), 0.82, 1.15);
  }
  if (wall) {
    // Walls: what the tile is made of, toon lit by their facing (left light, right dark).
    float top = terrain == 3 ? ${WATER_Y.toFixed(2)} : 0.0;
    col = side(terrain, top - vWorld.y, vWorld.x + vWorld.z * 0.7);
  }
  vec3 lit = lightUp(col, band) * (wall ? 1.0 : vAO);
  if (!wall) {
    // The hex grid stays readable: a soft darker line at the tile edge, a faint lit lip just inside it.
    lit *= mix(mix(0.84, 0.95, onRoad), 1.0, smoothstep(0.25, 1.1, edge));
    lit *= 1.0 + 0.05 * (smoothstep(1.0, 1.6, edge) - smoothstep(1.6, 3.0, edge));
  }
  gl_FragColor = vec4(finish(lit, vVeil), 1.0);
}`;

export const propVert = /* glsl */ `
attribute float aGloss; attribute vec3 aOut; attribute float aVeil;
uniform float uOutline;
varying vec3 vColor; varying vec3 vNormal; varying float vGloss; varying vec3 vWorld; varying float vVeil;
void main() {
  vColor = color; vNormal = normal; vGloss = aGloss;
  vVeil = aVeil * 0.3;
  vec4 w = modelMatrix * vec4(position + aOut * uOutline, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const propFrag = /* glsl */ `
${NOISE}
${LIGHT}
uniform bool uIsOutline;
varying vec3 vColor; varying vec3 vNormal; varying float vGloss; varying vec3 vWorld; varying float vVeil;
void main() {
  if (uIsOutline) { gl_FragColor = vec4(finish(vColor * vec3(0.30, 0.32, 0.36), vVeil), 1.0); return; }
  vec3 n = normalize(vNormal);
  float band = toon(n);
  if (vGloss < 0.0) {
    // Mountain rock and snow: the half band starts higher, so the face turned from the light falls into shade
    // and the peak reads as one lit face and one shaded face either side of its front ridge.
    float d = dot(n, uLightDir);
    band = 0.5 * smoothstep(0.12, 0.16, d) + 0.5 * smoothstep(0.5, 0.54, d);
  }
  vec3 col = vColor * (0.95 + 0.1 * noise(vWorld.xz * 0.6 + vWorld.y * 0.3));
  if (vGloss < -1.5) {
    // Rock strata: near-level bands in a few tones of the rock, all dipping the same way across one crag, a thin
    // darker seam at the foot of each band, a little wobble so the lines are not ruled.
    float a = (-vGloss - 2.0) * 6.2832;
    float s = (vWorld.y + 0.14 * dot(vWorld.xz, vec2(cos(a), sin(a))) + 0.5 * (noise(vWorld.xz * 0.12) - 0.5)) / 2.8;
    float b = floor(s);
    float k = fract(sin(b * 12.9898 + 4.1) * 43758.5453);
    col *= mix(0.93, 1.06, k);
    col = mix(col, col * vec3(1.05, 1.0, 0.93), step(0.66, fract(k * 7.3)) * 0.6);
    col *= 1.0 - 0.1 * (1.0 - smoothstep(0.0, 0.1, fract(s)));
  }
  vec3 lit = lightUp(col, band);
  // A hard glint on glossy parts (ore crystals, fruit): toon specular.
  vec3 view = normalize(vec3(0.0, 0.62, 0.785));
  float spec = pow(max(dot(reflect(-uLightDir, n), view), 0.0), 10.0);
  lit = mix(lit, vec3(1.0), max(vGloss, 0.0) * smoothstep(0.55, 0.6, spec) * 0.85);
  gl_FragColor = vec4(finish(lit, vVeil), 1.0);
}`;
