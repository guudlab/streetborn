import type { TrainingConfig } from './config.ts';
import { rng } from './random.ts';
import { STAT_NAMES, type DrillGrade, type StatName } from './training.ts';

// Burak abi's mini games, one per stat (antrenman doc, decision 1A): teneke devirme
// (shooting), duvar pası (passing), bakkala koş (pace) and merdiven (stamina).
// The server hands out a seed, the app plays the game with these functions and
// sends the raw inputs back, and the `train` Edge Function scores them again with
// the same code. Integer math only, so both sides agree to the point.
//
// Every game is harder at tier 1 and 2 (the stat has grown, see drillTier). Times
// are milliseconds from the moment the game starts.

export type Tier = 0 | 1 | 2;
/** Every mini game: one per stat, plus omuz oku (defense), which trains no stat (decision 2A). */
export type DrillName = StatName | 'defense';
export const DRILL_NAMES: readonly DrillName[] = [...STAT_NAMES, 'defense'];

// ---------------------------------------------------------------------------
// Teneke devirme: six cans on a crate; aim, then stop the power bar. Field x runs
// −1000..1000, y 0 (ground)..1400 (top of the scene).
// ---------------------------------------------------------------------------

export const TENEKE_BALLS = 4;
export const TENEKE_CRATE = 250;
export const TENEKE_CAN_H = 200;
/** A ball this high breaks the teyze's window: she keeps the next ball too. */
export const TENEKE_WINDOW = 1100;
export const TENEKE_BALL_R = 40;
/** The power bar uses the match engine's zones: target 750, perfect ±60, on time ±150. */
export const POWER_TARGET = 750;
export const POWER_PERFECT = 60;
export const POWER_TIMED = 150;
const CAN_W = [170, 150, 130] as const;

export interface Can {
  /** Centre x and bottom y. */
  x: number; y: number; w: number; h: number;
  /** The two cans this one stands on. */
  on: [number, number] | null;
}
export interface TenekeLayout { cans: Can[]; /** Sideways error direction of each ball, ±1. */ sides: number[] }
export interface TenekeShot { x: number; y: number; /** Power bar stop 0..1000. */ p: number; t: number }
export interface TenekeState { down: boolean[]; balls: number; shots: number }
export interface TenekeHit {
  /** Where the ball ended up. */
  hx: number; hy: number;
  /** The can the ball hit, and every can that fell with it. */
  hit: number | null; fell: number[];
  window: boolean;
  power: 'perfect' | 'timed' | 'off';
}

export function tenekeLayout(seed: number, tier: Tier): TenekeLayout {
  const next = rng(`teneke:${seed}`);
  const c = next(601) - 300;
  const w = CAN_W[tier];
  const half = Math.trunc(w / 2);
  const y0 = TENEKE_CRATE, y1 = y0 + TENEKE_CAN_H, y2 = y1 + TENEKE_CAN_H;
  const cans: Can[] = [
    { x: c - w, y: y0, w, h: TENEKE_CAN_H, on: null },
    { x: c, y: y0, w, h: TENEKE_CAN_H, on: null },
    { x: c + w, y: y0, w, h: TENEKE_CAN_H, on: null },
    { x: c - half, y: y1, w, h: TENEKE_CAN_H, on: [0, 1] },
    { x: c + half, y: y1, w, h: TENEKE_CAN_H, on: [1, 2] },
    { x: c, y: y2, w, h: TENEKE_CAN_H, on: [3, 4] },
  ];
  const sides = Array.from({ length: TENEKE_BALLS }, () => (next(2) ? 1 : -1));
  return { cans, sides };
}

export const tenekeStart = (): TenekeState => ({ down: [false, false, false, false, false, false], balls: TENEKE_BALLS, shots: 0 });

export const tenekeOver = (s: TenekeState) => s.balls <= 0 || s.down.every(Boolean);

/** How far off target the ball goes for a power bar stop. */
export function powerError(p: number, tier: Tier): number {
  const d = Math.abs(p - POWER_TARGET);
  const e = d <= POWER_PERFECT ? 0
    : d <= POWER_TIMED ? 60 + Math.trunc(((d - POWER_PERFECT) * 140) / 90)
      : 200 + Math.trunc((Math.min(d - POWER_TIMED, 300) * 450) / 300);
  return Math.trunc((e * (100 + 15 * tier)) / 100);
}

