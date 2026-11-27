import type { ReactElement } from 'react';
import type { UnitTypeId } from '../../engine';

// Unit emblems: a round badge per unit type, in a flat two-tone sports-crest style. A backing disc with a bold dark
// rim; the unit's profile (its head and helmet, or the thing itself) inside it, facing left, its top breaking a little
// above the disc; and its weapon or main element over the disc's lower right. Each is drawn in four colours (a main
// fill, a darker shade, a near-black ink for outlines and a warm white for highlights) so it can be tinted for any
// faction, or drawn in gold on black.
//
// Coordinates: the disc is centred on the origin with radius 34; everything fits in the box -54..54 across and
// -56..52 down. Each unit also has a small form for badges of about 20 css px: the same disc, profile and weapon
// with thicker outlines, no inner detail and the figure in warm white. The war banner (banner.tsx) wears the small
// form; the full form is for large views and the comparison sheets (scripts/emblems-sheets.ts).

/** The four colours of an emblem, plus the dark ground inside the disc's rim. */
export interface EmblemPaint {
  main: string;
  shade: string;
  ground: string;
  ink: string;
  light: string;
}

/** The disc's outer radius and the inner radius of its rim. */
export const EMBLEM_R = 34;
const RIM_IN = 28;

const INK = '#1A1512';
const WARM_WHITE = '#FFF4DE';

const hex = (c: string): number[] => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number): string => {
  const x = hex(a);
  const y = hex(b);
  return `#${x.map((v, i) => Math.round(v + ((y[i] ?? 0) - v) * t).toString(16).padStart(2, '0')).join('')}`;
};

/** The paint for a player colour: a lighter tint of it as the main fill, its dark as the shade. */
export function emblemPaint(colour: { main: string; dark: string }): EmblemPaint {
  return { main: mix(colour.main, '#FFFFFF', 0.16), shade: colour.dark, ground: mix(colour.dark, INK, 0.72), ink: INK, light: WARM_WHITE };
}

/** Gold on black. */
export const GOLD_PAINT: EmblemPaint = { main: '#E2AB3E', shade: '#9C681E', ground: '#141110', ink: '#0E0C0A', light: '#FBE4A6' };

/** Draws one emblem's shapes, each outlined in ink unless it is a detail line. */
export class Pen {
  readonly items: ReactElement[] = [];
  private k = 0;
  constructor(readonly p: EmblemPaint, readonly small: boolean) {}
  /** The outline width: bolder on the small form so it holds at badge size. */
  get w(): number {
    return this.small ? 4.6 : 2.6;
  }
  private key(): string {
    return String(this.k++);
  }
  /** A filled, outlined shape. */
  shape(d: string, fill: string): this {
    this.items.push(<path key={this.key()} d={d} fill={fill} stroke={this.p.ink} strokeWidth={this.w} strokeLinejoin="round" />);
    return this;
  }
  /** A filled shape with no outline: a shadow or a highlight laid over an outlined one. */
  flat(d: string, fill: string): this {
    this.items.push(<path key={this.key()} d={d} fill={fill} />);
    return this;
  }
  circle(cx: number, cy: number, r: number, fill: string, outlined = true): this {
    this.items.push(
      <circle key={this.key()} cx={cx} cy={cy} r={r} fill={fill} stroke={outlined ? this.p.ink : undefined} strokeWidth={outlined ? this.w : undefined} />,
    );
    return this;
  }
  /** A bar of width `w` along a path, outlined: a shaft, a pipe, a bow. */
  bar(d: string, colour: string, width: number): this {
    const w = this.small ? width * 1.4 : width;
    this.items.push(<path key={this.key()} d={d} fill="none" stroke={this.p.ink} strokeWidth={w + 2 * this.w} strokeLinecap="round" strokeLinejoin="round" />);
    this.items.push(<path key={this.key()} d={d} fill="none" stroke={colour} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />);
    return this;
  }
  /** A plain line with no outline: a highlight, a seam, a string. */
  line(d: string, colour: string, w: number): this {
    this.items.push(<path key={this.key()} d={d} fill="none" stroke={colour} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />);
    return this;
  }
  /** Inner detail: left out of the small form. */
  detail(draw: () => void): this {
    if (!this.small) draw();
    return this;
  }
  /** Shapes drawn in their own frame, moved to (x, y) and turned by `deg`. */
  at(x: number, y: number, deg: number, draw: (pen: Pen) => void): this {
    const sub = new Pen(this.p, this.small);
    draw(sub);
    this.items.push(<g key={this.key()} transform={`translate(${x} ${y}) rotate(${deg})`}>{sub.items}</g>);
    return this;
  }
}

