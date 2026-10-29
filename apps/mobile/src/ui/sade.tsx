import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '../theme.ts';
import { sfx } from '../audio/audio.ts';
import { buzz, CoachFace, T, tap } from './kit.tsx';
import { PressableScale } from './motion.tsx';

// Building blocks of the simplified "Tek odak" UI (Kaan, 2026-10-24): icon tiles
// instead of text rows, one-line coach bubbles, and a lime dot for anything new.
// Icons are the transparent Meshy cut-outs in assets/icons.

export const ICONS = {
  anahtar: require('../../assets/icons/anahtar.webp'),
  araba: require('../../assets/icons/araba.webp'),
  arsa: require('../../assets/icons/arsa.webp'),
  bisiklet: require('../../assets/icons/bisiklet.webp'),
  calim: require('../../assets/icons/calim.webp'),
  coinStack: require('../../assets/icons/coin-stack.webp'),
  davet: require('../../assets/icons/davet-zarf.webp'),
  enerji: require('../../assets/icons/enerji.webp'),
  evDaire: require('../../assets/icons/ev-daire.webp'),
  evOda: require('../../assets/icons/ev-oda.webp'),
  evVilla: require('../../assets/icons/ev-villa.webp'),
  fizik: require('../../assets/icons/fizik-dambil.webp'),
  gemCase: require('../../assets/icons/gem-case.webp'),
  gemCluster: require('../../assets/icons/gem-cluster.webp'),
  halisaha: require('../../assets/icons/halisaha.webp'),
  hiz: require('../../assets/icons/hiz-krampon.webp'),
  kramponMahalle: require('../../assets/icons/krampon-mahalle.webp'),
  kramponCim: require('../../assets/icons/krampon-cim.webp'),
  kramponPro: require('../../assets/icons/krampon-pro.webp'),
  kale: require('../../assets/icons/kale.webp'),
  kulup: require('../../assets/icons/kulup-bina.webp'),
  arma: require('../../assets/icons/mahalle-arma.webp'),
  mahalleBul: require('../../assets/icons/mahalle-bul.webp'),
  mahalle: require('../../assets/icons/mahalle-saha.webp'),
  milliForma: require('../../assets/icons/milli-forma.webp'),
  oyuncu: require('../../assets/icons/oyuncu-dur.webp'),
  oyuncuKosu: require('../../assets/icons/oyuncu-kosu.webp'),
  pas: require('../../assets/icons/pas.webp'),
  sezonKart: require('../../assets/icons/sezon-kart.webp'),
  sporAraba: require('../../assets/icons/spor-araba.webp'),
  sut: require('../../assets/icons/sut.webp'),
  ball: require('../../assets/meshy/ball.webp'),
  coin: require('../../assets/meshy/coin.webp'),
  gem: require('../../assets/meshy/gem.webp'),
  cup: require('../../assets/meshy/cup-gold.webp'),
} as const;
export type IconAsset = keyof typeof ICONS;

/** The picture of a pair of krampon by item id. */
export function bootIcon(id: string | null | undefined): IconAsset {
  return id === 'krampon_pro' ? 'kramponPro' : id === 'krampon_cim' ? 'kramponCim' : 'kramponMahalle';
}

/** A 3D icon. Decorative by default: the tile or button around it carries the label. */
export function Ico({ name, size = 40, dim, style }: { name: IconAsset; size?: number; dim?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ width: size, height: size, opacity: dim ? 0.35 : 1 }, style]} accessibilityElementsHidden importantForAccessibility="no">
      <Image source={ICONS[name]} style={{ width: '100%', height: '100%' }} contentFit="contain" />
    </View>
  );
}

/** The lime "something new here" dot. */
export const Dot = ({ style }: { style?: StyleProp<ViewStyle> }) => (
  <View style={[{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.l600 }, style]} />
);

type TileProps = {
  children: ReactNode; onPress?: () => void; selected?: boolean; disabled?: boolean; label?: string;
  role?: 'button' | 'radio'; row?: boolean; style?: StyleProp<ViewStyle>;
};

/**
 * A big tappable tile: icon on top (or on the left with `row`) and at most a word or a number.
 * Selected tiles get the lime border, like the selected tab.
 */
export function Tile({ children, onPress, selected, disabled, label, role = 'button', row, style }: TileProps) {
  return (
    <PressableScale
      accessibilityRole={role} accessibilityLabel={label} accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled || !onPress} onPress={() => { if (role === 'radio') { buzz('select'); sfx('tap'); } else tap(); onPress?.(); }} to={0.97}
      style={[{
        borderRadius: 22, borderWidth: 1.5, borderColor: selected ? colors.l600 : colors.line,
        backgroundColor: selected ? 'rgba(63,77,24,.38)' : colors.s2,
        ...(row
          ? { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 72, paddingHorizontal: 14, paddingVertical: 10 }
          : { alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, paddingHorizontal: 6 }),
      }, style]}
    >
      {children}
    </PressableScale>
  );
}

/** Burak abi's one line: his face and a speech bubble. Never more than a sentence. */
export function Bubble({ text, size = 40, style }: { text: string; size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, style]}>
      <CoachFace size={size} />
      <View style={{ flexShrink: 1, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, borderBottomLeftRadius: 6, backgroundColor: colors.s2 }}>
        <T w={600} size={15} style={{ lineHeight: 20 }} accessibilityLiveRegion="polite">{text}</T>
      </View>
    </View>
  );
}

/** An icon with a number next to it (coin, gem, members…). */
export function Amount({ icon, children, size = 22, color = colors.g100, textSize = 15 }: { icon: IconAsset; children: ReactNode; size?: number; color?: string; textSize?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Ico name={icon} size={size} />
      <T w={700} size={textSize} color={color}>{children}</T>
    </View>
  );
}

/** Thin segmented progress (the five character steps, AP points). */
export function Segments({ n, of, height = 5, gap = 6, style }: { n: number; of: number; height?: number; gap?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: 'row', gap }, style]}>
      {Array.from({ length: of }, (_, i) => (
        <View key={i} style={{ flex: 1, height, borderRadius: height / 2, backgroundColor: i < n ? colors.l600 : colors.s3 }} />
      ))}
    </View>
  );
}
