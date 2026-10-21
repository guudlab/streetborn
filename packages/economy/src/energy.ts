import type { EconomyConfig } from './config.ts';

/** Stored energy state. `updatedAt` is epoch ms, always set from the server clock. */
export interface EnergyState {
  energy: number;
  updatedAt: number;
}

/**
 * Energy right now. Regeneration is derived from server time, so changing the
 * phone's clock does nothing. When energy is full the regen clock restarts at `now`.
 */
export function currentEnergy(state: EnergyState, now: number, config: EconomyConfig): EnergyState {
  if (state.energy >= config.energyMax) return { energy: state.energy, updatedAt: now };
  const step = config.energyRegenSeconds * 1000;
  const gained = Math.floor(Math.max(0, now - state.updatedAt) / step);
  const energy = Math.min(config.energyMax, state.energy + gained);
  const updatedAt = energy >= config.energyMax ? now : state.updatedAt + gained * step;
  return { energy, updatedAt };
}

/** Spends energy, or returns null if there is not enough. */
export function spendEnergy(state: EnergyState, cost: number, now: number, config: EconomyConfig): EnergyState | null {
  const current = currentEnergy(state, now, config);
  if (current.energy < cost) return null;
  // Spending from full starts the regen clock now; otherwise the partial progress is kept.
  return { energy: current.energy - cost, updatedAt: current.updatedAt };
}