/** Plays one ball. A late stop flies high, an early one low. */
export function tenekeShoot(layout: TenekeLayout, state: TenekeState, shot: TenekeShot, tier: Tier): { state: TenekeState; hit: TenekeHit } {
  const d = Math.abs(shot.p - POWER_TARGET);
  const power = d <= POWER_PERFECT ? 'perfect' : d <= POWER_TIMED ? 'timed' : 'off';
  const e = powerError(shot.p, tier);
  const side = layout.sides[state.shots] ?? 1;
  const hx = shot.x + side * Math.trunc(e / 2);
  const hy = shot.y + (shot.p >= POWER_TARGET ? e : -e);

  let hit: number | null = null, best = Infinity;
  for (let i = 0; i < layout.cans.length; i++) {
    const c = layout.cans[i]!;
    if (state.down[i]) continue;
    if (Math.abs(hx - c.x) > Math.trunc(c.w / 2) + TENEKE_BALL_R) continue;
    if (hy < c.y - TENEKE_BALL_R / 2 || hy > c.y + c.h + TENEKE_BALL_R / 2) continue;
    const dist = Math.abs(hx - c.x) + Math.abs(hy - (c.y + Math.trunc(c.h / 2)));
    if (dist < best) { best = dist; hit = i; }
  }

  const down = state.down.slice();
  const fell: number[] = [];
  if (hit !== null) {
    down[hit] = true;
    fell.push(hit);
    // Supports have lower indices, so one pass brings down everything above.
    for (let i = 0; i < layout.cans.length; i++) {
      const on = layout.cans[i]!.on;
      if (!down[i] && on && (down[on[0]] || down[on[1]])) { down[i] = true; fell.push(i); }
    }
  }
  const window = hit === null && hy > TENEKE_WINDOW;
  const balls = Math.max(0, state.balls - (window ? 2 : 1));
  return { state: { down, balls, shots: state.shots + 1 }, hit: { hx, hy, hit, fell, window, power } };
}

