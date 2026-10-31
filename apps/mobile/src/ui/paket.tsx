import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Animated, {
  Easing, runOnJS, type SharedValue, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { sfx } from '../audio/audio.ts';
import { colors } from '../theme.ts';
import { buzz } from './kit.tsx';

// The first-badge pack of the sign-in screen (design G). A sealed Meshy pack waits; tapped,
// its top strip is pulled off the way a real pack tears (from the left edge across to the
// right, the loose end lifting as it goes), a soft white light glows out of the cut and then
// rays slowly pour out, the badge card rises out of the pack and the pack drops away.

export const PACK_W = 214;
export const PACK_H = 360;
export type PackStage = 'idle' | 'tear' | 'reveal';

/** Timeline of the opening, in ms after the tap. */
const AT = {
  tear: 160, // the pull starts at the left edge
  off: 1000, // the strip comes free and flies off
  rays: 1200, // the rays start to pour out, slowly
  rise: 1400, // the card rises out of the pack
  settle: 2100, // the pack drops away and the card takes the stage; "Devam" shows when it lands
};

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
/** The strip is drawn in vertical slices so the torn part can lift while the rest still holds. */
const SLICES = 12;
const SLICE_W = PACK_W / SLICES;
/** How high the torn part of the strip is pulled by the time it comes free. */
const LIFT = 12;

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

/** The card rises at this scale, small enough to hide behind the pack body. */
const CARD_IN = 0.76;
/** Card centre offsets from its final place: hidden in the pack, then risen out of it. */
const CARD_HIDDEN_Y = CUT_Y + 14 + PACK_H * CARD_IN / 2 - PACK_H / 2;
const CARD_RISEN_Y = CUT_Y + 90 - PACK_H * CARD_IN / 2 - PACK_H / 2;

/** One slice of the top strip. `tear` runs 0 to 1 as the tear crosses the strip from left to right. */
function StripSlice({ i, tear }: { i: number; tear: SharedValue<number> }) {
  const anim = useAnimatedStyle(() => {
    // The torn part moves as one piece, pulled up more as the tear runs; the front is a short ramp.
    const loose = Math.max(0, Math.min(1, tear.value * SLICES - i));
    return { transform: [{ translateY: -loose * LIFT * (0.25 + 0.75 * tear.value) }] };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: i * SLICE_W, top: 0, width: SLICE_W + 1, height: TOP_H, overflow: 'hidden' }, anim]}>
      <Image source={TOP_IMG} style={{ position: 'absolute', left: -i * SLICE_W, top: 0, width: PACK_W, height: TOP_H }} contentFit="fill" />
    </Animated.View>
  );
}

/** A foil fragment that flies out of the cut when the strip comes free. */
function Bit({ dx, dy, rot, size, delay, color, run }: { dx: number; dy: number; rot: number; size: number; delay: number; color: string; run: boolean }) {
  const k = useSharedValue(0);
  useEffect(() => {
    if (run) k.value = withDelay(delay, withTiming(1, { duration: 650, easing: Easing.out(Easing.quad) }));
  }, [run, k, delay]);
  const anim = useAnimatedStyle(() => ({
    opacity: k.value === 0 ? 0 : 1 - k.value * k.value,
    transform: [{ translateX: dx * k.value }, { translateY: dy * k.value + 90 * k.value * k.value }, { rotate: `${rot * k.value}deg` }],
  }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: PACK_W - 20, top: CUT_Y - 4, width: size, height: size * 0.6, backgroundColor: color, borderRadius: 1 }, anim]} />;
}

