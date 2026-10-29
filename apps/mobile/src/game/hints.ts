import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { DrillKey } from './rules.ts';

// First-time coaching (Burak abi's bubbles and the one spotlight). Which hints a
// player has seen lives only on the device: it carries no amounts and never touches the
// economy. Signing out forgets it, so the next player gets the tour.

export const HINTS_KEY = 'streetborn.hints.v1';

/** `howto_*`: the mini game's demo card was shown once (talim.tsx). */
export type HintId = 'spotTrain' | 'lifeTab' | 'shopTab' | 'jobTrain' | `howto_${DrillKey}`;

interface HintsState {
  loaded: boolean;
  seen: Partial<Record<HintId, true>>;
  mark(id: HintId): void;
  reset(): void;
}

const persist = (seen: HintsState['seen']) => { void AsyncStorage.setItem(HINTS_KEY, JSON.stringify(seen)).catch(() => {}); };

export const useHints = create<HintsState>()((set, get) => ({
  loaded: false,
  seen: {},
  mark: (id) => {
    if (get().seen[id]) return;
    const seen = { ...get().seen, [id]: true as const };
    set({ seen });
    persist(seen);
  },
  reset: () => set({ seen: {} }),
}));

void AsyncStorage.getItem(HINTS_KEY)
  .then(raw => {
    let stored: HintsState['seen'] = {};
    try { stored = raw ? (JSON.parse(raw) as HintsState['seen']) : {}; } catch { /* a damaged cache shows the hints again */ }
    useHints.setState(s => ({ loaded: true, seen: { ...stored, ...s.seen } }));
  })
  .catch(() => useHints.setState({ loaded: true }));

/** True once the saved state is read and the hint has not been shown yet. */
export const useHint = (id: HintId) => useHints(s => s.loaded && !s.seen[id]);
export const markHint = (id: HintId) => useHints.getState().mark(id);
