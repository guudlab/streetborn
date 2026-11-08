import { DEFAULT_CONFIG, lifeShowcase } from '@streetborn/economy';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useGame } from '../game/store.ts';
import { t, type Key } from '../i18n/index.ts';
import { colors } from '../theme.ts';
import { feedLine, type FeedLine } from './live/Commentary.tsx';
import { type IconAsset } from './sade.tsx';

// The Yaşam showcase outside the Yaşam tab (Kaan 2026-11-08 "Şimdi aç + vitrin"): the home behind
// the player on the profile card and the kick-off line. Mahalle cards stay quiet: a mate's items
// show on their profile. Status only.

const LIFE = DEFAULT_CONFIG.lifestyle;

export const LIFE_ICON: Record<string, IconAsset> = {
  ev_oda: 'evOda', bisiklet: 'bisiklet', ev_daire: 'evDaire', araba: 'araba',
  arsa: 'arsa', halisaha: 'halisaha', ev_villa: 'evVilla', spor_araba: 'sporAraba',
};

/** The Yaşam ids among the player's own items. */
export const myLife = () => useGame.getState().owned.filter(o => LIFE_ICON[o.id]).map(o => o.id);

const BACKDROP: Record<string, number> = {
  ev_oda: require('../../assets/yasam/bg-oda.webp'),
  ev_daire: require('../../assets/yasam/bg-daire.webp'),
  ev_villa: require('../../assets/yasam/bg-villa.webp'),
};

/** "Daire · Araba · Halısaha": the home, then the ride and the land when the player has them. */
export function lifeCaption(bought: readonly string[]): string {
  const show = lifeShowcase(bought, LIFE);
  return [show.ev, show.ulasim, show.arsa].filter((id): id is string => !!id).map(id => t(`life.${id}` as Key)).join(' · ');
}

/**
 * The player card's backdrop (Kaan 2026-11-08, option A "Evinin içinde"): the player stands in
 * their home. A dark scrim at the top and bottom keeps the power number and the name readable.
 */
export function HomeBackdrop({ bought }: { bought: readonly string[] }) {
  const home = lifeShowcase(bought, LIFE).ev;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image source={BACKDROP[home] ?? BACKDROP.ev_oda} style={StyleSheet.absoluteFill} contentFit="cover" />
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="homeScrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.ink} stopOpacity={0.86} />
            <Stop offset="0.3" stopColor={colors.ink} stopOpacity={0.12} />
            <Stop offset="0.58" stopColor={colors.ink} stopOpacity={0.18} />
            <Stop offset="0.82" stopColor={colors.ink} stopOpacity={0.94} />
            <Stop offset="1" stopColor={colors.ink} stopOpacity={0.96} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#homeScrim)" />
      </Svg>
    </View>
  );
}

/** The kick-off line when the player came in something: "Maça arabanla geldin." Null on foot. */
export function arrivalLine(): FeedLine | null {
  const ride = lifeShowcase(myLife(), LIFE).ulasim;
  return ride ? feedLine(0, t(`life.arrive.${ride}` as Key), 'me', null) : null;
}

