import type { EconomyConfig } from './config.ts';
import { rng } from './random.ts';

// Phone events: once a day, after the first finished match, someone from the player's life
// sends a message with two answers. Each answer moves morale, mahalle respect, coach trust
// or coin a little. The Edge Function picks the day's event from a seed and applies the
// answer; the app only shows the texts (i18n `phone.<key>.*`) and the effect chips.

export type PhoneSender =
  | 'kerem' | 'anne' | 'burak' | 'kardes' | 'gazete' | 'kuzen' | 'berber' | 'ogretmen' | 'firinci'
  | 'teyze' | 'muhtar' | 'radyo' | 'cocuklar' | 'yabanci'
  | 'hoca' | 'kaptan' | 'taraftar' | 'muhabir' | 'baskan' | 'takimArkadasi' | 'tv';

/** `mahalle` events come only before the first club, `club` only with a contract, `any` always. */
export type PhoneStage = 'mahalle' | 'club' | 'any';

/** One answer. m: morale, r: respect, t: coach trust (club events only), c: coin tier (−3..3, see phoneEffect). */
export interface PhoneOption { m?: number; r?: number; t?: number; c?: number }

export interface PhoneEvent { key: string; from: PhoneSender; stage: PhoneStage; a: PhoneOption; b: PhoneOption }

export interface PhoneEffect { morale: number; respect: number; trust: number; coin: number }

/** The whole catalogue. Keys are stored with answers: never rename or reuse one, only add. */
export const PHONE_EVENTS: readonly PhoneEvent[] = [
  // Friends
  { key: 'halisaha', from: 'kerem', stage: 'any', a: { m: 6, r: 1, c: -1 }, b: { m: -2 } },
  { key: 'pas', from: 'kerem', stage: 'any', a: { m: 2, r: 1 }, b: { m: 3, r: -2 } },
  { key: 'cayBahcesi', from: 'kerem', stage: 'any', a: { m: 5, c: -1 }, b: { m: -1, r: 1 } },
  { key: 'derbiBilet', from: 'kerem', stage: 'any', a: { m: 7, c: -2 }, b: { m: -2 } },
  { key: 'isgal', from: 'kerem', stage: 'mahalle', a: { r: 3 }, b: { m: 3, r: -1 } },
  // Family
  { key: 'bakkal', from: 'anne', stage: 'any', a: { m: 6, c: -2 }, b: { m: -3 } },
  { key: 'dogumGunu', from: 'anne', stage: 'any', a: { m: 8 }, b: { m: -3, r: 1 } },
  { key: 'imza', from: 'kardes', stage: 'any', a: { r: 2, c: -1 }, b: { m: -1 } },
  { key: 'video', from: 'kardes', stage: 'any', a: { m: 3, r: 2 }, b: { m: -1 } },
  { key: 'bisiklet', from: 'kardes', stage: 'any', a: { m: 4, c: -1 }, b: { m: -2 } },
  { key: 'matematik', from: 'kardes', stage: 'any', a: { m: 4 }, b: { m: -2 } },
  { key: 'dugun', from: 'kuzen', stage: 'any', a: { m: 8, c: -1 }, b: { m: -2, r: 1 } },
  // Mahalle
  { key: 'hakem', from: 'burak', stage: 'mahalle', a: { r: 3, m: -1 }, b: { r: -1 } },
  { key: 'yokus', from: 'burak', stage: 'mahalle', a: { r: 2, m: -1 }, b: { m: 2, r: -1 } },
  { key: 'kaleci', from: 'burak', stage: 'mahalle', a: { r: 2, m: -2 }, b: { r: -1 } },
  { key: 'gizliTurnuva', from: 'burak', stage: 'club', a: { r: 4, t: -3 }, b: { t: 1, r: -2 } },
  { key: 'derbiLaf', from: 'gazete', stage: 'mahalle', a: { m: 4, r: -1 }, b: { r: 2 } },
  { key: 'fotograf', from: 'berber', stage: 'any', a: { r: 2, m: 2 }, b: { r: -1 } },
  { key: 'okulKonusma', from: 'ogretmen', stage: 'any', a: { r: 3, m: 2 }, b: { m: -1 } },
  { key: 'tabela', from: 'firinci', stage: 'mahalle', a: { c: 2, r: -1 }, b: { r: 1 } },
  { key: 'cam', from: 'teyze', stage: 'any', a: { r: 3, c: -2 }, b: { r: -2 } },
  { key: 'temizlik', from: 'muhtar', stage: 'any', a: { r: 3, m: -1 }, b: { r: -1 } },
  { key: 'canliYayin', from: 'radyo', stage: 'mahalle', a: { r: 2, m: 2 }, b: { r: -1 } },
  { key: 'damdakiTop', from: 'cocuklar', stage: 'any', a: { r: 2, m: 2 }, b: { r: -1 } },
  { key: 'kapora', from: 'yabanci', stage: 'any', a: { c: -3, m: -4 }, b: { m: 1, r: 1 } },
  // Club
  { key: 'ekstraIdman', from: 'hoca', stage: 'club', a: { t: 2, m: -2 }, b: { t: -2, m: 2 } },
  { key: 'hosgeldin', from: 'kaptan', stage: 'club', a: { t: 1, m: 3, c: -2 }, b: { m: -2 } },
  { key: 'tribun', from: 'taraftar', stage: 'club', a: { r: 2, m: 3 }, b: { r: -1 } },
  { key: 'yedek', from: 'muhabir', stage: 'club', a: { t: 2 }, b: { m: 3, t: -3 } },
  { key: 'dernekYemegi', from: 'baskan', stage: 'club', a: { t: 1, r: 1, c: -1 }, b: { t: -1 } },
  { key: 'parti', from: 'takimArkadasi', stage: 'club', a: { m: 5, t: -2 }, b: { t: 1, m: -1 } },
  { key: 'roportaj', from: 'tv', stage: 'club', a: { r: 3, m: 2, t: -1 }, b: { t: 1 } },
];

const BY_KEY = new Map(PHONE_EVENTS.map((e) => [e.key, e]));
export const phoneEvent = (key: string): PhoneEvent | undefined => BY_KEY.get(key);

/** The numbers an answer moves. Coin tiers come from the config so they can be tuned live; trust only counts at a club. */
export function phoneEffect(option: PhoneOption, club: boolean, config: EconomyConfig): PhoneEffect {
  const k = config.kariyer;
  const tier = Math.abs(option.c ?? 0);
  const size = tier === 1 ? k.phoneCoinS : tier === 2 ? k.phoneCoinM : tier === 3 ? k.phoneCoinL : 0;
  return {
    morale: option.m ?? 0,
    respect: option.r ?? 0,
    trust: club ? option.t ?? 0 : 0,
    coin: Math.sign(option.c ?? 0) * size,
  };
}

/**
 * The day's event. The seed is player and day, so every call that day agrees; events seen
 * in `recent` are skipped while others are left. Returns null before the player has
 * `phoneMinMatches` finished matches.
 */
export function pickPhoneEvent(
  seed: string, ctx: { club: boolean; matches: number; recent: readonly string[] }, config: EconomyConfig,
): PhoneEvent | null {
  if (ctx.matches < config.kariyer.phoneMinMatches) return null;
  const pool = PHONE_EVENTS.filter((e) => e.stage === 'any' || e.stage === (ctx.club ? 'club' : 'mahalle'));
  const fresh = pool.filter((e) => !ctx.recent.includes(e.key));
  const from = fresh.length > 0 ? fresh : pool;
  return from[rng(`${seed}:phone`)(from.length)]!;
}
