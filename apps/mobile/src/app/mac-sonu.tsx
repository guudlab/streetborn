import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { setMusic, sfx } from '../audio/audio.ts';
import { delta, num } from '../game/format.ts';
import { levelProgress } from '../game/rules.ts';
import { useGame, type PostMatch } from '../game/store.ts';
import { colors } from '../theme.ts';
import { startLink } from '../ui/account.tsx';
import { Icon } from '../ui/Icon.tsx';
import { buzz, Cta, Ghost, H3, Ring, T, Track, useCountUp, wait } from '../ui/kit.tsx';
import { Pop, PressableScale, useReduceMotion } from '../ui/motion.tsx';
import { CurrencyFly, WalletPill } from '../ui/fly.tsx';
import { closeSheet, openSheet } from '../ui/overlay.tsx';
import { achName, injuryName, timeLeft } from '../ui/kariyer.tsx';
import { MatchStrip } from '../ui/live/MatchStrip.tsx';
import { Amount, Bubble, Ico } from '../ui/sade.tsx';
import { t } from '../i18n/index.ts';

const RES = { W: t('post.W'), D: t('post.D'), L: t('post.L') } as const;
const BADGE = { W: [colors.l900, colors.l500], D: [colors.s3, colors.g100], L: ['#3A1D19', '#FFB1A5'] } as const;
const LINE = {
  goal: [t('post.line.goal'), delta(1), 'plus'], saved: [t('post.line.miss'), delta(-0.5), 'minus'], wide: [t('post.line.miss'), delta(-0.5), 'minus'],
  over: [t('post.line.miss'), delta(-0.5), 'minus'], assist: [t('post.line.assist'), delta(0.7), 'plus'], lost: [t('post.line.lost'), delta(-0.3), 'minus'],
  stopped: [t('post.line.stopped'), delta(0.5), 'plus'], conceded: [t('post.line.conceded'), '0', ''], survived: [t('post.line.survived'), '0', ''],
} as const;

