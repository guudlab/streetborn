import { TIMED_WINDOW as TIMED, TIMING_TARGET, type ChanceOutcome, type MomentKind, type Side, type Tactic } from '@streetborn/engine';
import { BlurView } from 'expo-blur';
import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, useWindowDimensions, View } from 'react-native';
import Reanimated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { duckMusic, preloadSfx, setAmbience, setMusic, sfx, type SfxId } from '../audio/audio.ts';
import { crestCode } from '../game/career.ts';
import { delta } from '../game/format.ts';
import { markHint, useHints } from '../game/hints.ts';
import { myLine } from '../game/live.ts';
import { clamp, MOMENT_TITLE } from '../game/rules.ts';
import { liveScore, useGame } from '../game/store.ts';
import { colors } from '../theme.ts';
import { Icon, type IconName } from '../ui/Icon.tsx';
import { buzz, Caps, Cta, Ghost, H3, T, wait } from '../ui/kit.tsx';
import { Bubble, Ico, type IconAsset } from '../ui/sade.tsx';
import { useShake } from '../ui/motion.tsx';
import { closeSheet, openSheet, SheetText, toast, useOverlay } from '../ui/overlay.tsx';
import { AssistToggle } from '../ui/AssistToggle.tsx';
import { DefenseScene, type DefenseSceneHandle } from '../ui/DefenseScene.tsx';
import { SkillBar, type SkillBarHandle } from '../ui/SkillBar.tsx';
import { SoundToggles } from '../ui/settings.tsx';
import { ShotScene, type Mate, type ShotAnim, type ShotSceneHandle, type Target } from '../ui/ShotScene.tsx';
import { t } from '../i18n/index.ts';
import { Commentary, feedLine, type FeedLine } from '../ui/live/Commentary.tsx';
import { Decision, Halftime } from '../ui/live/Picks.tsx';
import { Match3D } from '../match3d/Match3D.tsx';

const MOMENT_ICON: Record<MomentKind, IconAsset> = {
  shot: 'sut', pass: 'pas', freekick: 'sut', defense: 'oyuncuKosu', penalty: 'sut', decision: 'sut', halftime: 'sut',
};
const KIND: Record<MomentKind, string> = {
  shot: t('kind.shot'), pass: t('kind.pass'), freekick: t('kind.freekick'), defense: t('kind.defense'),
  penalty: t('kind.penalty'), decision: t('kind.decision'), halftime: t('kind.halftime'),
};
/** What the 2D scene plays: a decision becomes a shot or a pass, a penalty is a shot without the wall. */
type PlayKind = 'shot' | 'pass' | 'freekick' | 'defense' | 'penalty';
const SHOT_TEXT = { gol: t('match.shot.goal'), kurtardi: t('match.shot.saved'), aut: t('match.shot.wide'), ust: t('match.shot.over') } as const;
const OUT = { goal: 'gol', saved: 'kurtardi', wide: 'aut', over: 'ust' } as const;
/** What the ball hits, and how the crowd reacts. */
const IMPACT: Record<ShotAnim['out'], [SfxId, SfxId]> = {
  gol: ['net', 'crowd_cheer'], kurtardi: ['save', 'crowd_groan'], aut: ['crowd_groan', 'crowd_groan'], ust: ['crowd_groan', 'crowd_groan'],
};
const SPOT: Record<Side, { x: number; y: number }> = { left: { x: 92, y: 330 }, right: { x: 300, y: 300 } };

/** Can runs left, Mert right; the plan decides who is open. The player has to see the marker. */
const NAME: Record<Side, string> = { left: 'Can', right: 'Mert' };
function matesFor(openSide: Side): Mate[] {
  return (['left', 'right'] as const).map(side => ({ name: NAME[side], open: side === openSide, ...SPOT[side] }));
}
const otherSide = (s: Side): Side => (s === 'left' ? 'right' : 'left');

/** Turns the engine's shot result (goal units ×1000) into the scene animation. */
function toAnim(o: Extract<ChanceOutcome, { x: number }>): ShotAnim {
  const fx = o.x / 1000, fy = Math.max(0.02, o.y / 1000);
  // The keeper reaches saved shots; otherwise he guessed the other side.
  const kx = o.outcome === 'saved' ? clamp(fx, -0.9, 0.9) : Math.abs(fx) < 0.18 ? (o.x % 2 ? 0.6 : -0.6) : fx > 0 ? -0.55 : 0.55;
  return { out: OUT[o.outcome], fx, fy, kx };
}

interface Card { good: boolean; title: string; desc: string; icon: IconName }

