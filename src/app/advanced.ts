import type { ChestSetting, MatchSettings, TimeSetting, WeatherSetting } from '../engine';

// The advanced match options chosen on the new match screen (and the online lobby). Chests is a rule the map
// generator reads; weather and time of day are looks only. All three live in MatchSettings as optional fields, and
// only a choice other than the default is written, so a default match's settings are exactly today's.

export const CHEST_CHOICES: readonly ChestSetting[] = ['few', 'normal', 'many'];
export const WEATHER_CHOICES: readonly WeatherSetting[] = ['clear', 'cloudy', 'rain', 'snow', 'random'];
export const TIME_CHOICES: readonly TimeSetting[] = ['day', 'dawn', 'dusk', 'night', 'random'];

export interface Advanced { chests: ChestSetting; weather: WeatherSetting; time: TimeSetting }
export const DEFAULT_ADVANCED: Advanced = { chests: 'normal', weather: 'clear', time: 'day' };

export type Weather = Exclude<WeatherSetting, 'random'>;
export type TimeOfDay = Exclude<TimeSetting, 'random'>;
export interface Look { weather: Weather; time: TimeOfDay }

type AdvancedPart = Pick<MatchSettings, 'chests' | 'weather' | 'time'>;

/** The settings fields for a set of choices: only those that differ from the default. */
export function advancedPart(a: Partial<Advanced> | undefined): AdvancedPart {
  const out: AdvancedPart = {};
  if (a === undefined) return out;
  if (a.chests !== undefined && a.chests !== DEFAULT_ADVANCED.chests && CHEST_CHOICES.includes(a.chests)) out.chests = a.chests;
  if (a.weather !== undefined && a.weather !== DEFAULT_ADVANCED.weather && WEATHER_CHOICES.includes(a.weather)) out.weather = a.weather;
  if (a.time !== undefined && a.time !== DEFAULT_ADVANCED.time && TIME_CHOICES.includes(a.time)) out.time = a.time;
  return out;
}

/** Reads the advanced fields of an untrusted settings object; null when one is present but not a known choice. */
export function readAdvanced(o: Record<string, unknown>): AdvancedPart | null {
  const { chests, weather, time } = o;
  if (chests !== undefined && !CHEST_CHOICES.includes(chests as ChestSetting)) return null;
  if (weather !== undefined && !WEATHER_CHOICES.includes(weather as WeatherSetting)) return null;
  if (time !== undefined && !TIME_CHOICES.includes(time as TimeSetting)) return null;
  return advancedPart({ chests: chests as ChestSetting | undefined, weather: weather as WeatherSetting | undefined, time: time as TimeSetting | undefined });
}

const RANDOM_WEATHER: readonly Weather[] = ['clear', 'cloudy', 'rain', 'snow'];
const RANDOM_TIME: readonly TimeOfDay[] = ['day', 'dawn', 'dusk', 'night'];

// A small integer mix of the seed (not the match's rng, which it must never touch), salted per option so weather
// and time are not tied to each other.
function mix(seed: number, salt: number): number {
  let h = (seed ^ salt) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** The weather and time of day a match is drawn with. Random is picked from the seed, so it is the same for the
 * whole match and on every phone. */
export function lookOf(settings: Pick<MatchSettings, 'seed' | 'weather' | 'time'> | null | undefined): Look {
  if (!settings) return { weather: 'clear', time: 'day' };
  const seed = settings.seed >>> 0;
  const w = settings.weather ?? 'clear';
  const t = settings.time ?? 'day';
  const weather = w === 'random' ? RANDOM_WEATHER[mix(seed, 0x57ea7e) % RANDOM_WEATHER.length]! : WEATHER_CHOICES.includes(w) ? w as Weather : 'clear';
  const time = t === 'random' ? RANDOM_TIME[mix(seed, 0x71de) % RANDOM_TIME.length]! : TIME_CHOICES.includes(t) ? t as TimeOfDay : 'day';
  return { weather, time };
}
