// Prototype game rules, ported from tasarim-yonleri/prototip/game.js (GDD v2).
// LOCAL ONLY: nothing here is saved or validated by the server yet. When the
// app is wired to Supabase, rewards come from match-finish instead of here.
// Rating starts at 6.0: goal +1.0, assist +0.7, missed chance −0.5,
// turnover −0.3, team result ±0.3. XP to reach level n = 100 · n^1.5.

export type StatKey = 'sut' | 'pas' | 'hiz' | 'fizik';
export type Stats = Record<StatKey, number>;
export type MomentKind = 'sut' | 'pas' | 'serbest';
export type ShotOut = 'gol' | 'kurtardi' | 'aut' | 'ust' | 'direk';
export type Result = 'G' | 'B' | 'M';

export interface Moment { min: number; kind: MomentKind; title: string; keeper?: number }

export const OPP = 'Kartaltepe SK';
export const MOMENTS: readonly Moment[] = [
  { min: 23, kind: 'sut', title: 'Ceza sahası yayı', keeper: 0 },
  { min: 51, kind: 'pas', title: 'Kontra atak' },
  { min: 84, kind: 'serbest', title: 'Serbest vuruş', keeper: 0.1 },
];

export const DRILLS: Record<StatKey, { stat: string; name: string; place: string }> = {
  sut: { stat: 'Şut', name: 'Duvara şut', place: 'Mahalle duvarı' },
  pas: { stat: 'Pas', name: 'Duvar pası', place: 'Garaj önü' },
  hiz: { stat: 'Hız', name: 'Koni slalomu', place: 'Sokak' },
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

export const xpNeed = (n: number) => Math.round(100 * Math.pow(n, 1.5));
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const ovr = (s: Stats) => Math.round((s.sut + s.pas + s.hiz + s.fizik) / 4);

/** Level progress 0..1 between the current and next level thresholds. */
export function levelProgress(level: number, xp: number) {
  const a = xpNeed(level), b = xpNeed(level + 1);
  return clamp((xp - a) / (b - a), 0, 1);
}

export function addXp(level: number, xp: number, gain: number) {
  let lv = level;
  const total = xp + gain;
  while (total >= xpNeed(lv + 1)) lv++;
  return { level: lv, xp: total, ups: lv - level };
}

export interface ShotInput { tx: number; ty: number; power: number }
export interface ShotResult { out: ShotOut; goal: boolean; fx: number; fy: number; kx: number; power: number; perfect: boolean }

/** tx −1..1 between the posts, ty 0..1 ground to crossbar, power 0..1 (≈0.62 ideal). */
export function resolveShot(
  rnd: () => number,
  { tx, ty, power }: ShotInput,
  ctx: { moment: Moment; stats: Stats; assisted: boolean; firstEver: boolean },
): ShotResult {
  const r = (a: number, b: number) => a + rnd() * (b - a);
  const { moment, stats, firstEver } = ctx;
  const skill = stats.sut + (moment.kind === 'serbest' ? (stats.pas - 50) * 0.4 : 0);
  let noise = (1 - skill / 100) * (ctx.assisted ? 0.3 : 0.36);
  if (firstEver) noise *= 0.35; // first shot is a tutorial: close to a goal
  const pErr = Math.abs(power - 0.62);
  let fx = tx + r(-noise, noise);
  let fy = ty + r(-noise, noise) * 0.8 + (power - 0.62) * 0.5;
  if (pErr < 0.08) { fx = tx + (fx - tx) * 0.5; fy = ty + (fy - ty) * 0.5; }
  fy = Math.max(0.02, fy);
  const guessRight = rnd() < (firstEver ? 0.1 : 0.42);
  let kx = guessRight ? clamp(tx, -0.9, 0.9) : tx > 0 ? -0.55 : 0.55;
  if (Math.abs(tx) < 0.18) kx = guessRight ? 0 : rnd() < 0.5 ? -0.6 : 0.6;
  kx += moment.keeper ?? 0;
  let out: ShotOut;
  if (Math.abs(fx) > 1.0) out = 'aut';
  else if (fy > 1.0) out = 'ust';
  else if (Math.abs(fx - kx) < 0.36 && fy < 0.82 && !(power > 0.9 && Math.abs(fx - kx) > 0.22)) out = 'kurtardi';
  else if (Math.abs(fx) > 0.93 && rnd() < 0.5) out = 'direk';
  else out = 'gol';
  return { out, goal: out === 'gol', fx, fy, kx, power, perfect: pErr < 0.08 };
}

/** A pass to the open teammate usually becomes an assist. */
export function resolvePass(rnd: () => number, open: boolean, pas: number) {
  const ok = open ? rnd() < 0.75 + (pas - 50) / 200 : rnd() < 0.25;
  return { ok, open };
}

export type Grade = 'mukemmel' | 'iyi' | 'kacti';
/** q: 0..1 hit quality on the timing bar (1 = centre). */
export function gradeDrill(q: number) {
  const grade: Grade = q >= 0.85 ? 'mukemmel' : q >= 0.5 ? 'iyi' : 'kacti';
  const xp = grade === 'mukemmel' ? 30 : grade === 'iyi' ? 20 : 8;
  const progress = grade === 'mukemmel' ? 2 : grade === 'iyi' ? 1 : 0;
  return { grade, xp, progress };
}

export interface MatchLogEntry { min: number; kind: MomentKind; ok: boolean }
export interface MatchState {
  i: number; us: number; them: number; goals: number; assists: number; missed: number; lost: number; rating: number;
  log: MatchLogEntry[];
}

export function matchRewards(m: MatchState) {
  const result: Result = m.us > m.them ? 'G' : m.us === m.them ? 'B' : 'M';
  let rating = m.rating + (result === 'G' ? 0.3 : result === 'M' ? -0.3 : 0);
  rating = Math.round(clamp(rating, 1, 10) * 10) / 10;
  const coins = 120 + 40 * m.goals + 30 * m.assists + (rating >= 7 ? 60 : 0) + (result === 'G' ? 50 : 0);
  const xp = Math.round(40 + 10 * m.goals + 6 * m.assists + Math.max(0, rating - 6) * 8);
  const trustDelta = rating >= 7 ? 4 : rating >= 6 ? 1 : -3;
  return { result, rating, coins, xp, trustDelta, scout: rating >= 6.5 };
}

/** Simulated flow between moments: the opponent scores in the 38th minute. */
export function eventsBetween(fromMin: number, toMin: number) {
  return fromMin < 38 && toMin >= 38 ? [{ min: 38, text: `${OPP} golü` }] : [];
}
