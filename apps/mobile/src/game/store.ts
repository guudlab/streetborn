import {
  computeRating, currentEnergy, DEFAULT_CONFIG, levelForXp, matchReward,
} from '@streetborn/economy';
import {
  planMatch, playChance, simulateMatch,
  type ChanceInput, type ChanceOutcome, type MatchPlan, type MatchSetup, type MomentKind, type TeamResult,
} from '@streetborn/engine';
import { create } from 'zustand';

import { ApiError, finishMatch as apiFinish, loadProfile, startMatch as apiStart } from '../net/api.ts';
import { offline } from '../net/supabase.ts';
import { clamp, gradeDrill, OFFERS, type StatKey, type Stats } from './rules.ts';

// Player state for the Concept A screens.
// Online (default): level, XP, coin, gem, energy and skills come from Supabase,
// and every match is started and scored by the server (match-start/finish).
// Local: when the server can't be reached, the same engine and economy code
// runs on the device and nothing is saved.
// Training, offers, shop actions and trust are still local in both modes.

const config = DEFAULT_CONFIG;
const REGEN_MS = config.energyRegenSeconds * 1000;

export type Mode = 'loading' | 'online' | 'local';

export interface LogEntry { minute: number; kind: MomentKind; outcome: ChanceOutcome['outcome'] }

export interface PostMatch {
  result: TeamResult; us: number; them: number; rating: number; goals: number; assists: number;
  coins: number; xp: number; trustDelta: number; ups: number; scout: boolean; flagged: boolean;
  log: LogEntry[];
  before: { level: number; xp: number; trust: number };
  after: { level: number; xp: number; trust: number };
}

export interface LiveMatch {
  matchId: string | null;
  setup: MatchSetup;
  plan: MatchPlan;
  /** Index of the moment being played. */
  i: number;
  inputs: ChanceInput[];
  outcomes: (ChanceOutcome | null)[];
  startedAt: number;
}

export interface TrainResult {
  key: StatKey; grade: 'mukemmel' | 'iyi' | 'kacti'; xp: number; ups: number; statUp: number;
  before: number; after: number; progress: number;
}

interface GameState {
  mode: Mode;
  /** Why the app fell back to local mode, for the banner. */
  offlineReason: string | null;
  name: string; club: string; level: number; xp: number; coins: number; gems: number;
  energy: number; energyMax: number; energyUpdatedAt: number;
  stats: Stats; drillProgress: Stats; trainFree: number; trust: number; form: number[];
  scouted: boolean; signed: string | null; trialAccepted: boolean; adsLeft: number; assisted: boolean;
  match: LiveMatch | null;
  post: PostMatch | null;

  init(): Promise<void>;
  syncEnergy(now?: number): void;
  startMatch(): Promise<'ok' | 'no_energy' | 'error'>;
  play(input: ChanceInput): ChanceOutcome;
  /** Moves to the next moment; returns the opponent goals scored in between. */
  advance(): { done: boolean; events: { minute: number }[] };
  finishMatch(): Promise<PostMatch>;
  train(key: StatKey, q: number): TrainResult | null;
  sign(id: string): void;
  acceptTrial(): void;
  watchAd(): boolean;
  gemRefill(): boolean;
  setAssisted(v: boolean): void;
}

/** Team score so far: the player's goals and assists, and the opponent goals before `minute`. */
export function liveScore(m: LiveMatch, minute: number) {
  let us = 0;
  for (const o of m.outcomes) if (o && (o.outcome === 'goal' || o.outcome === 'assist')) us++;
  return { us, them: m.plan.opponentGoals.filter(g => g < minute).length };
}

const randomSeed = () => Math.floor(Math.random() * 0x100000000) >>> 0;

