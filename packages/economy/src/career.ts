import type { CareerConfig, EconomyConfig, LeagueTier } from './config.ts';
import { rng } from './random.ts';
import type { RewardInput } from './rewards.ts';
import { matchReward } from './rewards.ts';

// Amateur club career (GDD v3.1 section 7): first offer, contracts, a 14-day NPC
// league per player, league match rewards, coach trust and season end. Pure and
// seeded, so the app can draw the same league table the server settles.

export interface ClubRef { key: string; name: string }

/** NPC clubs per tier (tier index 0..2). Invented names, no real clubs. */
export const CLUBS: readonly (readonly ClubRef[])[] = [
  [
    { key: 'kartaltepe', name: 'Kartaltepe SK' }, { key: 'bogazici', name: 'Boğaziçi Gençlik FK' },
    { key: 'yildirim', name: 'Yıldırımspor' }, { key: 'camlica', name: 'Çamlıca Gençlerbirliği' },
    { key: 'dereboyu', name: 'Dereboyu SK' }, { key: 'esentepe', name: 'Esentepe Gücü' },
    { key: 'kuyubasi', name: 'Kuyubaşı FK' }, { key: 'gunesli', name: 'Güneşli Gençlik' },
    { key: 'kocatas', name: 'Kocataş Spor' }, { key: 'hisarustu', name: 'Hisarüstü SK' },
  ],
  [
    { key: 'sariyar', name: 'Sarıyar SK' }, { key: 'kemeralti', name: 'Kemeraltı FK' },
    { key: 'ulubatli', name: 'Ulubatlı Gençlik' }, { key: 'karaagac', name: 'Karaağaç Spor' },
    { key: 'taskopru', name: 'Taşköprü SK' }, { key: 'yesilvadi', name: 'Yeşilvadi FK' },
    { key: 'akincilar', name: 'Akıncılar Gücü' }, { key: 'bayirbasi', name: 'Bayırbaşı SK' },
    { key: 'demirkapi', name: 'Demirkapı FK' }, { key: 'koprubasi', name: 'Köprübaşı Gençlik' },
  ],
  [
    { key: 'ilgaz', name: 'Ilgaz Gücü' }, { key: 'ovacik', name: 'Ovacık FK' },
    { key: 'karadere', name: 'Karadere SK' }, { key: 'gokceada', name: 'Gökçeada Gençlik' },
    { key: 'selvili', name: 'Selvili Spor' }, { key: 'ardicli', name: 'Ardıçlı FK' },
    { key: 'kirkpinar', name: 'Kırkpınar SK' }, { key: 'mercan', name: 'Mercan Gücü' },
    { key: 'tepecik', name: 'Tepecik Gençlik' }, { key: 'ulupinar', name: 'Ulupınar SK' },
  ],
];

export type OfferKind = 'direct' | 'trial' | 'better' | 'renew' | 'promote' | 'weaker';

export interface OfferDraft {
  kind: OfferKind;
  /** Tier index into config.career.tiers. */
  tier: number;
  clubKey: string;
  clubName: string;
  salaryWeekly: number;
}

export interface OfferProgress {
  level: number;
  matches: number;
  mahalleMatches: number;
}

/** Whether a player without a contract has earned the first offer. */
export function offerReady(p: OfferProgress, config: EconomyConfig): boolean {
  return p.level >= config.offerMinLevel && p.matches >= config.offerMinMatches && p.mahalleMatches >= config.offerMinMahalleMatches;
}

function salary(tier: LeagueTier, next: (n: number) => number, cfg: CareerConfig, bonusPct = 0): number {
  const variance = next(cfg.salaryVariancePct * 2 + 1) - cfg.salaryVariancePct;
  return Math.round((tier.weeklySalary * (100 + variance + bonusPct)) / 1000) * 10;
}

function pickClubs(next: (n: number) => number, tier: number, count: number, exclude: string[] = []): ClubRef[] {
  const pool = CLUBS[tier]!.filter((c) => !exclude.includes(c.key));
  const out: ClubRef[] = [];
  while (out.length < count && pool.length > 0) out.push(pool.splice(next(pool.length), 1)[0]!);
  return out;
}

