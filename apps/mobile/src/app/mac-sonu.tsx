import { Image } from 'expo-image';
import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tr } from '../game/format.ts';
import { levelProgress } from '../game/rules.ts';
import { useGame } from '../game/store.ts';
import { colors } from '../theme.ts';
import { Icon } from '../ui/Icon.tsx';
import { buzz, Caps, CoachFace, Cta, Ghost, H1, Ring, T, Track, useCountUp, wait } from '../ui/kit.tsx';

const RES = { W: 'Galibiyet', D: 'Beraberlik', L: 'Mağlubiyet' } as const;
const BADGE = { W: [colors.l900, colors.l500], D: [colors.s3, colors.g100], L: ['#3A1D19', '#FFB1A5'] } as const;
const LINE = {
  goal: ['Gol', '+1,0', 'plus'], saved: ['Kaçan fırsat', '−0,5', 'minus'], wide: ['Kaçan fırsat', '−0,5', 'minus'],
  over: ['Kaçan fırsat', '−0,5', 'minus'], assist: ['Asist', '+0,7', 'plus'], lost: ['Top kaybı', '−0,3', 'minus'],
} as const;

export default function MacSonu() {
  const insets = useSafeAreaInsets();
  const r = useGame(s => s.post);
  const [step, setStep] = useState(0); // 1 rating, 2 coins, 3 xp, 4 level up, 5 trust

  useEffect(() => {
    if (!r) return;
    let live = true;
    (async () => {
      await wait(250); if (!live) return; setStep(1);
      await wait(800); if (!live) return; setStep(2);
      await wait(700); if (!live) return; buzz(); setStep(3);
      if (r.ups) { await wait(900); if (!live) return; buzz('success'); setStep(4); }
      await wait(250); if (!live) return; setStep(5);
    })();
    return () => { live = false; };
  }, [r]);

  // Ratings are stored ×10 (75 = 7,5).
  const rating = useCountUp(6, (r?.rating ?? 60) / 10, 800, step >= 1);
  const coins = useCountUp(0, r?.coins ?? 0, 700, step >= 2);
  if (!r) return <Redirect href="/" />;

  const lines = r.log.map(l => LINE[l.outcome]);
  const teamDelta = r.result === 'W' ? ['+0,3', 'plus'] : r.result === 'L' ? ['−0,3', 'minus'] : ['0', ''];
  const quote = r.rating >= 70 ? 'Bugün adam gibi oynadın oğlum. Mahalle seninle gurur duyar.' : r.rating >= 60 ? 'Fena değildi kardeşim, ama daha iyisini biliyorum.' : 'Kötü gün, olur. Yarın sahaya, yine buradayım.';
  const p0 = levelProgress(r.before.level, r.before.xp);
  const p1 = levelProgress(r.after.level, r.after.xp);
  // With a level-up the bar fills to 100%, then restarts from 0 at the new level.
  const xpBar = step < 3 ? p0 : r.ups && step < 4 ? 1 : p1;
  const [badgeBg, badgeFg] = BADGE[r.result];
  const color = (k: string) => (k === 'plus' ? colors.l500 : k === 'minus' ? colors.bad : colors.g100);

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 18 }}>
      <View>
        <Image source={require('../../assets/meshy/cup-gold.png')} style={{ width: 88, height: 88, alignSelf: 'center' }} contentFit="contain" accessibilityElementsHidden importantForAccessibility="no" />
        <Caps>Maç sonu · Hafta 10</Caps>
        <H1 style={{ marginTop: 6 }}>Yıldırımspor {r.us} – {r.them} Kartaltepe</H1>
      </View>
      <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: badgeBg }}>
        <T w={600} size={13} color={badgeFg}>{RES[r.result]}</T>
      </View>

      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: colors.s1, borderRadius: 22, paddingVertical: 12, paddingHorizontal: 14 }}>
        <CoachFace size={44} />
        <View style={{ flex: 1 }}>
          <T w={600} size={17} style={{ lineHeight: 22 }}>“{quote}”</T>
          <Caps style={{ fontSize: 12, marginTop: 2 }}>Burak abi</Caps>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
        <Ring size={112} stroke={7} value={(step >= 1 ? rating : 6) / 10}>
          <T w={700} size={44} style={{ letterSpacing: -0.8 }}>{tr(rating, 1)}</T>
        </Ring>
        <View style={{ gap: 6, flex: 1 }} accessibilityLabel="Not dökümü">
          <Row v="6,0" c={colors.g100} label="Başlangıç" muted />
          {lines.length ? lines.map(([label, v, k], i) => <Row key={i} v={v!} c={color(k!)} label={`${r.log[i]!.minute}' ${label}`} />)
            : <T size={14} color={colors.g200}>Pozisyon oynanmadı</T>}
          <Row v={teamDelta[0]!} c={color(teamDelta[1]!)} label="Takım sonucu" />
        </View>
      </View>

      <View style={{ borderRadius: 20, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }}>
        <Gain show={step >= 2} first>
          <Icon name="coin" size={22} color={colors.l500} />
          <View style={{ flex: 1 }}>
            <T w={500} size={15}>Coin</T>
            <T size={12} color={colors.g200}>Maç ücreti, gol ve not bonusu</T>
          </View>
          <T w={600} size={17} color={colors.l500}>+{tr(coins)}</T>
        </Gain>
        <Gain show={step >= 3}>
          <Icon name="star" size={22} color={colors.l600} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T w={500} size={15}>Deneyim</T>
              {step >= 4 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.l600 }}>
                  <Icon name="star" size={14} color={colors.ink} /><T w={700} size={13} color={colors.ink}>Seviye {r.after.level}</T>
                </View>
              )}
            </View>
            <Track value={xpBar} reset={step === 4 ? 0 : undefined} />
          </View>
          <T w={600} size={17}>+{r.xp} XP</T>
        </Gain>
        <Gain show={step >= 5}>
          <Icon name="whistle" size={22} color={colors.g200} />
          <View style={{ flex: 1, gap: 8 }}>
            <T w={500} size={15}>Mahalle saygısı</T>
            <Track value={(step >= 5 ? r.after.trust : r.before.trust) / 100} />
          </View>
          <T w={600} size={17} color={r.trustDelta >= 0 ? colors.l500 : colors.bad}>{r.trustDelta >= 0 ? '+' : '−'}{Math.abs(r.trustDelta)}</T>
        </Gain>
      </View>

      {r.flagged && (
        <T size={13} color={colors.g200}>Bu maç incelemeye alındı; yalnızca katılım ödülü verildi.</T>
      )}

      <View style={{ gap: 10, marginTop: 'auto' }}>
        {r.scout && (
          <Cta onPress={() => router.replace('/teklifler')}>
            <Icon name="mail" color={colors.ink} /><T w={600} size={17} color={colors.ink}>İzci raporu: 2 teklif</T>
          </Cta>
        )}
        {r.scout
          ? <Ghost onPress={() => router.replace('/')}>Ana ekrana dön</Ghost>
          : <Cta onPress={() => router.replace('/')}>Ana ekrana dön</Cta>}
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
