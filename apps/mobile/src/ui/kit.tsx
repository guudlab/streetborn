import { Image, type ImageSource } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Animated, Platform, Text, View, type PressableProps, type StyleProp, type TextProps, type TextStyle, type ViewStyle,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { sfx } from '../audio/audio.ts';
import { colors, fonts, MAX_FONT_SCALE, motion, shadow, type Weight } from '../theme.ts';
import { Icon, type IconName } from './Icon.tsx';
import { PressableScale, useReduceMotion } from './motion.tsx';
import { t } from '../i18n/index.ts';

/* ---------- Text ---------- */

type TProps = TextProps & { w?: Weight; size?: number; color?: string };

/**
 * Inter text. Custom fonts need one family per weight on native, so weight goes through `w`.
 * Text follows the system text size (Dynamic Type) up to MAX_FONT_SCALE, so the larger
 * accessibility sizes still fit the game's fixed-size tiles and pills.
 */
export function T({ w = 400, size = 15, color = colors.g100, style, maxFontSizeMultiplier = MAX_FONT_SCALE, ...rest }: TProps) {
  return <Text {...rest} maxFontSizeMultiplier={maxFontSizeMultiplier} style={[{ fontFamily: fonts[w], fontSize: size, color, fontVariant: ['tabular-nums'] }, style]} />;
}

export const Caps = ({ children, style, color = colors.g200 }: { children: ReactNode; style?: StyleProp<TextStyle>; color?: string }) => (
  <T w={600} size={11} color={color} style={[{ letterSpacing: 1, textTransform: 'uppercase' }, style]}>{children}</T>
);
export const H1 = (p: TProps) => <T w={600} size={24} {...p} style={[{ lineHeight: 29 }, p.style]} />;
export const H3 = (p: TProps) => <T w={600} size={20} {...p} style={[{ lineHeight: 25 }, p.style]} />;

/* ---------- Buttons ---------- */

type BtnProps = Omit<PressableProps, 'style' | 'children'> & { children: ReactNode; style?: StyleProp<ViewStyle>; off?: boolean; busy?: boolean };

/**
 * The one primary action of a screen: lime, full width, 56 high. `busy` keeps it lime
 * with a spinner while the server answers, so a tap never looks ignored.
 */
export function Cta({ children, style, off, disabled, busy, onPress, ...rest }: BtnProps) {
  const dim = (off || disabled) && !busy;
  return (
    <PressableScale
      accessibilityRole="button" disabled={disabled || busy} accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      onPress={(e) => { tap(); onPress?.(e); }} {...rest}
      style={[{
        minHeight: 56, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 28, backgroundColor: dim ? colors.s3 : colors.l600, flexDirection: 'row',
        alignItems: 'center', justifyContent: 'center', gap: 10,
        ...(dim ? {} : shadow.lime),
      }, style]}
    >
      {busy ? <ActivityIndicator color={colors.ink} />
        : typeof children === 'string' ? <T w={600} size={17} color={dim ? colors.g200 : colors.ink}>{children}</T> : children}
    </PressableScale>
  );
}

export function Ghost({ children, style, disabled, busy, onPress, ...rest }: BtnProps) {
  return (
    <PressableScale
      accessibilityRole="button" disabled={disabled || busy} accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      onPress={(e) => { tap(); onPress?.(e); }} {...rest}
      style={[{
        minHeight: 48, paddingVertical: 6, paddingHorizontal: 16, borderRadius: 24, borderWidth: 1, borderColor: colors.line, flexDirection: 'row',
        alignItems: 'center', justifyContent: 'center', gap: 8, opacity: disabled && !busy ? 0.45 : 1,
      }, style]}
    >
      {busy ? <ActivityIndicator color={colors.g100} />
        : typeof children === 'string' ? <T w={600} size={16}>{children}</T> : children}
    </PressableScale>
  );
}

/**
 * Red button for leaving or deleting: outlined by default so it is never the loudest thing
 * on a screen; `solid` for the last, deliberate step.
 */
export function Danger({ children, style, off, disabled, busy, solid, onPress, ...rest }: BtnProps & { solid?: boolean }) {
  const dim = (off || disabled) && !busy;
  const fg = solid && !dim ? colors.ink : colors.bad;
  return (
    <PressableScale
      accessibilityRole="button" disabled={disabled || off || busy} accessibilityState={{ disabled: !!(disabled || off || busy), busy: !!busy }}
      onPress={(e) => { tap(); onPress?.(e); }} {...rest}
      style={[{
        minHeight: 52, paddingVertical: 6, paddingHorizontal: 16, borderRadius: 26, borderWidth: 1.5, borderColor: colors.bad, flexDirection: 'row', gap: 8,
        backgroundColor: solid && !dim ? colors.bad : 'transparent', alignItems: 'center', justifyContent: 'center', opacity: dim ? 0.45 : 1,
      }, style]}
    >
      {busy ? <ActivityIndicator color={fg} />
        : typeof children === 'string' ? <T w={600} size={16} color={fg}>{children}</T> : children}
    </PressableScale>
  );
}

