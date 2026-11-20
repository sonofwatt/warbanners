import type { ReactElement } from 'react';
import type { BuildingId, FactionId, Resource, Terrain } from '../../engine';
import { ACCENT } from './palette';
import { edgeCorners, r1 } from './tiles';

// Every piece here draws around the tile centre in board units. The light comes
// from the left: left faces are lighter, right faces darker, as on the tile walls.

const SHADOW = '#000000';
const WOOD = '#9C6B3E';
const WOOD_DARK = '#6B4A2B';
const TRUNK = '#7A5230';
const LEAF = ['#5DB866', '#47994E'] as const; // upper cone [lit, shaded]
const LEAF_LOW = ['#4FA556', '#3F8F46'] as const; // lower cone

/**
 * Collects keyed SVG shapes in drawing order. Every coordinate and size is
 * multiplied by `scale` (so a piece can be drawn a little larger as a whole)
 * and rounded to one decimal.
 */
export class Ink {
  readonly items: ReactElement[] = [];
  private k = 0;
  constructor(private readonly scale = 1) {}
  private key(): string {
    return String(this.k++);
  }
  private n(v: number): number {
    return r1(v * this.scale);
  }
  poly(p: readonly number[], fill: string, opacity?: number): this {
    const s: string[] = [];
    for (let i = 0; i + 1 < p.length; i += 2) s.push(`${this.n(p[i]!)},${this.n(p[i + 1]!)}`);
    this.items.push(<polygon key={this.key()} points={s.join(' ')} fill={fill} fillOpacity={opacity} />);
    return this;
  }
  rect(x: number, y: number, w: number, h: number, fill: string, rx?: number): this {
    const n = (v: number): number => this.n(v);
    this.items.push(<rect key={this.key()} x={n(x)} y={n(y)} width={n(w)} height={n(h)} rx={rx === undefined ? undefined : n(rx)} fill={fill} />);
    return this;
  }
  circle(cx: number, cy: number, r: number, fill: string): this {
    this.items.push(<circle key={this.key()} cx={this.n(cx)} cy={this.n(cy)} r={this.n(r)} fill={fill} />);
    return this;
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, fill: string, opacity?: number): this {
    const n = (v: number): number => this.n(v);
    this.items.push(<ellipse key={this.key()} cx={n(cx)} cy={n(cy)} rx={n(rx)} ry={n(ry)} fill={fill} fillOpacity={opacity} />);
    return this;
  }
  shadow(cx: number, cy: number, rx: number, ry: number, opacity = 0.16): this {
    return this.ellipse(cx, cy, rx, ry, SHADOW, opacity);
  }
  /** A thin prop: a pole, a stalk, a string. */
  line(x1: number, y1: number, x2: number, y2: number, stroke: string, width: number): this {
    this.items.push(
      <line key={this.key()} x1={this.n(x1)} y1={this.n(y1)} x2={this.n(x2)} y2={this.n(y2)} stroke={stroke} strokeWidth={this.n(width)} strokeLinecap="round" />,
    );
    return this;
  }
  /** A stroked path made only of absolute commands (M, L, Q, T), so every number in `d` is a coordinate. */
  stroke(d: string, stroke: string, width: number): this {
    const scaled = d.replace(/-?\d+(\.\d+)?/g, (v) => String(this.n(Number(v))));
    this.items.push(
      <path key={this.key()} d={scaled} fill="none" stroke={stroke} strokeWidth={this.n(width)} strokeLinecap="round" strokeLinejoin="round" />,
    );
    return this;
  }
  /** A filled path made only of absolute commands (M, L, Q, C, Z), so every number in `d` is a coordinate. */
  shape(d: string, fill: string): this {
    const scaled = d.replace(/-?\d+(\.\d+)?/g, (v) => String(this.n(Number(v))));
    this.items.push(<path key={this.key()} d={scaled} fill={fill} />);
    return this;
  }
  /** A four-point sparkle. */
  glint(x: number, y: number, s: number, fill: string): this {
    const t = s * 0.3;
    return this.poly([x, y - s, x + t, y - t, x + s, y, x + t, y + t, x, y + s, x - t, y + t, x - s, y, x - t, y - t], fill);
  }
  /** A five-point star. */
  star(x: number, y: number, s: number, fill: string): this {
    const p: number[] = [];
    for (let i = 0; i < 10; i++) {
      const a = (-90 + 36 * i) * (Math.PI / 180);
      const rr = i % 2 === 0 ? s : s * 0.45;
      p.push(x + rr * Math.cos(a), y + rr * Math.sin(a));
    }
    return this.poly(p, fill);
  }
  done(): ReactElement {
    return <g>{this.items}</g>;
  }
}

