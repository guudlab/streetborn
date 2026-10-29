import { apNeed, dailyDrill, DEFAULT_CONFIG, drillBadge, istanbulDay, type DrillInputs } from '@streetborn/economy';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sfx } from '../audio/audio.ts';
import { DRILLS } from '../game/rules.ts';
import { markHint, useHints } from '../game/hints.ts';
import { SERVER_DRILL, useGame, type DrillOutcome, type LiveDrill } from '../game/store.ts';
import { t, type Key } from '../i18n/index.ts';
import { colors } from '../theme.ts';
import { BakkalaKos } from '../ui/drills/BakkalaKos.tsx';
import { DRILL_ICON, Star, StarTrack, type DrillGameHandle } from '../ui/drills/common.tsx';
import { BadgeCard, ResultBackdrop, RewardCard, Sparkles } from '../ui/drills/reward.tsx';
import { DuvarPasi } from '../ui/drills/DuvarPasi.tsx';
import { HowTo, HowToSteps } from '../ui/drills/HowTo.tsx';
import { Merdiven } from '../ui/drills/Merdiven.tsx';
import { Omuz } from '../ui/drills/Omuz.tsx';
import { Teneke } from '../ui/drills/Teneke.tsx';
import { openEnergySheet } from '../ui/energy.tsx';
import { Icon } from '../ui/Icon.tsx';
import { buzz, CoachFace, Cta, H1, T } from '../ui/kit.tsx';
import { Pop, PressableScale } from '../ui/motion.tsx';
import { toast, Spinner } from '../ui/overlay.tsx';
import { bootIcon, Bubble, Ico, Segments } from '../ui/sade.tsx';

// Talim: one of Burak abi's mini games (antrenman doc, decision 1A). Gelişim
// starts the drill (the server spends the free drill or the energy and hands out
// the seed), this screen plays it and shows what it paid. Closing early sends what
// was played so far.

const GAMES = { sut: Teneke, pas: DuvarPasi, hiz: BakkalaKos, fizik: Merdiven, omuz: Omuz } as const;
const GRADE_KEY = { mukemmel: 'train.grade.mukemmel', iyi: 'train.grade.iyi', kacti: 'train.grade.kacti' } as const;
const COUNT_MS = 700;

type Phase = 'howto' | 'count' | 'play' | 'saving' | 'result';

