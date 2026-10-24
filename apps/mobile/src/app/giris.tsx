import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Ellipse, Line, Path, RadialGradient, Stop } from 'react-native-svg';

import { setMusic, sfx } from '../audio/audio.ts';
import { useGame } from '../game/store.ts';
import { colors } from '../theme.ts';
import { openSignInSheet } from '../ui/account.tsx';
import { buzz, Cta, T } from '../ui/kit.tsx';
import { Model3D, preloadModels } from '../ui/Model3D.tsx';
import { t } from '../i18n/index.ts';

// First screen for a new player (design C "Dokun ve başla"): the whole screen is the
// button. Tapping anywhere starts an anonymous career, then the mahalle and character steps follow; "Hesabım var" signs
// in to an account linked before (Apple, Google or an email code).
// The 3D player idles on a chalk-lined pitch and dribbles or celebrates now and then;
// the ball, cup, coin and gem float around him.

const HERO = require('../../assets/meshy/hero-street.webp');
const HERO_3D = require('../../assets/models/karakter-street.glb');
const BURAK_3D = require('../../assets/models/burak.glb');
const FIDGET = { clips: ['dribble', 'cheer', 'kick'], seconds: 5 };
const PROPS = [
  { src: require('../../assets/meshy/cup-gold.webp'), size: 74, left: '4%', top: 0.18, delay: 0 },
  { src: require('../../assets/meshy/coin.webp'), size: 54, right: '6%', top: 0.14, delay: 500 },
  { src: require('../../assets/meshy/ball.webp'), size: 62, left: '8%', top: 0.5, delay: 900 },
  { src: require('../../assets/meshy/gem.webp'), size: 48, right: '5%', top: 0.44, delay: 300 },
] as const;
const LOGO = require('../../assets/brand/logo.png');
const ease = Easing.bezier(0.2, 0.8, 0.2, 1);
const native = Platform.OS !== 'web';

export default function Giris() {
  const insets = useSafeAreaInsets();
  const startAnonymous = useGame(s => s.startAnonymous);
  const [busy, setBusy] = useState(false);
  const intro = useIntro();
  useEffect(() => { setMusic('menu'); preloadModels([BURAK_3D]); }, []);

  async function start() {
    if (busy) return;
    buzz('medium');
    sfx('whistle_start');
    setBusy(true);
    // The anonymous account starts here; the mahalle and character steps follow (see _layout).
    try { await startAnonymous(); } finally { setBusy(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, overflow: 'hidden' }}>
      <Pressable
        onPress={start} disabled={busy}
        accessibilityRole="button" accessibilityLabel={t('login.tapA11y')} accessibilityState={{ busy }}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Pitch />
        {PROPS.map((p, i) => <Float key={i} {...p} top={insets.top + 90 + p.top * 520} show={intro.logo} />)}
        <Animated.View style={[styles.heroWrap, { top: insets.top + 96, opacity: intro.hero, transform: [{ translateY: intro.heroY }] }]}>
          <FloorGlow />
          <Model3D model={HERO_3D} fallback={HERO} clip="idle" fidget={FIDGET} headroom={0.14} style={styles.hero} />
        </Animated.View>
        <View style={styles.fade} />
      </View>

      <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: insets.top + 28, left: 20, opacity: intro.logo }]}>
        <Image source={LOGO} style={{ width: 168, height: 31 }} contentFit="contain" accessibilityLabel="StreetBorn" />
      </Animated.View>

      <Pressable
        onPress={() => { buzz(); openSignInSheet(); }}
        accessibilityRole="button" accessibilityLabel={t('login.haveAccount')}
        hitSlop={8}
        style={({ pressed }) => [styles.account, { top: insets.top + 22, opacity: pressed ? 0.7 : 1 }]}
      >
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.g200} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
          <Path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
        </Svg>
        <T w={600} size={13} color={colors.g200}>{t('login.haveAccount')}</T>
      </Pressable>

      <View pointerEvents="box-none" style={{ position: 'absolute', left: 20, right: 20, bottom: Math.max(insets.bottom, 16) + 34, gap: 20 }}>
        <Animated.View pointerEvents="none" style={{ opacity: intro.logo, alignItems: 'center', gap: 4 }}>
          <T w={700} size={26} style={{ letterSpacing: -0.4 }}>{t('login.slogan1')}</T>
          <T w={700} size={26} color={colors.l600} style={{ letterSpacing: -0.4 }}>{t('login.slogan2')}</T>
        </Animated.View>
        {/* The whole screen still starts the game; the button makes that obvious. */}
        <Animated.View style={{ opacity: intro.logo }}>
          <Cta busy={busy} onPress={() => void start()} accessibilityLabel={t('login.tapA11y')}>{t('common.start')}</Cta>
        </Animated.View>
      </View>

      <T pointerEvents="none" w={500} size={11} color={colors.g300} style={{ position: 'absolute', left: 24, right: 24, bottom: Math.max(insets.bottom, 16), textAlign: 'center', lineHeight: 16 }}>
        {t('login.terms')}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  heroWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  hero: { width: 320, height: 470 },
  fade: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: '30%',
    backgroundColor: colors.ink, opacity: 0.85,
  },
  account: {
    position: 'absolute', right: 12, height: 44, paddingHorizontal: 14, borderRadius: 22,
    backgroundColor: 'rgba(13,13,13,.72)', flexDirection: 'row', alignItems: 'center', gap: 6,
  },
});

