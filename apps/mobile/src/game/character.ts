import type { ImageSource } from 'expo-image';

// Choices of the new-player flow (app/karakter.tsx). Stored on the device only for now:
// the server still decides stats, so none of these change a number yet.

export const HEROES = ['street', 'gercekci', 'ciliz3', 'ciliz4', 'pro'] as const;
export type Hero = (typeof HEROES)[number];
/** The starters offered on the look step: all skinny kids. 'pro' stays for players who picked it before. */
export const STARTERS: Hero[] = ['street', 'gercekci', 'ciliz3', 'ciliz4'];

/** `tint` recolours the 3D kit (hue in degrees, see Model3D); lime is the kit as modelled. */
export const JERSEYS = [
  { key: 'lime', color: '#CFFD5C', tint: null },
  { key: 'red', color: '#E5483B', tint: 5 },
  { key: 'blue', color: '#3B82F6', tint: 215 },
  { key: 'orange', color: '#FF9A2E', tint: 28 },
  { key: 'purple', color: '#8B5CF6', tint: 265 },
  { key: 'white', color: '#F2F2F2', tint: 'white' },
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

export const jerseyTint = (j: Jersey) => JERSEYS.find(x => x.key === j)?.tint ?? null;

/** Render of each hero in each jersey colour (built by scripts/recolor-heroes.py); shown only without WebGL. */
export const HERO_IMAGE: Record<Hero, Record<Jersey, ImageSource>> = {
  street: {
    lime: require('../../assets/meshy/hero-street.webp'),
    red: require('../../assets/meshy/hero-street-red.webp'),
    blue: require('../../assets/meshy/hero-street-blue.webp'),
    orange: require('../../assets/meshy/hero-street-orange.webp'),
    purple: require('../../assets/meshy/hero-street-purple.webp'),
    white: require('../../assets/meshy/hero-street-white.webp'),
  },
  gercekci: {
    lime: require('../../assets/meshy/hero-street.webp'),
    red: require('../../assets/meshy/hero-street-red.webp'),
    blue: require('../../assets/meshy/hero-street-blue.webp'),
    orange: require('../../assets/meshy/hero-street-orange.webp'),
    purple: require('../../assets/meshy/hero-street-purple.webp'),
    white: require('../../assets/meshy/hero-street-white.webp'),
  },
  ciliz3: {
    lime: require('../../assets/meshy/hero-street.webp'),
    red: require('../../assets/meshy/hero-street-red.webp'),
    blue: require('../../assets/meshy/hero-street-blue.webp'),
    orange: require('../../assets/meshy/hero-street-orange.webp'),
    purple: require('../../assets/meshy/hero-street-purple.webp'),
    white: require('../../assets/meshy/hero-street-white.webp'),
  },
  ciliz4: {
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

/** 3D model of each hero, with walk, idle, cheer, dribble and kick clips (pro has walk only). */
export const HERO_MODEL: Record<Hero, number> = {
  street: require('../../assets/models/karakter-street.glb'),
  gercekci: require('../../assets/models/karakter-gercekci.glb'),
  ciliz3: require('../../assets/models/karakter-ciliz3.glb'),
  ciliz4: require('../../assets/models/karakter-ciliz4.glb'),
  pro: require('../../assets/models/karakter-pro-yuruyus.glb'),
};

/** Head-and-shoulders render of each starter, for the picker. */
export const HERO_PORTRAIT: Partial<Record<Hero, ImageSource>> = {
  street: require('../../assets/meshy/portre-street.webp'),
  gercekci: require('../../assets/meshy/portre-gercekci.webp'),
  ciliz3: require('../../assets/meshy/portre-ciliz3.webp'),
  ciliz4: require('../../assets/meshy/portre-ciliz4.webp'),
};

export const NICK_MAX = 14;
export const NICK_MIN = 2;
/** Keeps letters (Turkish included), digits, space and underscore. */
export const cleanNick = (s: string) => s.replace(/[^\p{L}\p{N} _]/gu, '').slice(0, NICK_MAX);
