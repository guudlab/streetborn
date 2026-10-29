import { describe, expect, it } from 'vitest';
import {
  breathAt,
  DEFAULT_CONFIG,
  drillScore,
  drillStars,
  drillTier,
  keremRecord,
  dailyDrill,
  kosAdvance,
  kosLane,
  kosObstacles,
  kosScore,
  kosStart,
  lastInputAt,
  merdivenScore,
  merdivenStart,
  merdivenStep,
  parseDrillInputs,
  pasBeats,
  pasJudge,
  pasScore,
  powerError,
  starsGrade,
  tenekeLayout,
  tenekeScore,
  tenekeShoot,
  tenekeStart,
  type Move,
  type Tap,
  type TenekeShot,
} from './index.ts';

const tc = DEFAULT_CONFIG.training;

describe('teneke devirme', () => {
  const L = tenekeLayout(42, 0);
  const at = (i: number, p = 750, t = 0): TenekeShot => ({ x: L.cans[i]!.x, y: L.cans[i]!.y + 100, p, t });

  it('builds the same pyramid from the same seed', () => {
    expect(tenekeLayout(42, 0)).toEqual(L);
    expect(tenekeLayout(43, 0)).not.toEqual(L);
    expect(L.cans).toHaveLength(6);
    expect(L.cans[5]!.y).toBe(650);
    expect(tenekeLayout(42, 2).cans[0]!.w).toBeLessThan(L.cans[0]!.w);
  });

  it('brings down everything a hit can held up', () => {
    const r = tenekeShoot(L, tenekeStart(), at(1), 0);
    expect(r.hit.hit).toBe(1);
    expect(r.hit.fell.sort()).toEqual([1, 3, 4, 5]);
    expect(r.state.balls).toBe(3);
    // Three perfect shots clear the pyramid.
    expect(tenekeScore(42, 0, [at(1), at(0, 750, 1), at(2, 750, 2)])).toBe(6);
    // The top can alone takes only itself.
    expect(tenekeShoot(L, tenekeStart(), at(5), 0).hit.fell).toEqual([5]);
  });

  it('sends late stops high and early ones low', () => {
    expect(powerError(750, 0)).toBe(0);
    expect(powerError(810, 0)).toBe(0);
    expect(powerError(900, 0)).toBe(200);
    expect(powerError(1000, 0)).toBe(200 + Math.trunc((100 * 450) / 300));
    expect(powerError(900, 2)).toBe(260);
    const high = tenekeShoot(L, tenekeStart(), at(1, 1000), 0).hit;
    const low = tenekeShoot(L, tenekeStart(), at(1, 500), 0).hit;
    expect(high.hy).toBeGreaterThan(350);
    expect(low.hy).toBeLessThan(350);
  });

  it('loses the next ball too when the teyze\'s window breaks', () => {
    const r = tenekeShoot(L, tenekeStart(), { x: 0, y: 1300, p: 750, t: 0 }, 0);
    expect(r.hit).toMatchObject({ hit: null, window: true });
    expect(r.state.balls).toBe(2);
    expect(tenekeScore(42, 0, [{ x: 0, y: 1300, p: 750, t: 0 }, { x: 0, y: 1300, p: 750, t: 1 }, at(1, 750, 2)])).toBe(0);
  });
});

describe('duvar pası', () => {
  const beats = pasBeats(7, 0);
  const perfect: Tap[] = beats.map(b => ({ t: b.t, s: b.s }));

  it('speeds up and stays the same for a seed', () => {
    expect(beats).toHaveLength(24);
    expect(beats[0]!.t).toBe(1500);
    expect(beats[1]!.t - beats[0]!.t).toBe(1100);
    expect(beats[23]!.t - beats[22]!.t).toBeLessThan(600);
    expect(pasBeats(7, 0)).toEqual(beats);
  });

  it('scores perfect passes with the growing multiplier', () => {
    expect(pasScore(7, 0, perfect)).toBe(2 * 6 * (1 + 2 + 3 + 4));
    expect(pasJudge(beats[0]!, { t: beats[0]!.t + 110, s: beats[0]!.s }, 0)).toBe('good');
    expect(pasJudge(beats[0]!, { t: beats[0]!.t + 110, s: beats[0]!.s }, 2)).toBe('miss');
  });

  it('ends at the first miss, wrong side or a beat left alone', () => {
    const wrong = perfect.map((tap, i) => (i === 3 ? { ...tap, s: (1 - tap.s) as 0 | 1 } : tap));
    expect(pasScore(7, 0, wrong)).toBe(6);
    expect(pasScore(7, 0, perfect.slice(0, 2))).toBe(4);
    expect(pasScore(7, 0, [])).toBe(0);
  });
});

