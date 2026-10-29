import { lang, t } from '../i18n/index.ts';

// Number formatting without relying on Intl (Hermes builds may lack locale data).
// Turkish: 1.240 and 7,5. English: 1,240 and 7.5.
const GROUP = lang === 'tr' ? '.' : ',';
const POINT = lang === 'tr' ? ',' : '.';

export function num(n: number, digits = 0) {
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(digits);
  const [int = '0', frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP);
  return (neg ? '−' : '') + grouped + (frac ? POINT + frac : '');
}

/** Signed value for rating changes: +1,0 / −0,5. */
export function delta(n: number, digits = 1) {
  return (n > 0 ? '+' : '') + num(n, digits);
}

export function mmss(ms: number) {
  const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

/** An effect in plain words ("Moralin yükselir") instead of a signed number ("Moral +5"). */
export const effectText = (kind: 'shoot' | 'morale' | 'respect' | 'trust', n: number) => t(n >= 0 ? `fx.${kind}.up` : `fx.${kind}.down`);
