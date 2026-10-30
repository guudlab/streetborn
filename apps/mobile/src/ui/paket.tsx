import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { colors } from '../theme.ts';
import { T } from './kit.tsx';

// The first-badge pack of the sign-in screen (design G): a sealed pack waits, its top
// strip tears off when it is tapped, the pack drops away and the card with the player's first
// badge flips in. The pack and the badge are vector placeholders until the Meshy models
// (GP1 pack, GP3 badge) replace them.

export const PACK_W = 214;
export const PACK_H = 360;
export type PackStage = 'idle' | 'tear' | 'reveal';

/** Milliseconds from the tap to the card showing; the sign-in screen waits this long. */
export const TEAR_MS = 1450;

const ease = Easing.bezier(0.2, 0.9, 0.25, 1);

function useReduced() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((r) => { if (alive) setReduced(r); });
    return () => { alive = false; };
  }, []);
  return reduced;
}

/** A soft diagonal sheen that sweeps across its parent now and then. */
function Sheen({ width, height, delay = 0, every = 3400, reduced }: { width: number; height: number; delay?: number; every?: number; reduced: boolean }) {
  const x = useSharedValue(-1);
  useEffect(() => {
    if (reduced) return;
    x.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), withTiming(-1, { duration: 0 }), withDelay(every - 900, withTiming(-1, { duration: 0 }))), -1));
  }, [x, delay, every, reduced]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * width * 1.4 }, { skewX: '-20deg' }] }));
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height, overflow: 'hidden' }}>
      <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, left: width * 0.3, width: width * 0.14, backgroundColor: 'rgba(255,255,255,.2)' }, anim]} />
    </View>
  );
}

const BADGE_IMG = require('../../assets/meshy/rozet-cirak.webp');
/** The Meshy pack (GP1) is cut straight under its top seal into two pieces (assets/meshy/paket-ust|govde.webp). */
const TOP_IMG = require('../../assets/meshy/paket-ust.webp');
const BODY_IMG = require('../../assets/meshy/paket-govde.webp');
const TOP_H = PACK_W * 80 / 427;
const BODY_H = PACK_W * 640 / 427;
/** Where the strip is cut; the light and the sparks come out of this line. */
const CUT_Y = TOP_H;
const SLIDE_AT = 200;
const FAN_H = 170;
const FAN_W = PACK_W + 140;

/** Light rays fanning up from the cut: [angle in degrees from vertical, half-width in degrees]. */
const RAYS = [[-62, 5], [-46, 4], [-31, 6], [-16, 4], [0, 7], [16, 4], [31, 6], [46, 4], [62, 5]] as const;
const rad = (d: number) => d * Math.PI / 180;
const FAN_PATHS = RAYS.map(([a, w]) => {
  const L = FAN_H * 1.1, cx = FAN_W / 2;
  const pt = (d: number) => `${(cx + L * Math.sin(rad(d))).toFixed(1)} ${(FAN_H - L * Math.cos(rad(d))).toFixed(1)}`;
  return `M ${cx} ${FAN_H} L ${pt(a - w)} L ${pt(a + w)} Z`;
});

/** A foil fragment that flies out of the tear when the strip rips free. */
function Bit({ dx, dy, rot, size, delay, color, run }: { dx: number; dy: number; rot: number; size: number; delay: number; color: string; run: boolean }) {
  const k = useSharedValue(0);
  useEffect(() => {
    if (run) k.value = withDelay(delay, withTiming(1, { duration: 650, easing: Easing.out(Easing.quad) }));
  }, [run, k, delay]);
  const anim = useAnimatedStyle(() => ({
    opacity: k.value === 0 ? 0 : 1 - k.value * k.value,
    transform: [{ translateX: dx * k.value }, { translateY: dy * k.value + 90 * k.value * k.value }, { rotate: `${rot * k.value}deg` }],
  }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: PACK_W / 2, top: CUT_Y, width: size, height: size * 0.6, backgroundColor: color, borderRadius: 1 }, anim]} />;
}