type Draw = (pen: Pen) => void;

// ---- shared parts ----

/** The disc: a main-coloured rim with a dark ground inside. */
function disc(pen: Pen): void {
  pen.circle(0, 0, EMBLEM_R, pen.p.main);
  pen.circle(0, 0, RIM_IN, pen.p.ground, false);
  pen.detail(() => pen.line('M -24 -14 Q -14 -27 2 -30.5', pen.p.light, 1.6));
}

/** A bare head in profile facing left, with its neck cut off at the disc's ground. */
function head(pen: Pen, fill = pen.p.main): void {
  pen.shape(
    'M -4 -30 Q 16 -30 19 -12 Q 21 4 13 12 L 15 26 Q 4 29 -8 26 L -8 16 Q -14 16 -18 12 L -19 6 L -22 4 L -20 1 L -23 -1 Q -25 -3 -26 -6 L -20 -10 Q -22 -28 -4 -30 Z',
    fill,
  );
  pen.detail(() => pen.flat('M 13 12 L 15 26 Q 10 27.6 4 27.6 L 2 14 Q 8 15 13 12 Z', pen.p.shade));
}

/** An eye: a dark dot. */
const eye = (pen: Pen, x: number, y: number): void => {
  pen.circle(x, y, pen.small ? 2.4 : 1.9, pen.p.ink, false);
};

/** A horse's head and neck facing left, its ears breaking the top. */
function horse(pen: Pen): void {
  const { main, shade, ink, light } = pen.p;
  // The mane, behind.
  pen.shape('M 10 -34 L 18 -32 L 19 -26 L 26 -22 L 25 -15 L 30 -10 L 27 -3 L 30 4 L 26 10 L 27 18 L 24 26 L 16 27 Z', shade);
  pen.shape(
    'M 2 -30 L 0 -45 L 8 -35 L 12 -44 L 14 -30 Q 22 -18 23 0 Q 24 14 21 26 Q 12 28.6 2 27 Q 3 18 -2 12 Q -8 15 -15 15 Q -23 15 -27 9 Q -29 2 -25 -4 Q -16 -18 -7 -26 Q -2 -29.6 2 -30 Z',
    main,
  );
  pen.detail(() => {
    pen.flat('M -2 12 Q -8 15 -15 15 Q -23 15 -27 9 Q -20 11 -12 9 Q -4 6 -2 12 Z', shade);
    pen.line('M -6 -24 Q -14 -12 -22 -2', light, 1.4);
    pen.line('M -22 0 L -6 -8 L 0 6', ink, 1.6);
    pen.line('M 14 -24 Q 18 -8 16 20', shade, 1.4);
  });
  eye(pen, -5, -16);
  pen.circle(-24, 4, pen.small ? 2 : 1.6, ink, false);
}

// ---- the weapons and devices, drawn upright about their middle ----

/** A spear: shaft and a leaf blade, its point at y `-len`. */
function spear(pen: Pen, len: number, blade: number): void {
  pen.bar(`M 0 ${len * 0.7} L 0 ${-len + blade}`, pen.p.shade, 3.2);
  pen.shape(`M 0 ${-len} Q ${blade * 0.32} ${-len + blade * 0.55} 0 ${-len + blade} Q ${-blade * 0.32} ${-len + blade * 0.55} 0 ${-len} Z`, pen.p.main);
  pen.detail(() => pen.line(`M 0 ${-len + 3} L 0 ${-len + blade - 3}`, pen.p.light, 1.2));
}

/** A short sword, point up. */
function sword(pen: Pen, len = 34): void {
  const { main, shade, light } = pen.p;
  pen.shape(`M 0 ${-len} L 4.4 ${-len + 8} L 4.4 6 L -4.4 6 L -4.4 ${-len + 8} Z`, main);
  pen.detail(() => pen.line(`M 0 ${-len + 6} L 0 3`, light, 1.3));
  pen.shape('M -10 5 L 10 5 Q 11 9 10 10 L -10 10 Q -11 9 -10 5 Z', shade);
  pen.shape('M -2.6 10 L 2.6 10 L 2.6 20 L -2.6 20 Z', shade);
  pen.circle(0, 22.5, 4.2, main);
}

