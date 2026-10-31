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
// its top seal peels back from the left along a ragged tear, the torn flap folding over the part
// still stuck down, a soft white glow follows when it comes free and then
// the badge card rises out of the pack, growing as it comes, and the pack drops away.

export const PACK_W = 214;
export const PACK_H = 360;
export type PackStage = 'idle' | 'tear' | 'reveal';

/** Timeline of the opening, in ms after the tap. */
const AT = {
  tear: 160, // the seal starts to peel back from the left edge
  off: 900, // it comes free and flies off
  rise: 1250, // the card rises out of the pack
  settle: 1950, // the pack drops away and the card takes the stage; "Devam" shows when it lands
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
/** The sealed Meshy pack (GP1) in one piece, so no cut shows before the tap. */
const PACK_IMG = require('../../assets/meshy/paket-tam.webp');
/**
 * The peel is a flipbook drawn from the same art (scripts/pack-peel.py): each frame shows the top of the
 * pack with the seal torn up to that point along a ragged line, the torn flap lifted over the part
 * still stuck down, with its shadow. The art is 427 px wide; frames cover art rows -26 to 112.
 */
const PEEL = [
  require('../../assets/meshy/soyulma/f00.webp'),
  require('../../assets/meshy/soyulma/f01.webp'),
  require('../../assets/meshy/soyulma/f02.webp'),
  require('../../assets/meshy/soyulma/f03.webp'),
  require('../../assets/meshy/soyulma/f04.webp'),
  require('../../assets/meshy/soyulma/f05.webp'),
  require('../../assets/meshy/soyulma/f06.webp'),
  require('../../assets/meshy/soyulma/f07.webp'),
  require('../../assets/meshy/soyulma/f08.webp'),
  require('../../assets/meshy/soyulma/f09.webp'),
  require('../../assets/meshy/soyulma/f10.webp'),
  require('../../assets/meshy/soyulma/f11.webp'),
  require('../../assets/meshy/soyulma/f12.webp'),
  require('../../assets/meshy/soyulma/f13.webp'),
  require('../../assets/meshy/soyulma/f14.webp'),
  require('../../assets/meshy/soyulma/f15.webp'),
  require('../../assets/meshy/soyulma/f16.webp'),
  require('../../assets/meshy/soyulma/f17.webp'),
  require('../../assets/meshy/soyulma/f18.webp'),
  require('../../assets/meshy/soyulma/f19.webp'),
];
const OPEN_TOP_IMG = require('../../assets/meshy/soyulma/acik.webp');
const FLAP_IMG = require('../../assets/meshy/soyulma/serit.webp');
const LOWER_IMG = require('../../assets/meshy/soyulma/alt.webp');
const SRC = PACK_W / 427;
const PEEL_TOP = -26 * SRC;
const PEEL_W = 700 * SRC;
const PEEL_H = 138 * SRC;
const LOWER_TOP = 109 * SRC; // 3 art px under the frames so no seam shows
const LOWER_H = (720 - 109) * SRC;
/** The torn flap's final pose in the last frame, where the fly-off starts. */
const FLAP_X = 427 * 0.55 * SRC;
const FLAP_Y = -10 * SRC;
const FLAP_H = 90 * SRC;
/** Where the seal tears off; the light and the sparks come out of this line. */
const CUT_Y = 80 * SRC;
/** The card starts small inside the pack and grows as it rises out; it lands at full size. */
const CARD_START = 0.42;
const CARD_IN = 0.72;
// Final size: the card stays a little inside the pack's outline, even at the top of the pop.
const CARD_END = 0.86;
/** Card centre offsets from its final place: hidden in the pack, then risen out of it. */
const CARD_HIDDEN_Y = CUT_Y + 12 + PACK_H * CARD_START / 2 - PACK_H / 2;
const CARD_RISEN_Y = CUT_Y + 90 - PACK_H * CARD_IN / 2 - PACK_H / 2;

/** One frame of the peel; shown while `tear` is on it. */
function PeelFrame({ i, tear, fly }: { i: number; tear: SharedValue<number>; fly: SharedValue<number> }) {
  const anim = useAnimatedStyle(() => {
    const at = Math.round(tear.value * (PEEL.length - 1));
    return { opacity: tear.value > 0 && fly.value === 0 && at === i ? 1 : 0 };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: PEEL_TOP, width: PEEL_W, height: PEEL_H }, anim]}>
      <Image source={PEEL[i]} style={{ width: PEEL_W, height: PEEL_H }} contentFit="fill" />
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
  const bloom = useSharedValue(0);
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
      withTiming(0.25, { duration: 200, easing: Easing.out(Easing.quad) }),
      withTiming(0.32, { duration: 120, easing: Easing.inOut(Easing.quad) }),
      withTiming(0.72, { duration: 220, easing: Easing.inOut(Easing.quad) }),
      withTiming(1, { duration: AT.off - AT.tear - 540, easing: Easing.in(Easing.quad) }, (fin) => { if (fin) runOnJS(cueOff)(); }),
    ));
    fly.value = withDelay(AT.off, withTiming(1, { duration: 360, easing: Easing.in(Easing.quad) }));
    // A soft white glow wells up from inside the pack once the seal is off, and stays while the card rises.
    bloom.value = withDelay(AT.off - 40, withSequence(withTiming(1, { duration: 420, easing: Easing.out(Easing.quad) }), withTiming(0.7, { duration: 700 })));
    rise.value = withDelay(AT.rise, withTiming(1, { duration: 650, easing: Easing.bezier(0.2, 1.15, 0.4, 1) }));
    settle.value = withDelay(AT.settle, withTiming(1, { duration: 520, easing: ease }, (fin) => { if (fin) runOnJS(cueDone)(); }));
    flash.value = withDelay(AT.settle + 120, withSequence(
      withTiming(1, { duration: 180 }, (fin) => { if (fin) runOnJS(cueLand)(); }),
      withTiming(0, { duration: 800 }),
    ));

    // Haptic ticks follow the pull; the big moments are cued by the animations themselves (below).
    const cues: [number, () => void][] = [
      [AT.tear, () => { buzz('light'); sfx('sling_pull', 0.7); }],
      [AT.tear + 200, () => buzz('light')],
      [AT.tear + 320, () => buzz('light')],
      [AT.tear + 540, () => buzz('light')],
      [AT.rise, () => sfx('badge_shine')],
    ];
    const ids = cues.map(([ms, fn]) => setTimeout(fn, ms));
    return () => ids.forEach(clearTimeout);
  }, [stage, reduced, wobble, press, tear, fly, bloom, rise, settle, flash]);

  const pack = useAnimatedStyle(() => ({
    opacity: 1 - settle.value,
    transform: [
      { translateY: -10 * wobble.value + 260 * settle.value },
      { rotate: `${(wobble.value - 0.5) * 5 + settle.value * 6}deg` },
      { scale: 1 + 0.04 * press.value },
    ],
  }));
  // The glow stays at the opening while the pack falls away, so the card rises out of the light.
  const lightAt = useAnimatedStyle(() => ({
    opacity: 1 - settle.value,
    transform: [{ translateY: -10 * wobble.value }],
  }));
  // Once torn all the way the flap flies off from where the last peel frame left it.
  const flyStyle = useAnimatedStyle(() => {
    const f = fly.value;
    return {
      opacity: f === 0 ? 0 : f > 0.55 ? 1 - (f - 0.55) / 0.45 : 1,
      transformOrigin: `${PACK_W}px ${FLAP_H}px`,
      transform: [{ translateX: FLAP_X + f * PACK_W * 1.1 }, { translateY: FLAP_Y - f * 36 }, { rotate: `${f * 12}deg` }],
    };
  });
  // The one-piece pack shows until the peel starts; the flipbook and the lower body line up with it.
  const sealed = useAnimatedStyle(() => ({ opacity: tear.value > 0 || fly.value > 0 ? 0 : 1 }));
  const cut = useAnimatedStyle(() => ({ opacity: tear.value > 0 || fly.value > 0 ? 1 : 0 }));
  const opened = useAnimatedStyle(() => ({ opacity: fly.value > 0 ? 1 : 0 }));
  const bloomStyle = useAnimatedStyle(() => ({ opacity: bloom.value, transform: [{ scaleY: 0.4 + 0.6 * bloom.value }, { scaleX: 0.7 + 0.3 * bloom.value }] }));
  const card = useAnimatedStyle(() => {
    const y = CARD_HIDDEN_Y + (CARD_RISEN_Y - CARD_HIDDEN_Y) * rise.value;
    const s = settle.value > 0 ? CARD_IN + (CARD_END - CARD_IN) * settle.value : CARD_START + (CARD_IN - CARD_START) * rise.value;
    const pop = 1 + 0.04 * Math.sin(settle.value * Math.PI);
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
      {/* Flash and ring when the card lands. */}
      <Animated.View style={[{ position: 'absolute', left: -28, top: 10, width: PACK_W + 56, height: PACK_H - 20 }, flashStyle]}>
        <Glow id="cardFlash" width={PACK_W + 56} height={PACK_H - 20} strength={0.9} />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', left: PACK_W / 2 - 100, top: PACK_H / 2 - 100, width: 200, height: 200, borderRadius: 100, borderWidth: 4, borderColor: colors.l500 }, ring]} />

      {/* The soft white glow comes from inside: it sits behind the pack front, so only the part
          above the opening shows, and the card rises through it. */}
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: PACK_W, height: PACK_H }, lightAt]}>
        <Animated.View style={[{ position: 'absolute', left: -20, top: CUT_Y - 70, width: PACK_W + 40, height: 140, transformOrigin: '50% 50%' }, bloomStyle]}>
          <Glow id="packBloom" width={PACK_W + 40} height={140} />
        </Animated.View>
      </Animated.View>

      {/* The card sits in the pack, behind its front. */}
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, card]}>
        <CardFace reduced={reduced} />
      </Animated.View>

      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: PACK_W, height: PACK_H }, pack]}>
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: PACK_W, height: PACK_H }, sealed]}>
          <Image source={PACK_IMG} style={{ width: PACK_W, height: PACK_H }} contentFit="fill" />
        </Animated.View>
        <Animated.View style={[{ position: 'absolute', left: 0, top: LOWER_TOP, width: PACK_W, height: LOWER_H }, cut]}>
          <Image source={LOWER_IMG} style={{ width: PACK_W, height: LOWER_H }} contentFit="fill" />
        </Animated.View>
        {PEEL.map((_, i) => <PeelFrame key={i} i={i} tear={tear} fly={fly} />)}
        <Animated.View style={[{ position: 'absolute', left: 0, top: PEEL_TOP, width: PEEL_W, height: PEEL_H }, opened]}>
          <Image source={OPEN_TOP_IMG} style={{ width: PEEL_W, height: PEEL_H }} contentFit="fill" />
        </Animated.View>
        <Glint x={PACK_W - 60} y={90} size={26} delay={0} reduced={reduced} />
        <Glint x={26} y={PACK_H - 86} size={18} delay={900} reduced={reduced} />
        <Glint x={PACK_W - 40} y={PACK_H - 120} size={14} delay={1600} reduced={reduced} />
        {BITS.map((b, i) => <Bit key={i} {...b} delay={b.delay + AT.off} run={stage === 'tear' && !reduced} />)}
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: PACK_W, height: FLAP_H }, flyStyle]}>
          <Image source={FLAP_IMG} style={{ width: PACK_W, height: FLAP_H }} contentFit="fill" />
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
