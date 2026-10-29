import { apNeed, DEFAULT_CONFIG, type DrillInputs } from '@streetborn/economy';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BackHandler, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sfx } from '../audio/audio.ts';
import { DRILLS, type StatKey } from '../game/rules.ts';
import { markHint } from '../game/hints.ts';
import { useGame, type DrillOutcome, type LiveDrill } from '../game/store.ts';
import { t, type Key } from '../i18n/index.ts';
import { colors } from '../theme.ts';
import { BakkalaKos } from '../ui/drills/BakkalaKos.tsx';
import { Star, StarTrack, type DrillGameHandle } from '../ui/drills/common.tsx';
import { DuvarPasi } from '../ui/drills/DuvarPasi.tsx';
import { Merdiven } from '../ui/drills/Merdiven.tsx';
import { Teneke } from '../ui/drills/Teneke.tsx';
import { openEnergySheet } from '../ui/energy.tsx';
import { Icon } from '../ui/Icon.tsx';
import { buzz, Cta, H1, T } from '../ui/kit.tsx';
import { Pop, PressableScale } from '../ui/motion.tsx';
import { toast, Spinner } from '../ui/overlay.tsx';
import { bootIcon, Bubble, Ico, Segments, type IconAsset } from '../ui/sade.tsx';

// Talim: one of Burak abi's mini games (antrenman doc, decision 1A). Gelişim
// starts the drill (the server spends the free drill or the energy and hands out
// the seed), this screen plays it and shows what it paid. Closing early sends what
// was played so far.

const GAMES = { sut: Teneke, pas: DuvarPasi, hiz: BakkalaKos, fizik: Merdiven } as const;
const STAT_ICON: Record<StatKey, IconAsset> = { sut: 'sut', pas: 'pas', hiz: 'hiz', fizik: 'fizik' };
const GRADE_KEY = { mukemmel: 'train.grade.mukemmel', iyi: 'train.grade.iyi', kacti: 'train.grade.kacti' } as const;
const COUNT_MS = 700;

type Phase = 'count' | 'play' | 'saving' | 'result';

export default function Talim() {
  const insets = useSafeAreaInsets();
  const [drill, setDrill] = useState<LiveDrill | null>(() => useGame.getState().drill);
  const [phase, setPhase] = useState<Phase>('count');
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
    if (!r) { toast(t('train.failed')); router.back(); return; }
    markHint('jobTrain');
    if (r.stars >= 3) { sfx('victory_sting'); buzz('success'); } else if (r.statUp) sfx('levelup'); else sfx(r.stars ? 'coin' : 'crowd_groan');
    setResult(r);
    setPhase('result');
  };

  const quit = () => {
    if (phase === 'count' || phase === 'play') void finish(game.current?.inputs() ?? []);
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
    if (r !== 'ok') return toast(t('train.failed'));
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
            <Bubble text={t(`talim.rule.${key}` as Key)} />
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
  const line = r.stars >= 3 ? t('talim.burak.top') : t(`talim.burak.${r.key}` as Key);
  const can = g.trainFree > 0 || g.energy > 0;
  // Online the AP per point grows with the stat (GDD v3.1); the offline prototype keeps 3.
  const need = g.mode === 'online' ? apNeed(r.after, DEFAULT_CONFIG.training) : 3;

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24, paddingHorizontal: 20, alignItems: 'center', gap: 18 }}>
      <View style={{ flex: 1 }} />
      <View accessible accessibilityLabel={t('talim.stars', { n: r.stars })} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 100 }}>
        {[0, 1, 2].map(i => (
          <Pop key={i} delay={150 + i * 180} style={{ transform: [{ rotate: i === 0 ? '-14deg' : i === 2 ? '14deg' : '0deg' }, { translateY: i === 1 ? -18 : -4 }] }}>
            <Star size={i === 1 ? 96 : 66} on={i < r.stars} />
          </Pop>
        ))}
      </View>
      <View style={{ alignItems: 'center', gap: 10 }}>
        <H1 accessibilityRole="header" style={{ fontSize: 34, lineHeight: 38 }}>{t(GRADE_KEY[r.grade])}</H1>
        <View style={{ backgroundColor: newRecord ? colors.l900 : colors.s2, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 }}>
          <T w={700} size={14} color={newRecord ? colors.l500 : colors.g200}>{chip}</T>
        </View>
      </View>

      <View style={{ alignSelf: 'stretch', backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, borderRadius: 22, padding: 8, gap: 4, marginTop: 6 }}>
        <Row icon={<Ico name={STAT_ICON[r.key]} size={38} />} label={stat} value={`+${r.ap - r.bootAp} AP`} />
        {r.bootAp > 0 && <Row icon={<Ico name={bootIcon(g.boots?.id)} size={38} />} label={t('talim.boots')} value={`+${r.bootAp} AP`} lime />}
        <Row icon={<View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.s3, alignItems: 'center', justifyContent: 'center' }}><T w={700} size={12} color={colors.g200}>XP</T></View>} label={t('talim.xp')} value={`+${r.xp} XP`} />
      </View>

      {r.statUp > 0 ? (
        <View accessible accessibilityLabel={`${stat} ${r.before} → ${r.after}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <T w={700} size={22} color={colors.g200}>{stat} {r.before}</T>
          <Icon name="chev" size={22} color={colors.l600} />
          <T w={700} size={22} color={colors.l600}>{r.after}</T>
        </View>
      ) : (
        <View style={{ alignSelf: 'stretch', paddingHorizontal: 40, gap: 6 }} accessible accessibilityLabel={t('train.progress', { n: r.progress, need })}>
          <Segments n={r.progress} of={need} height={6} gap={6} />
          <T w={600} size={13} color={colors.g200} style={{ textAlign: 'center' }}>{t('train.progress', { n: r.progress, need })}</T>
        </View>
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

function Row({ icon, label, value, lime }: { icon: ReactNode; label: string; value: string; lime?: boolean }) {
  return (
    <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, borderRadius: 14, backgroundColor: lime ? 'rgba(63,77,24,.38)' : 'transparent' }}>
      {icon}
      <T w={600} size={15} style={{ flex: 1 }}>{label}</T>
      <T w={700} size={18} color={lime ? colors.l600 : colors.g100}>{value}</T>
    </View>
  );
}
