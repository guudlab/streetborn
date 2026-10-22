import { xpNeed } from '@streetborn/economy';
import { t } from '../i18n/index.ts';

// Career-screen rules from the prototype (tasarim-yonleri/prototip/game.js).
// Match outcomes, rating and rewards are NOT here: they come from
// packages/engine and packages/economy, the same code the server runs.

export type StatKey = 'sut' | 'pas' | 'hiz' | 'fizik';
export type Stats = Record<StatKey, number>;

const drill = (k: StatKey) => ({ stat: t(`drill.${k}.stat`), name: t(`drill.${k}.name`), place: t(`drill.${k}.place`) });
export const DRILLS: Record<StatKey, { stat: string; name: string; place: string }> = {
  sut: drill('sut'), pas: drill('pas'), hiz: drill('hiz'), fizik: drill('fizik'),
};

export interface Offer {
  id: string; club: string; league: string; role: string; weekly: number; length: string; note: string; req: string | null;
}
export const OFFERS: readonly Offer[] = [
  { id: 'kartaltepe', club: 'Kartaltepe SK', league: t('offer.kartaltepe.league'), role: t('offer.kartaltepe.role'), weekly: 300, length: t('offer.kartaltepe.length'),
    note: t('offer.kartaltepe.note'), req: null },
  { id: 'bogazici', club: 'Boğaziçi Gençlik FK', league: t('offer.bogazici.league'), role: t('offer.bogazici.role'), weekly: 450, length: t('offer.bogazici.length'),
    note: t('offer.bogazici.note'), req: t('offer.bogazici.req') },
];

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const ovr = (s: Stats) => Math.round((s.sut + s.pas + s.hiz + s.fizik) / 4);

/** Level progress 0..1 between the current and next level thresholds. */
export function levelProgress(level: number, xp: number) {
  const a = xpNeed(level), b = xpNeed(level + 1);
  return clamp((xp - a) / (b - a), 0, 1);
}

export const OPP = 'Kartaltepe SK';
export const MOMENT_TITLE = { shot: t('moment.shot'), pass: t('moment.pass'), freekick: t('moment.freekick') } as const;

export type Grade = 'mukemmel' | 'iyi' | 'kacti';
/** q: 0..1 hit quality on the timing bar (1 = centre). */
export function gradeDrill(q: number) {
  const grade: Grade = q >= 0.85 ? 'mukemmel' : q >= 0.5 ? 'iyi' : 'kacti';
  const xp = grade === 'mukemmel' ? 30 : grade === 'iyi' ? 20 : 8;
  const progress = grade === 'mukemmel' ? 2 : grade === 'iyi' ? 1 : 0;
  return { grade, xp, progress };
}