// ---- terrain ----

/** A cone tree standing on (x, y): two tiers, each lit on the left. */
function tree(ink: Ink, x: number, y: number, s: number): void {
  ink.shadow(x + 1, y + 1, 6 * s, 2.2 * s);
  ink.rect(x - 1.5 * s, y - 4 * s, 3 * s, 5 * s, TRUNK);
  const cone = (base: number, w: number, h: number, c: readonly [string, string]): void => {
    const top = base - h;
    ink.poly([x - w / 2, base, x, base + 0.8 * s, x, top], c[0]);
    ink.poly([x, base + 0.8 * s, x + w / 2, base, x, top], c[1]);
  };
  cone(y - 3 * s, 14 * s, 12 * s, LEAF_LOW);
  cone(y - 10 * s, 11 * s, 10 * s, LEAF);
}

/** A round leafy bush. */
function bush(ink: Ink, x: number, y: number, s: number): void {
  ink.shadow(x + 0.5, y + 0.5, 5 * s, 1.8 * s);
  ink.circle(x, y - 3 * s, 4 * s, LEAF_LOW[1]);
  ink.circle(x - 0.8 * s, y - 3.6 * s, 3.2 * s, LEAF_LOW[0]);
}

const FORESTS: readonly (readonly [number, number, number])[][] = [
  [[0, -5, 1], [-9, 3, 1], [9, 4, 1]],
  [[-7, -4, 1.05], [8, -2, 0.9], [0, 6, 0.95]],
  [[-4, -2, 1.15], [9, 5, 0.9]],
];

function forest(variant: number): ReactElement {
  const ink = new Ink();
  const trees = FORESTS[variant % 3]!;
  if (variant % 3 === 2) bush(ink, -11, 7, 0.9);
  for (const [x, y, s] of [...trees].sort((a, b) => a[1] - b[1])) tree(ink, x, y, s);
  return ink.done();
}

function mountain(variant: number): ReactElement {
  const ink = new Ink();
  const v = variant % 3;
  ink.shadow(2, 6, 19, 4.5, 0.1);
  if (v === 1) {
    ink.poly([-23, 4, -14, -10, -12, 5], '#A39D8F');
    ink.poly([-14, -10, -5, 3, -12, 5], '#8A8478');
  }
  if (v === 2) {
    ink.poly([5, 5, 15, -9, 16, 7], '#A39D8F');
    ink.poly([15, -9, 24, 4, 16, 7], '#8A8478');
  }
  const tip = v === 1 ? 2 : v === 2 ? -3 : 0; // the peak leans a little per variant
  ink.poly([-17, 6, tip, -26, 3, 8], '#9A9486');
  ink.poly([tip, -26, 18, 5, 3, 8], '#7E786B');
  // Snow cap with a jagged hem, its shaded half a cool grey.
  // Snow cap with a jagged hem: white on the lit face, cool grey on the shaded one.
  const leftEdge = (y: number): number => tip + ((y + 26) / 32) * (-17 - tip);
  const rightEdge = (y: number): number => tip + ((y + 26) / 31) * (18 - tip);
  const ridge = (y: number): number => tip + ((y + 26) / 34) * (3 - tip);
  const lx = leftEdge(-14);
  const rx = ridge(-12);
  ink.poly([lx, -14, tip, -26, rx, -12, rx - 2.6, -14.6, (lx + rx) / 2 - 1, -11.4], '#FFFFFF');
  const ex = rightEdge(-15);
  ink.poly([tip, -26, ex, -15, (ex + rx) / 2 + 1, -12.6, (ex + rx) / 2 - 0.6, -14.6, rx, -12], '#E3E7EC');
  return ink.done();
}

const WAVES: readonly (readonly [number, number])[][] = [
  [[-12, -2], [-2, 6]],
  [[-10, 4], [0, -4]],
  [[-13, 1], [1, 7]],
];

function water(variant: number): ReactElement {
  const ink = new Ink();
  for (const [x, y] of WAVES[variant % 3]!) {
    ink.stroke(`M ${x} ${y} Q ${x + 3.5} ${y - 4} ${x + 7} ${y} T ${x + 14} ${y}`, '#FFFFFF', 1.6);
  }
  return ink.done();
}