export default function MacSonu() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const r = useGame(s => s.post);
  const [step, setStep] = useState(0); // 1 rating, 2 coins, 3 xp, 4 level up, 5 trust
  const still = useReduceMotion();
  const balance = useGame(s => s.coins);
  const coinRow = useRef<any>(null);
  const [from, setFrom] = useState<{ x: number; y: number } | null>(null);
  const [pill, setPill] = useState(false);
  const [landedN, setLandedN] = useState(0);

  // Coins fly from the coin row to a wallet pill at the top right; with Reduce Motion the pill just appears.
  useEffect(() => {
    if (step !== 2 || !r || r.coins <= 0) return;
    if (still) { setPill(true); const id = setTimeout(() => setPill(false), 1800); return () => clearTimeout(id); }
    const id = setTimeout(() => coinRow.current?.measureInWindow((x: number, y: number, w: number, h: number) => { if (w > 0) setFrom({ x: x + 15, y: y + h / 2 }); }), 400);
    return () => clearTimeout(id);
  }, [step, r, still]);
  // One light tap per coin that lands; the pill's balance ticks up with each one.
  const coinLanded = (n: number) => {
    buzz('light'); setPill(true); setLandedN(n);
    if (n === FLY_COINS) { sfx('coin'); setTimeout(() => { setPill(false); setFrom(null); }, 1400); }
  };

  useEffect(() => {
    if (!r) return;
    let live = true;
    setMusic(null);
    sfx(r.result === 'L' ? 'defeat_sting' : 'victory_sting');
    (async () => {
      await wait(250); if (!live) return; setStep(1);
      await wait(800); if (!live) return; if (r.coins > 0) sfx('coin_count'); setStep(2);
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

  // The store balance already holds this match's reward; the pill starts below it and adds one share per landed coin.
  const shown = still ? balance : Math.max(0, balance - r.coins) + Math.round((r.coins * landedN) / FLY_COINS);
  const lines = r.log.map(l => LINE[l.outcome]);
  const teamDelta = r.result === 'W' ? [delta(0.3), 'plus'] : r.result === 'L' ? [delta(-0.3), 'minus'] : ['0', ''];
  const quote = r.rating >= 70 ? t('post.quote.high') : r.rating >= 60 ? t('post.quote.mid') : t('post.quote.low');
  const p0 = levelProgress(r.before.level, r.before.xp);
  const p1 = levelProgress(r.after.level, r.after.xp);
  // With a level-up the bar fills to 100%, then restarts from 0 at the new level.
  const xpBar = step < 3 ? p0 : r.ups && step < 4 ? 1 : p1;
  const [badgeBg, badgeFg] = BADGE[r.result];
  const color = (k: string) => (k === 'plus' ? colors.l500 : k === 'minus' ? colors.bad : colors.g100);

  // The full rating breakdown is one tap away; the screen itself shows the score and the rewards.
  const details = () => openSheet(
    <>
      <H3>{t('post.ratingA11y')}</H3>
      <View style={{ gap: 6 }}>
        <Row v={num(6, 1)} c={colors.g100} label={t('post.start')} muted />
        {lines.length ? lines.map(([label, v, k], i) => <Row key={i} v={v!} c={color(k!)} label={`${r.log[i]!.minute}' ${label}`} />)
          : <T size={14} color={colors.g200}>{t('post.noMoments')}</T>}
        <Row v={teamDelta[0]!} c={color(teamDelta[1]!)} label={t('post.team')} />
      </View>
      <Cta onPress={closeSheet}>{t('common.ok')}</Cta>
    </>,
  );

  return (
    <View style={{ flex: 1 }}>
    <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 20, paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 18 }}>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Pop delay={150}>
          {r.result === 'L' ? <Ico name="ball" size={96} /> : <Ico name="cup" size={r.result === 'W' ? 128 : 96} dim={r.result === 'D'} />}
        </Pop>
        <T w={700} size={52} style={{ lineHeight: 58, letterSpacing: -1 }} accessibilityLabel={t('post.headline', { us: r.us, them: r.them })}>{r.us} – {r.them}</T>
        <View style={{ height: 30, paddingHorizontal: 14, borderRadius: 15, justifyContent: 'center', backgroundColor: badgeBg }}>
          <T w={700} size={14} color={badgeFg}>{RES[r.result]}</T>
        </View>
      </View>

      {r.pins.length > 0 && <MatchStrip pins={r.pins} goals={r.us + r.them} />}

      <Bubble text={quote} style={{ alignSelf: 'center' }} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <PressableScale accessibilityRole="button" accessibilityLabel={`${t('post.ratingA11y')}: ${num(r.rating / 10, 1)}`} onPress={details}>
          <Ring size={96} stroke={6} value={(step >= 1 ? rating : 6) / 10}>
            <T w={700} size={34} style={{ letterSpacing: -0.6 }}>{num(rating, 1)}</T>
          </Ring>
          <View style={{ position: 'absolute', right: -2, bottom: -2, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.s3, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="info" size={16} color={colors.g200} />
          </View>
        </PressableScale>
        <View style={{ flex: 1, gap: 10 }}>
          <Gain show={step >= 2} rowRef={coinRow}>
            <Ico name="coin" size={30} />
            <T w={700} size={22} color={colors.l500}>+{num(coins)}</T>
          </Gain>
          <Gain show={step >= 3}>
            <Icon name="star" size={24} color={colors.l600} />
            <T w={700} size={18}>+{r.xp}</T>
            <View style={{ flex: 1 }}><Track value={xpBar} reset={step === 4 ? 0 : undefined} /></View>
            {step >= 4 && (
              <Pop style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 10, backgroundColor: colors.l600 }}>
                <T w={700} size={12} color={colors.ink}>{t('post.level', { n: r.after.level })}</T>
              </Pop>
            )}
          </Gain>
          <Gain show={step >= 5}>
            <Icon name="whistle" size={24} color={colors.g200} />
            <T w={700} size={18} color={r.trustDelta >= 0 ? colors.l500 : colors.bad} accessibilityLabel={`${r.coachTrust ? t('career.trust') : t('post.trust')} ${r.trustDelta}`}>
              {r.trustDelta >= 0 ? '+' : '−'}{Math.abs(r.trustDelta)}
            </T>
            <T w={600} size={13} color={colors.g200} numberOfLines={1} style={{ flex: 1 }}>{r.coachTrust ? t('career.trust') : t('post.trust')}</T>
          </Gain>
        </View>
      </View>

      {r.kind === 'mahalle' && <T w={500} size={13} color={colors.g200} style={{ textAlign: 'center' }}>{t('post.mahalleShort')}</T>}
      {r.kind === 'trial' && (
        <T w={700} size={15} color={r.trialPassed ? colors.l500 : colors.g200} style={{ textAlign: 'center' }}>{r.trialPassed ? t('post.trialPassed') : t('post.trialFailed')}</T>
      )}

      {r.kariyer && step >= 5 && <KariyerLines k={r.kariyer} />}

      {r.first && <LinkStrip />}

      {r.flagged && (
        <T size={13} color={colors.g200}>{t('post.flagged')}</T>
      )}

      <View style={{ gap: 10, marginTop: 'auto' }}>
        {r.scout && (
          <Cta onPress={() => router.replace('/teklifler')}>
            <Ico name="kulup" size={30} /><T w={700} size={17} color={colors.ink}>{t('post.scoutReport')}</T>
          </Cta>
        )}
        {r.scout
          ? <Ghost onPress={() => router.replace('/')}>{t('post.home')}</Ghost>
          : <Cta onPress={() => router.replace('/')}>{t('common.continue')}</Cta>}
      </View>
    </ScrollView>
    {from && !still && <CurrencyFly icon="coin" from={from} to={{ x: width - 46, y: insets.top + 48 }} count={FLY_COINS} onLanded={coinLanded} />}
    {pill && <WalletPill icon="coin" value={num(shown)} label={`${balance}`} top={insets.top + 8} />}
    </View>
  );
}

const FLY_COINS = 5;

/** New trophies and a possible injury from this match. */
function KariyerLines({ k }: { k: NonNullable<PostMatch['kariyer']> }) {
  return (
    <View style={{ gap: 8 }}>
      {k.unlocked.map(u => (
        <Pop key={u.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, backgroundColor: colors.l900 }}>
          <Ico name="cup" size={40} />
          <View style={{ flex: 1 }}>
            <T w={600} size={12} color={colors.l500}>{t('ach.newLabel')}</T>
            <T w={700} size={16}>{achName(u.key)}</T>
          </View>
          <Amount icon="coin" size={22} textSize={15} color={colors.l500}>+{u.coin}</Amount>
        </Pop>
      ))}
      {k.injury && (
        <PressableScale
          accessibilityRole="button" onPress={() => router.push('/sakatlik')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, backgroundColor: '#3A1D19', borderWidth: 1, borderColor: colors.bad }}
        >
          <Icon name="plus" size={26} color={colors.bad} />
          <View style={{ flex: 1 }}>
            <T w={700} size={15} color={colors.bad}>{t('injury.postTitle', { kind: injuryName(k.injury.kind) })}</T>
            <T size={13} color={colors.g200}>{t('injury.postText', { t: timeLeft(k.injury.days * 86_400_000) })}</T>
          </View>
          <Icon name="chev" size={18} color={colors.g300} />
        </PressableScale>
      )}
    </View>
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

function Gain({ show, children, rowRef }: { show: boolean; children: React.ReactNode; rowRef?: React.Ref<View> }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { if (show) Animated.timing(a, { toValue: 1, duration: 350, useNativeDriver: true }).start(); }, [show, a]);
  return (
    <Animated.View ref={rowRef as never} style={{
      flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36,
      opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
    }}>
      {children}
    </Animated.View>
  );
}