const BITS = [
  { dx: -90, dy: -90, rot: -300, size: 9, delay: 0, color: colors.l500 }, { dx: -40, dy: -130, rot: 220, size: 7, delay: 40, color: '#FFFFFF' },
  { dx: 20, dy: -150, rot: -180, size: 10, delay: 20, color: colors.l600 }, { dx: 70, dy: -110, rot: 340, size: 7, delay: 60, color: '#FFFFFF' },
  { dx: 110, dy: -70, rot: -260, size: 9, delay: 30, color: colors.l500 }, { dx: -120, dy: -40, rot: 200, size: 6, delay: 80, color: colors.l600 },
  { dx: 130, dy: -30, rot: -150, size: 6, delay: 50, color: '#FFFFFF' },
] as const;

/** A four-point glint that twinkles; it sits on the pack so the foil looks like it catches light. */
function Glint({ x, y, size, delay, reduced }: { x: number; y: number; size: number; delay: number; reduced: boolean }) {
  const k = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    k.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0, { duration: 900 }), withTiming(0, { duration: 900 })), -1));
  }, [k, delay, reduced]);
  const anim = useAnimatedStyle(() => ({ opacity: k.value, transform: [{ scale: 0.4 + 0.6 * k.value }, { rotate: `${k.value * 45}deg` }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x, top: y, width: size, height: size }, anim]}>
      <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12 7-1 11-5 12-12z" fill="#FFFFFF" /></Svg>
    </Animated.View>
  );
}

/** The sealed pack. `stage` drives the idle wobble, then the strip is cut off and slides away with a burst of light. */
export function Pack({ stage }: { stage: PackStage }) {
  const reduced = useReduced();
  const wobble = useSharedValue(0);
  const press = useSharedValue(0);
  const slide = useSharedValue(0);
  const light = useSharedValue(0);
  const out = useSharedValue(0);

  useEffect(() => {
    if (stage === 'idle' && !reduced) {
      wobble.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }), -1, true);
    }
  }, [stage, reduced, wobble]);

  useEffect(() => {
    if (stage !== 'tear') return;
    wobble.value = withTiming(0.5, { duration: 120 });
    // The pack tenses for a beat, the strip is cut clean and slides off sideways, light pours out of the cut.
    press.value = withSequence(withTiming(1, { duration: SLIDE_AT, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 260 }));
    slide.value = withDelay(SLIDE_AT, withTiming(1, { duration: 560, easing: Easing.in(Easing.cubic) }));
    light.value = withDelay(SLIDE_AT, withSequence(withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }), withTiming(0.7, { duration: 700 })));
    out.value = withDelay(1000, withTiming(1, { duration: 480, easing: Easing.in(Easing.quad) }));
  }, [stage, press, slide, light, out, wobble]);

  const body = useAnimatedStyle(() => ({
    opacity: 1 - out.value,
    transform: [
      { translateY: -10 * wobble.value + 110 * out.value },
      { rotate: `${(wobble.value - 0.5) * 5}deg` },
      { scale: (1 + 0.05 * press.value) * (1 - 0.5 * out.value) },
    ],
  }));
  const strip = useAnimatedStyle(() => ({
    opacity: slide.value > 0.6 ? 1 - (slide.value - 0.6) / 0.4 : 1,
    transform: [{ translateX: slide.value * PACK_W * 1.2 }, { translateY: -slide.value * 6 }],
  }));
  const fan = useAnimatedStyle(() => ({ opacity: light.value, transform: [{ scaleY: 0.2 + 0.8 * light.value }, { scaleX: 0.7 + 0.3 * light.value }] }));
  const glow = useAnimatedStyle(() => ({ opacity: light.value, transform: [{ scale: 0.5 + 0.5 * light.value }] }));

  return (
    <Animated.View style={[{ width: PACK_W, height: PACK_H }, body]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image source={BODY_IMG} style={{ position: 'absolute', left: 0, top: TOP_H, width: PACK_W, height: BODY_H }} contentFit="fill" />
      <Glint x={PACK_W - 60} y={90} size={26} delay={0} reduced={reduced} />
      <Glint x={26} y={PACK_H - 86} size={18} delay={900} reduced={reduced} />
      <Glint x={PACK_W - 40} y={PACK_H - 120} size={14} delay={1600} reduced={reduced} />
      {/* Light rays and a hot glow pouring out of the cut. */}
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -(FAN_W - PACK_W) / 2, top: CUT_Y - FAN_H, width: FAN_W, height: FAN_H, transformOrigin: '50% 100%' }, fan]}>
        <Svg width={FAN_W} height={FAN_H}>
          <Defs>
            <LinearGradient id="packRay" gradientUnits="userSpaceOnUse" x1="0" y1={FAN_H} x2="0" y2="0">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={1} />
              <Stop offset="0.45" stopColor="#F4FFD0" stopOpacity={0.5} />
              <Stop offset="1" stopColor={colors.l600} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {FAN_PATHS.map((d, i) => <Path key={i} d={d} fill="url(#packRay)" />)}
        </Svg>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -20, top: CUT_Y - 70, width: PACK_W + 40, height: 110 }, glow]}>
        <Svg width={PACK_W + 40} height={110}>
          <Defs>
            <RadialGradient id="packBeam" cx="50%" cy="64%" rx="50%" ry="50%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={1} />
              <Stop offset="0.4" stopColor="#F4FFD0" stopOpacity={0.6} />
              <Stop offset="1" stopColor={colors.l600} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={PACK_W + 40} height={110} fill="url(#packBeam)" />
        </Svg>
      </Animated.View>
      {BITS.map((b, i) => <Bit key={i} {...b} delay={b.delay + SLIDE_AT} run={stage === 'tear'} />)}
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: PACK_W, height: TOP_H }, strip]}>
        <Image source={TOP_IMG} style={{ width: PACK_W, height: TOP_H }} contentFit="fill" />
      </Animated.View>
    </Animated.View>
  );
}

