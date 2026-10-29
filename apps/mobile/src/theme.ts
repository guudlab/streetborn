import { Easing } from 'react-native-reanimated';

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

/**
 * Largest system text scale (Dynamic Type) the UI follows. Bigger accessibility sizes are
 * capped here so 56 px buttons and icon tiles stay readable instead of clipping.
 */
export const MAX_FONT_SCALE = 1.35;

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
  /** Sheets and toasts arriving: quick, settles without a visible bounce. */
  sheet: { damping: 22, stiffness: 240, mass: 0.9 },
  /** Delay between items of a list that enters one after another (capped at 8 items). */
  stagger: 45,
} as const;

/**
 * Easing curves for timed animations (Reanimated's Easing.bezier takes the same numbers).
 * `out` for things arriving, `in` for things leaving, `inOut` for loops and moves.
 */
export const ease = {
  out: Easing.bezier(0.2, 0.8, 0.2, 1),
  in: Easing.bezier(0.4, 0, 1, 1),
  inOut: Easing.bezier(0.45, 0, 0.55, 1),
} as const;

/** Spacing scale (px). `screen` is the side padding of every screen. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, screen: 20 } as const;

/** Corner radii: pills are height / 2; these are the fixed ones. */
export const radius = { sm: 12, md: 18, card: 22, lg: 24, sheet: 32 } as const;

/** Elevation, for things that float above the page (toast, tab bar, sheet). */
export const shadow = {
  float: { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  /** The lime glow under the primary button. */
  lime: { shadowColor: colors.l600, shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } },
} as const;