/**
 * The match screen. The browser and the native WebView play the 3D halısaha (match3d/); when it fails
 * to start, or the browser has no WebGL, the 2D scenes below are used. `?mac2d` forces 2D. Both send the
 * same inputs to the same engine, so the result does not depend on which one ran.
 */
export default function Mac() {
  const insets = useSafeAreaInsets();
  const [three, setThree] = useState(can3d);
  const [why, setWhy] = useState('');
  if (!three) {
    // On the phone the reason for the fallback is shown until the native 3D match is proven on devices.
    return (
      <View style={{ flex: 1 }}>
        <Match2D />
        {Platform.OS !== 'web' && why ? <View pointerEvents="none" style={{ position: 'absolute', left: 8, right: 8, top: insets.top + 4, backgroundColor: 'rgba(0,0,0,.7)', padding: 4 }}><T size={11} color="#ff6666">{`3D: ${why}`}</T></View> : null}
      </View>
    );
  }
  return <Match3D onFail={(e) => { console.warn('3D match failed, using 2D', e); setWhy(String((e as Error)?.message ?? e).slice(0, 240)); setThree(false); }} />;
}

function can3d(): boolean {
  if (Platform.OS !== 'web') return true; // the WebView page reports its own failure through onFail
  if (/[?&]mac2d\b/.test(window.location.search)) return false;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    gl?.getExtension('WEBGL_lose_context')?.loseContext(); // only a probe: hand the context back
    return !!gl;
  } catch {
    return false;
  }
}

