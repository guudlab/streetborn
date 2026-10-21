import { create } from 'zustand';

import {
  MOMENTS, OFFERS, addXp, clamp, eventsBetween, gradeDrill, matchRewards, resolvePass, resolveShot,
  type MatchState, type ShotInput, type ShotResult, type StatKey, type Stats,
} from './rules.ts';

// Local player state for the Concept A screens. Starts from the prototype's
// sample character. Not persisted and not synced with Supabase yet.

const ENERGY_REGEN_MS = 30 * 60e3;
const rnd = Math.random;

export interface PostMatch {
  result: 'G' | 'B' | 'M'; us: number; them: number; rating: number; goals: number; assists: number;
  coins: number; xp: number; trustDelta: number; ups: number; scout: boolean;
  log: MatchState['log'];
  before: { level: number; xp: number; trust: number };
  after: { level: number; xp: number; trust: number };
}

export interface TrainResult {
  key: StatKey; grade: 'mukemmel' | 'iyi' | 'kacti'; xp: number; ups: number; statUp: number;
  before: number; after: number; progress: number;
}

interface GameState {
  name: string; club: string; level: number; xp: number; coins: number; gems: number;
  energy: number; energyMax: number; nextEnergyAt: number;
  stats: Stats; drillProgress: Stats; trainFree: number; trust: number; form: number[];
  shotsTaken: number; scouted: boolean; signed: string | null; trialAccepted: boolean; adsLeft: number; assisted: boolean;
  match: MatchState | null;
  post: PostMatch | null;

  syncEnergy(now?: number): void;
  startMatch(): boolean;
  shoot(input: ShotInput): ShotResult;
  pass(open: boolean): { ok: boolean; open: boolean };
  nextMoment(): { done: boolean; events: { min: number; text: string }[] };
  finishMatch(): PostMatch;
  simulateRest(): PostMatch;
  train(key: StatKey, q: number): TrainResult | null;
  sign(id: string): void;
  acceptTrial(): void;
  watchAd(): boolean;
  gemRefill(): boolean;
  setAssisted(v: boolean): void;
}