export default function Talim() {
  const insets = useSafeAreaInsets();
  const [drill, setDrill] = useState<LiveDrill | null>(() => useGame.getState().drill);
  // A game's first round starts with its demo card; later rounds go straight to 3, 2, 1.
  const [phase, setPhase] = useState<Phase>(() => {
    const d = useGame.getState().drill;
    return d && !useHints.getState().seen[`howto_${d.key}`] ? 'howto' : 'count';
  });
  const [count, setCount] = useState(3);
  const [score, setScore] = useState(0);
  const [result, setResult] = useState<DrillOutcome | null>(null);
  const [round, setRound] = useState(0);
  const [busy, setBusy] = useState(false);
  const game = useRef<DrillGameHandle>(null);
  const finishing = useRef(false);

  useEffect(() => { if (!drill) router.back(); }, [drill]);

  // 3, 2, 1 with the rule on screen, then play.
  useEffect(() => {
    if (phase !== 'count') return;
    if (count === 0) { sfx('whistle_start'); setPhase('play'); return; }
    const id = setTimeout(() => setCount(count - 1), COUNT_MS);
    return () => clearTimeout(id);
  }, [phase, count]);

  const finish = async (inputs: DrillInputs) => {
    if (finishing.current) return;
    finishing.current = true;
    setPhase('saving');
    const r = await useGame.getState().finishDrill(inputs);
    if (!r) { toast(t('train.failed'), 'error'); router.back(); return; }
    markHint('jobTrain');
    if (r.stars >= 3) { sfx('victory_sting'); buzz('success'); } else if (r.statUp) sfx('levelup'); else sfx(r.stars ? 'coin' : 'crowd_groan');
    setResult(r);
    setPhase('result');
  };

  const quit = () => {
    if (phase === 'howto' || phase === 'count' || phase === 'play') void finish(game.current?.inputs() ?? []);
    else if (phase === 'result') router.back();
  };

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (phase === 'saving') return true; quit(); return true; });
    return () => sub.remove();
  });

  const again = async () => {
    if (!drill) return;
    setBusy(true);
    const r = await useGame.getState().startDrill(drill.key);
    setBusy(false);
    if (r === 'no_energy') return openEnergySheet();
    if (r !== 'ok') return toast(t('train.failed'), 'error');
    finishing.current = false;
    setDrill(useGame.getState().drill);
    setScore(0);
    setResult(null);
    setCount(3);
    setRound(round + 1);
    setPhase('count');
  };

  if (!drill) return <View style={{ flex: 1, backgroundColor: colors.ink }} />;
  const key = drill.key;

  if (phase === 'result' && result) return <Result r={result} insets={insets} busy={busy} onOk={() => router.back()} onAgain={() => void again()} />;

  const Game = GAMES[key];
  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, paddingTop: insets.top + 8 }}>
      <View style={{ paddingHorizontal: 20, gap: 12, paddingBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
          <PressableScale
            accessibilityRole="button" accessibilityLabel={t('talim.close')} onPress={quit} disabled={phase === 'saving'} hitSlop={8}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.s2, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="x" size={20} color={colors.g100} />
          </PressableScale>
          <T w={700} size={17} accessibilityRole="header" style={{ flex: 1 }}>{DRILLS[key].name}</T>
          {phase === 'count' && (
            <PressableScale
              accessibilityRole="button" accessibilityLabel={t('howto.help')} onPress={() => setPhase('howto')} hitSlop={8}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.s2, alignItems: 'center', justifyContent: 'center' }}
            >
              <T w={700} size={20} color={colors.g100}>?</T>
            </PressableScale>
          )}
        </View>
        <StarTrack
          score={score} stars={drill.stars}
          left={t(`talim.unit.${key}` as Key, { n: score })}
          right={t('talim.kerem', { n: drill.kerem })}
        />
      </View>

      <View style={{ flex: 1 }}>
        <Game key={round} ref={game} seed={drill.seed} tier={drill.tier} running={phase === 'play'} onScore={setScore} onDone={i => void finish(i)} />
        {phase === 'count' && (
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 18, backgroundColor: 'rgba(13,13,13,.55)', paddingHorizontal: 24 }}>
            <Pop key={count}><T w={700} size={72} color={colors.l600}>{Math.max(1, count)}</T></Pop>
            <HowToSteps drill={key} />
          </View>
        )}
        {phase === 'howto' && (
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center', backgroundColor: 'rgba(13,13,13,.96)' }}>
            <HowTo drill={key} name={DRILLS[key].name} onDone={() => { markHint(`howto_${key}`); setCount(3); setPhase('count'); }} />
          </View>
        )}
        {phase === 'saving' && (
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(13,13,13,.7)' }}>
            <Spinner />
            <T w={600} size={15} color={colors.g200}>{t('talim.saving')}</T>
          </View>
        )}
      </View>
      <View style={{ height: insets.bottom + 8 }} />
    </View>
  );
}