export const useGame = create<GameState>()((set, get) => ({
  mode: 'loading',
  offlineReason: null,
  // Sample character from the prototype, used in local mode.
  name: 'Efe Yılmaz',
  club: 'Yıldırımspor',
  level: 7,
  xp: 2215,
  coins: 1240,
  gems: 30,
  energy: 4,
  energyMax: config.energyMax,
  energyUpdatedAt: Date.now() - REGEN_MS / 3,
  stats: { sut: 52, pas: 47, hiz: 58, fizik: 44 },
  drillProgress: { sut: 1, pas: 0, hiz: 2, fizik: 0 },
  trainFree: 3,
  trust: 62,
  form: [6.8, 7.4, 5.9],
  scouted: false,
  signed: null,
  trialAccepted: false,
  adsLeft: 2,
  assisted: false,
  match: null,
  post: null,

  async init() {
    if (offline) { set({ mode: 'local', offlineReason: 'Çevrimdışı mod' }); return; }
    try {
      const p = await loadProfile();
      set({
        mode: 'online', offlineReason: null,
        level: p.level, xp: p.xp, coins: p.coin, gems: p.gem,
        energy: p.energy, energyUpdatedAt: p.energyUpdatedAt,
        stats: { sut: p.stats.shooting, pas: p.stats.passing, hiz: p.stats.pace, fizik: p.stats.stamina },
        form: [],
      });
      get().syncEnergy();
    } catch (e) {
      console.warn('Supabase unavailable, playing locally', e);
      set({ mode: 'local', offlineReason: 'Sunucuya bağlanılamadı' });
    }
  },

  syncEnergy(now = Date.now()) {
    const s = get();
    const next = currentEnergy({ energy: s.energy, updatedAt: s.energyUpdatedAt }, now, config);
    if (next.energy !== s.energy || next.updatedAt !== s.energyUpdatedAt) set({ energy: next.energy, energyUpdatedAt: next.updatedAt });
  },

  async startMatch() {
    const s = get();
    s.syncEnergy();
    if (get().energy < config.matchEnergyCost) return 'no_energy';
    let matchId: string | null = null;
    let setup: MatchSetup;
    if (s.mode === 'online') {
      try {
        const t = await apiStart();
        matchId = t.matchId;
        setup = t.setup;
        set({ energy: t.energy.energy, energyUpdatedAt: t.energy.updatedAt });
      } catch (e) {
        if (e instanceof ApiError && e.code === 'no_energy') { set({ energy: 0 }); return 'no_energy'; }
        console.warn('match-start failed', e);
        return 'error';
      }
    } else {
      setup = {
        seed: randomSeed(), chances: config.matchChances,
        shooting: clamp(s.stats.sut, 1, 100), passing: clamp(s.stats.pas, 1, 100),
        opponentGoalkeeping: Math.min(95, 35 + s.level * 2), opponentAttack: Math.min(95, 30 + s.level * 2),
      };
      const wasFull = s.energy >= s.energyMax;
      set({ energy: s.energy - config.matchEnergyCost, energyUpdatedAt: wasFull ? Date.now() : s.energyUpdatedAt });
    }
    set({
      match: {
        matchId, setup, plan: planMatch(setup), i: 0, inputs: [],
        outcomes: Array.from({ length: setup.chances }, () => null), startedAt: Date.now(),
      },
    });
    return 'ok';
  },

  play(input) {
    const m = get().match!;
    const outcome = playChance(m.setup, m.plan, input);
    const outcomes = m.outcomes.slice();
    outcomes[input.chance] = outcome;
    set({ match: { ...m, inputs: [...m.inputs, input], outcomes } });
    return outcome;
  },

  advance() {
    const m = get().match!;
    const from = m.plan.moments[m.i]!.minute;
    const i = m.i + 1;
    const done = i >= m.plan.moments.length;
    const to = done ? 91 : m.plan.moments[i]!.minute;
    set({ match: { ...m, i } });
    return { done, events: m.plan.opponentGoals.filter(g => g >= from && g < to).map(minute => ({ minute })) };
  },

  async finishMatch() {
    const s = get();
    const m = s.match!;
    const durationMs = Date.now() - m.startedAt;
    const log: LogEntry[] = m.inputs
      .map(inp => ({ minute: m.plan.moments[inp.chance]!.minute, kind: m.plan.moments[inp.chance]!.kind, outcome: m.outcomes[inp.chance]!.outcome }))
      .sort((a, b) => a.minute - b.minute);
    const before = { level: s.level, xp: s.xp, trust: s.trust };

    let sim, rating: number, coins: number, xpGain: number, after: { level: number; xp: number }, flagged = false;
    let coinBalance = s.coins;
    if (s.mode === 'online' && m.matchId) {
      const r = await apiFinish(m.matchId, m.inputs, durationMs);
      sim = r.result;
      rating = r.result.rating;
      coins = r.reward?.coin ?? 0;
      xpGain = r.reward?.xp ?? 0;
      flagged = r.flagged;
      after = { level: r.player.level, xp: r.player.xp };
      coinBalance = r.player.coin;
    } else {
      sim = simulateMatch(m.setup, m.inputs);
      rating = computeRating(sim);
      const reward = matchReward({ ...sim, rating }, false, 0, config);
      coins = reward.coin;
      xpGain = reward.xp;
      after = { level: levelForXp(s.xp + xpGain), xp: s.xp + xpGain };
      coinBalance = s.coins + coins;
    }

    const trustDelta = rating >= 70 ? 4 : rating >= 60 ? 1 : -3;
    const trust = clamp(s.trust + trustDelta, 0, 100);
    const scout = rating >= 65;
    const post: PostMatch = {
      result: sim.result, us: sim.us, them: sim.them, rating, goals: sim.goals, assists: sim.assists,
      coins, xp: xpGain, trustDelta, ups: Math.max(0, after.level - before.level), scout, flagged, log,
      before, after: { ...after, trust },
    };
    set({
      coins: coinBalance, level: after.level, xp: after.xp, trust,
      form: [...s.form.slice(-2), rating / 10],
      scouted: s.scouted || scout,
      match: null, post,
    });
    return post;
  },

  train(key, q) {
    const s = get();
    let { trainFree, energy } = s;
    if (trainFree > 0) trainFree--;
    // Paid training needs a server function first; online it is free sessions only.
    else if (s.mode === 'local' && energy > 0) energy--;
    else return null;
    const g = gradeDrill(q);
    const xp = s.xp + g.xp;
    const level = Math.max(s.level, levelForXp(xp));
    let progress = s.drillProgress[key] + g.progress;
    let statUp = 0;
    if (progress >= 3) { progress -= 3; statUp = 1; }
    const before = s.stats[key];
    set({
      trainFree, energy, level, xp,
      drillProgress: { ...s.drillProgress, [key]: progress },
      stats: { ...s.stats, [key]: before + statUp },
    });
    return { key, grade: g.grade, xp: g.xp, ups: level - s.level, statUp, before, after: before + statUp, progress };
  },

  sign(id) { if (OFFERS.some(o => o.id === id)) set({ signed: id }); },
  acceptTrial() { set({ trialAccepted: true }); },

  watchAd() {
    const s = get();
    if (s.mode !== 'local' || s.adsLeft <= 0 || s.energy >= s.energyMax) return false;
    set({ adsLeft: s.adsLeft - 1, energy: s.energy + 1 });
    return true;
  },

  gemRefill() {
    const s = get();
    if (s.mode !== 'local' || s.gems < 20 || s.energy >= s.energyMax) return false;
    set({ gems: s.gems - 20, energy: s.energyMax, energyUpdatedAt: Date.now() });
    return true;
  },

  setAssisted(v) { set({ assisted: v }); },
}));
