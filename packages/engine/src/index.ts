export { createRng, deriveSeed, type Rng } from './prng.ts';
export { resolveShot, clamp, type ShotInput, type ShotOutcome, type ShotContext } from './shot.ts';
export {
  simulateMatch,
  EngineInputError,
  type MatchSetup,
  type ChanceInput,
  type MatchResult,
} from './match.ts';
