// The player's club career. `status` runs on app open and does the day's lazy work:
// missed league days, season end, daily salary, the first offers, and the starting
// and level gems (GDD v3.1 section 9). `accept` signs
// an offer. Amounts and results are computed here, never sent by the client.
import {
  dailySalary,
  firstOffers,
  istanbulDay,
  leagueSchedule,
  leagueTable,
  leagueTeams,
  levelGemLevels,
  npcScore,
  offerReady,
  seasonEndOffers,
  seasonPrize,
  type LeagueTeam,
} from '../../../packages/economy/src/index.ts';
import { handle, HttpError, json } from '../_shared/http.ts';
import { admin, loadEconomyConfig, requirePlayer } from '../_shared/supabase.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SQL_ERRORS: Record<string, number> = { not_found: 404, has_contract: 409, needs_trial: 409 };
const DAY_MS = 86_400_000;

function fail(error: { message: string } | null) {
  if (!error) return;
  const status = SQL_ERRORS[error.message];
  if (status) throw new HttpError(status, error.message);
  throw error;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

Deno.serve(handle(async (req) => {
  const playerId = await requirePlayer(req);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const config = await loadEconomyConfig();
  const cc = config.career;

  if (body.action === 'accept') {
    const offerId = typeof body.offerId === 'string' ? body.offerId : '';
    if (!UUID.test(offerId)) throw new HttpError(400, 'bad_offer');
    const { data: offer, error } = await admin
      .from('offers').select('id, tier, club_key, club_name').eq('id', offerId).eq('player_id', playerId).maybeSingle();
    if (error) throw error;
    if (!offer) throw new HttpError(404, 'not_found');
    const teams = leagueTeams(offer.id, offer.tier, { key: offer.club_key, name: offer.club_name }, config);
    const { data: seasonId, error: acceptError } = await admin.rpc('accept_offer', {
      p_player: playerId, p_offer: offer.id, p_teams: teams, p_first_gem: cc.firstContractGem, p_trust_start: cc.trustStart,
    });
    fail(acceptError);
    return json({ ok: true, seasonId });
  }

  if (body.action !== 'status') throw new HttpError(400, 'bad_action');

  const today = istanbulDay(Date.now());
  const [{ data: player, error: playerError }, { data: contract, error: contractError }] = await Promise.all([
    admin.from('players').select('level, respect, coach_trust').eq('id', playerId).single(),
    admin.from('contracts').select('tier, club_key, club_name, salary_weekly, season_id, active').eq('player_id', playerId).maybeSingle(),
  ]);
  if (playerError || contractError) throw playerError ?? contractError;

  let salary = 0;
  let seasonEnded: { place: number; prize: number } | null = null;

  if (contract?.active && contract.season_id) {
    const [{ data: season, error: seasonError }, { data: days, error: daysError }] = await Promise.all([
      admin.from('league_seasons').select('id, seed, tier, start_day, teams, status').eq('id', contract.season_id).single(),
      admin.from('league_days').select('round, us, them').eq('season_id', contract.season_id),
    ]);
    if (seasonError || daysError) throw seasonError ?? daysError;
    const teams = season.teams as LeagueTeam[];
    const rounds = leagueSchedule(teams.length).length;
    const roundToday = daysBetween(season.start_day, today);

    // Days that passed without a league match: the NPC result stands, trust drops once per day.
    const decided = new Map<number, { us: number; them: number }>((days ?? []).map((d) => [d.round, { us: d.us, them: d.them }]));
    const missed: { round: number; us: number; them: number }[] = [];
    for (let r = 0; r < Math.min(roundToday, rounds); r++) {
      if (decided.has(r)) continue;
      const pair = leagueSchedule(teams.length)[r]!.find(([h, a]) => h === 0 || a === 0)!;
      const [hg, ag] = npcScore(season.seed, r, teams[pair[0]]!, teams[pair[1]]!);
      const res = pair[0] === 0 ? { us: hg, them: ag } : { us: ag, them: hg };
      missed.push({ round: r, ...res });
      decided.set(r, res);
    }
    if (missed.length > 0) {
      fail((await admin.rpc('mark_missed_rounds', {
        p_player: playerId, p_season: season.id, p_rows: missed, p_trust_delta: cc.trustMissed,
      })).error);
    }

    if (roundToday >= rounds && season.status === 'active') {
      const table = leagueTable(season.seed, teams, Object.fromEntries(decided), rounds);
      const place = table.findIndex((row) => row.index === 0) + 1;
      const prize = seasonPrize(place, season.tier, config);
      const { data: fresh, error: freshError } = await admin.from('players').select('coach_trust, level').eq('id', playerId).single();
      if (freshError) throw freshError;
      const offers = seasonEndOffers(season.id, {
        tier: contract.tier, clubKey: contract.club_key, clubName: contract.club_name, trust: fresh.coach_trust, level: fresh.level,
      }, config);
      const { data: ended, error: endError } = await admin.rpc('end_season', {
        p_player: playerId, p_season: season.id, p_place: place, p_prize: prize, p_offers: offers,
      });
      fail(endError);
      if (ended) seasonEnded = { place, prize };
    } else {
      const { data: paid, error: salaryError } = await admin.rpc('claim_salary', {
        p_player: playerId, p_day: today, p_amount: dailySalary(contract.salary_weekly),
      });
      fail(salaryError);
      if (paid) salary = dailySalary(contract.salary_weekly);
    }
  } else if (!contract) {
    // First offers: level, finished matches and mahalle matches (GDD v3.1, offer block).
    const [{ count: matches, error: e1 }, { count: mahalleMatches, error: e2 }] = await Promise.all([
      admin.from('matches').select('id', { count: 'exact', head: true }).eq('player_id', playerId).eq('status', 'finished'),
      admin.from('matches').select('id', { count: 'exact', head: true }).eq('player_id', playerId).eq('status', 'finished').eq('kind', 'mahalle'),
    ]);
    if (e1 || e2) throw e1 ?? e2;
    if (offerReady({ level: player.level, matches: matches ?? 0, mahalleMatches: mahalleMatches ?? 0 }, config)) {
      fail((await admin.rpc('create_offers', { p_player: playerId, p_offers: firstOffers(playerId, player.respect, config) })).error);
    }
  }

  // Starting coin and gems once, then gems every 5 levels. Safe to repeat; the SQL checks the level.
  const { data: gems, error: gemsError } = await admin.rpc('claim_gems', {
    p_player: playerId, p_start_coin: config.shop.startCoin, p_start_gem: config.shop.startGem,
    p_levels: levelGemLevels(player.level, config.shop), p_level_gem: config.shop.levelGem,
  });
  fail(gemsError);

  return json({ salary, seasonEnded, gems });
}));
