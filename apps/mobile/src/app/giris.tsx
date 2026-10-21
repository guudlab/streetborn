import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, Line, LinearGradient, Mask, Path, Pattern, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useGame } from '../game/store.ts';
import { colors } from '../theme.ts';
import { buzz, Cta, Ghost, H3, T } from '../ui/kit.tsx';
import { closeSheet, openSheet, SheetText } from '../ui/overlay.tsx';

// First screen for a new player (design A "Gece maçı"): floodlights flicker on,
// the player rises into the light, then the copy and buttons come in one by one.
// Başla signs in anonymously; Apple and Google come once their providers are set up.

const HERO = require('../../assets/hero-alt.webp');
const LOGO = require('../../assets/brand/logo.png');
const ease = Easing.bezier(0.2, 0.8, 0.2, 1);
const native = Platform.OS !== 'web';

export default function Giris() {
  const insets = useSafeAreaInsets();
  const startAnonymous = useGame(s => s.startAnonymous);
  const [busy, setBusy] = useState(false);
  // Top of the copy block; the scene fits the player above it on any screen height.
  const [floor, setFloor] = useState(0);
  const a = useIntro();

  async function start() {
    if (busy) return;
    buzz('medium');
    setBusy(true);
    try { await startAnonymous(); } finally { setBusy(false); }
  }

  function soon(provider: 'Apple' | 'Google') {
    openSheet(
      <>
        <H3>{provider} ile giriş çok yakında</H3>
        <SheetText>Şimdilik Başla ile oyna. {provider} ile girişi açtığımızda bu cihazdaki ilerlemeni hesabına taşıyacağız.</SheetText>
        <Cta onPress={() => { closeSheet(); void start(); }}>Başla</Cta>
        <Ghost onPress={closeSheet}>Kapat</Ghost>
      </>,
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, overflow: 'hidden' }}>
      {floor > 0 && <Scene a={a} top={insets.top} floor={floor} />}

      <Animated.View style={[{ position: 'absolute', top: insets.top + 18, left: 0, right: 0, alignItems: 'center' }, rise(a.logo, -16)]}>
        <Image source={LOGO} style={{ width: 196, height: 36 }} contentFit="contain" accessibilityLabel="StreetBorn" />
      </Animated.View>

      <View
        style={{ position: 'absolute', left: 20, right: 20, bottom: Math.max(insets.bottom, 16) + 18, gap: 12 }}
        onLayout={(e) => setFloor(e.nativeEvent.layout.y)}
      >
        <Animated.View style={[{ gap: 8, paddingBottom: 6 }, rise(a.copy)]}>
          <T w={700} size={30} style={{ lineHeight: 34, letterSpacing: -0.6 }} accessibilityRole="header">
            Sokakta doğdun.{'\n'}<T w={700} size={30} color={colors.l600}>Tribünler seni bekliyor.</T>
          </T>
          <T w={500} size={15} color={colors.g200} style={{ lineHeight: 21 }}>
            Mahalle maçından profesyonel lige. İlk maçın bir dakika sonra.
          </T>
        </Animated.View>

        <Animated.View style={rise(a.cta)}>
          <Cta onPress={start} disabled={busy} accessibilityLabel="Başla" accessibilityState={{ busy }}>
            {busy ? (
              <>
                <ActivityIndicator color={colors.l600} />
                <T w={600} size={17} color={colors.g100}>Sahaya çıkıyorsun…</T>
              </>
            ) : (
              <>
                <Svg width={20} height={20} viewBox="0 0 24 24"><Path d="M7 4.5v15l13-7.5z" fill={colors.ink} /></Svg>
                <T w={600} size={17} color={colors.ink}>Başla</T>
              </>
            )}
          </Cta>
        </Animated.View>

        <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 }, rise(a.or)]}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
          <T w={600} size={11} color={colors.g200} style={{ letterSpacing: 1 }}>YA DA HESABINLA</T>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
        </Animated.View>

        <Animated.View style={[{ gap: 10 }, rise(a.social)]}>
          <SocialButton label="Apple ile giriş yap" light onPress={() => soon('Apple')} icon={<AppleLogo />} />
          <SocialButton label="Google ile giriş yap" onPress={() => soon('Google')} icon={<GoogleLogo />} />
        </Animated.View>

        <Animated.View style={rise(a.legal)}>
          <T w={500} size={11} color={colors.g300} style={{ textAlign: 'center', lineHeight: 16 }}>
            Devam ederek Kullanım Koşulları'nı ve Gizlilik Politikası'nı kabul edersin.
          </T>
        </Animated.View>
      </View>
    </View>
  );
}

