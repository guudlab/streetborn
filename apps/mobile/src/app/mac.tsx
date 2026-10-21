import type { ChanceOutcome, Side } from '@streetborn/engine';
import { BlurView } from 'expo-blur';
import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { clamp, MOMENT_TITLE } from '../game/rules.ts';
import { liveScore, useGame } from '../game/store.ts';
import { colors } from '../theme.ts';
import { Icon, type IconName } from '../ui/Icon.tsx';
import { buzz, Caps, CoachLine, Cta, Ghost, H3, T, wait } from '../ui/kit.tsx';
import { closeSheet, openSheet, SheetText, toast } from '../ui/overlay.tsx';
import { PowerBar, type PowerBarHandle } from '../ui/PowerBar.tsx';
import { ShotScene, type Mate, type ShotAnim, type ShotSceneHandle, type Target } from '../ui/ShotScene.tsx';

const KIND = { shot: 'Şut', pass: 'Pas', freekick: 'Serbest vuruş' } as const;
const SHOT_TEXT = { gol: 'GOL', kurtardi: 'Kaleci kurtardı', aut: 'Auta gitti', ust: 'Üstten auta' } as const;
const OUT = { goal: 'gol', saved: 'kurtardi', wide: 'aut', over: 'ust' } as const;
const SPOT: Record<Side, { x: number; y: number }> = { left: { x: 92, y: 330 }, right: { x: 300, y: 300 } };

/** Can is always the open teammate; the plan decides which side he is on. */
function matesFor(openSide: Side): Mate[] {
  const markedSide: Side = openSide === 'left' ? 'right' : 'left';
  return [{ name: 'Can', open: true, ...SPOT[openSide] }, { name: 'Mert', open: false, ...SPOT[markedSide] }];
}

/** Turns the engine's shot result (goal units ×1000) into the scene animation. */
function toAnim(o: Extract<ChanceOutcome, { x: number }>): ShotAnim {
  const fx = o.x / 1000, fy = Math.max(0.02, o.y / 1000);
  // The keeper reaches saved shots; otherwise he guessed the other side.
  const kx = o.outcome === 'saved' ? clamp(fx, -0.9, 0.9) : Math.abs(fx) < 0.18 ? (o.x % 2 ? 0.6 : -0.6) : fx > 0 ? -0.55 : 0.55;
  return { out: OUT[o.outcome], fx, fy, kx };
}

interface Card { good: boolean; title: string; desc: string; icon: IconName }

