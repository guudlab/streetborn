import type { Moment } from '@streetborn/engine';
import { xpNeed } from '@streetborn/economy';
import { t } from '../i18n/index.ts';

// Career-screen rules from the prototype (tasarim-yonleri/prototip/game.js).
// Match outcomes, rating and rewards are NOT here: they come from
// packages/engine and packages/economy, the same code the server runs.

export type StatKey = 'sut' | 'pas' | 'hiz' | 'fizik';
export type Stats = Record<StatKey, number>;
/** The mini games: one per stat, plus omuz oku (defense), which trains no stat. */
export type DrillKey = StatKey | 'omuz';
/** What a "nasıl oynanır" demo can teach: the mini games and the match's three moments. */
export type HowToKind = DrillKey | 'mShot' | 'mPass' | 'mDefense';

const drill = (k: DrillKey) => ({ stat: t(`drill.${k}.stat`), name: t(`drill.${k}.name`), place: t(`drill.${k}.place`) });
export const DRILLS: Record<DrillKey, { stat: string; name: string; place: string }> = {
  sut: drill('sut'), pas: drill('pas'), hiz: drill('hiz'), fizik: drill('fizik'), omuz: drill('omuz'),
};

export interface Offer {
  id: string; club: string; league: string; role: string; weekly: number; length: string; note: string; req: string | null;
}
export const OFFERS: readonly Offer[] = [
  { id: 'kartaltepe', club: t('club.kartaltepe'), league: t('offer.kartaltepe.league'), role: t('offer.kartaltepe.role'), weekly: 300, length: t('offer.kartaltepe.length'),
    note: t('offer.kartaltepe.note'), req: null },
  { id: 'bogazici', club: t('club.bogazici'), league: t('offer.bogazici.league'), role: t('offer.bogazici.role'), weekly: 450, length: t('offer.bogazici.length'),
    note: t('offer.bogazici.note'), req: t('offer.bogazici.req') },
];

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const ovr = (s: Stats) => Math.round((s.sut + s.pas + s.hiz + s.fizik) / 4);

/** Level progress 0..1 between the current and next level thresholds. */
export function levelProgress(level: number, xp: number) {
  const a = xpNeed(level), b = xpNeed(level + 1);
  return clamp((xp - a) / (b - a), 0, 1);
}

export const OPP = t('club.kartaltepe');
export const MOMENT_TITLE = {
  shot: t('moment.shot'), pass: t('moment.pass'), freekick: t('moment.freekick'), defense: t('moment.defense'),
  penalty: t('moment.penalty'), decision: t('moment.decision'), halftime: t('moment.halftime'),
} as const;

/** The title of a moment; engine 5 shots and free kicks also say where they are taken from. */
export function momentTitle(m: Moment): string {
  if (m.spot && m.kind === 'shot') return t(`moment.shot.${m.spot}`);
  if (m.spot && m.kind === 'freekick') return t(`moment.freekick.${m.spot}`);
  return MOMENT_TITLE[m.kind];
}