export function tenekeScore(seed: number, tier: Tier, shots: readonly TenekeShot[]): number {
  const layout = tenekeLayout(seed, tier);
  let s = tenekeStart();
  for (const shot of shots) {
    if (tenekeOver(s)) break;
    s = tenekeShoot(layout, s, shot, tier).state;
  }
  return s.down.filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Duvar pası: the ball comes back off the wall to the left or right foot; tap that
// side on the beat. The beat speeds up and the points multiply every six passes.
// The first miss ends the run.
// ---------------------------------------------------------------------------

export const PAS_BEATS = 24;
export const PAS_FIRST = 1500;
export const PAS_PERFECT = 50;
const PAS_GOOD = [130, 115, 100] as const;

export interface Beat { t: number; /** 0 left, 1 right. */ s: 0 | 1 }
export interface Tap { t: number; s: 0 | 1 }
export type PasJudge = 'perfect' | 'good' | 'miss';

export function pasBeats(seed: number, tier: Tier): Beat[] {
  const next = rng(`pas:${seed}`);
  const beats: Beat[] = [];
  let t = PAS_FIRST;
  for (let i = 0; i < PAS_BEATS; i++) {
    beats.push({ t, s: next(2) as 0 | 1 });
    const gap = Math.max(520 - 40 * tier, 1100 - 100 * tier - 25 * i);
    t += gap + (tier > 0 ? next(121) - 60 : 0);
  }
  return beats;
}

export const pasGoodWindow = (tier: Tier) => PAS_GOOD[tier];

export function pasJudge(beat: Beat, tap: Tap, tier: Tier): PasJudge {
  if (tap.s !== beat.s) return 'miss';
  const d = Math.abs(tap.t - beat.t);
  return d <= PAS_PERFECT ? 'perfect' : d <= PAS_GOOD[tier] ? 'good' : 'miss';
}

/** Points for beat i: perfect 2, good 1, ×2 from the 7th pass, ×3 from the 13th, ×4 from the 19th. */
export const pasPoints = (i: number, judge: PasJudge) => (judge === 'perfect' ? 2 : judge === 'good' ? 1 : 0) * (1 + Math.trunc(i / 6));

export function pasScore(seed: number, tier: Tier, taps: readonly Tap[]): number {
  const beats = pasBeats(seed, tier);
  let score = 0;
  for (let i = 0; i < beats.length && i < taps.length; i++) {
    const j = pasJudge(beats[i]!, taps[i]!, tier);
    if (j === 'miss') break;
    score += pasPoints(i, j);
  }
  return score;
}

// ---------------------------------------------------------------------------
// Bakkala koş: run down the mahalle in three lanes and dodge what comes (crates,
// a cat, a parked bike). A switch takes KOS_SWITCH_MS, so it has to start that
// early. The third bump ends the run; the score is how many were passed.
// ---------------------------------------------------------------------------

export const KOS_OBSTACLES = 24;
export const KOS_FIRST = 1800;
export const KOS_SWITCH_MS = 80;
export const KOS_LIVES = 3;
export const KOS_LANES = 3;

export interface Obstacle { t: number; /** Blocked lanes, 0..2. */ lanes: number[]; /** Which picture, 0..3. */ look: number }
export interface Move { t: number; d: -1 | 1 }
export interface KosRun { lane: number; passed: number; hits: number; /** Index of the next obstacle. */ next: number; over: boolean }

export function kosObstacles(seed: number, tier: Tier): Obstacle[] {
  const next = rng(`kos:${seed}`);
  const out: Obstacle[] = [];
  for (let j = 0; j < KOS_OBSTACLES; j++) {
    const t = KOS_FIRST + j * (800 - 100 * tier) + (tier > 0 ? next(161) - 80 : 0);
    let lanes: number[];
    if (next(100) < 25 + 10 * tier) {
      const free = next(3);
      lanes = [0, 1, 2].filter(l => l !== free);
    } else {
      lanes = [next(3)];
    }
    out.push({ t, lanes, look: next(4) });
  }
  return out;
}

export const kosStart = (): KosRun => ({ lane: 1, passed: 0, hits: 0, next: 0, over: false });

/** Lane after the moves made up to time t (the starting lane is the middle one). */
export function kosLane(moves: readonly Move[], t: number): number {
  let lane = 1;
  for (const m of moves) {
    if (m.t > t) break;
    lane = Math.max(0, Math.min(KOS_LANES - 1, lane + m.d));
  }
  return lane;
}

/** Resolves every obstacle that has arrived by time `now`. */
export function kosAdvance(obstacles: readonly Obstacle[], moves: readonly Move[], run: KosRun, now: number): KosRun {
  let { passed, hits, next, over } = run;
  while (!over && next < obstacles.length && obstacles[next]!.t <= now) {
    const o = obstacles[next]!;
    if (o.lanes.includes(kosLane(moves, o.t - KOS_SWITCH_MS))) hits++; else passed++;
    next++;
    if (hits >= KOS_LIVES || next >= obstacles.length) over = true;
  }
  return { lane: kosLane(moves, now), passed, hits, next, over };
}

export function kosScore(seed: number, tier: Tier, moves: readonly Move[]): number {
  const obstacles = kosObstacles(seed, tier);
  return kosAdvance(obstacles, moves, kosStart(), Number.MAX_SAFE_INTEGER).passed;
}

// ---------------------------------------------------------------------------
// Merdiven: climb the stairs for 20 seconds with alternating feet. Every step adds
// breath load, which comes back down by itself. The same foot twice is a short
// stumble; a full breath bar stops the player for a while, without recovery.
// ---------------------------------------------------------------------------

export const MERDIVEN_MS = 20_000;
export const BREATH_MAX = 1000;
export const MERDIVEN_SAME_FOOT_MS = 400;
export const MERDIVEN_OUT_OF_BREATH_MS = 1500;
const STEP_LOAD = [70, 72, 74] as const;

export interface MerdivenRun {
  steps: number; breath: number;
  /** Time breath was last brought up to date. */
  at: number;
  /** The last foot, or −1 after a stumble. */
  foot: -1 | 0 | 1;
  /** No steps before this time, and no recovery before `pausedUntil`. */
  stumbleUntil: number; pausedUntil: number;
}
export type StepResult = 'step' | 'same_foot' | 'out_of_breath' | 'ignored';

export const merdivenStart = (): MerdivenRun => ({ steps: 0, breath: 0, at: 0, foot: -1, stumbleUntil: 0, pausedUntil: 0 });
export const stepLoad = (tier: Tier) => STEP_LOAD[tier];

/** Breath at time t (for the bar): it falls by 1 every 5 ms, except while out of breath. */
export function breathAt(run: MerdivenRun, t: number): number {
  const from = Math.max(run.at, run.pausedUntil);
  return t <= from ? run.breath : Math.max(0, run.breath - Math.trunc((t - from) / 5));
}

export function merdivenStep(run: MerdivenRun, tap: Tap, tier: Tier): { run: MerdivenRun; result: StepResult } {
  if (tap.t > MERDIVEN_MS) return { run, result: 'ignored' };
  const breath = breathAt(run, tap.t);
  const r: MerdivenRun = { ...run, breath, at: Math.max(run.at, tap.t) };
  if (tap.t < run.stumbleUntil) return { run: r, result: 'ignored' };
  if (tap.s === run.foot) return { run: { ...r, foot: -1, stumbleUntil: tap.t + MERDIVEN_SAME_FOOT_MS }, result: 'same_foot' };
  const load = breath + STEP_LOAD[tier];
  if (load >= BREATH_MAX) {
    const until = tap.t + MERDIVEN_OUT_OF_BREATH_MS;
    return { run: { ...r, steps: r.steps + 1, breath: BREATH_MAX, foot: -1, stumbleUntil: until, pausedUntil: until }, result: 'out_of_breath' };
  }
  return { run: { ...r, steps: r.steps + 1, breath: load, foot: tap.s }, result: 'step' };
}

export function merdivenScore(_seed: number, tier: Tier, taps: readonly Tap[]): number {
  let run = merdivenStart();
  for (const tap of taps) run = merdivenStep(run, tap, tier).run;
  return run.steps;
}

// ---------------------------------------------------------------------------
// Shared: inputs, score, stars and the grade that pays the existing AP and XP.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Omuz oku: Kerem runs at you with the ball and drops a shoulder; slide to that
// side as the ring closes, the match's defense moment. Five reps judged with duvar
// pası's windows; a miss does not end the run.
// ---------------------------------------------------------------------------

export const OMUZ_REPS = 5;
/** A tap this close to a rep is its answer (the first one counts); others are ignored. */
export const OMUZ_REACH = 500;
const OMUZ_GAP = [2200, 1900, 1600] as const;

export function omuzReps(seed: number, tier: Tier): Beat[] {
  const next = rng(`omuz:${seed}`);
  return Array.from({ length: OMUZ_REPS }, (_, i) => ({ t: 1500 + i * OMUZ_GAP[tier] + next(400), s: next(2) as 0 | 1 }));
}

/** The first tap near a rep, if any. */
export const omuzAnswer = (rep: Beat, taps: readonly Tap[]) => taps.find((x) => Math.abs(x.t - rep.t) <= OMUZ_REACH);

/** 2 for a perfect read, 1 for a good one, out of 10. */
export function omuzScore(seed: number, tier: Tier, taps: readonly Tap[]): number {
  let score = 0;
  for (const rep of omuzReps(seed, tier)) {
    const tap = omuzAnswer(rep, taps);
    const j = tap ? pasJudge(rep, tap, tier) : 'miss';
    score += j === 'perfect' ? 2 : j === 'good' ? 1 : 0;
  }
  return score;
}

/** Omuz oku trains no stat, so it gets harder with the level instead. */
export const defenseTier = (level: number): Tier => (level >= 20 ? 2 : level >= 10 ? 1 : 0);

export type DrillInputs = TenekeShot[] | Tap[] | Move[];

const MAX_INPUTS: Record<DrillName, number> = { shooting: TENEKE_BALLS, passing: PAS_BEATS + 8, pace: 200, stamina: 400, defense: 40 };
const LAST_T: Record<DrillName, number> = { shooting: 120_000, passing: 40_000, pace: 30_000, stamina: MERDIVEN_MS + 2000, defense: 20_000 };

const int = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;

/**
 * Checks the shape of the inputs the app sent for a drill. Times must not go
 * backwards (and teneke shots come one after another). Null when anything is off.
 */
export function parseDrillInputs(stat: DrillName, raw: unknown): DrillInputs | null {
  if (!Array.isArray(raw) || raw.length > MAX_INPUTS[stat]) return null;
  let last = -1;
  const out: (TenekeShot | Tap | Move)[] = [];
  for (const v of raw as Record<string, unknown>[]) {
    if (typeof v !== 'object' || v === null || !int(v.t, 0, LAST_T[stat]) || (v.t as number) < last) return null;
    if (stat === 'shooting') {
      if ((v.t as number) === last || !int(v.x, -1000, 1000) || !int(v.y, 0, 1400) || !int(v.p, 0, 1000)) return null;
      out.push({ x: v.x, y: v.y, p: v.p, t: v.t as number });
    } else if (stat === 'pace') {
      if (v.d !== -1 && v.d !== 1) return null;
      out.push({ t: v.t as number, d: v.d });
    } else {
      if (v.s !== 0 && v.s !== 1) return null;
      out.push({ t: v.t as number, s: v.s });
    }
    last = v.t as number;
  }
  return out as DrillInputs;
}

/** The last input time, for the server's "was there time to play this" check. */
export const lastInputAt = (inputs: DrillInputs) => (inputs.length ? inputs[inputs.length - 1]!.t : 0);

export function drillScore(stat: DrillName, seed: number, tier: Tier, inputs: DrillInputs): number {
  switch (stat) {
    case 'shooting': return tenekeScore(seed, tier, inputs as TenekeShot[]);
    case 'passing': return pasScore(seed, tier, inputs as Tap[]);
    case 'pace': return kosScore(seed, tier, inputs as Move[]);
    case 'stamina': return merdivenScore(seed, tier, inputs as Tap[]);
    case 'defense': return omuzScore(seed, tier, inputs as Tap[]);
  }
}

/** Tier 1 and 2 make the game harder as the stat grows. */
export function drillTier(statValue: number, cfg: TrainingConfig): Tier {
  return statValue >= cfg.drillTierFrom[1] ? 2 : statValue >= cfg.drillTierFrom[0] ? 1 : 0;
}

export function drillStars(stat: DrillName, score: number, cfg: TrainingConfig): 0 | 1 | 2 | 3 {
  const [one, two, three] = cfg.drillStars[stat];
  return score >= three ? 3 : score >= two ? 2 : score >= one ? 1 : 0;
}

/** Stars pay what the old grades paid: 3 stars perfect, 2 good, fewer a miss. */
export const starsGrade = (stars: number): DrillGrade => (stars >= 3 ? 'perfect' : stars === 2 ? 'good' : 'miss');

/**
 * Kerem's best at this drill, the friendly target on the result screen: the
 * 2-star score at level 0, growing to the 3-star score by level 20.
 */
export function keremRecord(stat: DrillName, level: number, cfg: TrainingConfig): number {
  const [, two, three] = cfg.drillStars[stat];
  return two + Math.trunc(((three - two) * Math.min(Math.max(level, 0), 20)) / 20);
}

/**
 * The coach's drill of the day (decision 3A/9A): the same for everyone on a day, on
 * the app and the server. 3 stars on it ready the player for today's mahalle match
 * and, at a club, add coach trust once.
 */
export const dailyDrill = (day: string): StatName => STAT_NAMES[rng(`gunun-talimi:${day}`)(STAT_NAMES.length)]!;

/** Usta badge a best score has earned: 0 none, 1 bronze, 2 silver, 3 gold. Only for show. */
export function drillBadge(drill: DrillName, best: number | null | undefined, cfg: TrainingConfig): 0 | 1 | 2 | 3 {
  return cfg.drillBadges[drill].filter((at) => (best ?? -1) >= at).length as 0 | 1 | 2 | 3;
}