export default function Mac() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const match = useGame(s => s.match);
  const assisted = useGame(s => s.assisted);
  const scene = useRef<ShotSceneHandle>(null);
  const power = useRef<PowerBarHandle>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [ticker, setTicker] = useState<string | null>(null);
  const [line, setLine] = useState('');
  const [busy, setBusy] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [finishing, setFinishing] = useState<'no' | 'sending' | 'failed'>('no');
  const leaving = useRef(false);

  const moment = match ? match.plan.moments[match.i] : undefined;
  const forced = moment?.kind === 'freekick';
  const assistedNow = forced || assisted;

  // Coach line at the start of each moment.
  useEffect(() => {
    if (!moment || card) return;
    setLine(moment.kind === 'pass' ? 'Can boşta, Mert’in arkasında adam var. Boştakine dokun.'
      : forced ? 'Barajın üstünden. Kalede hedefe dokun, gücü yeşilde durdur.'
        : assisted ? 'Kalede bir yer seç, gücü yeşilde durdur.'
          : 'Topu kaleye doğru kaydır, köşeye vur. Kaleci erken yatıyor.');
  }, [moment, forced, assisted, card]);

  if (leaving.current) return null;
  if (!match && !card && finishing === 'no') return <Redirect href="/" />;

  const shoot = async (input: { tx: number; ty: number; power: number }) => {
    if (busy || !match) return;
    setBusy(true);
    const o = useGame.getState().play({
      chance: match.i,
      shot: {
        aim: Math.round(clamp(input.tx, -1, 1) * 1000),
        lift: Math.round(clamp(input.ty, 0, 1) * 1000),
        power: Math.round(clamp(input.power, 0, 1) * 1000),
      },
    });
    if (o.kind === 'pass') return;
    const res = toAnim(o);
    await scene.current?.animateShot(res);
    setTarget(null);
    const goal = o.outcome === 'goal';
    setCard({ good: goal, title: SHOT_TEXT[res.out], desc: goal ? 'Maç notu +1,0' : 'Maç notu −0,5', icon: goal ? 'ball' : 'x' });
    if (goal) { buzz('success'); setLine('İşte bu! Kafanı kaldır, devam.'); }
    else if (moment?.kind === 'shot' && !assisted) { setLine('Olur böyle. Kaydırmak zorsa yardımlı şutu aç, kimse bilmez.'); setNudge(true); }
    else setLine('Olur böyle. Sonrakine odaklan.');
  };

  const pass = async (mate: Mate) => {
    if (busy || !match || !moment?.openSide) return;
    setBusy(true);
    const side: Side = mate.open ? moment.openSide : moment.openSide === 'left' ? 'right' : 'left';
    const o = useGame.getState().play({ chance: match.i, pass: side });
    await scene.current?.animatePass(mate.x, mate.y);
    const ok = o.outcome === 'assist';
    setCard({
      good: ok, title: ok ? 'Asist' : 'Top kaybı', icon: ok ? 'check' : 'x',
      desc: ok ? 'Can golü attı · Not +0,7' : mate.open ? 'Pas kesildi · Not −0,3' : 'Mert markajdaydı · Not −0,3',
    });
    setLine(ok ? 'Gözün açık. Takım oyunu budur.' : mate.open ? 'Pas doğruydu, şanssızlık.' : 'Mert markajdaydı, Can boştaydı. Önce bak, sonra ver.');
  };

  const finish = async () => {
    setFinishing('sending');
    try {
      await useGame.getState().finishMatch();
      leaving.current = true;
      router.replace('/mac-sonu');
    } catch (e) {
      console.warn('match-finish failed', e);
      setFinishing('failed');
      toast('Maç sonucu gönderilemedi');
    }
  };

  const next = async () => {
    const n = useGame.getState().advance();
    setCard(null);
    for (const ev of n.events) {
      const m = useGame.getState().match!;
      const score = liveScore(m, ev.minute + 1);
      setTicker(`${ev.minute}'  Kartaltepe SK golü · YIL ${score.us} – ${score.them} KAR`);
      setLine('Gol yedik. Panik yok, fırsat gelecek.');
      await wait(1300);
      setTicker(null);
    }
    if (n.done) return finish();
    scene.current?.reset();
    setBusy(false);
  };

  const pause = () => openSheet(
    <>
      <H3>Maç duraklatıldı</H3>
      <SheetText>Kalan pozisyonları oynamazsan maç simüle edilir; o pozisyonlardan not ve gol gelmez.</SheetText>
      <Cta onPress={closeSheet}>Devam et</Cta>
      <Ghost onPress={() => { closeSheet(); setCard(null); setBusy(true); void finish(); }}>Maçı simüle et ve bitir</Ghost>
    </>,
  );

  const m = match;
  const minute = moment ? moment.minute : 90;
  const score = m ? liveScore(m, minute) : { us: 0, them: 0 };
  const total = m?.plan.moments.length ?? 3;
  const sceneH = Math.min((width * 560) / 390, height - 270 - insets.bottom);

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <View style={{ height: sceneH }}>
        {moment && (
          <ShotScene
            key={m?.i}
            ref={scene}
            mode={busy || card ? 'none' : moment.kind === 'pass' ? 'none' : assistedNow ? 'assisted' : 'swipe'}
            wall={forced}
            mates={moment.kind === 'pass' && moment.openSide && !card && !busy ? matesFor(moment.openSide) : undefined}
            onMate={pass}
            onTarget={setTarget}
            onSwipe={shoot}
            onShort={() => setLine('Daha uzun sür topu, kaleye kadar!')}
          />
        )}

        {/* Match HUD */}
        <View style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Duraklat" onPress={pause} disabled={finishing !== 'no'} style={{ width: 44, height: 44, borderRadius: 22, overflow: 'hidden' }}>
            <BlurView intensity={20} tint="dark" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(13,13,13,.6)' }}>
              <Icon name="pause" color={colors.g100} />
            </BlurView>
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ height: 40, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: 20, backgroundColor: 'rgba(13,13,13,.72)' }}>
              <T w={600} size={15}>YIL {score.us} – {score.them} KAR</T>
              <View style={{ width: 1, height: 16, backgroundColor: colors.g400 }} />
              <T w={600} size={15} color={colors.l600}>{minute}'</T>
            </View>
          </View>
          <View style={{ width: 44, flexDirection: 'row', gap: 5, justifyContent: 'center' }} accessibilityLabel={`Pozisyon ${Math.min((m?.i ?? total - 1) + 1, total)} / ${total}`}>
            {Array.from({ length: total }, (_, i) => (
              <View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i < (m?.i ?? total) ? colors.g200 : i === m?.i ? colors.l600 : 'rgba(255,255,255,.25)' }} />
            ))}
          </View>
        </View>

        {ticker && (
          <View accessibilityLiveRegion="polite" style={{ position: 'absolute', top: insets.top + 68, left: 16, right: 16, padding: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: 'rgba(13,13,13,.82)' }}>
            <T w={600} size={15}>{ticker}</T>
          </View>
        )}

        {card && <ResultCard card={card} />}
      </View>

      {/* Panel */}
      <View style={{ flex: 1, paddingTop: 18, paddingHorizontal: 20, paddingBottom: insets.bottom + 20, gap: 14 }}>
        {moment && finishing === 'no' && (
          <View>
            <Caps>Pozisyon {(m?.i ?? 0) + 1} · {KIND[moment.kind]}</Caps>
            <H3 style={{ marginTop: 4 }}>{MOMENT_TITLE[moment.kind]}</H3>
          </View>
        )}
        {finishing === 'no' ? <CoachLine text={line} /> : (
          <View style={{ gap: 6 }}>
            <Caps>Maç sonu</Caps>
            <H3>{finishing === 'sending' ? 'Sonuç hesaplanıyor…' : 'Sonuç gönderilemedi'}</H3>
          </View>
        )}

        {target && !card && !busy && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <PowerBar ref={power} key={`${target.tx},${target.ty}`} />
            <Cta style={{ width: 104, height: 48 }} onPress={() => { const p = power.current?.stop() ?? 0.5; void shoot({ ...target, power: p }); }}>Vur</Cta>
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 'auto' }}>
          {moment?.kind === 'shot' && !card && finishing === 'no' ? (
            <AssistToggle on={assisted} nudge={nudge} onPress={() => { if (busy) return; setTarget(null); setNudge(false); useGame.getState().setAssisted(!assisted); }} />
          ) : <View />}
          {card && finishing === 'no' && <Cta style={{ width: 150, height: 48 }} onPress={next}>Devam</Cta>}
          {finishing === 'failed' && <Cta style={{ width: 170, height: 48 }} onPress={finish}>Tekrar dene</Cta>}
        </View>
      </View>
    </View>
  );
}