export function TerrainFeature(p: { terrain: Terrain; variant: number }): ReactElement | null {
  const v = Math.abs(Math.trunc(p.variant));
  switch (p.terrain) {
    case 'field':
      return null;
    case 'forest':
      return forest(v);
    case 'mountain':
      return mountain(v);
    case 'water':
      return water(v);
  }
}

// ---- resources ----

function orchard(): ReactElement {
  const ink = new Ink(1.1);
  ink.shadow(1, 3, 9, 3);
  ink.rect(-1.6, -5, 3.2, 8, TRUNK);
  ink.circle(0, -12, 9, LEAF_LOW[1]);
  ink.circle(-1.6, -13, 7.6, LEAF_LOW[0]);
  ink.circle(-3.6, -15.4, 3, LEAF[0]);
  for (const [x, y] of [[-5, -10], [2, -16], [4.5, -9], [-1, -6.5], [6, -14]] as const) ink.circle(x, y, 1.9, '#E0563F');
  ink.circle(7, 3.5, 1.6, '#E0563F');
  return ink.done();
}

function cropland(): ReactElement {
  const ink = new Ink(1.1);
  // A golden plot the shape of the tile, with three rows of ripe stalks.
  ink.poly([16, 4.3, 0, 9.5, -16, 4.3, -16, -4.3, 0, -9.5, 16, -4.3], '#BE9A58');
  for (const [row, y] of [[0, -4], [1, 1], [2, 6]] as const) {
    ink.ellipse(-0.5 + row * 0.5, y + 0.3, 13, 1.4, '#C4A747');
    for (let i = 0; i < 5; i++) {
      const x = -11 + row + i * 5.4;
      ink.poly([x - 1.5, y, x, y - 7, x, y + 0.4], '#E9BE36');
      ink.poly([x, y - 7, x + 1.5, y, x, y + 0.4], '#D1A52C');
      ink.ellipse(x, y - 7.6, 1.5, 2.7, '#F7D85A');
    }
  }
  return ink.done();
}

function game(): ReactElement {
  const ink = new Ink(1.15);
  const body = '#A8693A';
  ink.shadow(0, 5, 8.5, 2.4);
  ink.rect(-3.5, -5, 1.8, 9.5, '#6A3E1F'); // far legs
  ink.rect(4.5, -5, 1.8, 9.5, '#6A3E1F');
  ink.ellipse(7.4, -7, 1.5, 1.8, '#F4E9D8'); // tail
  ink.ellipse(0, -5.5, 7.5, 3.8, body);
  ink.ellipse(0.5, -3.6, 5, 1.6, '#D9B07E');
  ink.rect(-6, -5, 1.9, 10, '#7A4A26'); // near legs
  ink.rect(2.5, -5, 1.9, 10, '#7A4A26');
  ink.poly([-7, -5, -3, -8, -6.5, -14, -9.5, -12.5], body); // neck
  ink.stroke('M -8.5 -15 L -9.5 -19.5 L -12 -21.5 M -9.6 -19 L -8 -21.8 M -7 -15 L -5.5 -19.5 L -3.5 -21 M -5.7 -19 L -6.6 -21.6', WOOD_DARK, 1.1);
  ink.ellipse(-9, -14, 3.2, 2.4, body);
  ink.poly([-11, -14.6, -14, -13, -13.6, -11.8, -10.4, -12.6], body); // muzzle
  ink.circle(-13.8, -12.6, 0.8, '#3A2516');
  ink.circle(-9.4, -14.8, 0.6, '#3A2516');
  ink.poly([-7.4, -15.6, -4.6, -17, -5.6, -14.4], '#8A5530'); // ear
  return ink.done();
}

function ore(): ReactElement {
  const ink = new Ink(1.3);
  ink.shadow(0, 3, 11, 3);
  ink.poly([-10, 3, -8, -5, -2, -10, 5, -8, 10, -1, 8, 3], '#55525E');
  ink.poly([-10, 3, -8, -5, -2, -10, -1, -2, -4, 3], '#6E6A78');
  ink.poly([-2, -10, 5, -8, 3, -3, -1, -2], '#7B7786');
  ink.glint(-4.5, -3, 3, '#EAF4FF');
  ink.glint(4.5, -2, 2.2, '#CFE6FA');
  return ink.done();
}