describe('bakkala koş', () => {
  const obs = kosObstacles(99, 1);
  const dodge = (seed: number, tier: 0 | 1 | 2) => {
    const moves: Move[] = [];
    let lane = 1;
    for (const o of kosObstacles(seed, tier)) {
      if (!o.lanes.includes(lane)) continue;
      const free = [0, 1, 2].filter(l => !o.lanes.includes(l)).sort((a, b) => Math.abs(a - lane) - Math.abs(b - lane))[0]!;
      const d = free > lane ? 1 : -1;
      for (let i = 0; i < Math.abs(free - lane); i++) moves.push({ t: o.t - 300 + i * 50, d });
      lane = free;
    }
    return moves;
  };

  it('blocks one or two lanes and never all three', () => {
    expect(obs).toHaveLength(24);
    expect(obs.every(o => o.lanes.length >= 1 && o.lanes.length <= 2)).toBe(true);
    expect(obs.some(o => o.lanes.length === 2)).toBe(true);
    expect(kosObstacles(99, 1)).toEqual(obs);
  });

  it('passes everything with good dodges and stops at the third bump', () => {
    expect(kosScore(99, 1, dodge(99, 1))).toBe(24);
    const still = kosScore(99, 1, []);
    expect(still).toBeLessThan(24);
    const run = kosAdvance(obs, [], kosStart(), Number.MAX_SAFE_INTEGER);
    expect(run).toMatchObject({ hits: 3, over: true, passed: still });
  });

  it('needs a switch to start before the obstacle arrives', () => {
    const o = obs.find(x => x.lanes.length === 1 && x.lanes[0] === 1)!;
    expect(kosLane([{ t: o.t - 50, d: 1 }], o.t - 80)).toBe(1);
    expect(kosLane([{ t: o.t - 200, d: 1 }], o.t - 80)).toBe(2);
    expect(kosLane([{ t: 0, d: -1 }, { t: 1, d: -1 }], 10)).toBe(0);
  });
});

describe('merdiven', () => {
  const steady = (gap: number, until = 20_000): Tap[] => {
    const taps: Tap[] = [];
    for (let t = 0, s = 0; t <= until; t += gap, s = 1 - s) taps.push({ t, s: s as 0 | 1 });
    return taps;
  };

  it('stumbles on the same foot twice', () => {
    let run = merdivenStep(merdivenStart(), { t: 0, s: 0 }, 0).run;
    const r = merdivenStep(run, { t: 300, s: 0 }, 0);
    expect(r.result).toBe('same_foot');
    run = r.run;
    expect(merdivenStep(run, { t: 500, s: 1 }, 0).result).toBe('ignored');
    expect(merdivenStep(run, { t: 800, s: 1 }, 0).result).toBe('step');
  });

  it('lets breath come back by itself, except while out of breath', () => {
    const run = merdivenStep(merdivenStart(), { t: 0, s: 0 }, 0).run;
    expect(run.breath).toBe(70);
    expect(breathAt(run, 200)).toBe(30);
    expect(breathAt(run, 1000)).toBe(0);
    const out = merdivenStep({ ...run, breath: 990, at: 0 }, { t: 0, s: 1 }, 0);
    expect(out.result).toBe('out_of_breath');
    expect(breathAt(out.run, 1400)).toBe(1000);
    expect(breathAt(out.run, 2500)).toBe(800);
  });

  it('rewards pacing over mashing', () => {
    const paced = merdivenScore(0, 0, steady(300));
    const mashed = merdivenScore(0, 0, steady(120));
    expect(paced).toBeGreaterThan(55);
    expect(mashed).toBeLessThan(paced);
    expect(merdivenScore(0, 0, steady(300, 25_000))).toBe(paced);
  });
});

describe('drill inputs and stars', () => {
  it('accepts only well-formed inputs in time order', () => {
    expect(parseDrillInputs('shooting', [{ x: 0, y: 300, p: 750, t: 1000 }])).toEqual([{ x: 0, y: 300, p: 750, t: 1000 }]);
    expect(parseDrillInputs('shooting', [{ x: 0, y: 300, p: 750, t: 1000 }, { x: 0, y: 300, p: 750, t: 1000 }])).toBeNull();
    expect(parseDrillInputs('shooting', Array.from({ length: 5 }, (_, t) => ({ x: 0, y: 0, p: 0, t })))).toBeNull();
    expect(parseDrillInputs('passing', [{ t: 10, s: 1 }, { t: 5, s: 0 }])).toBeNull();
    expect(parseDrillInputs('passing', [{ t: 10, s: 2 }])).toBeNull();
    expect(parseDrillInputs('pace', [{ t: 10, d: 1 }, { t: 10, d: -1 }])).toEqual([{ t: 10, d: 1 }, { t: 10, d: -1 }]);
    expect(parseDrillInputs('pace', [{ t: 10, d: 2 }])).toBeNull();
    expect(parseDrillInputs('stamina', 'taps')).toBeNull();
    expect(parseDrillInputs('stamina', [{ t: 1.5, s: 0 }])).toBeNull();
    expect(lastInputAt([{ t: 4, s: 0 }, { t: 9, s: 1 }])).toBe(9);
  });

  it('scores every stat through one entry point', () => {
    const beats = pasBeats(5, 0);
    expect(drillScore('passing', 5, 0, beats.map(b => ({ t: b.t, s: b.s })))).toBe(120);
    expect(drillScore('stamina', 5, 0, [])).toBe(0);
  });

  it('turns scores into stars and stars into the old grades', () => {
    expect([0, 2, 4, 5, 6].map(s => drillStars('shooting', s, tc))).toEqual([0, 1, 2, 2, 3]);
    expect([3, 2, 1, 0].map(starsGrade)).toEqual(['perfect', 'good', 'miss', 'miss']);
    expect([40, 59, 60, 79, 80, 99].map(v => drillTier(v, tc))).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('sets Kerem\'s record between the 2 and 3 star scores', () => {
    expect(keremRecord('pace', 0, tc)).toBe(18);
    expect(keremRecord('pace', 10, tc)).toBe(21);
    expect(keremRecord('pace', 40, tc)).toBe(24);
  });

  it('picks one drill a day, the same every call, all four over a month', () => {
    expect(dailyDrill('2026-11-03')).toBe(dailyDrill('2026-11-03'));
    const month = Array.from({ length: 30 }, (_, i) => dailyDrill(`2026-11-${String(i + 1).padStart(2, '0')}`));
    expect(new Set(month).size).toBe(4);
  });
});