const BITS = [
  { dx: 40, dy: -70, rot: -300, size: 7, delay: 0, color: colors.l500 }, { dx: 70, dy: -40, rot: 220, size: 5, delay: 30, color: '#FFFFFF' },
  { dx: 20, dy: -95, rot: -180, size: 8, delay: 15, color: colors.l600 }, { dx: 90, dy: -80, rot: 340, size: 5, delay: 45, color: '#FFFFFF' },
  { dx: -10, dy: -60, rot: -260, size: 6, delay: 25, color: colors.l500 },
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

/** A soft white glow, brightest in the middle. */
function Glow({ id, width, height, cy = '50%', strength = 1 }: { id: string; width: number; height: number; cy?: string; strength?: number }) {
  return (
    <Svg width={width} height={height}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy={cy} rx="50%" ry="50%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={strength} />
          <Stop offset="0.45" stopColor="#F4FFD0" stopOpacity={0.55 * strength} />
          <Stop offset="1" stopColor={colors.l600} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill={`url(#${id})`} />
    </Svg>
  );
}

const CONFETTI = [
  { x: 40, c: colors.l500, d: 0, h: 16 }, { x: 120, c: '#FFFFFF', d: 160, h: 14 }, { x: 200, c: colors.gem, d: 60, h: 16 },
  { x: 270, c: colors.l500, d: 220, h: 15 }, { x: 330, c: '#FFFFFF', d: 100, h: 14 }, { x: 80, c: colors.l600, d: 260, h: 15 },
  { x: 160, c: colors.gem, d: 120, h: 14 }, { x: 300, c: colors.l600, d: 200, h: 16 },
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

function Star({ on }: { on: boolean }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="m12 2 3 7 7 .6-5.300 4.700 1.600 7.200L12 17.800 5.700 21.500l1.600-7.200L2 9.600 9 9z" fill={on ? colors.l500 : colors.s3} />
    </Svg>
  );
}

/** The first-badge card: lime foil frame, the "Mahalle Çırağı" badge and one of three stars. */
function CardFace({ reduced }: { reduced: boolean }) {
  return (
    <View style={{ width: PACK_W, height: PACK_H, borderRadius: 26, padding: 6, backgroundColor: colors.l700 }}>
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
        <Image source={BADGE_IMG} style={{ width: 196 * 0.78, height: 196 }} contentFit="contain" />
        <View style={{ flexDirection: 'row', gap: 6 }}><Star on /><Star on={false} /><Star on={false} /></View>
        <Sheen width={PACK_W - 12} height={PACK_H - 12} delay={600} every={2800} reduced={reduced} />
      </View>
    </View>
  );
}

/**
 * The pack and the card in it. On 'tear' it plays the whole opening (with haptics and sounds)
 * and calls `onDone` when the card has settled; with Reduce Motion the card shows at once.
 */
export function PackOpening({ stage, onDone }: { stage: PackStage; onDone: () => void }) {
  const reduced = useReduced();
  const [burst, setBurst] = useState(false);
  // Kept in a ref so a new callback from the screen never restarts the opening.
  const done = useRef(onDone);
  done.current = onDone;
  const cueOff = () => { buzz('medium'); sfx('lane_whoosh'); };
  const cueLand = () => { buzz('success'); sfx('card_pop'); setBurst(true); };
  const cueDone = () => done.current();
  const wobble = useSharedValue(0);
  const press = useSharedValue(0);
  const tear = useSharedValue(0);
  const fly = useSharedValue(0);
  const peek = useSharedValue(0);
  const bloom = useSharedValue(0);
  const rays = useSharedValue(0);
  const rise = useSharedValue(0);
  const settle = useSharedValue(0);
  const flash = useSharedValue(0);

  useEffect(() => {
    if (stage === 'idle' && !reduced) {
      wobble.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }), -1, true);
    }
  }, [stage, reduced, wobble]);

  useEffect(() => {
    if (stage !== 'tear') return;
    if (reduced) {
      tear.value = 1; fly.value = 1; rise.value = 1; settle.value = 1;
      buzz('success');
      sfx('badge_shine');
      done.current();
      return;
    }
    wobble.value = withTiming(0.5, { duration: 120 });
    press.value = withSequence(withTiming(1, { duration: AT.tear, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 300 }));
    // A real pull: a quick start, a short catch where the seal holds, then it gives all the way.
    tear.value = withDelay(AT.tear, withSequence(
      withTiming(0.3, { duration: 260, easing: Easing.out(Easing.quad) }),
      withTiming(0.4, { duration: 200, easing: Easing.inOut(Easing.quad) }),
      withTiming(0.82, { duration: 230, easing: Easing.inOut(Easing.quad) }),
      withTiming(1, { duration: AT.off - AT.tear - 690, easing: Easing.in(Easing.quad) }, (fin) => { if (fin) runOnJS(cueOff)(); }),
    ));
    // A thin white light shows through the cut as it opens...
    peek.value = withDelay(AT.tear + 120, withTiming(1, { duration: AT.off - AT.tear - 120, easing: Easing.in(Easing.quad) }));
    fly.value = withDelay(AT.off, withTiming(1, { duration: 440, easing: Easing.in(Easing.quad) }));
    // ...then a soft white glow when the strip comes free, and the rays pour out slowly.
    bloom.value = withDelay(AT.off - 40, withSequence(withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) }), withTiming(0.55, { duration: 600 })));
    rays.value = withDelay(AT.rays, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
    rise.value = withDelay(AT.rise, withTiming(1, { duration: 650, easing: Easing.bezier(0.2, 1.15, 0.4, 1) }));
    settle.value = withDelay(AT.settle, withTiming(1, { duration: 520, easing: ease }, (fin) => { if (fin) runOnJS(cueDone)(); }));
    flash.value = withDelay(AT.settle + 120, withSequence(
      withTiming(1, { duration: 180 }, (fin) => { if (fin) runOnJS(cueLand)(); }),
      withTiming(0, { duration: 800 }),
    ));

    // Haptic ticks follow the pull; the big moments are cued by the animations themselves (below).
    const cues: [number, () => void][] = [
      [AT.tear, () => { buzz('light'); sfx('sling_pull', 0.7); }],
      [AT.tear + 260, () => buzz('light')],
      [AT.tear + 460, () => buzz('light')],
      [AT.tear + 690, () => buzz('light')],
      [AT.rise, () => sfx('badge_shine')],
    ];
    const ids = cues.map(([ms, fn]) => setTimeout(fn, ms));
    return () => ids.forEach(clearTimeout);
  }, [stage, reduced, wobble, press, tear, peek, fly, bloom, rays, rise, settle, flash]);

  const pack = useAnimatedStyle(() => ({
    opacity: 1 - settle.value,
    transform: [
      { translateY: -10 * wobble.value + 260 * settle.value },
      { rotate: `${(wobble.value - 0.5) * 5 + settle.value * 6}deg` },
      { scale: 1 + 0.04 * press.value },
    ],
  }));
  // The rays and the glow stay at the cut while the pack falls away, so the card rises through the light.
  const lightAt = useAnimatedStyle(() => ({
    opacity: 1 - settle.value,
    transform: [{ translateY: -10 * wobble.value }],
  }));
  const strip = useAnimatedStyle(() => ({
    opacity: fly.value > 0.55 ? 1 - (fly.value - 0.55) / 0.45 : 1,
    transformOrigin: `${PACK_W}px ${TOP_H}px`,
    transform: [
      { translateX: fly.value * PACK_W * 1.25 },
      { translateY: -fly.value * 40 },
      { rotate: `${fly.value * 14}deg` },
    ],
  }));
  const whole = useAnimatedStyle(() => ({ opacity: tear.value >= 0.999 ? 1 : 0 }));
  const peekStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, 0.4 + peek.value) * Math.min(1, tear.value * 3) * (1 - 0.6 * fly.value),
    transform: [{ scaleX: Math.max(0.02, tear.value) }],
  }));
  const bloomStyle = useAnimatedStyle(() => ({ opacity: bloom.value, transform: [{ scale: 0.6 + 0.4 * bloom.value }] }));
  const fan = useAnimatedStyle(() => ({
    opacity: rays.value * 0.9,
    transform: [{ scaleY: 0.15 + 0.85 * rays.value }, { scaleX: 0.6 + 0.4 * rays.value }],
  }));
  const card = useAnimatedStyle(() => {
    const y = CARD_HIDDEN_Y + (CARD_RISEN_Y - CARD_HIDDEN_Y) * rise.value;
    const s = CARD_IN + (1 - CARD_IN) * settle.value;
    const pop = 1 + 0.07 * Math.sin(settle.value * Math.PI);
    return {
      opacity: rise.value > 0 ? 1 : 0,
      transform: [
        { translateY: y * (1 - settle.value) },
        { rotate: `${Math.sin(rise.value * Math.PI) * -3 * (1 - settle.value)}deg` },
        { scale: s * pop },
      ],
    };
  });
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.85 }));
  const ring = useAnimatedStyle(() => ({ opacity: 0.9 * flash.value, transform: [{ scale: 0.4 + 2 * (1 - flash.value) }] }));

  return (
    <View style={{ width: PACK_W, height: PACK_H }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* Rays pour out of the cut behind the card. */}
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: PACK_W, height: PACK_H }, lightAt]}>
        <Animated.View style={[{ position: 'absolute', left: -(FAN_W - PACK_W) / 2, top: CUT_Y - FAN_H, width: FAN_W, height: FAN_H, transformOrigin: '50% 100%' }, fan]}>
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
      </Animated.View>

      {/* Flash and ring when the card lands. */}
      <Animated.View style={[{ position: 'absolute', left: -28, top: 10, width: PACK_W + 56, height: PACK_H - 20 }, flashStyle]}>
        <Glow id="cardFlash" width={PACK_W + 56} height={PACK_H - 20} strength={0.9} />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', left: PACK_W / 2 - 100, top: PACK_H / 2 - 100, width: 200, height: 200, borderRadius: 100, borderWidth: 4, borderColor: colors.l500 }, ring]} />

      {/* The card sits in the pack, behind its front. */}
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, card]}>
        <CardFace reduced={reduced} />
      </Animated.View>

      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: PACK_W, height: PACK_H }, pack]}>
        <Image source={BODY_IMG} style={{ position: 'absolute', left: 0, top: TOP_H, width: PACK_W, height: BODY_H }} contentFit="fill" />
        <Glint x={PACK_W - 60} y={90} size={26} delay={0} reduced={reduced} />
        <Glint x={26} y={PACK_H - 86} size={18} delay={900} reduced={reduced} />
        <Glint x={PACK_W - 40} y={PACK_H - 120} size={14} delay={1600} reduced={reduced} />
        {/* The light that shows through the cut while the strip is pulled. */}
        <Animated.View style={[{ position: 'absolute', left: 0, top: CUT_Y - 18, width: PACK_W, height: 26, transformOrigin: '0% 50%' }, peekStyle]}>
          <Glow id="packPeek" width={PACK_W} height={26} />
        </Animated.View>
        {BITS.map((b, i) => <Bit key={i} {...b} delay={b.delay + AT.off} run={stage === 'tear' && !reduced} />)}
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: PACK_W, height: TOP_H }, strip]}>
          {Array.from({ length: SLICES }, (_, i) => <StripSlice key={i} i={i} tear={tear} />)}
          {/* Once it is torn all the way, one whole image flies off so no slice seams show. */}
          <Animated.View style={[{ position: 'absolute', left: 0, top: -LIFT, width: PACK_W, height: TOP_H }, whole]}>
            <Image source={TOP_IMG} style={{ width: PACK_W, height: TOP_H }} contentFit="fill" />
          </Animated.View>
        </Animated.View>
      </Animated.View>

      {/* The soft white glow at the opening, in front so the card comes up out of the light. */}
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: PACK_W, height: PACK_H }, lightAt]}>
        <Animated.View style={[{ position: 'absolute', left: -30, top: CUT_Y - 60, width: PACK_W + 60, height: 100 }, bloomStyle]}>
          <Glow id="packBloom" width={PACK_W + 60} height={100} cy="60%" />
        </Animated.View>
      </Animated.View>

      {burst && (
        <View style={{ position: 'absolute', left: (PACK_W - 390) / 2, top: -190, width: 390, height: 360 }}>
          {CONFETTI.map((p, i) => <ConfettiPiece key={i} {...p} />)}
        </View>
      )}
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
