import type { Rng } from './prng.ts';

/**
 * All values are integers. The goal mouth spans aim -1000..1000 (posts) and
 * lift 0..1000 (crossbar), so the engine never needs floating point.
 */
export interface ShotInput {
  /** Horizontal target, -1000 (left post) .. 1000 (right post). */
  aim: number;
  /** Vertical target, 0 (ground) .. 1000 (crossbar). */
  lift: number;
  /** Shot power, 0 .. 1000. */
  power: number;
}

export type ShotOutcome = 'goal' | 'saved' | 'wide' | 'over';

/** Skill ratings are integers 1..100. */
export interface ShotContext {
  shooting: number;
  goalkeeping: number;
}

const POWER_SWEET_SPOT = 750;

export function resolveShot(rng: Rng, shot: ShotInput, ctx: ShotContext): ShotOutcome {
  // Lower shooting skill and overhit shots both widen the error spread.
  const overhit = Math.max(0, shot.power - POWER_SWEET_SPOT);
  const spread = (110 - ctx.shooting) * 4 + overhit;

  const x = shot.aim + rng.range(-spread, spread);
  const y = shot.lift + rng.range(-spread, spread);

  if (x < -1000 || x > 1000) return 'wide';
  if (y > 1000) return 'over';

  // Corners and power beat the keeper; skill helps the keeper.
  const corner = Math.trunc(Math.max(Math.abs(x), Math.max(y, 0)) / 10); // 0..100
  const saveChance = clamp(40 + Math.trunc(ctx.goalkeeping / 2) - Math.trunc(corner / 2) - Math.trunc(shot.power / 40), 5, 90);

  return rng.int(100) < saveChance ? 'saved' : 'goal';
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