/** Logo, player and the tap prompt come in one after another. Reduced motion shows them at once. */
function useIntro() {
  const v = useRef({
    hero: new Animated.Value(0), logo: new Animated.Value(0),
  }).current;
  const heroY = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!alive) return;
      if (reduce) { v.hero.setValue(1); v.logo.setValue(1); heroY.setValue(0); return; }
      Animated.parallel([
        Animated.timing(v.hero, { toValue: 1, duration: 700, delay: 150, easing: ease, useNativeDriver: native }),
        Animated.timing(heroY, { toValue: 0, duration: 800, delay: 150, easing: ease, useNativeDriver: native }),
        Animated.timing(v.logo, { toValue: 1, duration: 600, delay: 500, easing: ease, useNativeDriver: native }),
      ]).start();
    });
    return () => { alive = false; };
  }, [v, heroY]);
  return { ...v, heroY };
}

/** Faint chalk lines of a pitch behind the player: halfway line, centre circle and spot. */
function Pitch() {
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
      <Line x1={0} y1={560} x2={390} y2={560} stroke="#fff" strokeOpacity={0.06} strokeWidth={2} />
      <Ellipse cx={195} cy={560} rx={150} ry={46} stroke="#fff" strokeOpacity={0.06} strokeWidth={2} fill="none" />
      <Circle cx={195} cy={560} r={3} fill="#fff" fillOpacity={0.1} />
      <Path d="M-20 820 L120 640 L270 640 L410 820" stroke="#fff" strokeOpacity={0.04} strokeWidth={2} fill="none" />
    </Svg>
  );
}

function FloorGlow() {
  return (
    <Svg width={300} height={60} style={{ position: 'absolute', bottom: 0, alignSelf: 'center' }}>
      <Defs>
        <RadialGradient id="floor" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor={colors.l600} stopOpacity={0.35} />
          <Stop offset="1" stopColor={colors.l600} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={150} cy={30} rx={150} ry={30} fill="url(#floor)" />
    </Svg>
  );
}

/** A 3D-rendered prop that drifts up and down beside the player. */
function Float({ src, size, left, right, top, delay, show }: {
  src: number; size: number; left?: string; right?: string; top: number; delay: number; show: Animated.Value;
}) {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce || !alive) return;
      loop = Animated.loop(Animated.sequence([
        Animated.timing(y, { toValue: -10, duration: 1800, delay, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(y, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      ]));
      loop.start();
    });
    return () => { alive = false; loop?.stop(); };
  }, [y, delay]);
  return (
    <Animated.View style={{ position: 'absolute', top, left, right, opacity: show, transform: [{ translateY: y }] } as object}>
      <Image source={src} style={{ width: size, height: size }} contentFit="contain" accessibilityElementsHidden importantForAccessibility="no" />
    </Animated.View>
  );
}
