// Every sound the app can play. Ids are stable; to replace a sound, drop a new
// file with the same name into assets/audio/. The first block is synthesized by
// scripts/generate-audio.py (no samples, no licenses); the second was generated
// in ElevenLabs Sound Effects and cut by scripts/cut-sfx.py.

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

  count_tick: { src: require('../../assets/audio/count_tick.m4a'), gain: 0.6 },
  star_pop_1: { src: require('../../assets/audio/star_pop_1.m4a'), gain: 0.75 },
  star_pop_2: { src: require('../../assets/audio/star_pop_2.m4a'), gain: 0.75 },
  star_pop_3: { src: require('../../assets/audio/star_pop_3.m4a'), gain: 0.75 },
  badge_shine: { src: require('../../assets/audio/badge_shine.m4a'), gain: 0.8 },
  record_fanfare: { src: require('../../assets/audio/record_fanfare.m4a'), gain: 0.75 },
  card_pop: { src: require('../../assets/audio/card_pop.m4a'), gain: 0.55 },
  sling_pull: { src: require('../../assets/audio/sling_pull.m4a'), gain: 0.6 },
  can_hit: { src: require('../../assets/audio/can_hit.m4a'), gain: 0.85 },
  glass_crack: { src: require('../../assets/audio/glass_crack.m4a'), gain: 0.8 },
  wall_thud: { src: require('../../assets/audio/wall_thud.m4a'), gain: 0.75 },
  lane_whoosh: { src: require('../../assets/audio/lane_whoosh.m4a'), gain: 0.55 },
  crate_bump: { src: require('../../assets/audio/crate_bump.m4a'), gain: 0.8 },
  shop_bell: { src: require('../../assets/audio/shop_bell.m4a'), gain: 0.7 },
  stair_step: { src: require('../../assets/audio/stair_step.m4a'), gain: 0.5 },
  out_of_breath: { src: require('../../assets/audio/out_of_breath.m4a'), gain: 0.75 },
  ball_steal: { src: require('../../assets/audio/ball_steal.m4a'), gain: 0.8 },
  dribble_past: { src: require('../../assets/audio/dribble_past.m4a'), gain: 0.75 },
  phone_ping: { src: require('../../assets/audio/phone_ping.m4a'), gain: 0.6 },
  energy_charge: { src: require('../../assets/audio/energy_charge.m4a'), gain: 0.7 },
  coin_count: { src: require('../../assets/audio/coin_count.m4a'), gain: 0.65 },
  gem_sparkle: { src: require('../../assets/audio/gem_sparkle.m4a'), gain: 0.7 },
} as const;

/** Looping beds. Only one music track and one ambience play at a time. */
export const LOOPS = {
  // "Mahalle funk" from ElevenLabs Music (112 BPM), cut by scripts/loop-music.py into an
  // 86 s loop; it is mastered louder than the old synthesized loop, hence the low gain.
  menu: { src: require('../../assets/audio/menu_loop.m4a'), gain: 0.28 },
  match: { src: require('../../assets/audio/match_loop.m4a'), gain: 0.32 },
  // The stand chant from the trailer (fragman/ses/tribun-tezahurat-2.mp3), cut into a seamless
  // 9.9 s loop; crowd_loop.m4a is the older synthesized bed.
  crowd: { src: require('../../assets/audio/crowd_chant.m4a'), gain: 0.42 },
} as const;

export type SfxId = keyof typeof SFX;
export type LoopId = keyof typeof LOOPS;
