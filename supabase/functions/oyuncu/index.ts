// The player's career features: morale and form, the day's pre-match choice, injuries,
// achievements, the weekly friend duel and the day's phone event. `durum` runs when the app opens and does the
// lazy work (settling last week's duel, unlocking achievements). Amounts and results are
// computed here, never sent by the client.
import {
  ACHIEVEMENTS,
  CHOICES,
  choiceEffect,
  istanbulDay,
  weekStart,
  type Choice,
} from '../../../packages/economy/src/index.ts';
import { handle, HttpError, json } from '../_shared/http.ts';
import { admin, loadEconomyConfig, requirePlayer } from '../_shared/supabase.ts';
import { currentDuel, loadState, settleDuels, unlockAchievements } from '../_shared/kariyer.ts';
import { phoneToday } from '../_shared/telefon.ts';

Deno.serve(handle(async (req) => {
  const playerId = await requirePlayer(req);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const config = await loadEconomyConfig();
  const now = Date.now();

  if (body.action === 'sec') {
    if (!CHOICES.includes(body.choice as Choice)) throw new HttpError(400, 'bad_choice');
    const effect = choiceEffect(body.choice as Choice, config);
    const { error } = await admin.rpc('kariyer_secim', {
      p_player: playerId, p_day: istanbulDay(now), p_choice: body.choice, p_morale_delta: effect.morale, p_respect: effect.respect,
    });
    if (error?.message === 'already_chosen') throw new HttpError(409, 'already_chosen');
    if (error) throw error;
    return json({ ok: true });
  }

  if (body.action === 'masaj') {
    const { error } = await admin.rpc('kariyer_masaj', { p_player: playerId, p_cost: config.kariyer.massageCost });
    if (error?.message === 'not_injured') throw new HttpError(409, 'not_injured');
    // The wallet refuses a negative balance.
    if (error?.code === '23514') throw new HttpError(402, 'no_coin');
    if (error) throw error;
    const { data: wallet, error: walletError } = await admin.from('wallets').select('coin').eq('player_id', playerId).single();
    if (walletError) throw walletError;
    return json({ ok: true, coin: Number(wallet.coin) });
  }

  if (body.action === 'telefon') {
    const answer = body.answer;
    if (answer !== 0 && answer !== 1) throw new HttpError(400, 'bad_answer');
    const { view } = await phoneToday(playerId, now, config);
    // The day changed or the event is not the one the app showed: the app reloads.
    if (!view || view.key !== body.key) throw new HttpError(409, 'stale');
    if (view.answer !== null) throw new HttpError(409, 'already_answered');
    const fx = answer === 0 ? view.a : view.b;
    const { error } = await admin.rpc('telefon_cevapla', {
      p_player: playerId, p_day: view.day, p_key: view.key, p_answer: answer,
      p_morale: fx.morale, p_respect: fx.respect, p_trust: fx.trust, p_coin: fx.coin,
    });
    if (error?.message === 'already_answered') throw new HttpError(409, 'already_answered');
    // The wallet refuses a negative balance.
    if (error?.code === '23514') throw new HttpError(402, 'no_coin');
    if (error) throw error;
    return json({ ok: true });
  }

  if (body.action !== 'durum') throw new HttpError(400, 'bad_action');

  const { data: player, error: playerError } = await admin.from('players').select('level').eq('id', playerId).single();
  if (playerError) throw playerError;
  const week = weekStart(istanbulDay(now));

  // Last week's duel first, so a win is paid before the achievements are counted.
  const settled = await settleDuels(playerId, week, player.level, config);
  const [state, duel, phone] = await Promise.all([
    loadState(playerId, now, config), currentDuel(playerId, now, player.level, config), phoneToday(playerId, now, config),
  ]);
  const { unlocked, stats, have } = await unlockAchievements(playerId);
  const { data: wallet, error: walletError } = await admin.from('wallets').select('coin').eq('player_id', playerId).single();
  if (walletError) throw walletError;

  return json({
    coin: Number(wallet.coin),
    morale: state.morale,
    form: state.form,
    injury: state.injury,
    choice: state.choice,
    choseToday: state.choseToday,
    massageCost: config.kariyer.massageCost,
    duel: { ...duel, minMatches: config.kariyer.duelMinMatches, winCoin: config.kariyer.duelWinCoin, winRespect: config.kariyer.duelWinRespect },
    settled,
    achievements: ACHIEVEMENTS.map((a) => ({
      key: a.key, group: a.group, coin: a.coin, target: a.target, value: Math.min(a.value(stats), a.target), unlocked: have.has(a.key),
    })),
    unlocked,
    phone: phone.view,
    totals: { matches: stats.matches, goals: stats.goals, assists: stats.assists },
  });
}));
