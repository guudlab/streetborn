import { useEffect, useRef, type ReactNode } from 'react';
import { Pressable, type DimensionValue, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';

import { colors, motion } from '../theme.ts';

// Reanimated building blocks for game feel. Springs and timings come from
// `motion` in theme.ts; Reanimated skips them when the OS asks for reduced motion.

const APressable = Animated.createAnimatedComponent(Pressable);

/**
 * The system "Reduce Motion" setting. Reanimated already honours it; use this for the
 * React Native `Animated` code, navigation transitions and decorative loops.
 */
export const useReduceMotion = useReducedMotion;

type ScaleProps = Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle>; children?: ReactNode; to?: number };

/** A Pressable that springs down while held and back up on release. */
export function PressableScale({ style, to = 0.96, onPressIn, onPressOut, disabled, children, ...rest }: ScaleProps) {
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <APressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => { s.value = withSpring(to, motion.snappy); onPressIn?.(e); }}
      onPressOut={(e) => { s.value = withSpring(1, motion.snappy); onPressOut?.(e); }}
      style={[style, anim]}
    >
      {children}
    </APressable>
  );
}

/** Pops its children in with the reward spring when mounted. */
export function Pop({ children, delay = 0, from = 0.6, style }: { children: ReactNode; delay?: number; from?: number; style?: StyleProp<ViewStyle> }) {
  const k = useSharedValue(0);
  useEffect(() => {
    const id = setTimeout(() => { k.value = withSpring(1, motion.bouncy); }, delay);
    return () => clearTimeout(id);
  }, [k, delay]);
  const anim = useAnimatedStyle(() => ({
    opacity: Math.min(1, k.value * 2),
    transform: [{ scale: from + (1 - from) * k.value }],
  }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/** Briefly scales its children up whenever `value` changes (coins, energy, rating). */
export function Pulse({ value, children, style }: { value: unknown; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const s = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    s.value = withSequence(withTiming(1.15, { duration: motion.fast }), withSpring(1, motion.bouncy));
  }, [value, s]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/** Fades and slides a list item in; pass its index to stagger a list (capped at 8). */
export function Enter({ i = 0, children, style }: { i?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View entering={FadeInDown.duration(motion.slow).delay(Math.min(i, 8) * motion.stagger)} style={style}>
      {children}
    </Animated.View>
  );
}

/** A horizontal shake for impacts (goal, wrong answer). Spread `style` on an Animated.View. */
export function useShake(px = 6) {
  const x = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const shake = () => {
    const d = 45;
    x.value = withSequence(
      withTiming(px, { duration: d }), withTiming(-px, { duration: d }),
      withTiming(px * 0.6, { duration: d }), withTiming(-px * 0.6, { duration: d }),
      withTiming(0, { duration: d }),
    );
  };
  return { style, shake };
}

/**
 * Placeholder in the shape of the content that is still loading, so nothing jumps when it
 * arrives. A slow breathing pulse; with reduced motion it stays still.
 */
export function Skeleton({ width = '100%', height, radius = 12, style }: { width?: DimensionValue; height: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const o = useSharedValue(0.5);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 750, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ width, height, borderRadius: radius, backgroundColor: colors.s2 }, style, anim]} />;
}
