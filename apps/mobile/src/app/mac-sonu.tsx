import { Image } from 'expo-image';
import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { setMusic, sfx } from '../audio/audio.ts';
import { delta, num } from '../game/format.ts';
import { levelProgress } from '../game/rules.ts';
import { useGame } from '../game/store.ts';
import { colors } from '../theme.ts';
import { Icon } from '../ui/Icon.tsx';
import { buzz, Caps, CoachFace, Cta, Ghost, H1, H3, Ring, T, Track, useCountUp, wait } from '../ui/kit.tsx';
import { Pop } from '../ui/motion.tsx';
import { closeSheet, openSheet, SheetText } from '../ui/overlay.tsx';
import { t } from '../i18n/index.ts';

const RES = { W: t('post.W'), D: t('post.D'), L: t('post.L') } as const;
const BADGE = { W: [colors.l900, colors.l500], D: [colors.s3, colors.g100], L: ['#3A1D19', '#FFB1A5'] } as const;
const LINE = {
  goal: [t('post.line.goal'), delta(1), 'plus'], saved: [t('post.line.miss'), delta(-0.5), 'minus'], wide: [t('post.line.miss'), delta(-0.5), 'minus'],
  over: [t('post.line.miss'), delta(-0.5), 'minus'], assist: [t('post.line.assist'), delta(0.7), 'plus'], lost: [t('post.line.lost'), delta(-0.3), 'minus'],
} as const;

export default function MacSonu() {
  const insets = useSafeAreaInsets();
  const r = useGame(s => s.post);
  const [step, setStep] = useState(0); // 1 rating, 2 coins, 3 xp, 4 level up, 5 trust

  useEffect(() => {
    if (!r) return;
    let live = true;
    setMusic(null);
    sfx(r.result === 'L' ? 'defeat_sting' : 'victory_sting');
    (async () => {
      await wait(250); if (!live) return; setStep(1);
      await wait(800); if (!live) return; sfx('coin'); setStep(2);
      await wait(700); if (!live) return; buzz(); sfx('tab'); setStep(3);
      if (r.ups) { await wait(900); if (!live) return; buzz('success'); sfx('levelup'); setStep(4); }
      await wait(250); if (!live) return; setStep(5);
    })();
    return () => { live = false; };
  }, [r]);

  // Ratings are stored ×10 (75 = 7,5).
  const rating = useCountUp(6, (r?.rating ?? 60) / 10, 800, step >= 1);
  const coins = useCountUp(0, r?.coins ?? 0, 700, step >= 2);
  if (!r) return <Redirect href="/" />;

  const lines = r.log.map(l => LINE[l.outcome]);
  const teamDelta = r.result === 'W' ? [delta(0.3), 'plus'] : r.result === 'L' ? [delta(-0.3), 'minus'] : ['0', ''];
  const quote = r.rating >= 70 ? t('post.quote.high') : r.rating >= 60 ? t('post.quote.mid') : t('post.quote.low');
  const p0 = levelProgress(r.before.level, r.before.xp);
  const p1 = levelProgress(r.after.level, r.after.xp);
  // With a level-up the bar fills to 100%, then restarts from 0 at the new level.
  const xpBar = step < 3 ? p0 : r.ups && step < 4 ? 1 : p1;
  const [badgeBg, badgeFg] = BADGE[r.result];
  const color = (k: string) => (k === 'plus' ? colors.l500 : k === 'minus' ? colors.bad : colors.g100);

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 18 }}>
      <View>
        <Pop delay={150} style={{ alignSelf: 'center' }}>
          <Image source={require('../../assets/meshy/cup-gold.webp')} style={{ width: 88, height: 88 }} contentFit="contain" accessibilityElementsHidden importantForAccessibility="no" />
        </Pop>
        <Caps>{t('post.title')}</Caps>
        <H1 style={{ marginTop: 6 }}>{t('post.headline', { us: r.us, them: r.them })}</H1>
      </View>
      <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: badgeBg }}>
        <T w={600} size={13} color={badgeFg}>{RES[r.result]}</T>
      </View>

      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: colors.s1, borderRadius: 22, paddingVertical: 12, paddingHorizontal: 14 }}>
        <CoachFace size={44} />
        <View style={{ flex: 1 }}>
          <T w={600} size={17} style={{ lineHeight: 22 }}>“{quote}”</T>
          <Caps style={{ fontSize: 12, marginTop: 2 }}>{t('coach.name')}</Caps>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
        <Ring size={112} stroke={7} value={(step >= 1 ? rating : 6) / 10}>
          <T w={700} size={44} style={{ letterSpacing: -0.8 }}>{num(rating, 1)}</T>
        </Ring>
        <View style={{ gap: 6, flex: 1 }} accessibilityLabel={t('post.ratingA11y')}>
          <Row v={num(6, 1)} c={colors.g100} label={t('post.start')} muted />
          {lines.length ? lines.map(([label, v, k], i) => <Row key={i} v={v!} c={color(k!)} label={`${r.log[i]!.minute}' ${label}`} />)
            : <T size={14} color={colors.g200}>{t('post.noMoments')}</T>}
          <Row v={teamDelta[0]!} c={color(teamDelta[1]!)} label={t('post.team')} />
        </View>
      </View>

      <View style={{ borderRadius: 20, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }}>
        <Gain show={step >= 2} first>
          <Icon name="coin" size={22} color={colors.l500} />
          <View style={{ flex: 1 }}>
            <T w={500} size={15}>{t('post.coin')}</T>
            <T size={12} color={colors.g200}>{t('post.coinSub')}</T>
          </View>
          <T w={600} size={17} color={colors.l500}>+{num(coins)}</T>
        </Gain>
        <Gain show={step >= 3}>
          <Icon name="star" size={22} color={colors.l600} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T w={500} size={15}>{t('post.xp')}</T>
              {step >= 4 && (
                <Pop style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.l600 }}>
                  <Icon name="star" size={14} color={colors.ink} /><T w={700} size={13} color={colors.ink}>{t('post.level', { n: r.after.level })}</T>
                </Pop>
              )}
            </View>
            <Track value={xpBar} reset={step === 4 ? 0 : undefined} />
          </View>
          <T w={600} size={17}>+{r.xp} XP</T>
        </Gain>
        <Gain show={step >= 5}>
          <Icon name="whistle" size={22} color={colors.g200} />
          <View style={{ flex: 1, gap: 8 }}>
            <T w={500} size={15}>{t('post.trust')}</T>
            <Track value={(step >= 5 ? r.after.trust : r.before.trust) / 100} />
          </View>
          <T w={600} size={17} color={r.trustDelta >= 0 ? colors.l500 : colors.bad}>{r.trustDelta >= 0 ? '+' : '−'}{Math.abs(r.trustDelta)}</T>
        </Gain>
      </View>

      {r.first && <LinkStrip />}

      {r.flagged && (
        <T size={13} color={colors.g200}>{t('post.flagged')}</T>
      )}

      <View style={{ gap: 10, marginTop: 'auto' }}>
        {r.scout && (
          <Cta onPress={() => router.replace('/teklifler')}>
            <Icon name="mail" color={colors.ink} /><T w={600} size={17} color={colors.ink}>{t('post.scoutReport')}</T>
          </Cta>
        )}
        {r.scout
          ? <Ghost onPress={() => router.replace('/')}>{t('post.home')}</Ghost>
          : <Cta onPress={() => router.replace('/')}>{t('post.home')}</Cta>}
      </View>
    </ScrollView>
  );
}

