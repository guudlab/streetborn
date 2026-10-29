import { skippedDefense, TIMED_WINDOW, TIMING_TARGET, type Moment, type Side } from '@streetborn/engine';
import { BlurView } from 'expo-blur';
import { Redirect, router } from 'expo-router';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { duckMusic, preloadSfx, setAmbience, setMusic, sfx } from '../audio/audio.ts';
import { crestCode } from '../game/career.ts';
import { DEFAULT_CHARACTER, HERO_MODEL, JERSEYS, jerseyTint, STARTERS, type Hero } from '../game/character.ts';
import { markHint, useHints } from '../game/hints.ts';
import type { HowToKind } from '../game/rules.ts';
import { liveScore, useGame } from '../game/store.ts';
import { colors } from '../theme.ts';
import { AssistToggle } from '../ui/AssistToggle.tsx';
import { HowTo } from '../ui/drills/HowTo.tsx';
import { Icon } from '../ui/Icon.tsx';
import { Caps, Cta, Ghost, H3, T, wait } from '../ui/kit.tsx';
import { kitTinter, loadMatchScene, loadModel } from '../ui/Model3D.tsx';
import { closeSheet, openSheet, SheetText, toast, useOverlay } from '../ui/overlay.tsx';
import { Bubble } from '../ui/sade.tsx';
import { SoundToggles } from '../ui/settings.tsx';
import { t, type Key } from '../i18n/index.ts';
import { assembleG } from './assemble.ts';
import type { SceneBridge } from './bridgeTypes.ts';
import { NativeSceneView } from './nativeScene';
import { RingButton, type RingHandle } from './RingButton.tsx';
import type { DefenseGrade, Gltf, MatchEnv, MatchScene, SceneResult, ScenePhase, ShotGrade } from './scene.d.ts';

// The 3D match screen (web, and iOS/Android through a WebView). The scene (scene.js) acts each moment out; this screen
// owns the HUD and the engine: it sends the player's input to the engine through the
// store, then tells the scene the outcome. The scene never decides anything.

const MODELS = {
  keeper: require('../../assets/models/mac/keeper.glb'),
  rival: require('../../assets/models/mac/rival.glb'),
  // their other players (Meshy R1-R3, lime kit; the scene puts them in graphite): G.opps
  opp0: require('../../assets/models/mac/rival2.glb'),
  opp1: require('../../assets/models/mac/rival3.glb'),
  opp2: require('../../assets/models/mac/rival4.glb'),
  ball: require('../../assets/models/ball.glb'),
  'anim-street-idle': require('../../assets/models/mac/anim-street-idle.glb'),
  'anim-kick': require('../../assets/models/mac/anim-kick.glb'),
  'anim-cheer': require('../../assets/models/mac/anim-cheer.glb'),
  'anim-run': require('../../assets/models/mac/anim-run.glb'),
  'anim-slide': require('../../assets/models/mac/anim-slide.glb'),
  'anim-leap': require('../../assets/models/mac/anim-leap.glb'),
  // the crowd (Meshy T1-T4): G.fans
  fan0: require('../../assets/models/mac/fan1.glb'),
  fan1: require('../../assets/models/mac/fan2.glb'),
  fan2: require('../../assets/models/mac/fan3.glb'),
  fan3: require('../../assets/models/mac/fan4.glb'),
  stand: require('../../assets/models/mac/stand.glb'),
  floodlight: require('../../assets/models/mac/floodlight.glb'),
} as const;

/** Our two teammates in pass moments: the starters the player did not pick. */
const matesOf = (hero: Hero) => STARTERS.filter(h => h !== hero).slice(0, 2);

/** Every file the 3D match loads, so the hub can fetch them before kick-off. */
export const matchModels = (hero: Hero) => [HERO_MODEL[hero], ...matesOf(hero).map(h => HERO_MODEL[h]), ...Object.values(MODELS)];

/** Can stands on the left, Mert on the right, as in the 2D match. */
const NAME: Record<Side, string> = { left: 'Can', right: 'Mert' };