/** Soft account-link offer after the very first match. */
function LinkStrip() {
  const [hidden, setHidden] = useState(false);
  const linked = useGame(s => s.account !== null && !s.account.anonymous);
  if (hidden || linked) return null;
  return (
    <View style={{ borderRadius: 20, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.l700, padding: 16, gap: 12 }}>
      <View style={{ gap: 4 }}>
        <T w={600} size={17}>{t('post.link.title')}</T>
        <T size={14} color={colors.g200} style={{ lineHeight: 20 }}>{t('post.link.text')}</T>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <PressableScale onPress={() => startLink('apple')} accessibilityRole="button" style={{ flex: 1, height: 48, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
          <T w={600} size={15} color={colors.ink}>{t('post.link.apple')}</T>
        </PressableScale>
        <PressableScale onPress={() => startLink('google')} accessibilityRole="button" style={{ flex: 1, height: 48, borderRadius: 24, backgroundColor: colors.s3, alignItems: 'center', justifyContent: 'center' }}>
          <T w={600} size={15}>{t('post.link.google')}</T>
        </PressableScale>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 24 }}>
        <PressableScale onPress={() => startLink('email')} accessibilityRole="button" hitSlop={8} style={{ minHeight: 32, justifyContent: 'center' }}>
          <T w={600} size={14} color={colors.g100}>{t('account.email')}</T>
        </PressableScale>
        <PressableScale onPress={() => setHidden(true)} accessibilityRole="button" hitSlop={8} style={{ minHeight: 32, justifyContent: 'center' }}>
          <T w={500} size={14} color={colors.g200}>{t('post.link.later')}</T>
        </PressableScale>
      </View>
    </View>
  );
}
