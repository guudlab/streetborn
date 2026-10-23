/**
 * Names players type: nicknames and mahalle names. Shared by the app (instant
 * feedback) and the Edge Functions (the real check). The word list is a small
 * starting point, not a full moderation system.
 */
export type NameKind = 'nick' | 'mahalle';
export type NameProblem = 'too_short' | 'too_long' | 'bad_chars' | 'blocked';

export const NAME_LIMITS: Record<NameKind, { min: number; max: number }> = {
  nick: { min: 2, max: 14 },
  mahalle: { min: 2, max: 18 },
};

const ALLOWED = /^[\p{L}\p{N} _'’-]+$/u;

/** Letters people swap for others to dodge a filter. */
const LOOKALIKE: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };

// Matched inside the squashed name (no spaces or punctuation), so keep them 4+ letters.
const BLOCKED_PARTS = ['orospu', 'yarrak', 'yarak', 'ibne', 'pust', 'piclik', 'gotveren', 'siktir', 'sikik', 'fuck', 'shit', 'bitch', 'nigger', 'amina', 'amcik'];
// Short ones only match as a whole word.
const BLOCKED_WORDS = ['amk', 'aq', 'sik', 'got', 'bok', 'pic', 'mk', 'oc'];

/** Lower case (Turkish rules), no accents, look-alike digits mapped back to letters. */
export function normalizeName(raw: string): string {
  return raw
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g')
    .replace(/[01345 7@$]/g, (c) => LOOKALIKE[c] ?? c);
}

export function checkName(raw: string, kind: NameKind): NameProblem | null {
  const name = raw.trim();
  const { min, max } = NAME_LIMITS[kind];
  if (Array.from(name).length < min) return 'too_short';
  if (Array.from(name).length > max) return 'too_long';
  if (!ALLOWED.test(name)) return 'bad_chars';
  const squashed = normalizeName(name).replace(/[^a-z]/g, '');
  const words = normalizeName(name).split(/[^a-z]+/).filter(Boolean);
  if (BLOCKED_PARTS.some((b) => squashed.includes(b))) return 'blocked';
  if (words.some((w) => BLOCKED_WORDS.includes(w))) return 'blocked';
  return null;
}
