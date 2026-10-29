// Training. A drill is one of Burak abi's mini games, played as a session: `start`
// spends the day's free drill (then 1 energy) and hands out a seed, `finish` sends
// the raw inputs, which are scored here with the same code the app ran. Stars pay
// the grades' AP and XP, and boots with talim left add AP to a 3-star drill. A
// `private` session costs coin by the stat's value. AP, stat points, XP and every
// amount are computed here; the client never sends them.
import {
  DRILL_NAMES,
  STAT_NAMES,
  applyAp,
  dailyDrill,
  defenseTier,
  drillGain,
  drillScore,
  drillStars,
  drillTier,
  keremRecord,
  lastInputAt,
  levelForXp,
  parseDrillInputs,
  privateCost,
  spendEnergy,
  starsGrade,
  type DrillName,
  type EconomyConfig,
  type StatName,
  type Tier,
} from '../../../packages/economy/src/index.ts';
import { handle, HttpError, json } from '../_shared/http.ts';
import { admin, loadEconomyConfig, randomSeed, requirePlayer } from '../_shared/supabase.ts';

const SQL_ERRORS: Record<string, number> = { limit: 429, no_coin: 402, no_session: 404, finished: 409 };
/** The app's game clock starts after the start response arrives; this covers clock jitter on top. */
const CLOCK_SLACK_MS = 1500;

function fail(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.code === '40001') throw new HttpError(409, 'retry');
  const status = SQL_ERRORS[error.message];
  if (status) throw new HttpError(status, error.message);
  throw error;
}

Deno.serve(handle(async (req) => {
  const playerId = await requirePlayer(req);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  // Apps from before the mini games send { kind: 'drill', quality }; those drills are gone.
  const action = body.action ?? (body.kind === 'private' ? 'private' : body.kind);
  if (action === 'drill') throw new HttpError(426, 'update_app');
  const config = await loadEconomyConfig();

  if (action === 'finish') return json(await finish(playerId, body, config));
  const stat = body.stat as DrillName;
  if (action === 'start' && DRILL_NAMES.includes(stat)) return json(await start(playerId, stat, config));
  if (action === 'private' && STAT_NAMES.includes(stat as StatName)) return json(await privateSession(playerId, stat as StatName, config));
  if (!DRILL_NAMES.includes(stat)) throw new HttpError(400, 'bad_stat');
  throw new HttpError(400, 'bad_action');
}));

async function start(playerId: string, stat: DrillName, config: EconomyConfig) {
  const tc = config.training;
  const day = await todayIstanbul();
  const defense = stat === 'defense';
  const [{ data: stats, error: e1 }, { data: player, error: e2 }, { data: wallet, error: e3 }, { data: free, error: e4 }, { data: record, error: e5 }, { data: streak, error: e6 }] = await Promise.all([
    // Omuz oku has no stat to read.
    defense ? { data: null, error: null } : admin.from('player_stats').select(stat).eq('player_id', playerId).single(),
    admin.from('players').select('level').eq('id', playerId).single(),
    admin.from('wallets').select('energy, energy_updated_at, version').eq('player_id', playerId).single(),
    admin.from('training_log').select('id').eq('player_id', playerId).eq('day', day).eq('kind', 'free'),
    admin.from('drill_records').select('best').eq('player_id', playerId).eq('stat', stat).maybeSingle(),
    // Three days in a row: one more free drill today (decision 4A).
    admin.rpc('talim_serisi', { p_player: playerId, p_day: day }),
  ]);
  if (e1 || e2 || e3 || e4 || e5 || e6) throw e1 ?? e2 ?? e3 ?? e4 ?? e5 ?? e6;

  const tier = defense ? defenseTier(player.level) : drillTier((stats as unknown as Record<string, number>)[stat]!, tc);
  const freeLimit = tc.freeDrillsPerDay + (streak ? 1 : 0);
  const isFree = (free ?? []).length < freeLimit;
  let energy = { energy: wallet.energy, updatedAt: Date.parse(wallet.energy_updated_at) };
  if (!isFree) {
    const spent = spendEnergy(energy, tc.drillEnergyCost, Date.now(), config);
    if (!spent) throw new HttpError(409, 'no_energy');
    energy = spent;
  }

  const seed = randomSeed();
  const { data: session, error } = await admin.rpc('start_drill', {
    p_player: playerId, p_stat: stat, p_kind: isFree ? 'free' : 'energy', p_limit: isFree ? freeLimit : null,
    p_seed: seed, p_tier: tier,
    p_expected_version: wallet.version, p_energy: energy.energy, p_energy_updated_at: new Date(energy.updatedAt).toISOString(),
  });
  fail(error);

  return {
    session: Number(session), seed, tier,
    /** Scores for 1, 2 and 3 stars (live config, so the app shows the server's numbers). */
    stars: tc.drillStars[stat],
    record: record?.best ?? null,
    kerem: keremRecord(stat, player.level, tc),
    kind: isFree ? 'free' : 'energy',
    energy: isFree ? null : energy,
  };
}

