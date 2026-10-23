import type { ImageSource } from 'expo-image';

// Choices of the new-player flow (app/karakter.tsx). Stored on the device only for now:
// the server still decides stats, so none of these change a number yet.

export const HEROES = ['street', 'pro'] as const;
export type Hero = (typeof HEROES)[number];

export const JERSEYS = [
  { key: 'lime', color: '#CFFD5C' },
  { key: 'red', color: '#E5483B' },
  { key: 'blue', color: '#3B82F6' },
  { key: 'orange', color: '#FF9A2E' },
  { key: 'purple', color: '#8B5CF6' },
  { key: 'white', color: '#F2F2F2' },
] as const;
export type Jersey = (typeof JERSEYS)[number]['key'];

export const POSITIONS = ['bitirici', 'oyunKurucu', 'kanat'] as const;
export type Position = (typeof POSITIONS)[number];
export const TRAITS = ['hirsli', 'sakin', 'caliskan', 'sovmen', 'lider', 'sert'] as const;
export type Trait = (typeof TRAITS)[number];
export const DREAMS = ['milli', 'avrupa', 'saha'] as const;
export type Dream = (typeof DREAMS)[number];

export interface Character { hero: Hero; jersey: Jersey; position: Position; trait: Trait; dream: Dream }

export const DEFAULT_CHARACTER: Character = { hero: 'street', jersey: 'lime', position: 'bitirici', trait: 'hirsli', dream: 'avrupa' };

/** Render of each hero in each jersey colour (built by scripts/recolor-heroes.py). */
export const HERO_IMAGE: Record<Hero, Record<Jersey, ImageSource>> = {
  street: {
    lime: require('../../assets/meshy/hero-street.webp'),
    red: require('../../assets/meshy/hero-street-red.webp'),
    blue: require('../../assets/meshy/hero-street-blue.webp'),
    orange: require('../../assets/meshy/hero-street-orange.webp'),
    purple: require('../../assets/meshy/hero-street-purple.webp'),
    white: require('../../assets/meshy/hero-street-white.webp'),
  },
  pro: {
    lime: require('../../assets/meshy/hero-pro.webp'),
    red: require('../../assets/meshy/hero-pro-red.webp'),
    blue: require('../../assets/meshy/hero-pro-blue.webp'),
    orange: require('../../assets/meshy/hero-pro-orange.webp'),
    purple: require('../../assets/meshy/hero-pro-purple.webp'),
    white: require('../../assets/meshy/hero-pro-white.webp'),
  },
};

/** Walking model for the hub. The 3D model keeps its lime kit; only the image fallback follows the jersey. */
export const HERO_MODEL: Record<Hero, number> = {
  street: require('../../assets/models/karakter-street-yuruyus.glb'),
  pro: require('../../assets/models/karakter-pro-yuruyus.glb'),
};

export const NICK_MAX = 14;
export const NICK_MIN = 2;
/** Keeps letters (Turkish included), digits, space and underscore. */
export const cleanNick = (s: string) => s.replace(/[^\p{L}\p{N} _]/gu, '').slice(0, NICK_MAX);