export function ResourceMark(p: { resource: Resource }): ReactElement {
  switch (p.resource) {
    case 'orchard':
      return orchard();
    case 'cropland':
      return cropland();
    case 'game':
      return game();
    case 'ore':
      return ore();
  }
}

// ---- buildings ----

interface HouseColours {
  front: string;
  side: string;
  roof: string;
  roofSide: string;
}

/** A gabled box standing on (x, y), its gable end facing the viewer. */
function house(ink: Ink, x: number, y: number, w: number, h: number, c: HouseColours, roofH = 8): void {
  const hw = w / 2;
  ink.shadow(x + 2, y + 0.5, hw + 3, 2.4, 0.14);
  ink.rect(x - hw, y - h, w, h, c.front);
  ink.poly([x + hw, y - h, x + hw + 4, y - h - 3, x + hw + 4, y - 3, x + hw, y], c.side);
  ink.poly([x - hw - 2, y - h, x + hw + 2, y - h, x, y - h - roofH], c.roof);
  ink.poly([x, y - h - roofH, x + 4, y - h - roofH - 2, x + hw + 5, y - h - 3, x + hw + 2, y - h], c.roofSide);
}

function farm(): ReactElement {
  const ink = new Ink();
  // A tilled plot, front left, with furrows and young shoots.
  ink.poly([-21, 4, -10, -2, 1, 4, -10, 10], '#A07A48');
  for (const t of [0.2, 0.4, 0.6, 0.8]) {
    const sx = -21 + 11 * t;
    const sy = 4 + 6 * t;
    ink.line(sx + 1, sy - 0.5, sx + 10, sy - 5.5, '#7E5C34', 1.2);
    ink.circle(sx + 4, sy - 2.2, 0.9, '#7BBF4A');
    ink.circle(sx + 7.5, sy - 4.2, 0.9, '#7BBF4A');
  }
  // The barn, back right.
  house(ink, 9, 0, 13, 10, { front: '#B5653A', side: '#8F4E2C', roof: '#6E4A33', roofSide: '#563827' }, 9);
  ink.rect(6, -6, 6, 6, '#5A3C29');
  ink.line(6.5, -5.5, 11.5, -0.5, '#F1E3C2', 0.9);
  ink.line(11.5, -5.5, 6.5, -0.5, '#F1E3C2', 0.9);
  ink.rect(8, -14.5, 2, 2, '#F1E3C2'); // hay door
  return ink.done();
}

function lumberCamp(): ReactElement {
  const ink = new Ink(1.1);
  // A chopping stump at the back left, a big axe bitten into its top.
  ink.shadow(-9, -1, 6, 2, 0.14);
  ink.rect(-12.6, -6.4, 7.2, 5.6, '#8A5A33', 1);
  ink.rect(-9, -6.4, 3.6, 5.6, '#6E4528', 1);
  ink.ellipse(-9, -6.4, 3.6, 1.6, '#E2C08A');
  ink.line(-9.4, -6.6, -4.4, -15.4, WOOD_DARK, 1.4);
  ink.poly([-6.4, -18.4, -0.6, -17.6, -1.8, -11.4, -5, -13.6], '#C9D1D8');
  ink.poly([-1.8, -17.8, -0.6, -17.6, -1.8, -11.4, -2.8, -12.2], '#9AA2AC');
  // A stack of cut logs, front right, ends toward the viewer: three, two and one.
  const logs: [number, number][] = [[4.4, -8.4], [1.2, -3], [7.6, -3], [-2, 2.4], [4.4, 2.4], [10.8, 2.4]];
  ink.shadow(6, 6.2, 12, 2.6);
  for (const [x, y] of logs) ink.rect(x, y - 3, 7.4, 6, '#7A4E2C', 1.4);
  for (const [x, y] of logs) {
    ink.circle(x, y, 3, '#E9C98F');
    ink.circle(x, y, 1.5, '#C9995A');
  }
  return ink.done();
}