type Dot = 'good' | 'bad' | 'meh';
type Tone = 'lime' | 'white' | 'red' | 'muted';
const TONE: Record<Tone, string> = { lime: colors.l600, white: colors.g100, red: colors.bad, muted: colors.g200 };
const SHOT_GRADE: Record<ShotGrade, Tone> = { perfect: 'lime', good: 'white', over: 'red', weak: 'muted' };

const BANNER: Record<Moment['kind'], Key> = { shot: 'm3.banner.shot', freekick: 'm3.banner.freekick', pass: 'm3.banner.pass', defense: 'm3.banner.defense' };

interface Pop { text: string; tone: Tone; id: number }

export function Match3D({ onFail }: { onFail(e: unknown): void }) {
  const insets = useSafeAreaInsets();
  const match = useGame(s => s.match);
  const assisted = useGame(s => s.assisted);
  const career = useGame(s => s.career);
  const mahalleName = useGame(s => s.mahalle?.name);
  const sheetOpen = useOverlay(s => s.sheet !== null);

  const host = useRef<React.ComponentRef<typeof View>>(null);
  const scene = useRef<MatchScene | null>(null);
  const shootRing = useRef<RingHandle>(null);
  const leftRing = useRef<RingHandle>(null);
  const rightRing = useRef<RingHandle>(null);
  // The moment the player already acted in: one input per moment, however fast the taps.
  const acted = useRef(-1);
  const lastTiming = useRef(0);
  const lastSide = useRef<Side | null>(null);
  const leaving = useRef(false);
  // The whistle went (or the player simulated the rest): no more moments or inputs.
  const ended = useRef(false);

  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<ScenePhase>('menu');
  const [aimed, setAimed] = useState(false);
  const [dots, setDots] = useState<Dot[]>([]);
  const [banner, setBanner] = useState<{ text: string; def: boolean; id: number } | null>(null);
  const [coach, setCoach] = useState<{ text: string; id: number } | null>(null);
  const [big, setBig] = useState<Pop | null>(null);
  const [grade, setGrade] = useState<Pop | null>(null);
  const [ticker, setTicker] = useState<string | null>(null);
  const [nudge, setNudge] = useState(false);
  const [finishing, setFinishing] = useState<'no' | 'sending' | 'failed'>('no');
  const [demo, setDemo] = useState<HowToKind | null>(null);

  const say = useCallback((key: Key, vars?: Record<string, string | number>) => setCoach({ text: t(key, vars), id: Date.now() }), []);
  const pop = useCallback((key: Key, tone: Tone) => setBig({ text: t(key), tone, id: Date.now() }), []);
  const mark = useCallback((i: number, d: Dot) => setDots(prev => { const n = prev.slice(); n[i] = d; return n; }), []);

  // Match atmosphere: crowd bed + match music. The scene blows the whistle for each moment.
  useEffect(() => {
    preloadSfx(['kick', 'kick_power', 'net', 'post', 'save', 'crowd_cheer', 'crowd_groan', 'whistle_start', 'whistle_end']);
    setMusic('match');
    setAmbience('crowd');
    return () => setAmbience(null);
  }, []);

  // Any sheet (pause, settings) stops the game clock.
  useEffect(() => { scene.current?.setPaused(sheetOpen || ended.current); }, [sheetOpen]);

  const finish = useCallback(async () => {
    ended.current = true;
    scene.current?.setPaused(true);
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
  }, []);

  /** Starts the store's current moment in the scene. */
  const begin = useCallback(() => {
    const m = useGame.getState().match;
    const sc = scene.current;
    if (!m || !sc) return;
    const mo = m.plan.moments[m.i]!;
    // The first shot, pass and defense moment of a player's life opens with a short hand demo.
    const howto: HowToKind = mo.kind === 'pass' ? 'mPass' : mo.kind === 'defense' ? 'mDefense' : 'mShot';
    if (!useHints.getState().seen[`howto_${howto}`]) {
      sc.setPaused(true);
      setDemo(howto);
      return;
    }
    acted.current = -1; lastSide.current = null; lastTiming.current = 0;
    setAimed(false); setNudge(false);
    setBanner({ text: t(BANNER[mo.kind], { minute: mo.minute }), def: mo.kind === 'defense', id: Date.now() });
    const shots = m.plan.moments.slice(0, m.i).filter(x => x.kind === 'shot').length;
    if (mo.kind === 'defense') say('m3.coach.defense');
    else if (mo.kind === 'pass') say('m3.coach.pass');
    else if (mo.kind === 'freekick') say('m3.coach.freekick');
    else if (useGame.getState().assisted) say('match.coach.assisted');
    else say(m.i === 0 ? 'm3.coach.first' : shots % 3 === 0 ? 'm3.coach.shot' : 'm3.coach.angle');
    sc.start({
      kind: mo.kind, attackSide: mo.attackSide, openSide: mo.openSide,
      skip: mo.kind === 'defense' ? skippedDefense(m.setup, m.i) : undefined,
    });
  }, [say]);

  const next = useCallback(async () => {
    if (ended.current) return;
    const n = useGame.getState().advance();
    for (const ev of n.events) {
      const m = useGame.getState().match!;
      const score = liveScore(m, ev.minute + 1);
      setTicker(t('match.ticker', { minute: ev.minute, us: score.us, them: score.them }));
      say('match.coach.conceded');
      sfx('crowd_groan');
      await wait(1300);
      setTicker(null);
    }
    if (n.done) return finish();
    if (!ended.current) begin();
  }, [begin, finish, say]);

  const onResult = useCallback((r: SceneResult) => {
    const m = useGame.getState().match;
    if (!m) return;
    const i = m.i;
    if (r.kind === 'stopped') {
      pop('m3.big.stopped', 'lime'); mark(i, 'good');
      say(Math.abs(lastTiming.current - TIMING_TARGET) <= TIMED_WINDOW ? 'm3.coach.stoppedTimed' : 'm3.coach.stoppedLucky');
    } else if (r.kind === 'lost') {
      pop('m3.big.lost', 'red'); mark(i, 'bad');
      if (r.marked) say('m3.coach.passMarked', { name: NAME[lastSide.current ?? 'left'] });
      else say('m3.coach.passLost');
    } else if (r.by === 'mate') {
      pop('m3.big.assist', 'lime'); mark(i, 'good'); duckMusic(2000);
      say('m3.coach.assist', { name: NAME[lastSide.current ?? 'left'] });
    } else if (r.by === 'us') {
      mark(i, r.kind === 'goal' ? 'good' : 'bad');
      if (r.kind === 'goal') { pop('m3.big.goal', 'lime'); duckMusic(2400); say(r.perfect ? 'm3.coach.goalPerfect' : 'm3.coach.goal'); }
      else if (r.kind === 'save') { pop('m3.big.save', 'white'); say(r.central ? 'm3.coach.saveCentral' : 'm3.coach.saveTiming'); }
      else if (r.kind === 'post') { pop('m3.big.post', 'white'); say('m3.coach.post'); }
      else { pop('m3.big.miss', 'red'); say(r.q === 'over' ? 'm3.coach.missOver' : 'm3.coach.miss'); }
      if (r.kind !== 'goal' && !useGame.getState().assisted && r.q !== 'perfect') setNudge(true);
    } else {
      // their forward got past: the engine already said whether he scores
      const mo = m.plan.moments[i]!;
      mark(i, r.kind === 'goal' ? 'bad' : 'meh');
      if (r.kind === 'goal') {
        pop('m3.big.conceded', 'red');
        const side = lastSide.current, timing = lastTiming.current;
        if (!side) say('m3.coach.skipped');
        else if (side !== mo.attackSide) say('m3.coach.wrongSide');
        else if (timing < TIMING_TARGET - TIMED_WINDOW) say('m3.coach.early');
        else if (timing > TIMING_TARGET + TIMED_WINDOW) say('m3.coach.late');
        else say('m3.coach.beaten');
      } else if (r.kind === 'save') { pop('m3.big.keeper', 'white'); say('m3.coach.theirSave'); }
      else if (r.kind === 'post') { pop('m3.big.post', 'white'); say('m3.coach.theirPost'); }
      else { pop('m3.big.miss', 'white'); say(lastSide.current ? 'm3.coach.theirMiss' : 'm3.coach.skipped'); }
    }
  }, [mark, pop, say]);

  // Load the models, build the scene, kick off. Once: the scene lives as long as the screen.
  // The browser draws into a canvas here; iOS and Android host the same scene in a WebView
  // (nativeScene.native.tsx), which hands over its bridge once its page is ready.
  const handlers = useRef({ next, onResult });
  handlers.current = { next, onResult };
  const [bridge, setBridge] = useState<SceneBridge | null>(null);
  useEffect(() => {
    const native = Platform.OS !== 'web';
    const el = host.current as unknown as HTMLElement | null;
    if (native ? !bridge : !el) return;
    let cancelled = false;
    let sc: MatchScene | null = null;
    void (async () => {
      const s = useGame.getState();
      const ch = s.character ?? DEFAULT_CHARACTER;
      const files: [string, number][] = [
        ['hero', HERO_MODEL[ch.hero]],
        ...matesOf(ch.hero).map((h, i): [string, number] => [`mate${i}`, HERO_MODEL[h]]),
        ...Object.entries(MODELS),
      ];
      const tint = jerseyTint(ch.jersey);
      const kind = s.match?.kind;
      const board = ((kind === 'league' ? s.career?.contract?.clubName : s.mahalle?.name) ?? t('club.home')).toLocaleUpperCase('tr');
      const away = s.match?.opponentName?.toLocaleUpperCase('tr');
      const kit = JERSEYS.find(j => j.key === ch.jersey)?.color ?? colors.l600;
      const on: MatchEnv['on'] = {
        phase: setPhase,
        aimed: () => setAimed(true),
        ring: (p) => { leftRing.current?.set(p); rightRing.current?.set(p); },
        grade: (q: ShotGrade | DefenseGrade) => {
          const tone: Tone = q in SHOT_GRADE ? SHOT_GRADE[q as ShotGrade] : q === 'perfect' || q === 'timed' ? 'lime' : 'muted';
          setGrade({ text: t(`m3.grade.${q}` as Key), tone, id: Date.now() });
        },
        result: (r) => handlers.current.onResult(r),
        skipped: () => { const m = useGame.getState().match; if (m) useGame.getState().skip(m.i); },
        done: () => { void handlers.current.next(); },
      };
      if (native) {
        sc = await bridge!.start({ keys: files.map(f => f[0]), tint, board, kit, away }, files, setProgress, { on, sfx: (id, gain) => sfx(id, gain) });
      } else {
        let n = 0;
        const [parsed, createMatch, tinter] = await Promise.all([
          Promise.all(files.map(async ([k, f]) => { const g = await loadModel(f); setProgress(++n / files.length); return [k, g] as const; })),
          loadMatchScene(),
          kitTinter(),
        ]);
        if (cancelled) return;
        sc = createMatch({
          host: el!, G: assembleG(Object.fromEntries(parsed)), board, kit, away,
          tint: (root, t) => tinter(root, t === undefined ? tint : t),
          sfx: (id, gain) => sfx(id, gain),
          on,
        });
        (window as unknown as { __match3d?: MatchScene }).__match3d = sc; // test hook (sim)
      }
      scene.current = sc;
      // The loading bar stays up while the shaders compile, so no frame stalls mid-match.
      await sc.ready;
      if (cancelled) return;
      setReady(true);
      begin();
    })().catch((e: unknown) => { if (!cancelled) onFail(e); });
    return () => { cancelled = true; sc?.dispose(); bridge?.dispose(); scene.current = null; };
  }, [bridge]); // eslint-disable-line react-hooks/exhaustive-deps

  const moment = match ? match.plan.moments[match.i] : undefined;
  const live = !!moment && finishing === 'no';

  // --- inputs: each goes to the engine first, then the scene acts out the outcome
  const shoot = useCallback((power: number) => {
    const m = useGame.getState().match, sc = scene.current;
    if (!m || !sc || ended.current || sc.phase() !== 'aim' || acted.current === m.i) return;
    acted.current = m.i;
    sc.setCharging(false);
    const helped = useGame.getState().assisted;
    const { aim, lift } = sc.aim();
    const o = useGame.getState().play({
      chance: m.i,
      shot: { aim, lift, ...(helped ? { power: TIMING_TARGET, assisted: true } : { power: Math.round(power * 1000) }) },
    });
    if (o.kind !== 'shot' && o.kind !== 'freekick') return;
    setNudge(false);
    sc.shoot({ power: helped ? TIMING_TARGET / 1000 : power, outcome: o.outcome, x: o.x, y: o.y, perfect: !!o.perfect, assisted: helped });
  }, []);

  const pass = useCallback((side: Side) => {
    const m = useGame.getState().match, sc = scene.current;
    if (!m || !sc || ended.current || sc.phase() !== 'pass' || acted.current === m.i) return;
    acted.current = m.i;
    const timing = sc.timing();
    lastSide.current = side; lastTiming.current = timing;
    const o = useGame.getState().play({ chance: m.i, pass: side, timing });
    if (o.kind !== 'pass') return;
    sc.passTo(side, o.outcome);
  }, []);

  const slide = useCallback((side: Side) => {
    const m = useGame.getState().match, sc = scene.current;
    if (!m || !sc || ended.current || sc.phase() !== 'defend' || acted.current === m.i) return;
    acted.current = m.i;
    const timing = sc.timing();
    lastSide.current = side; lastTiming.current = timing;
    const o = useGame.getState().play({ chance: m.i, defense: side, timing });
    if (o.kind !== 'defense') return;
    sc.tackle(side === 'right' ? 1 : -1, timing, o.outcome);
  }, []);

  // Keyboard on the web: space charges the shot, arrows slide or pass.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const down = (e: KeyboardEvent) => {
      const k = useGame.getState().match?.plan.moments[useGame.getState().match!.i]?.kind;
      if (e.code === 'Space' && !e.repeat && (k === 'shot' || k === 'freekick')) { e.preventDefault(); shootRing.current?.press(); }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        const side: Side = e.code === 'ArrowLeft' ? 'left' : 'right';
        if (k === 'defense') slide(side); else if (k === 'pass') pass(side);
      }
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') shootRing.current?.release(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [pass, slide]);

  const pause = () => openSheet(
    <>
      <H3>{t('match.pauseTitle')}</H3>
      <SheetText>{t('match.pauseText')}</SheetText>
      <SoundToggles />
      <Cta onPress={closeSheet}>{t('match.resume')}</Cta>
      <Ghost onPress={() => { closeSheet(); void finish(); }}>{t('match.simulate')}</Ghost>
    </>,
  );

  if (leaving.current) return null;
  if (!match && finishing === 'no') return <Redirect href="/" />;

  const m = match;
  const minute = moment ? moment.minute : 90;
  const score = m ? liveScore(m, minute) : { us: 0, them: 0 };
  const homeName = m?.kind === 'league' ? career?.contract?.clubName : m?.kind === 'mahalle' ? mahalleName : undefined;
  const homeCode = homeName ? crestCode(homeName) : t('club.home.code');
  const awayCode = m?.opponentName ? crestCode(m.opponentName) : t('club.away.code');
  const shooting = moment?.kind === 'shot' || moment?.kind === 'freekick';
  const hint = !live ? '' : phase === 'aim' ? (assisted ? t('m3.hint.assisted') : aimed ? t('m3.hint.charge') : t('m3.hint.aim'))
    : phase === 'pass' ? t('m3.hint.pass') : phase === 'defend' ? t('m3.hint.defend') : '';

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, overflow: 'hidden' }}>
      <View ref={host} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        {Platform.OS !== 'web' && <NativeSceneView onBridge={setBridge} onFail={onFail} />}
      </View>

      {/* HUD: the canvas under it still gets the taps that aim */}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 20, paddingHorizontal: 16 }}>
        <View pointerEvents="box-none" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('match.pause')} onPress={pause} disabled={finishing !== 'no' || !ready} style={{ width: 44, height: 44, borderRadius: 22, overflow: 'hidden' }}>
            <BlurView intensity={20} tint="dark" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(13,13,13,.6)' }}>
              <Icon name="pause" color={colors.g100} />
            </BlurView>
          </Pressable>
          <View pointerEvents="none" style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ height: 40, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: 20, backgroundColor: 'rgba(21,21,21,.78)', borderWidth: 1, borderColor: 'rgba(255,255,255,.08)' }}>
              <T w={700} size={15} color={colors.l600}>{homeCode}</T>
              <T w={700} size={19}>{score.us} – {score.them}</T>
              <T w={700} size={15} color={colors.g200}>{awayCode}</T>
              <View style={{ width: 1, height: 16, backgroundColor: colors.g400 }} />
              <T w={600} size={15} color={colors.l600}>{minute}'</T>
            </View>
          </View>
          <View style={{ width: 44 }} />
        </View>

        {m && (
          <View pointerEvents="none" accessibilityLabel={t('match.momentA11y', { i: Math.min(m.i + 1, m.plan.moments.length), n: m.plan.moments.length })} style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10 }}>
            {m.plan.moments.map((mo, i) => {
              const d = dots[i];
              const now = i === m.i && !d;
              return (
                <View key={i} style={{
                  width: now ? 22 : 10, height: 10, borderRadius: 5,
                  backgroundColor: d === 'good' ? colors.l600 : d === 'bad' ? colors.bad : d === 'meh' ? '#6B6F66' : now ? (mo.kind === 'defense' ? colors.bad : colors.g100) : 'rgba(255,255,255,.16)',
                }} />
              );
            })}
          </View>
        )}

        {banner && <Banner key={banner.id} text={banner.text} def={banner.def} />}
        {coach && live && <Coach key={coach.id} text={coach.text} />}

        {ticker && (
          <View accessibilityLiveRegion="polite" style={{ marginTop: 10, padding: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: 'rgba(13,13,13,.82)' }}>
            <T w={600} size={15}>{ticker}</T>
          </View>
        )}

        <View pointerEvents="none" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {big && <BigText key={big.id} pop={big} />}
          {grade && <GradePop key={grade.id} pop={grade} />}
        </View>

        {/* Controls: one area, the buttons of the current moment */}
        <View pointerEvents="box-none" style={{ alignItems: 'center', gap: 10, minHeight: 172, justifyContent: 'flex-end' }}>
          {hint ? (
            <View pointerEvents="none" style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(13,13,13,.55)' }}>
              <T w={600} size={13} color={colors.g200}>{hint}</T>
            </View>
          ) : null}
          {live && ready && shooting && (
            <RingButton
              ref={shootRing} mode={assisted ? 'tap' : 'charge'} enabled={phase === 'aim'}
              label={assisted ? t('m3.shootAssistedA11y') : t('m3.shootA11y')}
              onCharge={() => scene.current?.setCharging(true)} onFire={shoot}
            >
              <T w={700} size={24} color={colors.ink} style={{ fontStyle: 'italic' }}>{t('m3.shoot')}</T>
            </RingButton>
          )}
          {live && ready && (moment.kind === 'defense' || moment.kind === 'pass') && (
            <View style={{ flexDirection: 'row', gap: 28 }}>
              {(['left', 'right'] as const).map(side => (
                <RingButton
                  key={side} ref={side === 'left' ? leftRing : rightRing} mode="tap" size={116} dark
                  enabled={phase === (moment.kind === 'defense' ? 'defend' : 'pass')}
                  label={moment.kind === 'defense' ? t(side === 'left' ? 'm3.leftA11y' : 'm3.rightA11y') : t('m3.passA11y', { name: NAME[side] })}
                  onFire={() => (moment.kind === 'defense' ? slide(side) : pass(side))}
                >
                  {moment.kind === 'defense' && <Icon name={side === 'left' ? 'back' : 'chev'} size={26} color={colors.g100} />}
                  <T w={700} size={18}>{moment.kind === 'defense' ? t(side === 'left' ? 'm3.left' : 'm3.right') : NAME[side].toLocaleUpperCase('tr')}</T>
                </RingButton>
              ))}
            </View>
          )}
          {live && ready && shooting && (
            <View style={{ alignSelf: 'flex-start' }}>
              <AssistToggle on={assisted} nudge={nudge} onPress={() => { if (phase !== 'aim' && phase !== 'intro') return; setNudge(false); useGame.getState().setAssisted(!assisted); }} />
            </View>
          )}
        </View>
      </View>

      {demo && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(13,13,13,.96)' }}>
          <HowTo
            drill={demo} name={t(`howto.${demo}.title` as Key)}
            onDone={() => {
              markHint(`howto_${demo}`);
              setDemo(null);
              scene.current?.setPaused(false);
              begin();
            }}
          />
        </View>
      )}
      {!ready && finishing === 'no' && <Loading progress={progress} />}
      {finishing !== 'no' && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, backgroundColor: 'rgba(13,13,13,.86)' }}>
          <Caps>{t('match.end')}</Caps>
          <H3>{finishing === 'sending' ? t('match.calculating') : t('match.notSent')}</H3>
          {finishing === 'failed' && <Cta style={{ width: 170, height: 48, minHeight: 48 }} onPress={finish}>{t('match.retry')}</Cta>}
        </View>
      )}
    </View>
  );
}