const CONFETTI = [
  { x: 40, c: colors.l500, d: 200, h: 16 }, { x: 120, c: '#FFFFFF', d: 400, h: 14 }, { x: 200, c: colors.gem, d: 100, h: 16 },
  { x: 270, c: colors.l500, d: 500, h: 15 }, { x: 330, c: '#FFFFFF', d: 300, h: 14 }, { x: 80, c: colors.l600, d: 600, h: 15 },
  { x: 160, c: colors.gem, d: 250, h: 14 }, { x: 300, c: colors.l600, d: 450, h: 16 },
] as const;

function ConfettiPiece({ x, c, d, h }: { x: number; c: string; d: number; h: number }) {
  const k = useSharedValue(0);
  useEffect(() => { k.value = withDelay(d, withTiming(1, { duration: 2400, easing: Easing.in(Easing.quad) })); }, [k, d]);
  const anim = useAnimatedStyle(() => ({
    opacity: k.value === 0 ? 0 : 1 - k.value,
    transform: [{ translateY: k.value * 360 }, { rotate: `${k.value * 540}deg` }],
  }));
  return <Animated.View style={[{ position: 'absolute', left: x, top: 0, width: 9, height: h, borderRadius: 2, backgroundColor: c }, anim]} />;
}

function Badge({ size }: { size: number }) {
  return <Image source={BADGE_IMG} style={{ width: size * 0.78, height: size }} contentFit="contain" />;
}

function Star({ on }: { on: boolean }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="m12 2 3 7 7 .6-5.300 4.700 1.600 7.200L12 17.800 5.700 21.500l1.600-7.200L2 9.600 9 9z" fill={on ? colors.l500 : colors.s3} />
    </Svg>
  );
}

