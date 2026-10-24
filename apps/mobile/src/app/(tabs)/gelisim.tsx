import { Model3D } from '../../ui/Model3D.tsx';
import { apNeed, DEFAULT_CONFIG, privateCost } from '@streetborn/economy';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DRILLS, ovr, type StatKey } from '../../game/rules.ts';
import { useGame, type TrainResult } from '../../game/store.ts';
import { colors, TAB_BAR_SPACE } from '../../theme.ts';
import { openEnergySheet } from '../../ui/energy.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { toast } from '../../ui/overlay.tsx';
import { sfx } from '../../audio/audio.ts';
import { buzz, Caps, Cta, Ghost, H1, H3, T } from '../../ui/kit.tsx';
import { TimingBar, type TimingBarHandle } from '../../ui/TimingBar.tsx';
import { t } from '../../i18n/index.ts';

const KEYS = Object.keys(DRILLS) as StatKey[];
const GRADES = {
  mukemmel: { color: colors.l600, icon: 'star', label: t('train.grade.mukemmel') },
  iyi: { color: colors.g100, icon: 'check', label: t('train.grade.iyi') },
  kacti: { color: colors.bad, icon: 'x', label: t('train.grade.kacti') },
  ozel: { color: colors.l600, icon: 'whistle', label: t('train.grade.ozel') },
} as const;
const tc = DEFAULT_CONFIG.training;

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
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: TAB_BAR_SPACE + insets.bottom, gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View><Caps>{t('train.eyebrow')}</Caps><H1 style={{ marginTop: 4 }}>{t('train.title')}</H1></View>
        <Model3D model={require('../../../assets/models/ball.glb')} fallback={require('../../../assets/meshy/ball.webp')} poster={require('../../../assets/meshy/ball.webp')} spin style={{ width: 56, height: 56 }} label={t('train.ball')} />
        <View style={{ alignItems: 'flex-end' }}><Caps>{t('train.overall')}</Caps><H1 style={{ marginTop: 4 }}>{ovr(g.stats)}</H1></View>
      </View>

      <View style={{ gap: 8 }}>
        {KEYS.map(k => {
          const on = k === sel;
          const flash = last?.statUp && last.key === k;
          return (
            <Pressable
              key={k} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => pick(k)}
              style={{ padding: 14, paddingHorizontal: 16, borderRadius: 18, backgroundColor: colors.s1, borderWidth: 1, borderColor: on ? colors.l600 : colors.line, gap: 8 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <T w={600} size={16}>{DRILLS[k].stat}  <T w={500} size={13} color={colors.g200}>{DRILLS[k].name}</T></T>
                <T w={600} size={22} color={flash ? colors.l600 : colors.g100}>{g.stats[k]}</T>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.s3, overflow: 'hidden' }}>
                  <View style={{ width: `${g.stats[k]}%`, height: '100%', borderRadius: 3, backgroundColor: on ? colors.l600 : colors.g200 }} />
                </View>
                <View style={{ flexDirection: 'row', gap: 4 }} accessibilityLabel={t('train.progressA11y', { n: g.drillProgress[k] })}>
                  {Array.from({ length: need(k) }, (_, i) => <View key={i} style={{ width: 14, height: 6, borderRadius: 3, backgroundColor: i < g.drillProgress[k] ? colors.l600 : colors.s3 }} />)}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={{ borderRadius: 22, backgroundColor: colors.s2, padding: 16, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View><Caps>{d.place}</Caps><H3 style={{ marginTop: 2 }}>{d.name}</H3></View>
          {g.trainFree > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="check" size={16} color={colors.l500} /><T w={600} size={13} color={colors.l500}>{t('train.freeLeft', { n: g.trainFree })}</T>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="bolt" size={16} color={colors.g200} /><T w={600} size={13} color={colors.g200}>{t('train.oneEnergy', { n: g.energy })}</T>
            </View>
          )}
        </View>

        {running ? (
          <>
            <TimingBar ref={bar} />
            <Cta onPress={() => void tapBar()}>{t('train.tap')}</Cta>
          </>
        ) : (
          <>
            {last ? <DrillResult r={last} stat={DRILLS[last.key].stat} level={g.level} need={need(last.key)} /> : (
              <T size={14} color={colors.g200}>{t('train.hint', { stat: d.stat })}</T>
            )}
            <Cta disabled={!can || busy} off={busy} onPress={() => { setLast(null); startedAt.current = Date.now(); setRunning(true); }}>
              {can ? (last ? t('train.again') : t('common.start')) : t('train.noEnergy')}
            </Cta>
            {online && (
              <Ghost disabled={busy || g.privateLeft === 0} onPress={() => void privateSession()}>
                {g.privateLeft === 0
                  ? t('train.private.limit')
                  : t('train.private.cta', { coach, n: cost, left: g.privateLeft })}
              </Ghost>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}

function DrillResult({ r, stat, level, need }: { r: TrainResult; stat: string; level: number; need: number }) {
  const G = GRADES[r.grade];
  const sub = r.statUp ? `${stat} ${r.before} → ${r.after}` : r.grade === 'kacti' ? t('train.noProgress') : t('train.progress', { n: r.progress, need });
  const paid = r.coin ? ` · −${r.coin} coin` : '';
  return (
    <View accessibilityLiveRegion="polite" style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Icon name={G.icon} size={22} color={G.color} />
      <View>
        <T w={600} size={15} color={G.color}>{G.label} · +{r.xp} XP{paid}</T>
        <T w={500} size={13} color={colors.g200}>{sub}{r.ups ? t('train.levelUp', { n: level }) : ''}</T>
      </View>
    </View>
  );
}