function Result({ r, insets, busy, onOk, onAgain }: { r: DrillOutcome; insets: { top: number; bottom: number }; busy: boolean; onOk(): void; onAgain(): void }) {
  const g = useGame();
  const stat = DRILLS[r.key].stat;
  const newRecord = r.score > 0 && (r.record.previous === null || r.score > r.record.previous);
  const chip = newRecord
    ? `${t('talim.newRecord', { n: r.score })}${r.score > r.kerem ? ` · ${t('talim.beatKerem')}` : ''}`
    : r.record.best > 0 ? t('talim.recordLine', { best: r.record.best, kerem: r.kerem }) : t('talim.kerem', { n: r.kerem });
  // 3 stars on the drill of the day or on omuz oku: today's mahalle match gets the "work" shooting bonus (match-start).
  const prep = r.stars === 3 && g.mahalleToday?.played === false && (r.key === 'omuz' || SERVER_DRILL[r.key] === dailyDrill(istanbulDay(Date.now())));
  const badge = drillBadge(SERVER_DRILL[r.key], r.record.best, DEFAULT_CONFIG.training);
  const newBadge = badge > drillBadge(SERVER_DRILL[r.key], r.record.previous, DEFAULT_CONFIG.training) ? badge : 0;
  const line = prep ? t('daily.ready') : r.stars >= 3 ? t('talim.burak.top') : t(`talim.burak.${r.key}` as Key);
  const can = g.trainFree > 0 || g.energy > 0;
  // Online the AP per point grows with the stat (GDD v3.1); the offline prototype keeps 3.
  const need = g.mode === 'online' ? apNeed(r.after, DEFAULT_CONFIG.training) : 3;

  const omuz = r.key === 'omuz';
  const xp = (
    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.s3, alignItems: 'center', justifyContent: 'center' }}>
      <T w={700} size={14} color={colors.l500}>XP</T>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24, paddingHorizontal: 20, alignItems: 'center', gap: 16 }}>
      <View style={{ flex: 1 }} />
      <View accessible accessibilityLabel={t('talim.stars', { n: r.stars })} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 100 }}>
        <ResultBackdrop stars={r.stars} />
        {[0, 1, 2].map(i => (
          <Pop key={i} delay={150 + i * 180} style={{ transform: [{ rotate: i === 0 ? '-14deg' : i === 2 ? '14deg' : '0deg' }, { translateY: i === 1 ? -18 : -4 }] }}>
            <Star size={i === 1 ? 96 : 66} on={i < r.stars} />
          </Pop>
        ))}
        {r.stars >= 3 && <Sparkles />}
      </View>
      <View style={{ alignItems: 'center', gap: 10 }}>
        <H1 accessibilityRole="header" style={{ fontSize: 34, lineHeight: 38 }}>{t(GRADE_KEY[r.grade])}</H1>
        <View style={{ backgroundColor: newRecord ? colors.l900 : colors.s2, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 }}>
          <T w={700} size={14} color={newRecord ? colors.l500 : colors.g200}>{chip}</T>
        </View>
      </View>

      {/* What the drill paid, as cards: the stat and its steps to the next point, XP, then the extras. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 4 }}>
        {!omuz && (
          <RewardCard
            icon={<Ico name={DRILL_ICON[r.key]} size={44} />} value={r.statUp ? `+${r.statUp}` : `${r.after}`}
            label={r.statUp ? `${stat} ${r.after}` : stat} lime={r.statUp > 0} shine={r.statUp > 0} delay={600}
          >
            {!r.statUp && <Segments n={r.progress} of={need} height={5} gap={3} style={{ width: 64, marginBottom: 2 }} />}
          </RewardCard>
        )}
        {r.bootAp > 0 && <RewardCard icon={<Ico name={bootIcon(g.boots?.id)} size={44} />} value={`+${r.bootAp}`} label={t('talim.boots')} lime delay={700} />}
        <RewardCard icon={xp} value={`+${r.xp}`} label={t('talim.xp')} delay={800} />
        {prep && <RewardCard icon={<Ico name="sut" size={44} />} value={t('talim.prepValue')} label={t('talim.prepLabel')} lime shine delay={900} />}
        {r.trust > 0 && <RewardCard icon={<CoachFace size={44} />} value={`+${r.trust}`} label={t('career.trust')} lime shine delay={1000} />}
      </View>
      {newBadge > 0 && (
        <BadgeCard
          level={newBadge as 1 | 2 | 3} title={t(`badge.${newBadge}` as Key)} sub={stat} delay={1200} style={{ alignSelf: 'stretch' }}
          medal={<Ico name={DRILL_ICON[r.key]} size={40} />}
        />
      )}
      {r.ups > 0 && <T w={700} size={15} color={colors.l600}>{t('post.level', { n: g.level })}</T>}

      <View style={{ flex: 1 }} />
      <Bubble text={line} style={{ alignSelf: 'stretch' }} />
      <View style={{ alignSelf: 'stretch', flexDirection: 'row', gap: 10 }}>
        <PressableScale
          accessibilityRole="button" onPress={onOk}
          style={{ flex: 1, height: 56, borderRadius: 28, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}
        >
          <T w={600} size={17}>{t('common.ok')}</T>
        </PressableScale>
        <Cta style={{ flex: 1.4 }} busy={busy} disabled={!can} off={!can} onPress={onAgain} accessibilityLabel={can ? t('train.again') : t('train.noEnergy')}>
          <T w={700} size={17} color={can ? colors.ink : colors.g200}>{can ? t('train.again') : t('train.noEnergy')}</T>
          {can && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(13,13,13,.12)', borderRadius: 12, paddingVertical: 3, paddingHorizontal: 8 }}>
              {g.trainFree > 0
                ? <T w={700} size={13} color={colors.ink}>{t('train.freeShort', { n: g.trainFree })}</T>
                : <><Icon name="bolt" size={15} color={colors.ink} /><T w={700} size={14} color={colors.ink}>1</T></>}
            </View>
          )}
        </Cta>
      </View>
    </View>
  );
}