export function Pill({ icon, iconColor, image, children, onPress, label }: { icon?: IconName; iconColor?: string; image?: ImageSource; children: ReactNode; onPress?: () => void; label: string }) {
  return (
    <PressableScale
      accessibilityRole="button" accessibilityLabel={label} onPress={onPress && (() => { tap(); onPress(); })}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingLeft: 8, paddingRight: 12, borderRadius: 22, backgroundColor: colors.s2, minWidth: 44 }}
    >
      {image ? <Image source={image} style={{ width: 28, height: 28, marginLeft: -4, marginVertical: -4 }} contentFit="contain" accessibilityElementsHidden importantForAccessibility="no" /> : <Icon name={icon!} size={20} color={iconColor} />}
      {children}
    </PressableScale>
  );
}

export const Card = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => (
  <View style={[{ borderRadius: 22, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 12 }, style]}>{children}</View>
);

/* ---------- Haptics ---------- */

/**
 * One vocabulary of haptics: `light` for a tap, `select` for picking one of several
 * (tabs, radio tiles), `medium` for impacts, `success` and `error` for server answers.
 */
export function buzz(kind: 'light' | 'select' | 'medium' | 'success' | 'error' = 'light') {
  if (Platform.OS === 'web') return;
  if (kind === 'success') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  else if (kind === 'error') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  else if (kind === 'select') void Haptics.selectionAsync();
  else void Haptics.impactAsync(kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
}
/** Default feedback for a button: light haptic plus the tap sound. */
export const tap = () => { buzz('light'); sfx('tap'); };

/* ---------- Hooks ---------- */

export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}

/** Counts from `from` to `to` (ease-out cubic) once `start` is true. */
export function useCountUp(from: number, to: number, ms: number, start: boolean) {
  const [v, setV] = useState(from);
  useEffect(() => {
    if (!start) return;
    let raf = 0;
    const t0 = Date.now();
    const step = () => {
      const k = Math.min(1, (Date.now() - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      setV(from + (to - from) * e);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [from, to, ms, start]);
  return v;
}

export const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/* ---------- Progress ---------- */

/** Circular progress (the prototype used conic-gradient, which RN has no equivalent for). */
export function Ring({ size, stroke, value, children }: { size: number; stroke: number; value: number; children?: ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.s3} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={r} stroke={colors.l600} strokeWidth={stroke} fill="none"
          strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

/** Thin bar whose fill animates to `value` (0..1). */
export function Track({ value, color = colors.l600, height = 8, reset }: { value: number; color?: string; height?: number; reset?: number }) {
  const a = useRef(new Animated.Value(value)).current;
  const [w, setW] = useState(0);
  const still = useReduceMotion();
  useEffect(() => { if (reset !== undefined) a.setValue(reset); }, [reset, a]);
  useEffect(() => {
    if (still) a.setValue(value);
    else Animated.timing(a, { toValue: value, duration: 700, useNativeDriver: false }).start();
  }, [value, a, still]);
  return (
    <View onLayout={e => setW(e.nativeEvent.layout.width)} style={{ height, borderRadius: height / 2, backgroundColor: colors.s3, overflow: 'hidden' }}>
      <Animated.View style={{ height: '100%', borderRadius: height / 2, backgroundColor: color, width: a.interpolate({ inputRange: [0, 1], outputRange: [0, w] }) }} />
    </View>
  );
}

/* ---------- Mahalle abisi (Burak abi) ---------- */

export function CoachFace({ size = 40 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', borderWidth: 2, borderColor: colors.s3 }}>
      <Image source={require('../../assets/meshy/burak-yuz.webp')} style={{ width: '100%', height: '100%' }} contentFit="cover" accessibilityElementsHidden importantForAccessibility="no" />
    </View>
  );
}

/** One contextual coach line; fades in whenever the text changes. */
export function CoachLine({ text }: { text: string }) {
  const a = useRef(new Animated.Value(0)).current;
  const still = useReduceMotion();
  useEffect(() => {
    if (still) { a.setValue(1); return; }
    a.setValue(0); Animated.timing(a, { toValue: 1, duration: motion.base, useNativeDriver: true }).start();
  }, [text, a, still]);
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <CoachFace />
      <Animated.View style={{ flex: 1, opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }] }}>
        <Caps style={{ fontSize: 12, marginBottom: 2 }}>{t('coach.name')}</Caps>
        <T w={500} size={15} style={{ lineHeight: 20 }} accessibilityLiveRegion="polite">{text}</T>
      </Animated.View>
    </View>
  );
}

/** Tappable row used in sheets and the shop. */
export function Opt({ icon, title, sub, right, disabled, onPress }: { icon: IconName; title: string; sub: string; right?: ReactNode; disabled?: boolean; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="button" disabled={disabled} onPress={() => { tap(); onPress(); }} to={0.98}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.s2, opacity: disabled ? 0.45 : 1 }}
    >
      <Icon name={icon} color={colors.l600} />
      <View style={{ flex: 1, paddingVertical: 8 }}>
        <T w={600} size={15}>{title}</T>
        <T w={500} size={13} color={colors.g200}>{sub}</T>
      </View>
      {right ?? <Icon name="chev" color={colors.g200} />}
    </PressableScale>
  );
}

export function Price({ children, gem }: { children: ReactNode; gem?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {gem && <Icon name="gem" size={16} color={colors.gem} />}
      <T w={600} size={15}>{children}</T>
    </View>
  );
}
