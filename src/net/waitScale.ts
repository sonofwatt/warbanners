// Real-time wait limits in the emulator tests are written for a quiet laptop. A shared CI runner can be several times
// slower, so every limit goes through wait(): one factor, set here once, 3x when CI is set. Test code only; nothing in
// the app imports this file. The factor is read when wait() is called, never at import.
export const WAIT_FACTOR_CI = 3;
export const wait = (ms: number): number => (process.env.CI ? ms * WAIT_FACTOR_CI : ms);
