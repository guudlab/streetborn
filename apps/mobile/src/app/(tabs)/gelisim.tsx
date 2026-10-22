import { Model3D } from '../../ui/Model3D.tsx';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DRILLS, ovr, type StatKey } from '../../game/rules.ts';
import { useGame, type TrainResult } from '../../game/store.ts';
import { colors, TAB_BAR_SPACE } from '../../theme.ts';
import { Icon } from '../../ui/Icon.tsx';
import { sfx } from '../../audio/audio.ts';
import { buzz, Caps, Cta, H1, H3, T } from '../../ui/kit.tsx';
import { TimingBar, type TimingBarHandle } from '../../ui/TimingBar.tsx';
import { t } from '../../i18n/index.ts';

const KEYS = Object.keys(DRILLS) as StatKey[];
const GRADES = {
  mukemmel: { color: colors.l600, icon: 'star', label: t('train.grade.mukemmel') },
  iyi: { color: colors.g100, icon: 'check', label: t('train.grade.iyi') },
  kacti: { color: colors.bad, icon: 'x', label: t('train.grade.kacti') },
} as const;

export default function Gelisim() {
  const insets = useSafeAreaInsets();
  const g = useGame();
  const [sel, setSel] = useState<StatKey>('sut');
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<TrainResult | null>(null);
  const bar = useRef<TimingBarHandle>(null);
  const d = DRILLS[sel];
  // Paid training (1 energy) needs a server function; online only the free sessions work for now.
  const can = g.trainFree > 0 || (g.mode === 'local' && g.energy > 0);

  const pick = (k: StatKey) => { if (running) return; setSel(k); setLast(null); };
  const tapBar = () => {
    const q = bar.current?.stop() ?? 0;
    setRunning(false);
    const r = useGame.getState().train(sel, q);
    if (!r) return;
    buzz(r.grade === 'mukemmel' ? 'success' : 'light');
    sfx(r.ups ? 'levelup' : r.grade === 'mukemmel' ? 'unlock' : r.grade === 'iyi' ? 'coin' : 'error');
    setLast(r);
  };

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: TAB_BAR_SPACE + insets.bottom, gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View><Caps>{t('train.eyebrow')}</Caps><H1 style={{ marginTop: 4 }}>{t('train.title')}</H1></View>
        <Model3D model={require('../../../assets/models/ball.glb')} fallback={require('../../../assets/meshy/ball.webp')} spin style={{ width: 56, height: 56 }} label={t('train.ball')} />
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
                  {[0, 1, 2].map(i => <View key={i} style={{ width: 14, height: 6, borderRadius: 3, backgroundColor: i < g.drillProgress[k] ? colors.l600 : colors.s3 }} />)}
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
              <Icon name="bolt" size={16} color={colors.g200} /><T w={600} size={13} color={colors.g200}>{g.mode === 'online' ? t('train.freeOver') : t('train.oneEnergy', { n: g.energy })}</T>
            </View>
          )}
        </View>

        {running ? (
          <>
            <TimingBar ref={bar} />
            <Cta onPress={tapBar}>{t('train.tap')}</Cta>
          </>
        ) : (
          <>
            {last ? <DrillResult r={last} stat={DRILLS[last.key].stat} level={g.level} /> : (
              <T size={14} color={colors.g200}>{t('train.hint', { stat: d.stat })}</T>
            )}
            <Cta disabled={!can} onPress={() => { setLast(null); setRunning(true); }}>
              {can ? (last ? t('train.again') : t('common.start')) : g.mode === 'online' ? t('train.again.tomorrow') : t('train.noEnergy')}
            </Cta>
          </>
        )}
      </View>
    </ScrollView>
  );
}

function DrillResult({ r, stat, level }: { r: TrainResult; stat: string; level: number }) {
  const G = GRADES[r.grade];
  const sub = r.statUp ? `${stat} ${r.before} → ${r.after}` : r.grade === 'kacti' ? t('train.noProgress') : t('train.progress', { n: r.progress });
  return (
    <View accessibilityLiveRegion="polite" style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Icon name={G.icon} size={22} color={G.color} />
      <View>
        <T w={600} size={15} color={G.color}>{G.label} · +{r.xp} XP</T>
        <T w={500} size={13} color={colors.g200}>{sub}{r.ups ? t('train.levelUp', { n: level }) : ''}</T>
      </View>
    </View>
  );
}