function mine(): ReactElement {
  const ink = new Ink();
  ink.shadow(1, 5, 18, 4, 0.12);
  ink.poly([-17, 6, -13, -6, -4, -13, 6, -12, 14, -4, 17, 6], '#7F796C');
  ink.poly([-17, 6, -13, -6, -4, -13, -4, 6], '#958F81');
  ink.rect(-4, -8, 8, 13, '#2B2724', 3);
  ink.rect(-6.4, -9, 2.4, 14.5, WOOD);
  ink.rect(4, -9, 2.4, 14.5, '#80552F');
  ink.rect(-7.4, -11.4, 14.8, 2.8, TRUNK);
  // A spoil heap by the door.
  ink.poly([6, 8, 9, 4, 13, 3, 16, 7, 14, 9], '#6E6A78');
  ink.poly([8, 7, 10, 5, 12.5, 6, 11.5, 8], '#55525E');
  ink.poly([11, 9, 13, 7.5, 15, 8.6, 13.6, 10], '#6E6A78');
  return ink.done();
}

function market(): ReactElement {
  const ink = new Ink();
  ink.shadow(1, 5, 14, 3);
  // Counter.
  ink.rect(-11, -3, 20, 8, '#C8925A');
  ink.poly([9, -3, 13, -5, 13, 3, 9, 5], '#A8743F');
  ink.poly([-11, -3, -7, -5, 13, -5, 9, -3], '#DDB07A');
  // Goods on the counter.
  for (const [x, c] of [[-7, '#E0563F'], [-3, '#F2C230'], [1, '#7BBF4A'], [5, '#E0563F']] as const) {
    ink.circle(x, -5.2, 1.8, c);
  }
  // Posts and a striped awning.
  ink.line(-10, -3, -10, -15, WOOD_DARK, 1.2);
  ink.line(8, -3, 8, -15, WOOD_DARK, 1.2);
  const stripes = 6;
  for (let i = 0; i < stripes; i++) {
    const a = -13 + (i * 25) / stripes;
    const b = -13 + ((i + 1) * 25) / stripes;
    ink.poly([a + 3, -21, b + 3, -21, b, -14, a, -14], i % 2 === 0 ? '#F2B705' : '#FFF6E0');
  }
  for (let i = 0; i < stripes; i++) {
    const cx = -13 + ((i + 0.5) * 25) / stripes;
    ink.ellipse(cx, -14, 25 / stripes / 2, 1.6, i % 2 === 0 ? '#F2B705' : '#FFF6E0');
  }
  ink.poly([12, -14, 15, -21, 16, -20, 13.6, -14], '#C99A08');
  return ink.done();
}

export function BuildingMark(p: { building: BuildingId }): ReactElement {
  switch (p.building) {
    case 'farm':
      return farm();
    case 'lumberCamp':
      return lumberCamp();
    case 'mine':
      return mine();
    case 'market':
      return market();
  }
}

// ---- roads, villages, treasure ----

const DIRT = '#D8B977';

export function Road(p: { links: readonly number[] }): ReactElement {
  const ink = new Ink();
  for (const d of [...p.links].sort((a, b) => a - b)) {
    const [a, b] = edgeCorners(d);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    ink.stroke(`M 0 0 L ${r1(mx)} ${r1(my)}`, DIRT, 4.6);
  }
  ink.ellipse(0, 0, p.links.length === 0 ? 4.5 : 3.4, p.links.length === 0 ? 3 : 2.4, DIRT);
  return ink.done();
}

const HUT: HouseColours = { front: '#E6D5B0', side: '#C9B68E', roof: '#9A8878', roofSide: '#7E6E60' };

export function Village(): ReactElement {
  const ink = new Ink(1.15);
  house(ink, -7, -1, 11, 7, HUT, 10);
  ink.rect(-8.5, -5, 3, 4, '#6B5A48');
  house(ink, 7, 6, 10, 6, HUT, 9);
  ink.rect(5.6, 2.4, 2.8, 3.6, '#6B5A48');
  // A woodpile of three short logs between the huts.
  ink.circle(-1, 8, 1.6, '#C49A5E');
  ink.circle(-4, 8, 1.6, '#C49A5E');
  ink.circle(-2.5, 5.6, 1.6, '#C49A5E');
  return ink.done();
}

