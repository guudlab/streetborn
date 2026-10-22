// Every sound the app can play. Ids are stable; to replace a sound, drop a new
// file with the same name into assets/audio/. The current files are
// synthesized by scripts/generate-audio.py (no samples, no licenses).

export const SFX = {
  tap: { src: require('../../assets/audio/tap.m4a'), gain: 0.5 },
  tab: { src: require('../../assets/audio/tab.m4a'), gain: 0.55 },
  back: { src: require('../../assets/audio/back.m4a'), gain: 0.5 },
  error: { src: require('../../assets/audio/error.m4a'), gain: 0.6 },
  coin: { src: require('../../assets/audio/coin.m4a'), gain: 0.6 },
  levelup: { src: require('../../assets/audio/levelup.m4a'), gain: 0.8 },
  unlock: { src: require('../../assets/audio/unlock.m4a'), gain: 0.7 },
  kick: { src: require('../../assets/audio/kick.m4a'), gain: 0.9 },
  kick_power: { src: require('../../assets/audio/kick_power.m4a'), gain: 1 },
  net: { src: require('../../assets/audio/net.m4a'), gain: 0.9 },
  post: { src: require('../../assets/audio/post.m4a'), gain: 0.8 },
  save: { src: require('../../assets/audio/save.m4a'), gain: 0.9 },
  whistle_start: { src: require('../../assets/audio/whistle_start.m4a'), gain: 0.6 },
  whistle_end: { src: require('../../assets/audio/whistle_end.m4a'), gain: 0.6 },
  crowd_cheer: { src: require('../../assets/audio/crowd_cheer.m4a'), gain: 0.8 },
  crowd_groan: { src: require('../../assets/audio/crowd_groan.m4a'), gain: 0.7 },
  victory_sting: { src: require('../../assets/audio/victory_sting.m4a'), gain: 0.8 },
  defeat_sting: { src: require('../../assets/audio/defeat_sting.m4a'), gain: 0.7 },
} as const;

/** Looping beds. Only one music track and one ambience play at a time. */
export const LOOPS = {
  menu: { src: require('../../assets/audio/menu_loop.m4a'), gain: 0.45 },
  match: { src: require('../../assets/audio/match_loop.m4a'), gain: 0.32 },
  crowd: { src: require('../../assets/audio/crowd_loop.m4a'), gain: 0.4 },
} as const;

export type SfxId = keyof typeof SFX;
export type LoopId = keyof typeof LOOPS;
