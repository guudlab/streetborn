import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, Path, RadialGradient, Stop } from 'react-native-svg';

import { setMusic, sfx } from '../audio/audio.ts';
import { useGame } from '../game/store.ts';
import { colors } from '../theme.ts';
import { openSignInSheet } from '../ui/account.tsx';
import { buzz, Cta, T } from '../ui/kit.tsx';
import { toast } from '../ui/overlay.tsx';
import { preloadModels } from '../ui/Model3D.tsx';
import { Pack, BadgeCard, Rays, PACK_H, TEAR_MS, type PackStage } from '../ui/paket.tsx';
import { t } from '../i18n/index.ts';

// First screen for a new player (design G "İlk rozet paketi"): a glowing sealed pack waits,
// tapping the pack tears its top strip off and the card with the first badge flips in.
// "Devam" then starts an anonymous career, and the mahalle and character steps follow;
// "Hesabım var" signs in to an account linked before (Apple, Google or an email code).
// The pack and badge are vector placeholders until the Meshy models replace them.

const BURAK_3D = require('../../assets/models/burak.glb');
const LOGO = require('../../assets/brand/logo.png');
const ease = Easing.bezier(0.2, 0.8, 0.2, 1);
const native = Platform.OS !== 'web';

export default function Giris() {
  const insets = useSafeAreaInsets();
  const startAnonymous = useGame(s => s.startAnonymous);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<PackStage>('idle');
  const intro = useIntro();
  // Short phones shrink the pack so it never touches the text.
  const { height } = useWindowDimensions();
  const fit = Math.max(0.6, Math.min(1, (height - 330) / (PACK_H + 40)));
  useEffect(() => { setMusic('menu'); preloadModels([BURAK_3D]); }, []);

  function open() {
    if (stage !== 'idle') return;
    buzz('medium');
    sfx('whistle_start');
    setStage('tear');
    // The top strip tears off, the pack drops, then the card shows.
    setTimeout(() => { buzz('success'); setStage('reveal'); }, TEAR_MS);
  }

  async function start() {
    if (busy) return;
    buzz('medium');
    setBusy(true);
    // The anonymous account starts here; the mahalle and character steps follow (see _layout).
    try { await startAnonymous(); } catch (e) {
      console.warn('Could not start', e);
      toast(t('login.err'), 'error');
    } finally { setBusy(false); }
  }

  const revealed = stage === 'reveal';

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, overflow: 'hidden' }}>
      <Animated.View pointerEvents="none" style={{ alignItems: 'center', marginTop: insets.top + 28, opacity: intro.logo }}>
        <Image source={LOGO} style={{ width: 168, height: 31, alignSelf: 'flex-start', marginLeft: 20 }} contentFit="contain" accessibilityLabel="StreetBorn" />
        <T w={700} size={26} style={{ letterSpacing: -0.4, marginTop: 28, height: 32 }}>
          {revealed ? <>{t('login.badgeA')}<T w={700} size={26} color={colors.l600}>{t('login.badgeB')}</T></>
            : <>{t('login.packA')}<T w={700} size={26} color={colors.l600}>{t('login.packB')}</T></>}
        </T>
      </Animated.View>

      <Pressable
        onPress={open} disabled={stage !== 'idle'}
        accessibilityRole="button" accessibilityLabel={t('login.tapA11y')} accessibilityElementsHidden={revealed}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <View pointerEvents="none" style={{ position: 'absolute' }}><Rays /></View>
        <Glow />
        <Animated.View pointerEvents="none" style={{ opacity: intro.hero, transform: [{ translateY: intro.heroY }, { scale: fit }], alignItems: 'center', justifyContent: 'center', height: PACK_H + 40 }}>
          {revealed ? <BadgeCard /> : <Pack stage={stage} />}
        </Animated.View>
        <Floor />
      </Pressable>

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

      <View style={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 16) + 8, gap: 14 }}>
        <Animated.View style={{ opacity: intro.logo, alignItems: 'center' }}>
          <T w={600} size={17} color={colors.g200} style={{ textAlign: 'center' }}>
            {revealed ? t('login.badgeSaved') : <>{t('login.slogan1')} <T w={600} size={17} color={colors.l600}>{t('login.slogan2')}</T></>}
          </T>
        </Animated.View>
        <Animated.View style={{ opacity: intro.logo }}>
          {revealed
            ? <Cta busy={busy} onPress={() => void start()} accessibilityLabel={t('common.continue')}>{t('common.continue')}</Cta>
            : <TapHint hidden={stage !== 'idle'} />}
        </Animated.View>
        <Pressable
          onPress={() => { buzz(); router.push('/gizlilik'); }} hitSlop={6}
          accessibilityRole="link" accessibilityLabel={t('privacy.title')}
          style={{ paddingVertical: 4 }}
        >
          <T w={500} size={11} color={colors.g300} style={{ textAlign: 'center', lineHeight: 16 }}>
            {t('login.termsA')}<T w={600} size={11} color={colors.g100} style={{ textDecorationLine: 'underline' }}>{t('login.termsLink')}</T>{t('login.termsB')}
          </T>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  account: {
    position: 'absolute', right: 12, height: 44, paddingHorizontal: 14, borderRadius: 22,
    backgroundColor: 'rgba(13,13,13,.72)', flexDirection: 'row', alignItems: 'center', gap: 6,
  },
});

/** Logo, pack and the button come in one after another. Reduced motion shows them at once. */
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

/** "DOKUN VE BAŞLA" under the pack: pulses until the pack is tapped. */
function TapHint({ hidden }: { hidden: boolean }) {
  const k = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce || !alive) return;
      loop = Animated.loop(Animated.sequence([
        Animated.timing(k, { toValue: 0.35, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(k, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      ]));
      loop.start();
    });
    return () => { alive = false; loop?.stop(); };
  }, [k]);
  return (
    <Animated.View pointerEvents="none" style={{ height: 56, alignItems: 'center', justifyContent: 'center', gap: 8, opacity: hidden ? 0 : k }}>
      <T w={700} size={16} style={{ letterSpacing: 3 }}>{t('login.tap')}</T>
      <View style={{ width: 120, height: 4, borderRadius: 2, backgroundColor: colors.l600, shadowColor: colors.l600, shadowOpacity: 0.8, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } }} />
    </Animated.View>
  );
}

/** Lime glow behind the pack. */
function Glow() {
  return (
    <Svg width={300} height={360} style={{ position: 'absolute' }}>
      <Defs>
        <RadialGradient id="packGlow" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor={colors.l600} stopOpacity={0.42} />
          <Stop offset="1" stopColor={colors.l600} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={150} cy={180} rx={150} ry={180} fill="url(#packGlow)" />
    </Svg>
  );
}

/** Soft lime pool on the floor under the pack. */
function Floor() {
  return (
    <Svg width={230} height={36} style={{ position: 'absolute', bottom: 6 }}>
      <Defs>
        <RadialGradient id="floorPool" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor={colors.l600} stopOpacity={0.4} />
          <Stop offset="1" stopColor={colors.l600} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={115} cy={18} rx={115} ry={18} fill="url(#floorPool)" />
    </Svg>
  );
}
