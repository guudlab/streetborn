import { getLocales } from 'expo-localization';

import { en } from './en.ts';
import { tr, type Key } from './tr.ts';

export type Lang = 'tr' | 'en';
export type { Key };

/** The device language decides: Turkish on Turkish devices, English everywhere else. */
function detect(): Lang {
  try {
    return getLocales()[0]?.languageCode === 'tr' ? 'tr' : 'en';
  } catch {
    return 'en';
  }
}

// A language change in the device settings restarts the app, so one lookup at startup is enough.
export const lang: Lang = detect();
const dict: Record<Key, string> = lang === 'tr' ? tr : en;

/** Looks up a UI string and fills in {name} placeholders. */
export function t(key: Key, vars?: Record<string, string | number>): string {
  const s = dict[key];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

// Web: keep <html lang> in step with the UI language (screen readers, hyphenation).
if (typeof document !== 'undefined') document.documentElement.lang = lang;