function Loading({ progress }: { progress: number }) {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32, backgroundColor: colors.ink }}>
      <Caps color={colors.l600}>{t('m3.loading')}</Caps>
      <View style={{ width: '100%', maxWidth: 280, height: 6, borderRadius: 3, backgroundColor: colors.s2, overflow: 'hidden' }}>
        <View style={{ width: `${Math.round(progress * 100)}%`, height: '100%', backgroundColor: colors.l600 }} />
      </View>
    </View>
  );
}

/** Fades in, holds, fades out. */
function useFlash(holdMs: number) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 280, useNativeDriver: false }),
      Animated.delay(holdMs),
      Animated.timing(a, { toValue: 0, duration: 320, useNativeDriver: false }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [a, holdMs]);
  return a;
}

function Banner({ text, def }: { text: string; def: boolean }) {
  const a = useFlash(1300);
  return (
    <Animated.View pointerEvents="none" style={{ alignSelf: 'center', marginTop: 12, opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }}>
      <View style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, backgroundColor: def ? colors.bad : colors.l600 }}>
        <T w={700} size={13} color={colors.ink} style={{ letterSpacing: 1.8 }}>{text}</T>
      </View>
    </Animated.View>
  );
}

function Coach({ text }: { text: string }) {
  const a = useFlash(3000);
  return (
    <Animated.View pointerEvents="none" style={{ marginTop: 10, alignSelf: 'flex-start', maxWidth: 320, opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }}>
      <Bubble text={text} size={40} />
    </Animated.View>
  );
}

