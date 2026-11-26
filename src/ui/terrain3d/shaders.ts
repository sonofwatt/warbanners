// The terrain's shaders: toon light in three soft bands, painted ground, packed earth roads, and today's flat fog.
// Veiled tiles are dimmed toward the board's veil colour by the same 0.3 the SVG veil uses.
import { INR, RES_HARVESTED, ROAD_GROW, ROAD_HALF, WALL, WATER_Y } from './layout';
import { BED_DEPTH } from './waterLayout';

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
attribute vec2 aRoadWear;
varying vec4 vInfo; varying vec4 vTile; varying float vAO; varying vec2 vLocal; varying vec3 vWorld; varying vec3 vNormal; varying float vRoad; varying float vVeil;
varying vec2 vRoadWear;
void main() {
  vInfo = aInfo; vTile = aTile; vAO = aAO; vLocal = aLocal; vNormal = normal; vRoad = aRoad; vRoadWear = aRoadWear;
  vVeil = aVeil * 0.3;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const groundFrag = /* glsl */ `
${NOISE}
${LIGHT}
varying vec4 vInfo; varying vec4 vTile; varying float vAO; varying vec2 vLocal; varying vec3 vWorld; varying vec3 vNormal; varying float vRoad; varying float vVeil;
varying vec2 vRoadWear;
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

// Roads: for the edges in the tile's bit mask (bit e = the edge whose normal is at 60e degrees; 64 = a road with no
// links, a bare patch), the distance from the road's side (negative on the road), the signed offset across the track
// from its centre line, and the road's wear there (tracks3d: wc at the tile's centre, we a base 4 digit per edge for
// where it meets that neighbour, so two tiles' roads meet at one width). Wear 0 is the light road as it always was.
vec3 roadField(vec2 l, float mask, float wc, float we) {
  float bare = step(63.5, mask);
  vec3 best = vec3(length(l) - mix(3.4, 4.5, bare) * (1.0 + ${ROAD_GROW.toFixed(2)} * wc), 0.0, wc);
  float bit = 1.0, wb = 1.0;
  for (int e = 0; e < 6; e++) {
    bool on = mod(floor(mask / bit + 0.01), 2.0) > 0.5;
    float wEdge = mod(floor(we / wb), 4.0);
    bit *= 2.0; wb *= 4.0;
    if (!on) continue;
    float a = float(e) * 1.0471976;
    vec2 d = vec2(cos(a), sin(a));
    float t = clamp(dot(l, d), 0.0, INR + 1.0);
    vec2 off = l - d * t;
    float wear = mix(wc, wEdge, smoothstep(0.3, 1.0, t / INR));
    float dist = length(off) - ${ROAD_HALF.toFixed(2)} * (1.0 + ${ROAD_GROW.toFixed(2)} * wear);
    if (dist < best.x) best = vec3(dist, dot(off, vec2(-d.y, d.x)), wear);
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
  int resRaw = int(vTile.z + 0.5);
  bool harvested = resRaw >= ${RES_HARVESTED}; // rules 8: the resource's ground tint fades, as its mark does
  int res = harvested ? resRaw - ${RES_HARVESTED} : resRaw;
  float resTint = harvested ? 0.45 : 1.0;
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
    if (res == 4) col = mix(col, vec3(0.62, 0.49, 0.40), 0.4 * resTint); // ore: rust-tinted scree
  } else if (terrain == 3) { // water3d: the bed under the clear surface (WATER below), sand to pebbles to deep green
    float d = clamp((${WATER_Y.toFixed(2)} - h) / ${BED_DEPTH.toFixed(2)}, 0.0, 1.0);
    vec3 sand = patches(vec3(0.86, 0.80, 0.61), vec3(0.90, 0.85, 0.66), vec3(0.80, 0.73, 0.55), p, 13.0);
    // Sand ripples: soft parallel bands, wobbling.
    float rip = sin(p.x * 0.55 + p.y * 0.25 + 2.5 * noise(p * 0.08));
    sand *= 0.96 + 0.05 * smoothstep(0.3, 0.9, rip);
    vec3 mid = patches(vec3(0.70, 0.73, 0.58), vec3(0.76, 0.78, 0.63), vec3(0.62, 0.67, 0.53), p, 17.0);
    // Pebbles in the middle depths: small pale stones with dark rims.
    float peb = noise(p * 0.7 + 3.0) * step(0.5, noise(p * 0.11 + 8.0));
    mid = mix(mid, vec3(0.74, 0.71, 0.62), smoothstep(0.82, 0.86, peb));
    mid = mix(mid, vec3(0.42, 0.45, 0.38), smoothstep(0.76, 0.8, peb) * (1.0 - smoothstep(0.82, 0.86, peb)));
    vec3 deep = patches(vec3(0.46, 0.60, 0.58), vec3(0.52, 0.66, 0.62), vec3(0.40, 0.54, 0.54), p, 19.0);
    col = mix(sand, mid, smoothstep(0.12, 0.45, d));
    col = mix(col, deep, smoothstep(0.5, 0.95, d));
  } else { // sand: a city's ground
    col = patches(vec3(0.91, 0.84, 0.63), vec3(0.95, 0.89, 0.70), vec3(0.85, 0.77, 0.56), p, 11.0);
  }

  if (res == 1 && !wall) { // cropland: wild, unfarmed ground; straw and dry grass in loose patches under the tufts
    float wild = fbm(p * 0.07 + vTile.xy * 0.01);
    float reach = smoothstep(2.0, 9.0, edge + 6.0 * (fbm(p * 0.09 + 3.0) - 0.5));
    vec3 straw = mix(vec3(0.80, 0.74, 0.42), vec3(0.88, 0.79, 0.45), smoothstep(0.45, 0.6, wild));
    straw = mix(straw, vec3(0.62, 0.70, 0.36), smoothstep(0.42, 0.32, wild));
    straw *= 0.95 + 0.1 * noise(vec2(p.x * 0.35 + p.y * 0.2, p.y * 0.9));
    col = mix(col, straw, resTint * reach * smoothstep(0.3, 0.42, wild + 0.12));
  }

  if (!wall && terrain != 3) {
    // A wet, darker bank along water.
    col *= 1.0 - 0.12 * (1.0 - smoothstep(0.5, 3.5, shore));
  }

  float onRoad = 0.0;
  if (vRoad > 0.5 && !wall) {
    // A packed earth track: wobbly edges, a darker worn rim, two faint wheel ruts and a few pebbles. A busy road
    // (tracks3d) is wider, its earth worn patchy, with a band of dead, yellow-brown grass either side.
    vec3 rf = roadField(vLocal, vRoad, floor(vRoadWear.x + 0.5), floor(vRoadWear.y + 0.5));
    float wob = 0.7 * (noise(p * 0.35) - 0.5) + 0.35 * (noise(p * 1.3) - 0.5);
    float d = rf.x + wob; // below 0 on the road
    float grow = 1.0 + ${ROAD_GROW.toFixed(2)} * rf.z;
    onRoad = 1.0 - smoothstep(-0.35, 0.35, d);
    vec3 earth = mix(vec3(0.80, 0.66, 0.42), vec3(0.86, 0.73, 0.48), noise(p * 0.5 + 2.0));
    earth = mix(earth, earth * vec3(0.88, 0.84, 0.78), (rf.z / 3.0) * smoothstep(0.4, 0.7, noise(p * 0.3 + 4.0)));
    earth = mix(earth, vec3(0.66, 0.52, 0.32), smoothstep(-1.3, -0.2, d)); // worn rim
    float rut = smoothstep(0.45, 0.0, abs(abs(rf.y) - 1.15 * grow) + 0.25 * (noise(p * 0.8) - 0.5));
    earth *= 1.0 - 0.13 * rut * step(0.5, abs(rf.y) + 0.5) * smoothstep(3.0, 6.0, length(vLocal));
    earth *= 1.0 - 0.18 * smoothstep(0.82, 0.88, noise(p * 1.7 + 5.0));
    col = mix(col, earth, onRoad);
    // The grass verge either side is trodden a little darker and drier.
    float verge = (1.0 - smoothstep(0.2, 2.2, d)) * (1.0 - onRoad);
    col = mix(col, col * vec3(0.9, 0.88, 0.8), verge * 0.7);
    if (rf.z > 0.01 && terrain != 2) {
      // Dead grass along a busy road, wider and thicker the busier it is, ragged at its outer edge.
      float reach = 1.5 + 2.4 * rf.z + 2.0 * (noise(p * 0.18 + 9.0) - 0.5) * rf.z;
      float dead = (1.0 - smoothstep(reach * 0.45, reach, d)) * (1.0 - onRoad) * min(1.0, 0.45 + rf.z / 2.0);
      dead *= 0.75 + 0.25 * smoothstep(0.3, 0.6, noise(p * 0.5 + 3.0));
      vec3 straw = mix(vec3(0.78, 0.69, 0.42), vec3(0.66, 0.56, 0.34), noise(p * 0.6 + 1.0));
      straw *= 0.94 + 0.1 * noise(vec2(p.x * 0.4 + p.y * 0.2, p.y * 1.1));
      col = mix(col, straw, dead * 0.85);
    }
  }

  float band = toon(n);
  if (!wall) {
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
#ifdef LAMP
// A mine tunnel's inside, lit by its lantern (lanterns.ts): the lantern's place and which flicker voice it follows.
attribute vec4 aLamp; varying vec4 vLamp;
#endif
void main() {
  vColor = color; vGloss = aGloss;
#ifdef LAMP
  vLamp = aLamp;
#endif
#ifdef WORLD_NORMAL
  // A figure that turns (units/facing.ts) is lit by the world's light, not its own: its normals turn with it.
  vNormal = mat3(modelMatrix) * normal;
#else
  vNormal = normal;
#endif
  vVeil = aVeil * 0.3;
  vec4 w = modelMatrix * vec4(position + aOut * uOutline, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const propFrag = /* glsl */ `
${NOISE}
${LIGHT}
uniform bool uIsOutline;
// A fading fall's figure (units/units3d.ts) defines UNIT_ALPHA and sets uAlpha; everything else is opaque.
#ifdef UNIT_ALPHA
uniform float uAlpha;
#define ALPHA uAlpha
#else
#define ALPHA 1.0
#endif
// A spent unit's figure (units/units3d.ts) defines UNIT_SHADE and sets uShade (0 to 1): at 1 it is 40 percent darker
// and a quarter greyer, as the svg figure's filter (theme.css .unit-shade.spent).
#ifdef UNIT_SHADE
uniform float uShade;
vec3 shade(vec3 c) { return mix(c, mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, 0.75) * 0.6, uShade); }
#else
vec3 shade(vec3 c) { return c; }
#endif
varying vec3 vColor; varying vec3 vNormal; varying float vGloss; varying vec3 vWorld; varying float vVeil;
#ifdef LAMP
varying vec4 vLamp;
uniform float uGlow0, uGlow1, uReach;
#endif
void main() {
  if (uIsOutline) { gl_FragColor = vec4(shade(finish(vColor * vec3(0.30, 0.32, 0.36), vVeil)), ALPHA); return; }
  vec3 n = normalize(vNormal);
  float band = toon(n);
  if (vGloss < 0.0) {
    // Mountain rock and snow: the half band starts higher, so the face turned from the light falls into shade
    // and the peak reads as one lit face and one shaded face either side of its front ridge.
    float d = dot(n, uLightDir);
    band = 0.5 * smoothstep(0.12, 0.16, d) + 0.5 * smoothstep(0.5, 0.54, d);
  }
  vec3 col = vColor * (0.95 + 0.1 * noise(vWorld.xz * 0.6 + vWorld.y * 0.3));
  vec3 lit = lightUp(col, band);
  // A hard glint on glossy parts (ore crystals, fruit): toon specular.
  vec3 view = normalize(vec3(0.0, 0.62, 0.785));
  float spec = pow(max(dot(reflect(-uLightDir, n), view), 0.0), 10.0);
  lit = mix(lit, vec3(1.0), max(vGloss, 0.0) * smoothstep(0.55, 0.6, spec) * 0.85);
#ifdef LAMP
  // Warm lantern light, falling off from the lantern in two toon steps and breathing with its flicker. Faces turned
  // toward the lantern take more of it, so the frames' edges catch the light as they recede.
  vec3 toLamp = vLamp.xyz - vWorld;
  float dist = length(toLamp);
  float glow = vLamp.w < 0.5 ? uGlow0 : uGlow1;
  float near = 1.0 - smoothstep(0.0, uReach, dist);
  float facing = 0.45 + 0.55 * max(dot(n, toLamp / max(dist, 0.001)), 0.0);
  float warm = glow * facing * (0.55 * near + 0.45 * near * near);
  lit = lit * (1.0 + 2.6 * warm * vec3(1.0, 0.78, 0.48)) + warm * vec3(0.30, 0.17, 0.05);
#endif
  gl_FragColor = vec4(shade(finish(lit, vVeil)), ALPHA);
}`;


// water3d: the water's surface, laid over what lies under it. `deep` is how much water the eye looks through (world
// units), `shore` the distance to the land (foam), p the surface point (world x, z). The tones are the old opaque
// water's: pale in the shallows, a little deeper blue out in open water, with the same painted swells and foam; the
// deeper the water, the more of the surface's colour covers what is under it, so depth reads.
export const WATER = /* glsl */ `
vec4 waterSurface(vec2 p, float shore, float deep) {
  float f = clamp(deep / ${BED_DEPTH.toFixed(2)}, 0.0, 1.0);
  vec3 col = mix(vec3(0.58, 0.84, 0.95), vec3(0.45, 0.75, 0.92), f);
  float a = mix(0.14, 0.5, smoothstep(0.0, 1.0, f));
  vec2 q = vec2(p.x * 0.11 + 0.6 * sin(p.y * 0.09), p.y * 0.28);
  float band = noise(q + vec2(uTime * 0.05, 0.0));
  float crest = smoothstep(0.72, 0.76, band) * smoothstep(0.35, 0.6, noise(p * 0.06 + 9.0));
  col = mix(col, vec3(0.82, 0.94, 0.99), crest * 0.85);
  a = mix(a, 0.8, crest * 0.85);
  float foam = 1.0 - smoothstep(1.0, 2.6, shore + 0.9 * (noise(p * 0.5) - 0.5));
  col = mix(col, vec3(0.93, 0.98, 1.0), foam * 0.9);
  a = mix(a, 0.95, foam * 0.9);
  return vec4(col, a);
}
`;