// ---- the emblems ----

/** Each unit type's emblem, drawn over its disc. */
export const EMBLEMS: Record<UnitTypeId, Draw> = {
  // A bearded head in a round cap; a hand axe.
  warrior: (pen) => {
    const { main, shade, ink, light } = pen.p;
    head(pen);
    pen.shape('M -24 -2 Q -26 12 -18 20 Q -8 24 0 14 L 2 2 Q -6 6 -12 2 Q -18 6 -24 -2 Z', shade);
    pen.shape('M -22 -12 Q -24 -38 0 -40 Q 22 -38 22 -12 Q 0 -18 -22 -12 Z', main);
    pen.detail(() => {
      pen.flat('M -22 -12 Q 0 -18 22 -12 L 21 -16 Q 0 -22 -21.6 -16 Z', ink);
      pen.line('M -14 -24 Q -8 -34 4 -35', light, 1.6);
    });
    eye(pen, -13, -6);
    pen.at(26, 20, 28, (w) => {
      w.bar('M 0 20 L 0 -18', w.p.shade, 4.4);
      w.shape('M -2 -20 L 6 -23 Q 18 -14 14 2 L 2 -6 L -2 -6 Z', w.p.main);
      w.detail(() => w.line('M 9 -19 Q 16 -12 13.6 -2', w.p.light, 1.4));
    });
  },
  // An open-faced pointed helmet with cheek guards; a broad spear point.
  spearman: (pen) => {
    const { main, shade, light } = pen.p;
    head(pen);
    pen.shape('M -24 -10 Q -20 -30 -4 -44 Q 2 -36 12 -30 Q 22 -22 22 -6 L 22 10 Q 16 13 12 8 L 12 -4 L -2 -6 L -4 6 Q -8 10 -10 6 L -10 -6 Q -18 -8 -24 -10 Z', main);
    pen.detail(() => {
      pen.flat('M 12 -4 L 12 8 Q 16 13 22 10 L 22 -6 Q 18 -4 12 -4 Z', shade);
      pen.line('M -16 -16 Q -10 -30 -4 -38', light, 1.6);
    });
    eye(pen, -15, -2);
    pen.at(28, 22, 22, (w) => spear(w, 34, 26));
  },
  // A legionary helmet with a neck guard and a tall upright crest; a short sword.
  swordsman: (pen) => {
    const { main, shade, light } = pen.p;
    head(pen);
    pen.shape('M -6 -30 Q -8 -46 2 -48 Q 12 -46 10 -30 Z', shade);
    pen.detail(() => pen.line('M 2 -45 L 2 -32 M -2 -44 L -2 -32 M 6 -44 L 6 -32', main, 1.2));
    pen.shape('M -24 -10 Q -24 -32 0 -32 Q 22 -32 22 -12 L 30 -2 L 28 4 L 14 2 L 12 -6 L -2 -6 L -2 12 Q -6 16 -10 12 L -10 -6 L -24 -6 Z', main);
    pen.detail(() => {
      pen.flat('M 12 -6 L 14 2 L 28 4 L 30 -2 L 22 -12 Q 18 -6 12 -6 Z', shade);
      pen.line('M -24 -8 L 12 -8', pen.p.ink, 1.6);
      pen.line('M -16 -18 Q -10 -28 2 -29', light, 1.6);
    });
    eye(pen, -16, -2);
    pen.at(26, 20, 32, (w) => sword(w));
  },
  // A plain round helmet behind a tall curved scutum.
  defender: (pen) => {
    const { main, shade, light, ink } = pen.p;
    pen.at(-6, 0, 0, (hd) => {
      head(hd);
      hd.shape('M -22 -8 Q -22 -36 0 -36 Q 22 -36 22 -10 L 24 -4 L -24 -4 Z', main);
      hd.detail(() => {
        hd.line('M -12 -22 Q -6 -32 6 -32', light, 1.6);
        hd.line('M 0 -36 L 0 -42', ink, 3);
      });
      eye(hd, -15, 2);
    });
    pen.at(22, 12, 8, (w) => {
      w.shape('M -15 -28 Q 0 -32 15 -28 L 15 26 Q 0 30 -15 26 Z', main);
      w.detail(() => {
        w.flat('M 9 -28.6 Q 13 -28.4 15 -28 L 15 26 Q 13 26.6 9 27.4 Z', shade);
        w.line('M -11 -24 L -11 22', light, 1.4);
        w.line('M 0 -27 L 0 -8 M 0 8 L 0 26', ink, 1.6);
      });
      w.circle(0, 0, 6, shade);
      w.detail(() => w.circle(-1.6, -1.6, 1.8, light, false));
    });
  },
  // A head in a peaked cap with a long feather; a drawn bow and arrow.
  archer: (pen) => {
    const { main, shade, light } = pen.p;
    head(pen);
    pen.shape('M 4 -26 Q 14 -46 36 -46 Q 26 -36 12 -20 Z', light);
    pen.detail(() => pen.line('M 8 -26 Q 18 -40 32 -44', shade, 1));
    pen.shape('M -30 -12 Q -20 -14 -18 -20 Q -12 -34 4 -34 Q 20 -32 22 -12 Q 0 -16 -30 -12 Z', main);
    pen.detail(() => pen.flat('M -30 -12 Q 0 -16 22 -12 L 22 -15 Q 0 -19 -20 -16 Z', shade));
    eye(pen, -14, -6);
    pen.at(24, 20, -45, (w) => {
      w.line('M -3 -26 L -3 26', w.p.light, 1.4);
      w.shape('M -3 -28 Q 18 -14 18 0 Q 18 14 -3 28 Q 10 14 10 0 Q 10 -14 -3 -28 Z', w.p.main);
      w.bar('M -6 0 L 22 0', w.p.shade, 2.2);
      w.shape('M 30 0 L 21 -5 L 23 0 L 21 5 Z', w.p.light);
      w.shape('M -4 0 L -10 -5 L -12 -5 L -8 0 L -12 5 L -10 5 Z', w.p.light);
    });
  },
  // A horse's head; a spear.
  horseman: (pen) => {
    horse(pen);
    pen.detail(() => pen.line('M -6 -30 Q -2 -34 6 -30', pen.p.light, 1.2));
    pen.at(28, 24, 40, (w) => spear(w, 40, 16));
  },
  // A closed great helm with a plume; a lance with a pennant.
  knight: (pen) => {
    const { main, shade, ink, light } = pen.p;
    pen.shape('M -6 -28 Q -12 -46 8 -48 Q 30 -46 34 -20 Q 26 -32 14 -32 Q 8 -30 6 -26 Z', light);
    pen.detail(() => pen.line('M 0 -32 Q 4 -42 14 -42 Q 24 -40 28 -30', shade, 1.2));
    pen.shape('M -24 -24 Q -24 -30 -18 -30 L 16 -30 Q 22 -30 22 -24 L 22 22 Q 0 27 -24 22 Q -27 10 -24 0 L -28 -4 Z', main);
    pen.detail(() => {
      pen.flat('M 12 -30 L 16 -30 Q 22 -30 22 -24 L 22 22 Q 18 23 12 23.4 Z', shade);
      pen.line('M -20 -24 L -20 16', light, 1.4);
    });
    pen.shape('M -27 -10 L -2 -10 L -2 -5 L -26 -5 Z', ink);
    pen.detail(() => {
      for (const y of [4, 9, 14]) pen.circle(-16, y, 1.2, ink, false);
      pen.line('M -24 -2 L 14 -2', shade, 1.4);
    });
    pen.at(30, 22, 32, (w) => {
      w.shape('M 6 -32 L 22 -30 L 15 -26 L 22 -21 L 4 -22 Z', w.p.light);
      w.shape('M 0 -44 L 4.6 10 L -4.6 10 Z', w.p.main);
      w.detail(() => w.line('M -1 -36 L -2.2 6', w.p.light, 1.2));
      w.shape('M -9 16 L 9 16 L 4 8 L -4 8 Z', w.p.shade);
      w.bar('M 0 17 L 0 26', w.p.shade, 4);
    });
  },
  // The throwing arm and its stone over a timber frame; a spoked wheel.
  catapult: (pen) => {
    const { main, shade, ink, light } = pen.p;
    pen.bar('M -26 14 L 18 14', shade, 6);
    pen.bar('M -14 14 L -2 -6 L 10 14', shade, 4.6);
    pen.bar('M 6 4 L -18 -32', main, 5);
    pen.shape('M -26 -34 Q -24 -42 -16 -40 L -14 -34 Q -20 -30 -26 -34 Z', shade);
    pen.circle(-21, -42, 6.6, main);
    pen.detail(() => {
      pen.circle(-23, -44, 2, light, false);
      pen.line('M -14 6 L -8 -2', light, 1.2);
    });
    pen.circle(-2, -6, 3, ink, false);
    pen.at(23, 23, 0, (w) => {
      w.circle(0, 0, 14, w.p.main);
      w.circle(0, 0, 9.6, w.p.ground, false);
      for (const a of [0, 60, 120]) {
        const r = (a * Math.PI) / 180;
        const dx = Math.round(Math.cos(r) * 9.6 * 100) / 100;
        const dy = Math.round(Math.sin(r) * 9.6 * 100) / 100;
        w.bar(`M ${-dx} ${-dy} L ${dx} ${dy}`, w.p.shade, 2.6);
      }
      w.circle(0, 0, 3.6, w.p.main);
    });
  },
  // A kettle hat with a wide brim over a scarred face; a sword across a stack of coins.
  sellsword: (pen) => {
    const { main, shade, ink, light } = pen.p;
    head(pen);
    pen.shape('M -18 -14 Q -18 -38 0 -40 Q 18 -38 16 -14 Z', main);
    pen.shape('M -32 -12 Q -10 -22 26 -12 L 26 -7 Q -6 -16 -32 -6 Z', shade);
    pen.detail(() => {
      pen.line('M 0 -40 L 0 -16', shade, 1.4);
      pen.line('M -8 -30 Q -6 -36 -2 -37', light, 1.4);
      pen.line('M -14 0 L -8 8', ink, 1.6);
    });
    eye(pen, -15, -3);
    pen.at(22, 12, 40, (w) => sword(w, 30));
    pen.at(24, 30, 0, (w) => {
      for (const y of [6, -1, -8]) {
        w.shape(`M -13 ${y} L -13 ${y + 5} Q 0 ${y + 11} 13 ${y + 5} L 13 ${y} Z`, w.p.shade);
        w.shape(`M -13 ${y} Q 0 ${y - 6} 13 ${y} Q 0 ${y + 6} -13 ${y} Z`, w.p.main);
      }
      w.detail(() => w.line('M -6 -9.4 Q 0 -11 6 -9.4', w.p.light, 1.3));
    });
  },
  // A Corinthian helmet with a horsehair crest; a round shield with a lambda.
  hoplite: (pen) => {
    const { main, shade, ink, light } = pen.p;
    pen.shape('M -24 -22 Q -18 -46 6 -46 Q 30 -44 34 -16 L 24 -16 Q 20 -32 6 -34 Q -8 -34 -14 -22 Z', main);
    pen.detail(() => pen.line('M -16 -28 L -12 -26 M -10 -36 L -6 -31 M -2 -40 L 0 -33 M 8 -41 L 7 -33 M 16 -38 L 13 -31 M 23 -32 L 18 -27 M 28 -24 L 22 -22', shade, 1.6));
    pen.shape('M -27 -8 Q -26 -32 -2 -32 Q 20 -32 20 -8 L 20 12 Q 14 15 9 12 Q 6 5 0 4 L -8 6 L -9 20 L -21 20 Q -28 10 -27 -8 Z', main);
    pen.detail(() => {
      pen.flat('M 9 12 Q 6 5 0 4 L 8 -2 L 20 -4 L 20 12 Q 14 15 9 12 Z', shade);
      pen.line('M -18 -20 Q -12 -28 0 -29', light, 1.6);
    });
    pen.shape('M -28 -9 L -9 -11 Q -7 -7 -9 -3 L -27 -2 Z', ink);
    pen.shape('M -27 -2 L -22 -2 L -22 16 L -25 16 Z', ink);
    pen.at(19, 19, 0, (w) => {
      w.circle(0, 0, 17, w.p.main);
      w.circle(0, 0, 12.4, w.p.shade);
      w.shape('M 0 -9 L 9 9 L 4.6 9 L 0 0 L -4.6 9 L -9 9 Z', w.p.light);
    });
  },
  // A helmet crowned with a coronet seen from the side; a heater shield.
  kingsGuard: (pen) => {
    const { main, shade, ink, light } = pen.p;
    head(pen);
    pen.shape('M -22 -10 Q -22 -32 0 -32 Q 20 -32 20 -10 L 22 6 Q 16 8 12 4 L 12 -6 L -10 -6 L -10 8 L -14 8 L -14 -6 L -22 -6 Z', main);
    pen.shape('M -18 -26 L -22 -44 L -12 -34 L -4 -48 L 4 -34 L 14 -44 L 14 -26 Q -2 -30 -18 -26 Z', light);
    pen.detail(() => {
      pen.flat('M 12 -6 L 12 4 Q 16 8 22 6 L 20 -10 Q 16 -6 12 -6 Z', shade);
      for (const x of [-12, -4, 6]) pen.circle(x, -29.6, 1.6, shade, false);
      pen.line('M -16 -16 Q -12 -26 -2 -27', light, 1.4);
    });
    eye(pen, -17, -1);
    pen.at(24, 20, 0, (w) => {
      w.shape('M -15 -18 L 15 -18 L 15 0 Q 15 14 0 22 Q -15 14 -15 0 Z', w.p.main);
      w.detail(() => w.flat('M 0 -16.6 L 13.6 -16.6 L 13.6 0 Q 13.6 12.6 0 20.4 Z', w.p.shade));
      w.shape('M -7 -6 L -7 4 L 7 4 L 7 -6 L 3.6 -2 L 0 -9 L -3.6 -2 Z', ink);
      w.detail(() => w.shape('M -6 -4 L -6 3 L 6 3 L 6 -4 L 3.4 -0.6 L 0 -7 L -3.4 -0.6 Z', light));
    });
  },
  // A head in a laurel wreath; the twin pipes of an aulos.
  piper: (pen) => {
    const { shade, light } = pen.p;
    head(pen);
    pen.shape('M -20 -14 Q -24 -32 -6 -34 Q 14 -36 20 -18 Q 22 -6 16 4 Q 10 -6 6 -14 Q -6 -12 -20 -14 Z', shade);
    // The wreath: leaves along the brow and up over the crown.
    const leaves: [number, number, number][] = [[-20, -18, -60], [-16, -26, -40], [-8, -32, -15], [2, -34, 10], [11, -31, 35], [17, -24, 60]];
    for (const [x, y, a] of leaves) {
      pen.at(x, y, a, (l) => l.shape('M 0 -8 Q 4 -2.6 0 2.6 Q -4 -2.6 0 -8 Z', light));
    }
    pen.at(-2, -40, 0, (l) => l.shape('M 0 -7 Q 4 -1 0 5 Q -4 -1 0 -7 Z', light));
    pen.detail(() => pen.line('M -12 -6 Q -6 -10 -2 -6', light, 1.2));
    eye(pen, -14, -4);
    pen.at(26, 20, 0, (w) => {
      for (const s of [-1, 1]) {
        w.bar(`M 0 -18 L ${s * 13} 18`, w.p.main, 4.6);
        w.shape(`M ${s * 13 - 4} 16 L ${s * 13 + 4} 16 L ${s * 15 + 5} 25 L ${s * 15 - 5} 25 Z`, w.p.shade);
      }
      w.shape('M -4.6 -26 L 4.6 -26 L 4 -16 L -4 -16 Z', w.p.shade);
      w.detail(() => {
        for (const t of [0.3, 0.55, 0.8]) {
          w.circle(-13 * t, -18 + 36 * t, 1.1, w.p.ink, false);
          w.circle(13 * t, -18 + 36 * t, 1.1, w.p.ink, false);
        }
      });
    });
  },
  // A pointed hood over a shadowed face, one eye catching the light; a dagger, point down.
  scout: (pen) => {
    const { main, shade, ink, light } = pen.p;
    pen.shape('M -24 14 Q -30 -16 -8 -32 Q 4 -40 16 -48 Q 12 -38 18 -30 Q 26 -16 24 8 L 22 27 Q 6 30 -14 26 Z', main);
    pen.shape('M -26 -14 Q -16 -24 -6 -14 Q -4 0 -10 10 Q -18 14 -24 8 Q -28 -2 -26 -14 Z', ink);
    pen.detail(() => {
      pen.flat('M 18 -30 Q 26 -16 24 8 L 22 27 Q 18 28 14 28 Q 18 0 12 -24 Z', shade);
      pen.line('M -18 -24 Q -8 -32 6 -38', light, 1.4);
    });
    pen.circle(-17, -6, pen.small ? 2.8 : 2, light, false);
    pen.at(26, 22, 140, (w) => {
      w.shape('M 0 -30 Q 6 -14 4.6 0 L -4.6 0 Q -6 -14 0 -30 Z', w.p.main);
      w.detail(() => w.line('M 0 -26 L 0 -3', w.p.light, 1.2));
      w.shape('M -10 0 L 10 0 L 8 4.6 L -8 4.6 Z', w.p.shade);
      w.bar('M 0 6 L 0 14', w.p.shade, 4.4);
      w.circle(0, 17.6, 3.6, w.p.main);
    });
  },
  // A horse's head with a plume between its ears and a tassel at the throat; a short recurve bow.
  horseArcher: (pen) => {
    const { shade, light } = pen.p;
    horse(pen);
    pen.shape('M 0 -36 Q -6 -48 4 -52 Q 2 -44 8 -38 Z', shade);
    pen.shape('M -6 10 Q -10 18 -6 24 Q -2 18 -6 10 Z', shade);
    pen.at(26, 22, -38, (w) => {
      w.bar('M -4 -24 Q 2 -22 2 -16 Q 8 0 2 16 Q 2 22 -4 24', w.p.main, 4.4);
      w.line('M -4 -24 L -4 24', w.p.light, 1.4);
      w.bar('M -8 0 L 16 0', w.p.shade, 2);
      w.shape('M 23 0 L 15 -4.4 L 17 0 L 15 4.4 Z', w.p.light);
    });
    pen.detail(() => pen.line('M -10 -24 Q -2 -30 6 -34', light, 1));
  },
  // A spiked steppe helmet with a fur brim and a mail neck guard; a horsetail standard.
  khansGuard: (pen) => {
    const { main, shade, ink, light } = pen.p;
    head(pen);
    pen.shape('M 10 -16 L 24 -14 L 26 14 Q 18 16 12 10 Z', shade);
    pen.detail(() => pen.line('M 14 -8 L 24 -6 M 14 0 L 25 2 M 14 8 L 25 9', ink, 1.2));
    pen.shape('M -18 -18 Q -16 -32 0 -34 L 0 -48 L 3 -34 Q 18 -32 20 -18 Z', main);
    pen.shape('M -24 -14 Q -26 -22 -18 -22 Q -14 -26 -8 -22 Q -2 -26 4 -22 Q 10 -26 16 -22 Q 24 -24 24 -16 Q 26 -10 20 -10 L -20 -10 Q -26 -8 -24 -14 Z', shade);
    pen.detail(() => {
      pen.line('M -10 -26 Q -6 -31 0 -32', light, 1.4);
      pen.line('M -22 4 Q -16 0 -10 4', ink, 1.8);
    });
    eye(pen, -15, -4);
    pen.at(28, 14, 0, (w) => {
      w.bar('M 0 32 L 0 -22', w.p.shade, 3.4);
      w.shape('M 0 -34 L 3.6 -22 L -3.6 -22 Z', w.p.main);
      w.shape('M -8 -14 Q -14 6 -10 22 L -4 16 L 0 26 L 4 16 L 10 22 Q 14 6 8 -14 Z', w.p.light);
      w.detail(() => w.line('M -4 -10 Q -6 4 -4 14 M 4 -10 Q 6 4 4 14', w.p.shade, 1.2));
      w.shape('M -9 -20 L 9 -20 L 9 -14 L -9 -14 Z', w.p.main);
    });
  },
  // A shaman under a tall fan of five feathers, a fringe hanging over the eyes; a staff with ribbons and a bolt.
  skyCaller: (pen) => {
    const { main, shade, ink, light } = pen.p;
    // The fan: five long feathers spreading from behind the head (their quills hidden by it), the middle one
    // tallest, drawn outside in so it is on top.
    const feathers: [number, number][] = [[-38, 37], [38, 37], [-19, 41], [19, 41], [0, 43]];
    for (const [a, len] of feathers) {
      pen.at(-1, -10, a, (f) => {
        f.shape(`M 0 ${-len} Q 5 ${-len * 0.78} 3.6 ${-len * 0.4} L -3.6 ${-len * 0.4} Q -5 ${-len * 0.78} 0 ${-len} Z`, f.p.shade);
        f.line(`M 0 ${-len + 4} L 0 ${-len * 0.5}`, f.p.light, f.small ? 2 : 1.3);
      });
    }
    head(pen);
    pen.shape('M -22 -14 Q -20 -32 0 -32 Q 20 -32 20 -14 Z', main);
    pen.shape('M -25 -14 L 21 -14 L 21 -8 L -25 -8 Z', shade);
    pen.shape('M -25 -8 L -9 -8 L -9 2 L -25 2 Z', shade);
    pen.detail(() => {
      for (const x of [-21, -17, -13]) pen.line(`M ${x} -7 L ${x} 1`, ink, 1);
      pen.line('M -14 -24 Q -8 -30 2 -30', light, 1.4);
    });
    eye(pen, -15, 1);
    // The staff, upright at the lower right: two ribbons streaming back from under its head, a bolt on top.
    pen.at(26, 4, 0, (w) => {
      w.shape('M 0 -2 Q 12 2 16 22 L 10 23 Q 8 8 0 4 Z', w.p.main);
      w.shape('M 0 2 Q 8 10 9 30 L 3 30 Q 3 14 0 8 Z', w.p.light);
      w.bar('M 0 -4 L 0 44', w.p.shade, 3.6);
      w.shape('M 3 -27 L -6 -11 L -0.6 -11 L -3.6 1 L 8 -16 L 2.4 -16 L 7 -27 Z', w.small ? w.p.light : w.p.main);
    });
  },
  // The roof of a round felt tent breaking the top, its smoke ring above; a campfire.
  camp: (pen) => {
    const { main, shade, ink, light } = pen.p;
    pen.shape('M -26 -2 L 18 -2 L 18 24 Q -4 28 -26 24 Z', main);
    pen.shape('M -32 -2 Q -18 -26 -8 -34 L 0 -34 Q 10 -26 24 -2 Q -4 4 -32 -2 Z', main);
    pen.shape('M -10 -34 L 2 -34 L 1 -42 L -9 -42 Z', shade);
    pen.shape('M -14 4 L -2 4 L -2 25.6 L -14 25.6 Z', ink);
    pen.detail(() => {
      pen.flat('M 6 -2 L 18 -2 L 18 24 Q 12 25 6 25.4 Z', shade);
      pen.line('M -28 -6 Q -4 -2 20 -6 M -20 -18 Q -4 -15 12 -18', shade, 1.6);
      pen.line('M -26 8 Q -4 11 18 8', shade, 1.6);
      pen.line('M -22 -12 Q -14 -24 -8 -30', light, 1.4);
    });
    pen.at(26, 24, 0, (w) => {
      w.bar('M -12 10 L 12 2', w.p.shade, 4.4);
      w.bar('M -12 2 L 12 10', w.p.shade, 4.4);
      w.shape('M 0 -22 Q 10 -10 8 0 Q 6 6 0 6 Q -8 6 -8 -2 Q -8 -10 -2 -14 Q -1 -8 2 -8 Q 3 -15 0 -22 Z', w.p.main);
      w.detail(() => w.flat('M 0 -6 Q 4 -2 3 2 Q 2 4 0 4 Q -3 4 -3 0 Q -3 -3 0 -6 Z', w.p.light));
    });
  },
};

/**
 * The small form's paint: the figure in warm white with a pale tint of the main colour as its shade, on the same
 * dark ground and rim, the way today's glyphs stand light on the banner. At badge size a figure in the rim's own
 * colour sinks into the dark ground.
 */
function smallPaint(p: EmblemPaint): EmblemPaint {
  return { ...p, main: p.light, shade: mix(p.main, p.light, 0.45) };
}

/** The emblem for a unit type: the disc, then the unit's profile and weapon. `small` draws the simplified badge form. */
export function Emblem(p: { type: UnitTypeId; paint: EmblemPaint; small?: boolean }): ReactElement {
  const small = p.small === true;
  const rim = new Pen(p.paint, small);
  disc(rim);
  const pen = new Pen(small ? smallPaint(p.paint) : p.paint, small);
  EMBLEMS[p.type](pen);
  return <g data-emblem={p.type}>{rim.items}{pen.items}</g>;
}
