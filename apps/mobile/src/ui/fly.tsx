// Currency that flies into the wallet: a few small icons arc from where the reward
// appeared to a wallet pill in the top right corner, one after another, and the pill's
// number ticks up as each lands. Match end (coins) and gem pack purchases (gems).
import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';

import { colors } from '../theme.ts';
import { T } from './kit.tsx';
import { Pop } from './motion.tsx';
import { Ico, type IconAsset } from './sade.tsx';

export type Point = { x: number; y: number };

/** `count` icons fly from `from` to `to` (centers, in the parent's coordinates); `onLanded(n)` fires as the n-th lands. */
export function CurrencyFly({ icon, from, to, count = 5, size = 18, onLanded }: {
  icon: IconAsset; from: Point; to: Point; count?: number; size?: number; onLanded: (n: number) => void;
}) {
  const vals = useRef(Array.from({ length: count }, () => new Animated.Value(0))).current;
  useEffect(() => {
    let landed = 0;
    vals.forEach((v, i) => Animated.timing(v, { toValue: 1, duration: 650, delay: i * 90, easing: Easing.in(Easing.quad), useNativeDriver: true })
      .start(({ finished }) => {
        if (!finished) return;
        onLanded(++landed);
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dx = to.x - from.x, dy = to.y - from.y;
  return (
    <>
      {vals.map((v, i) => (
        <Animated.View key={i} pointerEvents="none" style={{
          position: 'absolute', left: from.x - size / 2 + (i - (count - 1) / 2) * 6, top: from.y - size / 2,
          opacity: v.interpolate({ inputRange: [0, 0.1, 0.9, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
            { translateY: v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, -30, dy] }) },
            { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
          ],
        }}>
          <Ico name={icon} size={size} />
        </Animated.View>
      ))}
    </>
  );
}

/** The wallet pill the currency flies into, at the top right below the status bar. */
export function WalletPill({ icon, value, label, top }: { icon: IconAsset; value: string; label: string; top: number }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top, right: 16 }}>
      <Pop style={{ height: 40, paddingHorizontal: 12, borderRadius: 20, backgroundColor: colors.s2, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ico name={icon} size={24} /><T w={700} size={15} accessibilityLabel={label}>{value}</T>
      </Pop>
    </View>
  );
}