function ResultCard({ card }: { card: Card }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.spring(a, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start(); }, [a]);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        accessibilityLiveRegion="polite"
        style={{ alignItems: 'center', paddingVertical: 18, paddingHorizontal: 26, borderRadius: 24, backgroundColor: 'rgba(13,13,13,.78)', opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name={card.icon} size={34} color={card.good ? colors.l600 : colors.bad} />
          <T w={700} size={card.good ? 44 : 30} color={card.good ? colors.l600 : colors.g100} style={{ letterSpacing: -0.8 }}>{card.title}</T>
        </View>
        <T w={600} size={15} color={card.good ? colors.l500 : colors.bad} style={{ marginTop: 6 }}>{card.desc}</T>
      </Animated.View>
    </View>
  );
}

function AssistToggle({ on, nudge, onPress }: { on: boolean; nudge: boolean; onPress(): void }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: on }} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
      <View style={{
        width: 44, height: 26, borderRadius: 13, backgroundColor: on ? colors.l600 : colors.s3, justifyContent: 'center', paddingHorizontal: 3,
        borderWidth: nudge ? 2 : 0, borderColor: 'rgba(207,253,92,.6)',
      }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: on ? colors.ink : colors.g100, alignSelf: on ? 'flex-end' : 'flex-start' }} />
      </View>
      <T w={500} size={14} color={colors.g200}>Yardımlı şut</T>
    </Pressable>
  );
}