async function finish(playerId: string, body: Record<string, unknown>, config: EconomyConfig) {
  const tc = config.training;
  const id = body.session;
  if (!Number.isSafeInteger(id) || (id as number) <= 0) throw new HttpError(400, 'bad_session');
  const { data: s, error: sessionError } = await admin
    .from('training_log').select('day, stat, seed, tier, created_at, finished_at').eq('id', id).eq('player_id', playerId).maybeSingle();
  if (sessionError) throw sessionError;
  if (!s || s.seed === null) throw new HttpError(404, 'no_session');
  if (s.finished_at) throw new HttpError(409, 'finished');
  const elapsed = Date.now() - Date.parse(s.created_at);
  if (elapsed > tc.drillSessionSeconds * 1000) throw new HttpError(410, 'expired');

  const stat = s.stat as DrillName;
  const defense = stat === 'defense';
  const inputs = parseDrillInputs(stat, body.inputs);
  // Inputs that claim more time than the session has existed were not played.
  if (!inputs || lastInputAt(inputs) > elapsed + CLOCK_SLACK_MS) throw new HttpError(400, 'bad_inputs');

  const [{ data: stats, error: e1 }, { data: player, error: e2 }, { data: wallet, error: e3 }, { data: boots, error: e4 }] = await Promise.all([
    // Omuz oku moves no stat and leaves the boots alone: they add AP, and it pays none.
    defense ? { data: null, error: null } : admin.from('player_stats').select(`${stat}, ap_${stat}`).eq('player_id', playerId).single(),
    admin.from('players').select('xp, level').eq('id', playerId).single(),
    admin.from('wallets').select('coin').eq('player_id', playerId).single(),
    // The pair in use: the worn one first, then the one closest to wearing out.
    defense ? { data: [], error: null } : admin.from('inventory').select('item_id, uses_left').eq('player_id', playerId)
      .in('item_id', tc.boots.map((b) => b.id)).gt('uses_left', 0)
      .order('equipped', { ascending: false }).order('uses_left', { ascending: true }).limit(1),
  ]);
  if (e1 || e2 || e3 || e4) throw e1 ?? e2 ?? e3 ?? e4;
  const row = (stats ?? {}) as unknown as Record<string, number>;
  const value = row[stat] ?? null, ap = row[`ap_${stat}`] ?? null;
  const boot = boots?.[0] ?? null;

  const score = drillScore(stat, Number(s.seed), s.tier as Tier, inputs);
  const stars = drillStars(stat, score, tc);
  const grade = starsGrade(stars);
  const gain = defense ? { ap: 0, xp: drillGain(grade, tc).xp } : drillGain(grade, tc);
  const bootAp = boot && grade === 'perfect' ? tc.bootPerfectAp : 0;
  const xpAfter = Number(player.xp) + gain.xp;
  const level = Math.max(player.level, levelForXp(xpAfter, config));
  // The cap follows the level the player reaches with this drill's XP.
  const after = defense ? null : applyAp(value!, ap!, gain.ap + bootAp, level, config);
  // 3 stars on the drill of the day: at a club the coach adds trust, up to just below promotion.
  let trustCap: number | null = null;
  if (stars === 3 && stat === dailyDrill(s.day)) {
    const { data: contract, error: contractError } = await admin.from('contracts').select('active').eq('player_id', playerId).maybeSingle();
    if (contractError) throw contractError;
    if (contract?.active) trustCap = config.career.trustPromoteMin - 1;
  }

  const { data: record, error } = await admin.rpc('finish_drill', {
    p_player: playerId, p_session: id, p_score: score, p_stars: stars, p_grade: grade,
    p_expected_stat: value, p_expected_ap: ap, p_stat_after: after?.stat ?? null, p_ap_after: after?.ap ?? null,
    p_ap: gain.ap + bootAp, p_xp: gain.xp, p_level: level,
    p_boot: boot?.item_id ?? null, p_boot_uses: boot?.uses_left ?? null, p_boot_ap: bootAp, p_trust_cap: trustCap,
  });
  fail(error);
  const r = record as { best: number; previous: number | null; trust: number };

  return {
    score, stars, grade, ap: gain.ap + bootAp, bootAp, xp: gain.xp, coin: 0,
    stat: after ? { name: stat, before: value, after: after.stat, ap: after.ap } : null,
    player: { xp: xpAfter, level, coin: Number(wallet.coin) },
    record: { best: r.best, previous: r.previous },
    boots: boot ? { id: boot.item_id, usesLeft: boot.uses_left - 1 } : null,
    trust: r.trust,
    energy: null,
  };
}

