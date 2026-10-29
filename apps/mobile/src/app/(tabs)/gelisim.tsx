import { apNeed, DEFAULT_CONFIG, privateCost } from '@streetborn/economy';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DRILLS, ovr, type StatKey } from '../../game/rules.ts';
import { markHint } from '../../game/hints.ts';
import { useGame, type TrainResult } from '../../game/store.ts';
import { colors, TAB_BAR_SPACE } from '../../theme.ts';
import { openEnergySheet } from '../../ui/energy.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { toast } from '../../ui/overlay.tsx';
import { sfx } from '../../audio/audio.ts';
import { buzz, Caps, CoachFace, Cta, H1, T, Track } from '../../ui/kit.tsx';
import { PressableScale } from '../../ui/motion.tsx';
import { Amount, Ico, Segments, Tile, type IconAsset } from '../../ui/sade.tsx';
import { TimingBar, type TimingBarHandle } from '../../ui/TimingBar.tsx';
import { HintBubble } from '../../ui/hint.tsx';
import { t } from '../../i18n/index.ts';

const KEYS = Object.keys(DRILLS) as StatKey[];
const GRADES = {
  mukemmel: { color: colors.l600, icon: 'star', label: t('train.grade.mukemmel') },
  iyi: { color: colors.g100, icon: 'check', label: t('train.grade.iyi') },
  kacti: { color: colors.bad, icon: 'x', label: t('train.grade.kacti') },
  ozel: { color: colors.l600, icon: 'whistle', label: t('train.grade.ozel') },
} as const;
const tc = DEFAULT_CONFIG.training;
const STAT_ICON: Record<StatKey, IconAsset> = { sut: 'sut', pas: 'pas', hiz: 'hiz', fizik: 'fizik' };

