import { useEffect, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';

import { colors } from '../../theme.ts';
import { T } from '../kit.tsx';
import { Pop } from '../motion.tsx';

// The result screen's reward look: a glow with slow light rays behind the stars,
// twinkling sparkles, and reward cards that pop in with a shine passing over them.

const METAL = ['#3A3A3A', '#C98A4B', '#C9CED6', '#F2C94C'] as const;

/** Glow and slow light rays centred on its parent (the stars): none on a miss, soft white for 2 stars, lime for 3. */
export function ResultBackdrop({ stars, size = 640 }: { stars: number; size?: number }) {
  const spin = useSharedValue(0);
  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 30_000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(spin);
  }, [spin]);
  const rays = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  if (stars < 2) return null;
  const tint = stars >= 3 ? colors.l600 : colors.g100;
  const r = size / 2;
  // Twelve thin wedges from the centre, fading out towards the edge.
  const wedge = (i: number) => {
    const a = (i / 12) * Math.PI * 2, w = Math.PI / 30;
    return `M${r} ${r}L${r + Math.cos(a - w) * r} ${r + Math.sin(a - w) * r}L${r + Math.cos(a + w) * r} ${r + Math.sin(a + w) * r}Z`;
  };
  const fade = (id: string, at: number) => (
    <RadialGradient id={id} cx="50%" cy="50%" r="50%">
      <Stop offset="0" stopColor={tint} stopOpacity={at} />
      <Stop offset="1" stopColor={tint} stopOpacity={0} />
    </RadialGradient>
  );
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: '50%', marginLeft: -r, marginTop: -r, width: size, height: size }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Defs>{fade('glow', stars >= 3 ? 0.3 : 0.14)}</Defs>
        <Circle cx={r} cy={r} r={r} fill="url(#glow)" />
      </Svg>
      <Animated.View style={[{ position: 'absolute', width: size, height: size }, rays]}>
        <Svg width={size} height={size}>
          <Defs>{fade('rays', stars >= 3 ? 0.22 : 0.1)}</Defs>
          <G>{Array.from({ length: 12 }, (_, i) => <Path key={i} d={wedge(i)} fill="url(#rays)" />)}</G>
        </Svg>
      </Animated.View>
    </View>
  );
}

const SPARK = 'M12 0C12.8 7 17 11.2 24 12C17 12.8 12.8 17 12 24C11.2 17 7 12.8 0 12C7 11.2 11.2 7 12 0Z';

/** x and y are fractions of the parent box. */
function Sparkle({ x, y, size, delay, color }: { x: number; y: number; size: number; delay: number; color: string }) {
  const k = useSharedValue(0);
  useEffect(() => {
    k.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 500 }), withTiming(0, { duration: 700 }), withTiming(0, { duration: 600 })), -1, false));
    return () => cancelAnimation(k);
  }, [k, delay]);
  const style = useAnimatedStyle(() => ({ opacity: k.value, transform: [{ scale: 0.3 + 0.7 * k.value }, { rotate: `${k.value * 45}deg` }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, marginLeft: -size / 2, marginTop: -size / 2, width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 24 24"><Path d={SPARK} fill={color} /></Svg>
    </Animated.View>
  );
}

/** A few sparkles twinkling around the edges of the parent box. */
export function Sparkles({ color = colors.l500, n = 6 }: { color?: string; n?: number }) {
  const spots = [[0.08, 0.2], [0.92, 0.15], [0.18, 0.88], [0.85, 0.8], [0.5, -0.05], [0.02, 0.55], [0.98, 0.5]].slice(0, n);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
      {spots.map(([fx, fy], i) => <Sparkle key={i} x={fx!} y={fy!} size={10 + (i % 3) * 5} delay={i * 260} color={color} />)}
    </View>
  );
}

/** A white sheen that sweeps across its parent every few seconds; the parent clips it. */
export function Shine({ width, delay = 600 }: { width: number; delay?: number }) {
  const x = useSharedValue(0);
  useEffect(() => {
    x.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), withTiming(1, { duration: 1800 }), withTiming(0, { duration: 0 })), -1, false));
    return () => cancelAnimation(x);
  }, [x, delay]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: -60 + x.value * (width + 120) }, { rotate: '20deg' }] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -40, bottom: -40, width: 36, backgroundColor: 'rgba(255,255,255,.16)' }, style]} />;
}

/** One reward as a small card: a big picture, a big number and a word under it. */
export function RewardCard({ icon, value, label, lime, delay = 0, shine, children }: {
  icon: ReactNode; value: string; label: string; lime?: boolean; delay?: number; shine?: boolean; children?: ReactNode;
}) {
  return (
    <Pop delay={delay} from={0.4}>
      <View
        accessible accessibilityLabel={`${label} ${value}`}
        style={{
          width: 100, minHeight: 124, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10,
          backgroundColor: lime ? 'rgba(63,77,24,.55)' : colors.s1, borderWidth: 1.5, borderColor: lime ? colors.l700 : colors.line,
        }}
      >
        {icon}
        <T w={700} size={22} color={lime ? colors.l600 : colors.g100}>{value}</T>
        {children}
        <T w={600} size={12} color={colors.g200} numberOfLines={1}>{label}</T>
        {shine && <Shine width={100} delay={delay + 500} />}
      </View>
    </Pop>
  );
}

/** The usta badge as a card: the medal in its metal, the drill's picture inside, sparkles around. */
export function BadgeCard({ level, title, sub, medal, delay = 0, style }: {
  level: 1 | 2 | 3; title: string; sub: string; medal: ReactNode; delay?: number; style?: StyleProp<ViewStyle>;
}) {
  const metal = METAL[level];
  return (
    <Pop delay={delay} from={0.3} style={style}>
      <View
        accessible accessibilityLabel={`${title}, ${sub}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 14, height: 88, paddingHorizontal: 16, borderRadius: 22, overflow: 'hidden', backgroundColor: colors.s1, borderWidth: 1.5, borderColor: metal }}
      >
        <View style={{ width: 60, height: 60, borderRadius: 30, borderWidth: 3, borderColor: metal, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.06)' }}>
          {medal}
        </View>
        <View style={{ flex: 1 }}>
          <T w={700} size={19} color={metal}>{title}</T>
          <T w={600} size={14} color={colors.g200}>{sub}</T>
        </View>
        <Shine width={340} delay={delay + 400} />
      </View>
      <Sparkles color={metal} n={5} />
    </Pop>
  );
}