function Row({ v, c, label, muted }: { v: string; c: string; label: string; muted?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <T w={600} size={14} color={c} style={{ minWidth: 42, textAlign: 'right' }}>{v}</T>
      <T size={14} color={muted ? colors.g200 : colors.g100}>{label}</T>
    </View>
  );
}

function Gain({ show, first, children }: { show: boolean; first?: boolean; children: React.ReactNode }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { if (show) Animated.timing(a, { toValue: 1, duration: 350, useNativeDriver: true }).start(); }, [show, a]);
  return (
    <Animated.View style={{
      flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16,
      borderTopWidth: first ? 0 : 1, borderTopColor: colors.line,
      opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
    }}>
      {children}
    </Animated.View>
  );
}

/** Soft account-link offer after the very first match. Apple / Google stay placeholders until set up. */
function LinkStrip() {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  const soon = () => {
    buzz();
    openSheet(
      <>
        <H3>{t('post.link.soonTitle')}</H3>
        <SheetText>{t('post.link.soonText')}</SheetText>
        <Ghost onPress={closeSheet}>{t('common.close')}</Ghost>
      </>,
    );
  };
  return (
    <View style={{ borderRadius: 20, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.l700, padding: 16, gap: 12 }}>
      <View style={{ gap: 4 }}>
        <T w={600} size={17}>{t('post.link.title')}</T>
        <T size={14} color={colors.g200} style={{ lineHeight: 20 }}>{t('post.link.text')}</T>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable onPress={soon} accessibilityRole="button" style={{ flex: 1, height: 48, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
          <T w={600} size={15} color={colors.ink}>{t('post.link.apple')}</T>
        </Pressable>
        <Pressable onPress={soon} accessibilityRole="button" style={{ flex: 1, height: 48, borderRadius: 24, backgroundColor: colors.s3, alignItems: 'center', justifyContent: 'center' }}>
          <T w={600} size={15}>{t('post.link.google')}</T>
        </Pressable>
      </View>
      <Pressable onPress={() => setHidden(true)} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'center', minHeight: 32, justifyContent: 'center' }}>
        <T w={500} size={14} color={colors.g200}>{t('post.link.later')}</T>
      </Pressable>
    </View>
  );
}
