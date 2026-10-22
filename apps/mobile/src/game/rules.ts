import { xpNeed } from '@streetborn/economy';

// Career-screen rules from the prototype (tasarim-yonleri/prototip/game.js).
// Match outcomes, rating and rewards are NOT here: they come from
// packages/engine and packages/economy, the same code the server runs.

export type StatKey = 'sut' | 'pas' | 'hiz' | 'fizik';
export type Stats = Record<StatKey, number>;

export const DRILLS: Record<StatKey, { stat: string; name: string; place: string }> = {
  sut: { stat: 'Şut', name: 'Duvara şut', place: 'Mahalle duvarı' },
  pas: { stat: 'Pas', name: 'Duvar pası', place: 'Garaj önü' },
  hiz: { stat: 'Hız', name: 'Koni slalomu', place: 'Mahalle arası' },
  fizik: { stat: 'Fizik', name: 'Merdiven koşusu', place: 'Apartman merdiveni' },
};

export interface Offer {
  id: string; club: string; league: string; role: string; weekly: number; length: string; note: string; req: string | null;
}
export const OFFERS: readonly Offer[] = [
  { id: 'kartaltepe', club: 'Kartaltepe SK', league: 'Amatör Lig · A Grubu', role: 'İlk 11', weekly: 300, length: '1 sezon',
    note: 'Bugün oynadığın rakip. Hocası seni ilk 11 istiyor.', req: null },
  { id: 'bogazici', club: 'Boğaziçi Gençlik FK', league: 'Bölgesel Amatör Lig', role: 'Rotasyon', weekly: 450, length: '1 sezon + opsiyon',
    note: 'İzci raporundan geldi. Önce deneme maçı var.', req: 'Deneme maçında not 7,0 veya üstü' },
];

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const ovr = (s: Stats) => Math.round((s.sut + s.pas + s.hiz + s.fizik) / 4);

/** Level progress 0..1 between the current and next level thresholds. */
export function levelProgress(level: number, xp: number) {
  const a = xpNeed(level), b = xpNeed(level + 1);
  return clamp((xp - a) / (b - a), 0, 1);
}

export const OPP = 'Kartaltepe SK';
export const MOMENT_TITLE = { shot: 'Ceza sahası yayı', pass: 'Kontra atak', freekick: 'Serbest vuruş' } as const;

export type Grade = 'mukemmel' | 'iyi' | 'kacti';
/** q: 0..1 hit quality on the timing bar (1 = centre). */
export function gradeDrill(q: number) {
  const grade: Grade = q >= 0.85 ? 'mukemmel' : q >= 0.5 ? 'iyi' : 'kacti';
  const xp = grade === 'mukemmel' ? 30 : grade === 'iyi' ? 20 : 8;
  const progress = grade === 'mukemmel' ? 2 : grade === 'iyi' ? 1 : 0;
  return { grade, xp, progress };
}