function BigText({ pop }: { pop: Pop }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.sequence([
      Animated.spring(a, { toValue: 1, friction: 5, tension: 140, useNativeDriver: false }),
      Animated.delay(900),
      Animated.timing(a, { toValue: 0, duration: 300, useNativeDriver: false }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [a]);
  const size = pop.text.length > 8 ? 56 : pop.text.length > 5 ? 72 : 104;
  return (
    <Animated.View accessibilityLiveRegion="polite" style={{ opacity: a.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }), transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }, { rotate: '-4deg' }] }}>
      <T w={700} size={size} color={TONE[pop.tone]} style={{ fontStyle: 'italic', letterSpacing: -size * 0.04, lineHeight: size * 0.95, textAlign: 'center', textShadowColor: pop.tone === 'lime' ? 'rgba(207,253,92,.55)' : 'rgba(0,0,0,.45)', textShadowRadius: 28 }}>
        {pop.text}
      </T>
    </Animated.View>
  );
}

function GradePop({ pop }: { pop: Pop }) {
  const a = useFlash(500);
  return (
    <Animated.View style={{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
      <View style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999, backgroundColor: 'rgba(13,13,13,.7)' }}>
        <T w={700} size={20} color={TONE[pop.tone]} style={{ letterSpacing: 1.2 }}>{pop.text}</T>
      </View>
    </Animated.View>
  );
}