type Intro = ReturnType<typeof useIntro>;

/** Entrance timeline. With reduced motion everything is shown at once. */
function useIntro() {
  const v = useRef({
    lights: new Animated.Value(0), hero: new Animated.Value(0), logo: new Animated.Value(0),
    copy: new Animated.Value(0), cta: new Animated.Value(0), or: new Animated.Value(0),
    social: new Animated.Value(0), legal: new Animated.Value(0), loop: new Animated.Value(0),
  }).current;

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!alive) return;
      const steps = [v.lights, v.hero, v.logo, v.copy, v.cta, v.or, v.social, v.legal];
      if (reduce) { steps.forEach(s => s.setValue(1)); return; }
      const t = (val: Animated.Value, delay: number, duration = 450, easing = ease) =>
        Animated.timing(val, { toValue: 1, delay, duration, easing, useNativeDriver: native });
      Animated.parallel([
        t(v.lights, 0, 900, Easing.linear),
        t(v.hero, 350, 700),
        t(v.logo, 650, 500),
        t(v.copy, 850), t(v.cta, 980), t(v.or, 1080), t(v.social, 1160), t(v.legal, 1240),
      ]).start();
      Animated.loop(Animated.sequence([
        Animated.timing(v.loop, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(v.loop, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      ])).start();
    });
    return () => { alive = false; };
  }, [v]);
  return v;
}

function rise(val: Animated.Value, from = 18) {
  return { opacity: val, transform: [{ translateY: val.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }] };
}

/** Floodlights, fence, pitch lines, the player and the ball. Decorative. */
function Scene({ a, top, floor }: { a: Intro; top: number; floor: number }) {
  // Two lamps that stutter on like stadium floodlights, the second a little later.
  const flicker = (shift: number) => a.lights.interpolate({
    inputRange: [0, 0.12 + shift, 0.18 + shift, 0.3 + shift, 0.38 + shift, 0.5 + shift, 1],
    outputRange: [0, 0.9, 0.15, 1, 0.5, 1, 1],
    extrapolate: 'clamp',
  });
  const left = flicker(0), right = flicker(0.2);
  const heroY = a.hero.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });
  const heroScale = a.hero.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] });
  const glow = a.loop.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const ballY = a.loop.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  const stage = top + 70; // the scene starts under the logo
  const feet = floor + 10; // the player stands just behind the headline
  const heroH = Math.max(200, Math.min(392, feet - stage));
  const heroW = Math.round(heroH * 327 / 760);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height={feet + 80} style={{ position: 'absolute', top: 0 }}>
        <Defs>
          <Pattern id="fence" width={22} height={22} patternUnits="userSpaceOnUse">
            <Line x1={0} y1={0} x2={22} y2={22} stroke="#fff" strokeOpacity={0.07} strokeWidth={1} />
            <Line x1={22} y1={0} x2={0} y2={22} stroke="#fff" strokeOpacity={0.07} strokeWidth={1} />
          </Pattern>
          <LinearGradient id="fenceFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#fff" stopOpacity={0} />
            <Stop offset="0.3" stopColor="#fff" stopOpacity={1} />
            <Stop offset="0.6" stopColor="#fff" stopOpacity={1} />
            <Stop offset="0.85" stopColor="#fff" stopOpacity={0} />
          </LinearGradient>
          <Mask id="fenceMask"><Rect width="100%" height="100%" fill="url(#fenceFade)" /></Mask>
        </Defs>
        <Rect y={stage} width="100%" height={feet - stage} fill="url(#fence)" mask="url(#fenceMask)" />
        <Ellipse cx="50%" cy={feet - 20} rx={260} ry={70} stroke="#fff" strokeOpacity={0.1} strokeWidth={2} fill="none" />
        <Line x1="0" y1={feet + 40} x2="100%" y2={feet + 40} stroke="#fff" strokeOpacity={0.08} strokeWidth={2} />
      </Svg>

      <Beam side="left" opacity={left} top={top} />
      <Beam side="right" opacity={right} top={top} />

      <Animated.View style={{ position: 'absolute', top: feet - 46, left: 0, right: 0, alignItems: 'center', transform: [{ scale: glow }] }}>
        <Svg width={260} height={64}><Ellipse cx={130} cy={32} rx={130} ry={32} fill="url(#glowB)" />
          <Defs>
            <RadialGradient id="glowB" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor={colors.l600} stopOpacity={0.32} />
              <Stop offset="1" stopColor={colors.l600} stopOpacity={0} />
            </RadialGradient>
          </Defs>
        </Svg>
      </Animated.View>

      <Animated.View style={{ position: 'absolute', top: feet - heroH, left: 0, right: 0, alignItems: 'center', opacity: a.hero, transform: [{ translateY: heroY }, { scale: heroScale }] }}>
        <Image source={HERO} style={{ width: heroW, height: heroH }} contentFit="contain" />
      </Animated.View>

      <Animated.View style={{ position: 'absolute', top: feet - 38, left: '50%', marginLeft: Math.round(heroW * 0.3), opacity: a.hero, transform: [{ translateY: ballY }] }}>
        <Svg width={34} height={34}>
          <Defs>
            <RadialGradient id="ball" cx="35%" cy="30%" rx="70%" ry="70%">
              <Stop offset="0" stopColor="#FFFFFF" />
              <Stop offset="0.55" stopColor="#E6E6E6" />
              <Stop offset="1" stopColor="#9A9A9A" />
            </RadialGradient>
          </Defs>
          <Ellipse cx={17} cy={17} rx={17} ry={17} fill="url(#ball)" />
        </Svg>
      </Animated.View>

      <Svg width="100%" height={140} style={{ position: 'absolute', top: feet - 100 }}>
        <Defs>
          <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.ink} stopOpacity={0} />
            <Stop offset="0.55" stopColor={colors.ink} stopOpacity={0.85} />
            <Stop offset="1" stopColor={colors.ink} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height={140} fill="url(#fade)" />
      </Svg>
      <View style={{ position: 'absolute', top: feet + 39, left: 0, right: 0, bottom: 0, backgroundColor: colors.ink }} />
    </View>
  );
}

