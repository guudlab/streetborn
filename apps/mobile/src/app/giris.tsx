import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { setMusic, sfx } from '../audio/audio.ts';
import { useGame } from '../game/store.ts';
import { colors } from '../theme.ts';
import { openSignInSheet } from '../ui/account.tsx';
import { buzz, T } from '../ui/kit.tsx';
import { t } from '../i18n/index.ts';

// First screen for a new player (design C "Dokun ve başla"): the whole screen is the
// button. Tapping anywhere starts an anonymous career, then the mahalle and character steps follow; "Hesabım var" signs
// in to an account linked before (Apple, Google or an email code).

const HERO = require('../../assets/meshy/hero-street.webp');
const LOGO = require('../../assets/brand/logo.png');
const ease = Easing.bezier(0.2, 0.8, 0.2, 1);
const native = Platform.OS !== 'web';

export default function Giris() {
  const insets = useSafeAreaInsets();
  const startAnonymous = useGame(s => s.startAnonymous);
  const [busy, setBusy] = useState(false);
  const intro = useIntro();
  useEffect(() => { setMusic('menu'); }, []);
  const blink = useBlink(!busy);

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
        <Animated.View style={[styles.heroWrap, { top: insets.top + 150, opacity: intro.hero, transform: [{ translateY: intro.heroY }] }]}>
          <Image source={HERO} style={styles.hero} contentFit="contain" accessibilityElementsHidden importantForAccessibility="no" />
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

      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom, 16) + 56, alignItems: 'center', gap: 22 }}>
        {busy ? (
          <T w={600} size={13} color={colors.l600} style={{ letterSpacing: 1.8 }} accessibilityLiveRegion="polite">{t('login.entering')}</T>
        ) : (
          <Animated.View style={{ opacity: blink }}>
            <T w={600} size={13} style={{ letterSpacing: 1.8 }} accessibilityElementsHidden importantForAccessibility="no">{t('login.tap')}</T>
          </Animated.View>
        )}
      </View>

      <T pointerEvents="none" w={500} size={11} color={colors.g300} style={{ position: 'absolute', left: 24, right: 24, bottom: Math.max(insets.bottom, 16), textAlign: 'center', lineHeight: 16 }}>
        {t('login.terms')}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  heroWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  hero: { width: 400, height: 400 },
  fade: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: '42%',
    backgroundColor: colors.ink, opacity: 0.82,
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

/** Slow pulse on the tap prompt, so the player knows the whole screen is a button. */
function useBlink(on: boolean) {
  const a = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!on) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 0.45, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      Animated.timing(a, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [a, on]);
  return a;
}