/** The first offers (GDD v3.1): a direct contract, one that needs a trial match, and a better one at high mahalle respect. */
export function firstOffers(seed: string, respect: number, config: EconomyConfig): OfferDraft[] {
  const cfg = config.career;
  const next = rng(`${seed}:first`);
  const tier = cfg.tiers[0]!;
  const [a, b, c] = pickClubs(next, 0, 3);
  const offers: OfferDraft[] = [
    { kind: 'direct', tier: 0, clubKey: a!.key, clubName: a!.name, salaryWeekly: salary(tier, next, cfg) },
    { kind: 'trial', tier: 0, clubKey: b!.key, clubName: b!.name, salaryWeekly: salary(tier, next, cfg, cfg.trialSalaryBonusPct) },
  ];
  if (respect >= cfg.betterOfferRespect) {
    offers.push({ kind: 'better', tier: 0, clubKey: c!.key, clubName: c!.name, salaryWeekly: salary(tier, next, cfg, cfg.betterSalaryBonusPct) });
  }
  return offers;
}

/**
 * Offers at the end of a season (GDD v3.1): trust at or above renewMin renews the
 * contract; trust at or above promoteMin with the next tier's level also brings an
 * offer from the next tier; below renewMin a weaker club of the same tier calls.
 */
export function seasonEndOffers(
  seed: string,
  current: { tier: number; clubKey: string; clubName: string; trust: number; level: number },
  config: EconomyConfig,
): OfferDraft[] {
  const cfg = config.career;
  const next = rng(`${seed}:end`);
  const tier = cfg.tiers[current.tier]!;
  if (current.trust < cfg.trustRenewMin) {
    const [club] = pickClubs(next, current.tier, 1, [current.clubKey]);
    const weekly = Math.round((tier.weeklySalary * cfg.weakerSalaryPct) / 1000) * 10;
    return [{ kind: 'weaker', tier: current.tier, clubKey: club!.key, clubName: club!.name, salaryWeekly: weekly }];
  }
  const offers: OfferDraft[] = [
    { kind: 'renew', tier: current.tier, clubKey: current.clubKey, clubName: current.clubName, salaryWeekly: salary(tier, next, cfg) },
  ];
  const up = cfg.tiers[current.tier + 1];
  if (up && current.trust >= cfg.trustPromoteMin && current.level >= up.minLevel) {
    const [club] = pickClubs(next, current.tier + 1, 1);
    offers.push({ kind: 'promote', tier: current.tier + 1, clubKey: club!.key, clubName: club!.name, salaryWeekly: salary(up, next, cfg) });
  }
  return offers;
}

export interface LeagueTeam {
  key: string;
  name: string;
  goalkeeping: number;
  attack: number;
}

/** The 8 teams of a season. Index 0 is the player's club; NPC strength spreads around the tier's opponent strength. */
export function leagueTeams(seed: string, tierIndex: number, club: ClubRef, config: EconomyConfig): LeagueTeam[] {
  const tier = config.career.tiers[tierIndex]!;
  const next = rng(`${seed}:teams`);
  const others = pickClubs(next, tierIndex, config.career.teams - 1, [club.key]);
  const spread = () => next(11) - 5;
  return [
    { ...club, goalkeeping: tier.oppGoalkeeping, attack: tier.oppAttack },
    ...others.map((c) => ({ ...c, goalkeeping: Math.min(95, tier.oppGoalkeeping + spread()), attack: Math.min(100, tier.oppAttack + spread()) })),
  ];
}