export const useGame = create<GameState>()((set, get) => ({
  name: 'Efe Yılmaz',
  club: 'Yıldırımspor',
  level: 7,
  xp: 2215, // level 8 needs 2263, so one match levels up
  coins: 1240,
  gems: 30,
  energy: 4,
  energyMax: 5,
  nextEnergyAt: Date.now() + 18 * 60e3 + 42e3,
  stats: { sut: 52, pas: 47, hiz: 58, fizik: 44 },
  drillProgress: { sut: 1, pas: 0, hiz: 2, fizik: 0 },
  trainFree: 3,
  trust: 62,
  form: [6.8, 7.4, 5.9],
  shotsTaken: 0,
  scouted: false,
  signed: null,
  trialAccepted: false,
  adsLeft: 2,
  assisted: false,
  match: null,
  post: null,

  syncEnergy(now = Date.now()) {
    const s = get();
    if (s.energy >= s.energyMax || now < s.nextEnergyAt) return;
    let { energy, nextEnergyAt } = s;
    while (energy < s.energyMax && now >= nextEnergyAt) { energy++; nextEnergyAt += ENERGY_REGEN_MS; }
    set({ energy, nextEnergyAt });
  },

  startMatch() {
    const s = get();
    if (s.energy < 1) return false;
    const full = s.energy === s.energyMax;
    set({
      energy: s.energy - 1,
      nextEnergyAt: full ? Date.now() + ENERGY_REGEN_MS : s.nextEnergyAt,
      match: { i: 0, us: 0, them: 0, goals: 0, assists: 0, missed: 0, lost: 0, rating: 6.0, log: [] },
    });
    return true;
  },

  shoot(input) {
    const s = get();
    const m = s.match!;
    const moment = MOMENTS[m.i]!;
    const res = resolveShot(rnd, input, {
      moment, stats: s.stats, assisted: s.assisted || moment.kind === 'serbest', firstEver: s.shotsTaken === 0,
    });
    set({
      shotsTaken: s.shotsTaken + 1,
      match: {
        ...m,
        us: m.us + (res.goal ? 1 : 0),
        goals: m.goals + (res.goal ? 1 : 0),
        missed: m.missed + (res.goal ? 0 : 1),
        rating: m.rating + (res.goal ? 1.0 : -0.5),
        log: [...m.log, { min: moment.min, kind: moment.kind, ok: res.goal }],
      },
    });
    return res;
  },

  pass(open) {
    const s = get();
    const m = s.match!;
    const moment = MOMENTS[m.i]!;
    const res = resolvePass(rnd, open, s.stats.pas);
    set({
      match: {
        ...m,
        us: m.us + (res.ok ? 1 : 0),
        assists: m.assists + (res.ok ? 1 : 0),
        lost: m.lost + (res.ok ? 0 : 1),
        rating: m.rating + (res.ok ? 0.7 : -0.3),
        log: [...m.log, { min: moment.min, kind: 'pas', ok: res.ok }],
      },
    });
    return res;
  },

  nextMoment() {
    const m = get().match!;
    const from = MOMENTS[m.i]!.min;
    const i = m.i + 1;
    const to = i < MOMENTS.length ? MOMENTS[i]!.min : 90;
    const events = eventsBetween(from, to);
    set({ match: { ...m, i, them: m.them + events.length } });
    return { done: i >= MOMENTS.length, events };
  },

  finishMatch() {
    const s = get();
    const m = s.match!;
    const r = matchRewards(m);
    const lv = addXp(s.level, s.xp, r.xp);
    const trust = clamp(s.trust + r.trustDelta, 0, 100);
    const post: PostMatch = {
      result: r.result, us: m.us, them: m.them, rating: r.rating, goals: m.goals, assists: m.assists,
      coins: r.coins, xp: r.xp, trustDelta: r.trustDelta, ups: lv.ups, scout: r.scout, log: m.log,
      before: { level: s.level, xp: s.xp, trust: s.trust },
      after: { level: lv.level, xp: lv.xp, trust },
    };
    set({
      coins: s.coins + r.coins, level: lv.level, xp: lv.xp, trust,
      form: [...s.form.slice(-2), r.rating],
      scouted: s.scouted || r.scout,
      match: null, post,
    });
    return post;
  },

  simulateRest() {
    while (get().match && get().match!.i < MOMENTS.length) get().nextMoment();
    return get().finishMatch();
  },

  train(key, q) {
    const s = get();
    let { trainFree, energy } = s;
    if (trainFree > 0) trainFree--;
    else if (energy > 0) energy--;
    else return null;
    const g = gradeDrill(q);
    const lv = addXp(s.level, s.xp, g.xp);
    let progress = s.drillProgress[key] + g.progress;
    let statUp = 0;
    if (progress >= 3) { progress -= 3; statUp = 1; }
    const before = s.stats[key];
    set({
      trainFree, energy, level: lv.level, xp: lv.xp,
      drillProgress: { ...s.drillProgress, [key]: progress },
      stats: { ...s.stats, [key]: before + statUp },
    });
    return { key, grade: g.grade, xp: g.xp, ups: lv.ups, statUp, before, after: before + statUp, progress };
  },

  sign(id) { if (OFFERS.some(o => o.id === id)) set({ signed: id }); },
  acceptTrial() { set({ trialAccepted: true }); },

  watchAd() {
    const s = get();
    if (s.adsLeft <= 0 || s.energy >= s.energyMax) return false;
    set({ adsLeft: s.adsLeft - 1, energy: s.energy + 1 });
    return true;
  },

  gemRefill() {
    const s = get();
    if (s.gems < 20 || s.energy >= s.energyMax) return false;
    set({ gems: s.gems - 20, energy: s.energyMax });
    return true;
  },

  setAssisted(v) { set({ assisted: v }); },
}));