export function Treasure(): ReactElement {
  const ink = new Ink(1.2);
  ink.shadow(1, 4, 10, 2.8);
  ink.circle(-9, 4, 1.4, '#E7B53C');
  ink.rect(-7, -5, 12, 9, '#A0622D');
  ink.poly([5, -5, 8.5, -7, 8.5, 2, 5, 4], '#7E4A21');
  ink.rect(-7, -9.5, 12, 4.5, '#B8743A', 1.5);
  ink.poly([-7, -9.5, -3.5, -11.5, 8.5, -11.5, 5, -9.5], '#C98745');
  ink.poly([5, -9.5, 8.5, -11.5, 8.5, -7, 5, -5], '#8F5627');
  ink.rect(-5, -9.5, 2, 13.5, '#E7B53C');
  ink.rect(1.6, -9.5, 2, 13.5, '#E7B53C');
  ink.rect(-2.2, -7, 2.4, 3, '#F5D46A');
  ink.circle(8, 5, 1.4, '#E7B53C');
  ink.circle(10, 3.4, 1.2, '#F5D46A');
  ink.glint(8, -16, 4, '#FFF4B8');
  ink.glint(-9, -12, 2.2, '#FFF4B8');
  return ink.done();
}

// ---- cities ----

/** Where each building stands, in the order a growing city adds them. Slot 0 is the hall. */
const SLOTS: readonly (readonly [number, number])[] = [
  [1, -5],
  [-10, 3],
  [10, 2],
  [-15, -6],
  [16, -7],
  [0, 10],
];
const MAX_BUILDINGS = 6;

type Colour = { main: string; dark: string };

const PALE: Pick<HouseColours, 'front' | 'side'> = { front: '#F6ECD2', side: '#D9CCAA' };

function spartanHouse(ink: Ink, x: number, y: number, slot: number, colour: Colour): void {
  const w = slot % 2 === 0 ? 11 : 12;
  const h = slot === 5 ? 9 : 9 + (slot % 3);
  house(ink, x, y, w, h, { ...PALE, roof: colour.main, roofSide: colour.dark });
  ink.rect(x - 1.5, y - 4.5, 3, 4.5, '#A88E68');
}

function spartanHall(ink: Ink, x: number, y: number, colour: Colour, accent: string): void {
  const w = 17;
  const h = 11;
  const hw = w / 2;
  ink.shadow(x + 2, y + 0.5, hw + 4, 2.6, 0.14);
  ink.rect(x - hw - 1, y - 2.2, w + 2, 2.6, '#E2D5B2'); // step
  ink.poly([x + hw + 1, y - 2.2, x + hw + 5, y - 4.4, x + hw + 5, y - 2, x + hw + 1, y + 0.4], '#C4B48E');
  ink.rect(x - hw, y - h, w, h - 2, '#CDBE98'); // shaded hall behind the columns
  ink.poly([x + hw, y - h, x + hw + 4, y - h - 3, x + hw + 4, y - 4.4, x + hw, y - 2.2], PALE.side);
  for (let i = 0; i < 4; i++) ink.rect(x - hw + 1 + i * 4.3, y - h, 2.4, h - 2, '#FBF4E2');
  ink.rect(x - hw - 1, y - h - 2.4, w + 2, 2.6, PALE.front); // beam
  ink.poly([x - hw - 2, y - h - 2.4, x + hw + 2, y - h - 2.4, x, y - h - 9], colour.main);
  ink.poly([x, y - h - 9, x + 4, y - h - 11, x + hw + 5, y - h - 5.4, x + hw + 2, y - h - 2.4], colour.dark);
  ink.circle(x, y - h - 5, 1.6, accent);
}

/** Points along the front of an ellipse (x0, y0, rx, ry), from xa to xb. */
function frontArc(x0: number, y0: number, rx: number, ry: number, xa: number, xb: number): number[] {
  const out: number[] = [];
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const x = xa + ((xb - xa) * i) / n;
    const t = Math.max(0, 1 - ((x - x0) / rx) ** 2);
    out.push(x, y0 + ry * Math.sqrt(t));
  }
  return out;
}