/** Double round robin (circle method): rounds of [home, away] team indexes. Team 0 plays every round. */
export function leagueSchedule(teams: number): [number, number][][] {
  const order = Array.from({ length: teams }, (_, i) => i);
  const half: [number, number][][] = [];
  for (let r = 0; r < teams - 1; r++) {
    const round: [number, number][] = [];
    for (let i = 0; i < teams / 2; i++) {
      const a = order[i]!, b = order[teams - 1 - i]!;
      round.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    half.push(round);
    order.splice(1, 0, order.pop()!);
  }
  return [...half, ...half.map((round) => round.map(([a, b]): [number, number] => [b, a]))];
}

/** The player's opponent (team index) in a round. */
export function playerOpponent(teams: number, round: number): number {
  const pair = leagueSchedule(teams)[round]!.find(([a, b]) => a === 0 || b === 0)!;
  return pair[0] === 0 ? pair[1] : pair[0];
}

/** Seeded score of a match the player did not play (NPC pairs, or a missed league day). */
export function npcScore(seed: string, round: number, home: LeagueTeam, away: LeagueTeam): [number, number] {
  const next = rng(`${seed}:r${round}:${home.key}:${away.key}`);
  const goals = (atk: number, gk: number) => {
    const pct = Math.max(5, Math.min(60, 30 + Math.trunc((atk - gk) / 2)));
    let g = 0;
    for (let i = 0; i < 5; i++) if (next(100) < pct) g++;
    return g;
  };
  return [goals(home.attack, away.goalkeeping), goals(away.attack, home.goalkeeping)];
}

export interface LeagueRow {
  index: number;
  key: string;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

/**
 * Standings after `rounds` rounds. `playerResults[round]` is the player's team score
 * (us, them) for each round already decided, played or missed.
 */
export function leagueTable(
  seed: string,
  teams: LeagueTeam[],
  playerResults: Record<number, { us: number; them: number }>,
  rounds: number,
): LeagueRow[] {
  const rows: LeagueRow[] = teams.map((t, index) => ({
    index, key: t.key, name: t.name, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0,
  }));
  const add = (i: number, gf: number, ga: number) => {
    const r = rows[i]!;
    r.played++; r.goalsFor += gf; r.goalsAgainst += ga;
    if (gf > ga) { r.won++; r.points += 3; } else if (gf === ga) { r.drawn++; r.points += 1; } else r.lost++;
  };
  leagueSchedule(teams.length).slice(0, rounds).forEach((round, r) => {
    for (const [h, a] of round) {
      if (h === 0 || a === 0) {
        const res = playerResults[r];
        if (!res) continue;
        const [hg, ag] = h === 0 ? [res.us, res.them] : [res.them, res.us];
        add(h, hg, ag); add(a, ag, hg);
      } else {
        const [hg, ag] = npcScore(seed, r, teams[h]!, teams[a]!);
        add(h, hg, ag); add(a, ag, hg);
      }
    }
  });
  return rows.sort((x, y) =>
    y.points - x.points || (y.goalsFor - y.goalsAgainst) - (x.goalsFor - x.goalsAgainst) || y.goalsFor - x.goalsFor || x.index - y.index);
}

export interface LeagueReward {
  coin: number;
  xp: number;
  trustDelta: number;
}

/** League match (GDD v3.1): formula × club multiplier + win and goal bonus, +30 XP, coach trust by rating. No daily cap. */
export function leagueReward(report: RewardInput, flagged: boolean, tierIndex: number, config: EconomyConfig): LeagueReward {
  const cfg = config.career;
  const tier = cfg.tiers[tierIndex]!;
  const base = matchReward(report, flagged, 0, { ...config, dailyMatchCoinCap: Number.MAX_SAFE_INTEGER }, tier.coinMultiplierX100);
  let coin = base.coin;
  if (!flagged) coin += (report.result === 'W' ? tier.winBonus : 0) + report.goals * tier.goalBonus;
  const trustDelta = report.rating >= 70 ? cfg.trustRatingHigh : report.rating >= 60 ? cfg.trustRatingMid : cfg.trustRatingLow;
  return { coin, xp: base.xp + cfg.ligXpBonus, trustDelta };
}

/** Prize for the final place (1-based): champion prize, then the configured shares. */
export function seasonPrize(place: number, tierIndex: number, config: EconomyConfig): number {
  const pct = config.career.placePrizePct[place - 1] ?? 0;
  return Math.trunc((config.career.tiers[tierIndex]!.champPrize * pct) / 100);
}

/** Salary paid on the first login of a day (weekly / 7). */
export function dailySalary(weekly: number): number {
  return Math.round(weekly / 7);
}

export const clampTrust = (v: number) => Math.max(0, Math.min(100, v));