/** The 2D match: fallback when the 3D scene fails or WebGL is missing. */
function Match2D() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const match = useGame(s => s.match);
  const assisted = useGame(s => s.assisted);
  const tutorial = useGame(s => s.tutorial);
  const career = useGame(s => s.career);
  const mahalleName = useGame(s => s.mahalle?.name);
  const scene = useRef<ShotSceneHandle>(null);
  const duel = useRef<DefenseSceneHandle>(null);
  const bar = useRef<SkillBarHandle>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  // The live match: commentary up to the first moment, then between moments; pick screens for decisions and half-time.
  const [between, setBetween] = useState<{ from: number; to: number } | null>(() => (match ? { from: 0, to: match.plan.moments[0]!.minute } : null));
  const [clock, setClock] = useState(0);
  const [feed, setFeed] = useState<FeedLine[]>(() => [feedLine(0, t('live.kickoff'), 'info', 'whistle')]);
  const [pickMode, setPickMode] = useState<'decision' | 'halftime' | null>(null);
  const [playKind, setPlayKind] = useState<PlayKind | null>(null);
  const addLine = (l: FeedLine) => setFeed(f => [...f.slice(-30), l]);
  const sheetOpen = useOverlay(s => s.sheet !== null);
  const [line, setLine] = useState('');
  const [busy, setBusy] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [finishing, setFinishing] = useState<'no' | 'sending' | 'failed'>('no');
  const leaving = useRef(false);
  const impact = useShake(7);

  // Match atmosphere: crowd bed + match music, kick-off whistle. The tabs restore the menu loop.
  useEffect(() => {
    preloadSfx(['kick', 'kick_power', 'net', 'save', 'crowd_cheer', 'crowd_groan', 'whistle_end']);
    setMusic('match');
    setAmbience('crowd');
    sfx('whistle_start');
    return () => setAmbience(null);
  }, []);

  const moment = match ? match.plan.moments[match.i] : undefined;
  const shooting = playKind === 'shot' || playKind === 'freekick' || playKind === 'penalty';

  // Coach line at the start of each moment.
  useEffect(() => {
    if (!moment || card || !playKind) return;
    setLine(playKind === 'pass' ? t('match.coach.pass')
      : playKind === 'defense' ? t('match.coach.defense')
        : playKind === 'freekick' ? t('match.coach.freekick')
          : playKind === 'penalty' ? t('m3.coach.penalty')
            : assisted ? t('match.coach.assisted')
              : tutorial && match?.i === 0 ? t('match.coach.first')
                : t('match.coach.aim'));
  }, [moment, assisted, card, tutorial, match?.i, playKind]);

  if (leaving.current) return null;
  if (!match && !card && finishing === 'no') return <Redirect href="/" />;

  const shoot = async (aim: Target) => {
    if (busy || !match) return;
    const power = bar.current?.stop() ?? 0;
    setBusy(true);
    const o = useGame.getState().play({
      chance: match.i,
      shot: {
        aim: Math.round(clamp(aim.tx, -1, 1) * 1000),
        lift: Math.round(clamp(aim.ty, 0, 1) * 1000),
        ...(assisted ? { power: TIMING_TARGET, assisted: true } : { power }),
      },
    });
    if (o.kind !== 'shot' && o.kind !== 'freekick' && o.kind !== 'penalty') return;
    const res = toAnim(o);
    sfx(o.perfect ? 'kick_power' : 'kick');
    await scene.current?.animateShot(res);
    const [hit, crowd] = IMPACT[res.out];
    sfx(hit);
    if (hit !== crowd) sfx(crowd);
    setTarget(null);
    const goal = o.outcome === 'goal';
    const rated = goal ? t('match.goalDesc', { delta: delta(1) }) : t('match.missDesc', { delta: delta(-0.5) });
    setCard({ good: goal, title: SHOT_TEXT[res.out], desc: o.perfect ? t('match.perfectDesc', { rest: rated }) : rated, icon: goal ? 'ball' : 'x' });
    if (goal) { buzz('success'); impact.shake(); duckMusic(2400); setLine(o.perfect ? t('match.coach.perfect') : t('match.coach.goal')); }
    else if (o.outcome === 'saved' && Math.abs(o.x) < 400) setLine(t('match.coach.readByKeeper'));
    else if (!assisted && !o.perfect) { setLine(t('match.coach.missNudge')); setNudge(true); }
    else setLine(t('match.coach.miss'));
  };

  const pass = async (mate: Mate) => {
    if (busy || !match || !moment?.openSide) return;
    const timing = bar.current?.stop() ?? 0;
    setBusy(true);
    const side: Side = mate.open ? moment.openSide : otherSide(moment.openSide);
    const o = useGame.getState().play({ chance: match.i, pass: side, timing });
    const late = Math.abs(timing - TIMING_TARGET) > TIMED;
    sfx('kick');
    await scene.current?.animatePass(mate.x, mate.y);
    const ok = o.outcome === 'assist';
    if (ok) { sfx('net'); sfx('crowd_cheer', 0.7); duckMusic(2000); } else sfx('crowd_groan');
    setCard({
      good: ok, title: ok ? t('match.assist') : t('match.lostBall'), icon: ok ? 'check' : 'x',
      desc: ok ? t('match.assistDesc', { name: NAME[side], delta: delta(0.7) })
        : mate.open ? t('match.cutDesc', { delta: delta(-0.3) }) : t('match.markedDesc', { name: mate.name, delta: delta(-0.3) }),
    });
    setLine(ok ? t('match.coach.assistOk') : !mate.open ? t('match.coach.passMarked', { name: mate.name })
      : late ? t('match.coach.passLate') : t('match.coach.passUnlucky'));
  };

  const slide = async (dir: Side) => {
    if (busy || !match || !moment?.attackSide) return;
    const timing = bar.current?.stop() ?? 0;
    setBusy(true);
    const o = useGame.getState().play({ chance: match.i, defense: dir, timing });
    if (o.kind !== 'defense') return;
    sfx('kick');
    await duel.current?.animate(o.outcome, moment.attackSide, dir);
    const stopped = o.outcome === 'stopped';
    if (stopped) { sfx('crowd_cheer', 0.7); buzz('success'); } else sfx(o.outcome === 'conceded' ? 'net' : 'crowd_groan');
    setCard({
      good: o.outcome !== 'conceded', icon: stopped ? 'check' : o.outcome === 'conceded' ? 'x' : 'check',
      title: t(`match.defense.${o.outcome}`),
      desc: stopped ? t('match.defense.stoppedDesc', { delta: delta(0.5) }) : t(`match.defense.${o.outcome}Desc`),
    });
    const late = Math.abs(timing - TIMING_TARGET) > TIMED;
    setLine(stopped ? t('match.coach.stopped') : dir !== moment.attackSide ? t('match.coach.wrongSide') : late ? t('match.coach.slideLate') : t('match.coach.beaten'));
  };

  const finish = async () => {
    setFinishing('sending');
    sfx('whistle_end');
    setAmbience(null);
    try {
      await useGame.getState().finishMatch();
      leaving.current = true;
      router.replace('/mac-sonu');
    } catch (e) {
      console.warn('match-finish failed', e);
      setFinishing('failed');
      toast(t('match.sendFailed'), 'error');
    }
  };

  /** Starts the current moment: a pick screen, or the scene. */
  const begin = () => {
    const m = useGame.getState().match;
    if (!m) return;
    const mo = m.plan.moments[m.i]!;
    if (mo.kind === 'halftime' || mo.kind === 'decision') { setPickMode(mo.kind); return; }
    play(mo.kind);
  };
  const play = (kind: PlayKind) => {
    scene.current?.reset();
    setPlayKind(kind);
    setBusy(false);
  };

  /** After a moment: its line in the feed, then the commentary runs on. */
  const next = () => {
    const m = useGame.getState().match!;
    const mo = m.plan.moments[m.i]!;
    if (mo.kind !== 'halftime') {
      const o = m.outcomes[m.i] ?? null;
      const good = !!o && (o.outcome === 'goal' || o.outcome === 'assist' || o.outcome === 'stopped');
      addLine(feedLine(mo.minute, myLine(o, mo, NAME[mo.openSide ?? 'left']), good ? 'me' : 'info', good ? 'star' : 'x'));
    }
    const n = useGame.getState().advance();
    setCard(null);
    setPlayKind(null);
    setBetween({ from: n.from, to: n.to });
  };

  const arrive = () => {
    const m = useGame.getState().match;
    setBetween(null);
    if (!m || m.i >= m.plan.moments.length) {
      addLine(feedLine(90, t('live.fulltime'), 'info', 'whistle'));
      setBusy(true);
      void finish();
      return;
    }
    begin();
  };

  const halftime = (tactic: Tactic | null) => {
    const m = useGame.getState().match;
    if (!m) return;
    if (tactic) useGame.getState().play({ chance: m.i, tactic });
    setPickMode(null);
    addLine(feedLine(45, t('live.halftime'), 'info', 'whistle'));
    addLine(feedLine(46, t('live.secondHalf'), 'info', 'whistle'));
    next();
  };

  const pause = () => openSheet(
    <>
      <H3>{t('match.pauseTitle')}</H3>
      <SheetText>{t('match.pauseText')}</SheetText>
      <SoundToggles />
      <Cta onPress={closeSheet}>{t('match.resume')}</Cta>
      <Ghost onPress={() => { closeSheet(); setCard(null); setBetween(null); setPickMode(null); setBusy(true); void finish(); }}>{t('match.simulate')}</Ghost>
    </>,
  );

  const m = match;
  const minute = between ? clock : moment ? moment.minute : 90;
  const score = m ? liveScore(m, between ? clock + 1 : minute) : { us: 0, them: 0 };
  const total = m?.plan.moments.length ?? 3;
  // Fixture matches name the real sides: the club in the league, the mahalle in a mahalle match.
  const homeName = m?.kind === 'league' ? career?.contract?.clubName : m?.kind === 'mahalle' ? mahalleName : undefined;
  const homeCode = homeName ? crestCode(homeName) : t('club.home.code');
  const awayCode = m?.opponentName ? crestCode(m.opponentName) : t('club.away.code');
  const sceneH = Math.min((width * 560) / 390, height - 270 - insets.bottom);

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <Reanimated.View style={[{ height: sceneH }, impact.style]}>
        {playKind === 'defense' && moment?.attackSide ? (
          <DefenseScene key={m?.i} ref={duel} attackSide={moment.attackSide} />
        ) : moment && (
          <ShotScene
            key={m?.i}
            ref={scene}
            mode={busy || card || !shooting ? 'none' : 'aim'}
            wall={playKind === 'freekick'}
            mates={playKind === 'pass' && moment.openSide && !card && !busy ? matesFor(moment.openSide) : undefined}
            onMate={pass}
            onTarget={setTarget}
          />
        )}

        {/* Match HUD */}
        <View style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('match.pause')} onPress={pause} disabled={finishing !== 'no'} style={{ width: 44, height: 44, borderRadius: 22, overflow: 'hidden' }}>
            <BlurView intensity={20} tint="dark" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(13,13,13,.6)' }}>
              <Icon name="pause" color={colors.g100} />
            </BlurView>
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ height: 40, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: 20, backgroundColor: 'rgba(13,13,13,.72)' }}>
              <T w={600} size={15}>{homeCode} {score.us} – {score.them} {awayCode}</T>
              <View style={{ width: 1, height: 16, backgroundColor: colors.g400 }} />
              <T w={600} size={15} color={colors.l600}>{minute}'</T>
            </View>
          </View>
          <View style={{ width: 44, flexDirection: 'row', gap: 5, justifyContent: 'center' }} accessibilityLabel={t('match.momentA11y', { i: Math.min((m?.i ?? total - 1) + 1, total), n: total })}>
            {Array.from({ length: total }, (_, i) => (
              <View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i < (m?.i ?? total) ? colors.g200 : i === m?.i ? colors.l600 : 'rgba(255,255,255,.25)' }} />
            ))}
          </View>
        </View>

        {card && <ResultCard card={card} />}
      </Reanimated.View>

      {/* Panel */}
      <View style={{ flex: 1, paddingTop: 18, paddingHorizontal: 20, paddingBottom: insets.bottom + 20, gap: 14 }}>
        {moment && playKind && finishing === 'no' && (
          <View accessible accessibilityLabel={t('match.moment', { i: (m?.i ?? 0) + 1, kind: KIND[moment.kind] })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ico name={MOMENT_ICON[moment.kind]} size={40} />
            <H3>{MOMENT_TITLE[moment.kind]}</H3>
          </View>
        )}
        {finishing === 'no' ? (line ? <Bubble text={line} size={36} /> : null) : (
          <View style={{ gap: 6 }}>
            <Caps>{t('match.end')}</Caps>
            <H3>{finishing === 'sending' ? t('match.calculating') : t('match.notSent')}</H3>
          </View>
        )}

        {/* One timing bar per moment, keyed so it restarts on the next one. */}
        {shooting && target && !card && !busy && (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
            <SkillBar key={`shot${m?.i}${assisted}`} ref={bar} locked={assisted} label={t('match.bar.power')} hint={assisted ? t('match.bar.assisted') : t('match.bar.perfectShot')} />
            <Cta style={{ width: 104, height: 48, minHeight: 48 }} onPress={() => void shoot(target)}>{t('match.shoot')}</Cta>
          </View>
        )}
        {playKind === 'pass' && !card && !busy && finishing === 'no' && (
          <SkillBar key={`pass${m?.i}`} ref={bar} label={t('match.bar.pass')} hint={t('match.bar.passHint')} />
        )}
        {playKind === 'defense' && !card && !busy && finishing === 'no' && (
          <View style={{ gap: 12 }}>
            <SkillBar key={`def${m?.i}`} ref={bar} speed={1.1} label={t('match.bar.slide')} hint={t('match.bar.slideHint')} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <SlideButton dir="left" onPress={() => void slide('left')} />
              <SlideButton dir="right" onPress={() => void slide('right')} />
            </View>
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 'auto' }}>
          {shooting && !card && finishing === 'no' ? (
            <AssistToggle on={assisted} nudge={nudge} onPress={() => { if (busy) return; setTarget(null); setNudge(false); useGame.getState().setAssisted(!assisted); }} />
          ) : <View />}
          {card && finishing === 'no' && <Cta style={{ width: 150, height: 48, minHeight: 48 }} onPress={next}>{t('common.continue')}</Cta>}
          {finishing === 'failed' && <Cta style={{ width: 170, height: 48, minHeight: 48 }} onPress={finish}>{t('match.retry')}</Cta>}
        </View>
      </View>

      {/* The live match between moments; the score row above stays visible. */}
      {m && finishing === 'no' && (between || pickMode) && (
        <View style={{ position: 'absolute', top: insets.top + 60, left: 0, right: 0, bottom: 0, paddingTop: 8, paddingBottom: insets.bottom + 20, paddingHorizontal: 16, backgroundColor: colors.ink }}>
          {between ? (
            <Commentary
              key={`${between.from}-${between.to}`} match={m} from={between.from} to={between.to}
              next={m.plan.moments[m.i] ?? null} feed={feed} paused={sheetOpen}
              onLine={addLine} onClock={setClock} onArrive={arrive}
            />
          ) : pickMode === 'halftime' ? (
            <Halftime us={score.us} them={score.them} onPick={halftime} />
          ) : moment ? (
            <Decision
              key={m.i} moment={moment} mate={NAME[moment.openSide ?? 'left']} first={!useHints.getState().seen.liveDecide}
              onPick={k => { markHint('liveDecide'); setPickMode(null); play(k); }}
            />
          ) : null}
        </View>
      )}
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

function SlideButton({ dir, onPress }: { dir: Side; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => ({
        flex: 1, height: 56, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: pressed ? colors.l600 : colors.s2,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      })}
    >
      {({ pressed }) => (
        <>
          {dir === 'left' && <Icon name="back" size={20} color={pressed ? colors.ink : colors.g100} />}
          <T w={600} size={17} color={pressed ? colors.ink : colors.g100}>{dir === 'left' ? t('match.slideLeft') : t('match.slideRight')}</T>
          {dir === 'right' && <Icon name="chev" size={20} color={pressed ? colors.ink : colors.g100} />}
        </>
      )}
    </Pressable>
  );
}