function Beam({ side, opacity, top }: { side: 'left' | 'right'; opacity: Animated.AnimatedInterpolation<number>; top: number }) {
  const flip = side === 'right' ? [{ scaleX: -1 }] : [];
  return (
    <Animated.View style={{ position: 'absolute', top: top - 10, [side]: 0, width: 300, height: 700, opacity, transform: flip }}>
      <Svg width={300} height={700}>
        <Defs>
          <LinearGradient id={`beam-${side}`} x1="0" y1="0" x2="0.6" y2="1">
            <Stop offset="0" stopColor="#FFFFF0" stopOpacity={0.22} />
            <Stop offset="0.45" stopColor="#FFFFF0" stopOpacity={0.06} />
            <Stop offset="0.8" stopColor="#FFFFF0" stopOpacity={0} />
          </LinearGradient>
          <RadialGradient id={`lamp-${side}`} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor="#FFFFF0" stopOpacity={0.7} />
            <Stop offset="1" stopColor="#FFFFF0" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Polygon points="38,40 62,40 300,700 -40,700" fill={`url(#beam-${side})`} transform="rotate(-24 50 40)" />
        <Ellipse cx={48} cy={40} rx={34} ry={22} fill={`url(#lamp-${side})`} />
        <Rect x={34} y={35} width={28} height={10} rx={3} fill="#FFFFF0" />
      </Svg>
    </Animated.View>
  );
}

function SocialButton({ label, light, icon, onPress }: { label: string; light?: boolean; icon: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={label} onPress={() => { buzz(); onPress(); }}
      style={({ pressed }) => ({
        height: 50, borderRadius: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
        backgroundColor: light ? '#FFFFFF' : colors.s2, borderWidth: light ? 0 : 1, borderColor: colors.line,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      {icon}
      <T w={600} size={16} color={light ? '#000000' : colors.g100}>{label}</T>
    </Pressable>
  );
}

const AppleLogo = () => (
  <Svg width={20} height={20} viewBox="0 0 24 24">
    <Path fill="#000" d="M16.37 12.62c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.77-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-2.99-.79-1.54.02-2.96.9-3.75 2.27-1.6 2.78-.41 6.89 1.15 9.14.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.77-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.39-.92-2.41-3.66zM14.1 5.86c.63-.77 1.06-1.83.94-2.89-.91.04-2.01.61-2.66 1.37-.58.67-1.09 1.76-.96 2.79 1.02.08 2.05-.52 2.68-1.27z" />
  </Svg>
);

const GoogleLogo = () => (
  <Svg width={18} height={18} viewBox="0 0 48 48">
    <Path fill="#FBBC05" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
    <Path fill="#EA4335" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <Path fill="#34A853" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <Path fill="#4285F4" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
  </Svg>
);