async function privateSession(playerId: string, stat: StatName, config: EconomyConfig) {
  const tc = config.training;
  // The daily limit is checked by apply_training() under the stat's row lock.
  const [{ data: stats, error: e1 }, { data: player, error: e2 }, { data: wallet, error: e3 }] = await Promise.all([
    admin.from('player_stats').select(`${stat}, ap_${stat}`).eq('player_id', playerId).single(),
    admin.from('players').select('xp, level').eq('id', playerId).single(),
    admin.from('wallets').select('coin, energy, energy_updated_at, version').eq('player_id', playerId).single(),
  ]);
  if (e1 || e2 || e3) throw e1 ?? e2 ?? e3;
  const row = stats as unknown as Record<string, number>;
  const value = row[stat]!, ap = row[`ap_${stat}`]!;

  const coin = privateCost(value, tc);
  if (Number(wallet.coin) < coin) throw new HttpError(402, 'no_coin');
  const gain = { ap: tc.privateAp, xp: tc.privateXp };
  const xpAfter = Number(player.xp) + gain.xp;
  const level = Math.max(player.level, levelForXp(xpAfter, config));
  const after = applyAp(value, ap, gain.ap, level, config);

  fail((await admin.rpc('apply_training', {
    p_player: playerId, p_kind: 'private', p_stat: stat, p_grade: null,
    p_expected_stat: value, p_expected_ap: ap, p_stat_after: after.stat, p_ap_after: after.ap,
    p_ap: gain.ap, p_xp: gain.xp, p_level: level, p_coin: coin, p_limit: tc.privateSessionsPerDay,
    p_expected_version: wallet.version, p_energy: wallet.energy, p_energy_updated_at: wallet.energy_updated_at,
  })).error);

  return {
    grade: null, ap: gain.ap, xp: gain.xp, coin,
    stat: { name: stat, before: value, after: after.stat, ap: after.ap },
    player: { xp: xpAfter, level, coin: Number(wallet.coin) - coin },
    energy: null,
  };
}

async function todayIstanbul(): Promise<string> {
  const { data, error } = await admin.rpc('mahalle_today');
  if (error) throw error;
  return data as string;
}