/** The first-badge card: flips and bounces in with a flash, a ring burst and confetti. */
export function BadgeCard({ onShown }: { onShown?: () => void }) {
  const reduced = useReduced();
  const k = useSharedValue(0);
  const flash = useSharedValue(0);
  const ring = useSharedValue(0);

  useEffect(() => {
    k.value = withTiming(1, { duration: reduced ? 0 : 1000, easing: ease });
    flash.value = withSequence(withTiming(1, { duration: reduced ? 0 : 200 }), withTiming(0, { duration: reduced ? 0 : 900 }));
    ring.value = withTiming(1, { duration: reduced ? 0 : 1000, easing: Easing.out(Easing.quad) });
    const id = setTimeout(() => onShown?.(), reduced ? 0 : 700);
    return () => clearTimeout(id);
  }, [k, flash, ring, reduced, onShown]);

  const card = useAnimatedStyle(() => {
    const p = k.value;
    const overshoot = 1 + 0.12 * Math.sin(Math.min(p / 0.55, 1) * Math.PI) * (p < 0.75 ? 1 : 0);
    return {
      opacity: Math.min(1, p * 4),
      transform: [
        { perspective: 800 },
        { translateY: (1 - p) * 160 },
        { scale: (0.3 + 0.7 * p) * overshoot },
        { rotateY: `${(1 - Math.min(p / 0.55, 1)) * 180}deg` },
      ],
    };
  });
  const glow = useAnimatedStyle(() => ({ opacity: flash.value * 0.85 }));
  const burst = useAnimatedStyle(() => ({ opacity: 0.9 * (1 - ring.value), transform: [{ scale: 0.2 + 2.4 * ring.value }] }));

  return (
    <View style={{ width: 390, height: 360, alignItems: 'center' }} pointerEvents="none">
      <Animated.View style={[{ position: 'absolute', top: 10, left: 60, width: 270, height: 340 }, glow]}>
        <Svg width={270} height={340}>
          <Defs>
            <RadialGradient id="flash" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.9} />
              <Stop offset="0.4" stopColor={colors.l600} stopOpacity={0.4} />
              <Stop offset="1" stopColor={colors.l600} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={270} height={340} fill="url(#flash)" />
        </Svg>
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', top: 50, left: 95, width: 200, height: 200, borderRadius: 100, borderWidth: 4, borderColor: colors.l500 }, burst]} />
      <Animated.View style={[{ width: PACK_W, height: PACK_H, marginTop: 10, borderRadius: 26, padding: 6, backgroundColor: colors.l700 }, card]}>
        <Svg width={PACK_W} height={PACK_H} style={{ position: 'absolute' }}>
          <Defs>
            <LinearGradient id="cardFoil" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={colors.l500} />
              <Stop offset="0.45" stopColor={colors.l700} />
              <Stop offset="1" stopColor={colors.l900} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={PACK_W} height={PACK_H} rx={26} fill="url(#cardFoil)" />
        </Svg>
        <View style={{ flex: 1, borderRadius: 21, backgroundColor: colors.s2, alignItems: 'center', justifyContent: 'center', gap: 12, overflow: 'hidden' }}>
          <Badge size={196} />
          <View style={{ flexDirection: 'row', gap: 6 }}><Star on /><Star on={false} /><Star on={false} /></View>
          <Sheen width={PACK_W - 12} height={PACK_H - 12} delay={1000} every={2800} reduced={reduced} />
        </View>
      </Animated.View>
      <View style={{ position: 'absolute', left: 0, top: -190, width: 390, height: 360 }}>
        {CONFETTI.map((p, i) => <ConfettiPiece key={i} {...p} />)}
      </View>
    </View>
  );
}

/** Slow light rays turning behind the pack; static when motion is reduced. */
export function Rays({ size = 530 }: { size?: number }) {
  const reduced = useReduced();
  const r = useSharedValue(0);
  useEffect(() => {
    if (!reduced) r.value = withRepeat(withTiming(1, { duration: 40000, easing: Easing.linear }), -1);
  }, [r, reduced]);
  const anim = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value * 360}deg` }] }));
  const cx = size / 2;
  const rays = Array.from({ length: 16 }, (_, i) => {
    const a0 = (i * 22.5 * Math.PI) / 180;
    const a1 = ((i * 22.5 + 8) * Math.PI) / 180;
    const R = cx;
    return `M${cx} ${cx} L${cx + R * Math.cos(a0)} ${cx + R * Math.sin(a0)} L${cx + R * Math.cos(a1)} ${cx + R * Math.sin(a1)} Z`;
  }).join(' ');
  return (
    <Animated.View pointerEvents="none" style={[{ width: size, height: size }, anim]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="rayFade" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0.1" stopColor={colors.l600} stopOpacity={0.24} />
            <Stop offset="1" stopColor={colors.l600} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Path d={rays} fill="url(#rayFade)" />
      </Svg>
    </Animated.View>
  );
}
