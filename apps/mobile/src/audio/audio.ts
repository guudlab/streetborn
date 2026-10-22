import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';

import { LOOPS, SFX, type LoopId, type SfxId } from './sounds.ts';

export type { LoopId, SfxId };

// The only place that talks to expo-audio. Screens call sfx(), setMusic()
// and setAmbience(); the two settings toggles live in useSound.

const KEY = 'streetborn.sound.v1';
const POOL = 3; // overlapping copies per effect, so fast taps don't cut each other off

interface SoundState {
  music: boolean;
  effects: boolean;
  setMusicOn(on: boolean): void;
  setEffectsOn(on: boolean): void;
}

export const useSound = create<SoundState>()((set) => ({
  music: true,
  effects: true,
  setMusicOn: (music) => { set({ music }); save(); applyLoops(); },
  setEffectsOn: (effects) => { set({ effects }); save(); },
}));

const save = () => {
  const { music, effects } = useSound.getState();
  void AsyncStorage.setItem(KEY, JSON.stringify({ music, effects })).catch(() => {});
};

void AsyncStorage.getItem(KEY).then((raw) => {
  if (!raw) return;
  const v = JSON.parse(raw) as { music?: boolean; effects?: boolean };
  useSound.setState({ music: v.music !== false, effects: v.effects !== false });
  applyLoops();
}).catch(() => {});

// Effects follow the iOS silent switch; music and ambience never play in the background.
void setAudioModeAsync({ playsInSilentMode: false, shouldPlayInBackground: false }).catch(() => {});

/* ---------- effects ---------- */

const pools = new Map<SfxId, AudioPlayer[]>();

function playerFor(id: SfxId) {
  let pool = pools.get(id);
  if (!pool) { pool = []; pools.set(id, pool); }
  const idle = pool.find(p => !p.playing);
  if (idle) return idle;
  if (pool.length < POOL) {
    const p = createAudioPlayer(SFX[id].src);
    pool.push(p);
    return p;
  }
  return pool[0]!;
}

/** Plays a one-shot effect. `gain` scales the effect's default volume. */
export function sfx(id: SfxId, gain = 1) {
  unlock();
  if (!useSound.getState().effects) return;
  try {
    const p = playerFor(id);
    p.volume = SFX[id].gain * gain;
    void p.seekTo(0).catch(() => {});
    p.play();
  } catch (e) {
    console.warn('sfx failed', id, e);
  }
}

/** Creates the players for the effects a screen needs, so the first play has no delay. */
export function preloadSfx(ids: SfxId[]) {
  for (const id of ids) if (!pools.get(id)?.length) pools.set(id, [createAudioPlayer(SFX[id].src)]);
}

/* ---------- loops ---------- */

const loops = new Map<LoopId, AudioPlayer>();
let music: LoopId | null = null;
let ambience: LoopId | null = null;
let duck = 1;
let foreground = true;
// Browsers refuse to start audio before the first user gesture.
let unlocked = Platform.OS !== 'web';

function loopPlayer(id: LoopId) {
  let p = loops.get(id);
  if (!p) {
    p = createAudioPlayer(LOOPS[id].src);
    p.loop = true;
    loops.set(id, p);
  }
  return p;
}

function applyLoops() {
  const on = useSound.getState().music && foreground && unlocked;
  for (const id of Object.keys(LOOPS) as LoopId[]) {
    const wanted = on && (id === music || id === ambience);
    const p = wanted ? loopPlayer(id) : loops.get(id);
    if (!p) continue;
    if (wanted) {
      // Ambience is part of the match, so it is not ducked with the music.
      p.volume = LOOPS[id].gain * (id === ambience ? 1 : duck);
      if (!p.playing) p.play();
    } else if (p.playing) {
      p.pause();
    }
  }
}

/** Switches the music bed; null stops it. A track that is already playing keeps going. */
export function setMusic(id: LoopId | null) {
  if (music === id) return;
  if (music) void loops.get(music)?.seekTo(0).catch(() => {});
  music = id;
  applyLoops();
}

/** Background ambience (crowd) that plays together with the music. */
export function setAmbience(id: LoopId | null) {
  if (ambience === id) return;
  ambience = id;
  applyLoops();
}

/** Lowers the music for `ms` so a celebration or a coach line can be heard. */
export function duckMusic(ms: number, level = 0.35) {
  duck = level;
  applyLoops();
  setTimeout(() => { duck = 1; applyLoops(); }, ms);
}

function unlock() {
  if (unlocked) return;
  unlocked = true;
  applyLoops();
}

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.addEventListener('pointerdown', unlock, { once: true });
}

AppState.addEventListener('change', (s) => {
  foreground = s === 'active';
  applyLoops();
});
