// The War Chief's gunstock club (rules 11), one outline for the 2D and 3D figures, in the figure's SVG units with the
// grip in the right hand at about (9, -7). Our own drawing of the old form: a slim shaft that bends at an elbow into a
// broad head, its inner edge rising straight to a flat top that climbs to a point over a concave outer edge, an iron
// spike set in the outer edge at the bend, and brass tacks down its face.

/** The wooden board, as [x, y] corners. */
export const GUNSTOCK: readonly (readonly [number, number])[] = [
  [8.42, -7.06], [8.96, -6.52], [13.67, -10.71], [14.47, -11.45], [14.99, -12.36], [15.99, -14.69],
  [17.18, -16.9], [17.71, -18], [18.32, -18.9], [19.12, -20.2], [19.82, -21.6], [19.9, -22.04],
  [19.12, -21.7], [17.71, -21.3], [15.77, -21.04], [14.84, -20.9], [14.75, -19.4], [14.68, -17.66],
  [14.42, -15.87], [13.72, -14.19], [12.97, -12.93], [12.3, -11.75], [11.8, -10.43], [9.06, -7.69],
];

/** The iron spike, its base set into the board's outer edge at the bend. */
export const GUNSTOCK_SPIKE: readonly (readonly [number, number])[] = [[14.3, -11.2], [15.1, -12.6], [18.4, -10.95]];

/** The brass tacks, [x, y, radius]: smaller on the slim shaft. */
export const GUNSTOCK_TACKS: readonly (readonly [number, number, number])[] = [
  [10.46, -8.56, 0.4], [12.01, -10.11, 0.42], [14.51, -13.6, 0.55], [15.49, -15.63, 0.55], [16.47, -17.66, 0.55], [16.9, -19.6, 0.55],
];

/** Dark iron for the spike. */
export const SPIKE_IRON = '#2E2E33';
