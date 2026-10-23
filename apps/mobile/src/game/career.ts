import { DEFAULT_CONFIG, leagueSchedule, leagueTable, playerOpponent, type LeagueRow } from '@streetborn/economy';

import type { Career } from '../net/api.ts';
import { t } from '../i18n/index.ts';

// View helpers for the server career (league day, opponent, table).

const TIER_NAMES = ['tier.0', 'tier.1', 'tier.2'] as const;
export const tierName = (tier: number) => t(TIER_NAMES[tier] ?? 'tier.0');

/** "×1,5" for a tier's coin multiplier. */
export function multiplierLabel(tier: number): string {
  const x100 = DEFAULT_CONFIG.career.tiers[tier]?.coinMultiplierX100 ?? 100;
  return `×${(x100 / 100).toLocaleString('tr', { maximumFractionDigits: 2 })}`;
}

export const crestCode = (name: string) => name.replace(/[^\p{L}]/gu, '').slice(0, 3).toLocaleUpperCase('tr');

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export interface LeagueToday {
  clubName: string;
  tier: number;
  /** 0-based round of today, and the season length in rounds. */
  round: number;
  rounds: number;
  opponent: string;
  played: boolean;
}

/** Today's league fixture while a contract and season are active and the season has not run out. */
export function leagueToday(c: Career | null): LeagueToday | null {
  const contract = c?.contract, season = c?.season;
  if (!c || !contract?.active || !season || season.status !== 'active' || season.id !== contract.seasonId) return null;
  const rounds = leagueSchedule(season.teams.length).length;
  const round = daysBetween(season.startDay, c.today);
  if (round < 0 || round >= rounds) return null;
  return {
    clubName: contract.clubName, tier: contract.tier, round, rounds,
    opponent: season.teams[playerOpponent(season.teams.length, round)]!.name,
    played: season.days.some(d => d.round === round),
  };
}

/** Standings over the decided rounds (played or missed), the same table the server settles. */
export function standings(c: Career | null): { rows: LeagueRow[]; decided: number } | null {
  const season = c?.season;
  if (!season) return null;
  const results = Object.fromEntries(season.days.map(d => [d.round, { us: d.us, them: d.them }]));
  const decided = season.days.length ? Math.max(...season.days.map(d => d.round)) + 1 : 0;
  return { rows: leagueTable(season.seed, season.teams, results, decided), decided };
}