/** A round felt tent on (x, y): pale wall, domed roof in the owner's colour, gold crown. */
function tent(ink: Ink, x: number, y: number, r: number, h: number, colour: Colour, accent: string, hall: boolean): void {
  const ry = r * 0.36;
  const split = x + r * 0.3; // where lit turns to shaded
  ink.shadow(x + 1.5, y + 0.5, r + 2.5, ry + 1, 0.14);
  // Wall: a lit left part and a shaded right part, each with a round foot.
  ink.poly([x - r, y - h, split, y - h, ...frontArc(x, y - ry, r, ry, split, x - r)], '#F3EAD8');
  ink.poly([split, y - h, x + r, y - h, ...frontArc(x, y - ry, r, ry, x + r, split)], '#DCCFB6');
  if (hall) {
    const b = y - h - ry + 2;
    ink.poly([...frontArc(x, b, r, ry, x - r, x + r), ...frontArc(x, b + 1.8, r, ry, x + r, x - r)], accent);
  }
  const doorH = h * 0.65;
  ink.rect(x - 1.8, y - doorH, 3.6, doorH, '#8C5A33', 1);
  // Roof: a low dome whose hem follows the wall's top curve.
  const eave = r + 1;
  const eaveY = y - h - ry * 0.6;
  const crown = y - h - r * 0.95;
  const shoulder = r * 0.45;
  ink.poly(
    [x - eave, eaveY, x - shoulder, crown + 2, x, crown, x + shoulder, crown + 2, x + eave, eaveY, ...frontArc(x, eaveY, eave, ry, x + eave, x - eave)],
    colour.main,
  );
  ink.poly(
    [split, crown + (2 * 0.3) / 0.45, x + shoulder, crown + 2, x + eave, eaveY, ...frontArc(x, eaveY, eave, ry, x + eave, split)],
    colour.dark,
  );
  ink.circle(x, crown - 0.4, hall ? 1.8 : 1.3, accent);
}

function mongolTent(ink: Ink, x: number, y: number, slot: number, colour: Colour, accent: string): void {
  const r = slot === 5 ? 5.5 : 6 + (slot % 2) * 0.5;
  tent(ink, x, y, r, 7, colour, accent, false);
}

function banner(ink: Ink, colour: Colour, accent: string): void {
  const px = 12;
  ink.line(px, -12, px, -38, WOOD_DARK, 1.4);
  ink.circle(px, -38.6, 1.3, accent);
  ink.poly([px + 0.6, -37.5, px + 13, -36.5, px + 10, -33, px + 13, -29.5, px + 0.6, -30.5], colour.main);
  ink.poly([px + 0.6, -32.4, px + 11.6, -32, px + 11.4, -31.6, px + 0.6, -31.4], colour.dark);
  ink.circle(px + 5.5, -34.2, 1.6, accent);
}

function palisade(ink: Ink): void {
  const stakes: [number, number][] = [];
  for (let i = 0; i <= 14; i++) {
    const a = ((22 + (136 * i) / 14) * Math.PI) / 180;
    stakes.push([23 * Math.cos(a), 1 + 13.5 * Math.sin(a)]);
  }
  ink.stroke(
    `M ${r1(stakes[0]![0])} ${r1(stakes[0]![1] - 3.5)} ` + stakes.slice(1).map(([x, y]) => `L ${r1(x)} ${r1(y - 3.5)}`).join(' '),
    '#6E4A2C',
    1.2,
  );
  for (const [x, y] of [...stakes].sort((a, b) => a[1] - b[1])) {
    const c = x < -4 ? '#B98552' : x > 4 ? '#946339' : '#A87545';
    ink.poly([x - 1.5, y, x - 1.5, y - 5.5, x, y - 7.5, x + 1.5, y - 5.5, x + 1.5, y], c);
  }
}

export function CityMark(p: {
  faction: FactionId;
  colour: Colour;
  level: number;
  capital: boolean;
  walls: boolean;
  pending: boolean;
}): ReactElement {
  const ink = new Ink();
  const accent = ACCENT[p.faction];
  const count = Math.max(2, Math.min(MAX_BUILDINGS, Math.trunc(p.level) + 1));
  const order = SLOTS.slice(0, count)
    .map((s, slot) => ({ slot, x: s[0], y: s[1] }))
    .sort((a, b) => a.y - b.y);
  if (p.capital) banner(ink, p.colour, accent);
  for (const { slot, x, y } of order) {
    if (p.faction === 'spartans') {
      if (slot === 0) spartanHall(ink, x, y, p.colour, accent);
      else spartanHouse(ink, x, y, slot, p.colour);
    } else if (slot === 0) {
      tent(ink, x, y, 9, 8, p.colour, accent, true);
    } else {
      mongolTent(ink, x, y, slot, p.colour, accent);
    }
  }
  if (p.walls) palisade(ink);
  if (p.pending) {
    ink.star(-12, -30, 8, '#FFF4B8');
    ink.star(-12, -30, 6.2, '#FFC21A');
  }
  return ink.done();
}
