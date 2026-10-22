import { useEffect, useRef, type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  FadeInDown, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';

import { motion } from '../theme.ts';

// Reanimated building blocks for game feel. Springs and timings come from
// `motion` in theme.ts; Reanimated skips them when the OS asks for reduced motion.

const APressable = Animated.createAnimatedComponent(Pressable);

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
    <Animated.View entering={FadeInDown.duration(motion.slow).delay(Math.min(i, 8) * 45)} style={style}>
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
