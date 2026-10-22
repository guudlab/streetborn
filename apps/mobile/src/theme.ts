// Design tokens from the production design system (Concept A "Saha Kenarı").
// Values match tasarim-yonleri/prototip/a.html one to one.
export const colors = {
  ink: '#0D0D0D',
  s1: '#151515',
  s2: '#1D1D1D',
  s3: '#262626',
  line: '#2C2C2C',
  g100: '#FFFFFF',
  g200: '#B4B4B4',
  g300: '#7F8185',
  g400: '#5C5C5C',
  l500: '#DEFE83',
  l600: '#CFFD5C',
  l700: '#9BBF43',
  l900: '#3F4D18',
  bad: '#FF7A66',
  gem: '#9AD8FF',
  awayCrest: '#2E3A52',
  awayCrestText: '#C9D6F0',
} as const;

export const fonts = {
  400: 'Inter_400Regular',
  500: 'Inter_500Medium',
  600: 'Inter_600SemiBold',
  700: 'Inter_700Bold',
} as const;

export type Weight = keyof typeof fonts;

/** Space reserved at the bottom of tab screens for the floating tab bar. */
export const TAB_BAR_SPACE = 120;

/** Shared animation timings (ms) and springs, so every screen moves the same way. */
export const motion = {
  fast: 150,
  base: 250,
  slow: 400,
  celebrate: 900,
  /** UI feedback: presses, toggles, sliding indicators. */
  snappy: { damping: 18, stiffness: 260, mass: 1 },
  /** Rewards only: goals, level ups, coins. */
  bouncy: { damping: 10, stiffness: 180, mass: 1 },
} as const;