export default function Gelisim() {
  const insets = useSafeAreaInsets();
  const g = useGame();
  const [sel, setSel] = useState<StatKey>('sut');
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<TrainResult | null>(null);
  const [busy, setBusy] = useState(false);
  const bar = useRef<TimingBarHandle>(null);
  const startedAt = useRef(0);
  const d = DRILLS[sel];
  const online = g.mode === 'online';
  // After the free drills each drill costs 1 energy (online the server checks both).
  const can = g.trainFree > 0 || g.energy > 0;
  // Online the AP needed per point grows with the stat (GDD v3.1); the offline prototype keeps 3.
  const need = (k: StatKey) => (online ? apNeed(g.stats[k], tc) : 3);
  const cost = privateCost(g.stats[sel], tc);
  const coach = g.career?.contract?.active ? t('train.private.clubCoach') : t('train.private.burak');

  useEffect(() => { if (online) void useGame.getState().refreshTraining(); }, [online]);

  const pick = (k: StatKey) => { if (running || busy) return; setSel(k); setLast(null); };
  const show = (r: Awaited<ReturnType<ReturnType<typeof useGame.getState>['train']>>) => {
    if (r === 'no_energy') return openEnergySheet();
    if (!r) return toast(t('train.failed'));
    buzz(r.grade === 'mukemmel' || r.grade === 'ozel' ? 'success' : 'light');
    sfx(r.ups ? 'levelup' : r.grade === 'mukemmel' || r.statUp ? 'unlock' : r.grade === 'kacti' ? 'error' : 'coin');
    setLast(r);
    markHint('jobTrain');
  };
  const tapBar = async () => {
    const q = bar.current?.stop() ?? 0;
    setRunning(false);
    setBusy(true);
    show(await useGame.getState().train(sel, q, Date.now() - startedAt.current));
    setBusy(false);
  };
  const privateSession = async () => {
    setBusy(true);
    const r = await useGame.getState().privateTrain(sel);
    setBusy(false);
    if (r === 'no_coin') return toast(t('train.private.noCoin', { n: cost }));
    if (r === 'limit') return toast(t('train.private.limit'));
    show(r);
  };

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: TAB_BAR_SPACE + insets.bottom, gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
        <H1>{t('tab.train')}</H1>
        <View accessible accessibilityLabel={`${t('train.overall')} ${ovr(g.stats)}`} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Caps>{t('hub.ovr')}</Caps>
          <T w={700} size={30}>{ovr(g.stats)}</T>
        </View>
      </View>
      <HintBubble id="trainTab" text={t('hint.trainTab')} />

      {running ? (
        <View style={{ flex: 1, minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Ico name={STAT_ICON[sel]} size={170} />
          <T w={700} size={22}>{d.stat}</T>
          <T w={500} size={14} color={colors.g200}>{t('train.hintShort')}</T>
        </View>
      ) : (
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {KEYS.map(k => {
            const on = k === sel;
            const flash = last?.statUp && last.key === k;
            return (
              <Tile
                key={k} role="radio" selected={on} onPress={() => pick(k)} style={{ width: '48%', flexGrow: 1, gap: 8, paddingVertical: 14 }}
                label={`${DRILLS[k].stat} ${g.stats[k]}, ${t('train.progressA11y', { n: g.drillProgress[k] })}`}
              >
                <Ico name={STAT_ICON[k]} size={56} />
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                  <T w={600} size={13} color={colors.g200}>{DRILLS[k].stat}</T>
                  <T w={700} size={26} color={flash ? colors.l600 : colors.g100}>{g.stats[k]}</T>
                </View>
                <View style={{ alignSelf: 'stretch', paddingHorizontal: 12, gap: 6 }}>
                  <Track value={g.stats[k] / 100} height={6} color={on ? colors.l600 : colors.g200} />
                  <Segments n={g.drillProgress[k]} of={need(k)} height={5} gap={4} style={{ paddingHorizontal: 14 }} />
                </View>
              </Tile>
            );
          })}
        </View>
      )}

      {!running && <View style={{ flex: 1 }} />}
      {running ? (
        <>
          <TimingBar ref={bar} />
          <Cta onPress={() => void tapBar()}>{t('train.tap')}</Cta>
        </>
      ) : (
        <>
          {last && <DrillResult r={last} stat={DRILLS[last.key].stat} level={g.level} need={need(last.key)} />}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Cta
              style={{ flex: 1 }} disabled={!can || busy} off={busy}
              onPress={() => { setLast(null); startedAt.current = Date.now(); setRunning(true); }}
              accessibilityLabel={`${d.stat}: ${can ? t('common.start') : t('train.noEnergy')}`}
            >
              <T w={700} size={17} color={can ? colors.ink : colors.g200}>{can ? (last ? t('train.again') : t('train.cta')) : t('train.noEnergy')}</T>
              {can && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(13,13,13,.12)', borderRadius: 12, paddingVertical: 3, paddingHorizontal: 8 }}>
                  {g.trainFree > 0
                    ? <T w={700} size={13} color={colors.ink}>{t('train.freeShort', { n: g.trainFree })}</T>
                    : <><Icon name="bolt" size={15} color={colors.ink} /><T w={700} size={14} color={colors.ink}>1</T></>}
                </View>
              )}
            </Cta>
            {online && (
              <PressableScale
                accessibilityRole="button" disabled={busy || g.privateLeft === 0} onPress={() => void privateSession()}
                accessibilityLabel={g.privateLeft === 0 ? t('train.private.limit') : t('train.private.cta', { coach, n: cost, left: g.privateLeft })}
                style={{ width: 76, height: 56, borderRadius: 28, backgroundColor: colors.s2, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: g.privateLeft === 0 ? 0.4 : 1 }}
              >
                <CoachFace size={34} />
                <View style={{ alignItems: 'center' }}>
                  <Ico name="coin" size={18} />
                  <T w={700} size={11}>{cost}</T>
                </View>
              </PressableScale>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function DrillResult({ r, stat, level, need }: { r: TrainResult; stat: string; level: number; need: number }) {
  const G = GRADES[r.grade];
  const sub = r.statUp ? `${stat} ${r.before} → ${r.after}` : r.grade === 'kacti' ? '' : t('train.progress', { n: r.progress, need });
  return (
    <View accessibilityLiveRegion="polite" style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <Icon name={G.icon} size={24} color={G.color} />
      <T w={700} size={17} color={G.color}>{G.label}</T>
      <T w={700} size={15}>+{r.xp} XP</T>
      {r.coin ? <Amount icon="coin" size={18} textSize={14}>−{r.coin}</Amount> : null}
      {sub !== '' && <T w={600} size={13} color={colors.g200}>{sub}</T>}
      {r.ups ? <T w={700} size={13} color={colors.l600}>{t('post.level', { n: level })}</T> : null}
    </View>
  );
}
