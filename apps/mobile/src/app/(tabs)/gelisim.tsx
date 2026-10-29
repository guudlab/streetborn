import { apNeed, dailyDrill, DEFAULT_CONFIG, istanbulDay, privateCost } from '@streetborn/economy';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DRILLS, ovr, type DrillKey, type StatKey } from '../../game/rules.ts';
import { markHint } from '../../game/hints.ts';
import { SERVER_STAT, useGame, type TrainResult } from '../../game/store.ts';
import { colors, TAB_BAR_SPACE } from '../../theme.ts';
import { openEnergySheet } from '../../ui/energy.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { toast } from '../../ui/overlay.tsx';
import { sfx } from '../../audio/audio.ts';
import { buzz, Caps, CoachFace, Cta, H1, T } from '../../ui/kit.tsx';
import { PressableScale } from '../../ui/motion.tsx';
import { Amount, bootIcon, Bubble, Ico, Segments, Tile, type IconAsset } from '../../ui/sade.tsx';
import { Star } from '../../ui/drills/common.tsx';
import { t, type Key } from '../../i18n/index.ts';

const KEYS: StatKey[] = ['sut', 'pas', 'hiz', 'fizik'];
const GRADES = {
  mukemmel: { color: colors.l600, icon: 'star', label: t('train.grade.mukemmel') },
  iyi: { color: colors.g100, icon: 'check', label: t('train.grade.iyi') },
  kacti: { color: colors.bad, icon: 'x', label: t('train.grade.kacti') },
  ozel: { color: colors.l600, icon: 'whistle', label: t('train.grade.ozel') },
} as const;
const BOOTS_FROM = Math.min(...DEFAULT_CONFIG.training.boots.map(b => b.unlockLevel));
const tc = DEFAULT_CONFIG.training;
const STAT_ICON: Record<StatKey, IconAsset> = { sut: 'sut', pas: 'pas', hiz: 'hiz', fizik: 'fizik' };

export default function Gelisim() {
  const insets = useSafeAreaInsets();
  const g = useGame();
  // Burak abi's drill of the day: 3 stars on it ready the player for today's match.
  const today = dailyDrill(istanbulDay(Date.now()));
  const daily = KEYS.find(k => SERVER_STAT[k] === today)!;
  const [sel, setSel] = useState<DrillKey>(daily);
  const [last, setLast] = useState<TrainResult | null>(null);
  const [busy, setBusy] = useState(false);
  const d = DRILLS[sel];
  const online = g.mode === 'online';
  // After the free drills each drill costs 1 energy (online the server checks both).
  const can = g.trainFree > 0 || g.energy > 0;
  // Online the AP needed per point grows with the stat (GDD v3.1); the offline prototype keeps 3.
  const need = (k: StatKey) => (online ? apNeed(g.stats[k], tc) : 3);
  // Omuz oku trains no stat, so it has no private session.
  const statSel = sel === 'omuz' ? null : sel;
  const cost = statSel ? privateCost(g.stats[statSel], tc) : 0;
  const coach = g.career?.contract?.active ? t('train.private.clubCoach') : t('train.private.burak');

  useEffect(() => { if (online) void useGame.getState().refreshTraining(); }, [online]);

  const pick = (k: DrillKey) => { if (busy) return; setSel(k); setLast(null); };
  const startDrill = async () => {
    setLast(null);
    setBusy(true);
    const r = await useGame.getState().startDrill(sel);
    setBusy(false);
    if (r === 'no_energy') return openEnergySheet();
    if (r !== 'ok') return toast(t('train.failed'));
    router.push('/talim');
  };
  const privateSession = async () => {
    if (!statSel) return;
    setBusy(true);
    const r = await useGame.getState().privateTrain(statSel);
    setBusy(false);
    if (r === 'no_coin') return toast(t('train.private.noCoin', { n: cost }));
    if (r === 'limit') return toast(t('train.private.limit'));
    if (!r) return toast(t('train.failed'));
    buzz('success');
    sfx(r.ups ? 'levelup' : r.statUp ? 'unlock' : 'coin');
    setLast(r);
    markHint('jobTrain');
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
      <Bubble text={g.drillStars[daily] === 3 || g.drillStars.omuz === 3 ? t('daily.ready') : t(`daily.${today}`)} size={36} />

      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {KEYS.map(k => {
          const on = k === sel;
          const flash = last?.statUp && last.key === k;
          const stars = g.drillStars[k] ?? 0;
          return (
            <Tile
              key={k} role="radio" selected={on} onPress={() => pick(k)} style={{ width: '48%', flexGrow: 1, gap: 8, paddingVertical: 14 }}
              label={`${DRILLS[k].stat} ${g.stats[k]}, ${k === daily ? `${t('daily.tag')}, ` : ''}${t('talim.stars', { n: stars })}, ${t('train.progressA11y', { n: g.drillProgress[k] })}`}
            >
              {k === daily && <View style={{ position: 'absolute', top: 12, right: 12, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.l600 }} />}
              <Ico name={STAT_ICON[k]} size={56} />
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <T w={600} size={13} color={colors.g200}>{DRILLS[k].stat}</T>
                <T w={700} size={26} color={flash ? colors.l600 : colors.g100}>{g.stats[k]}</T>
              </View>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {[0, 1, 2].map(i => <Star key={i} size={16} on={i < stars} />)}
              </View>
              <Segments n={g.drillProgress[k]} of={need(k)} height={5} gap={4} style={{ alignSelf: 'stretch', paddingHorizontal: 26 }} />
            </Tile>
          );
        })}
        <Tile
          row role="radio" selected={sel === 'omuz'} onPress={() => pick('omuz')} style={{ width: '100%', gap: 12 }}
          label={`${DRILLS.omuz.name}, ${DRILLS.omuz.stat}, ${t('talim.prep')}, ${t('talim.stars', { n: g.drillStars.omuz ?? 0 })}`}
        >
          <Ico name="calim" size={48} />
          <View style={{ flex: 1, gap: 2 }}>
            <T w={700} size={16}>{DRILLS.omuz.name}</T>
            <T w={600} size={13} color={colors.g200}>{DRILLS.omuz.stat} · {t('talim.prep')}</T>
          </View>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {[0, 1, 2].map(i => <Star key={i} size={16} on={i < (g.drillStars.omuz ?? 0)} />)}
          </View>
        </Tile>
      </View>

      <View style={{ flex: 1 }} />
      {g.trainStreak && (
        <View accessible style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="bolt" size={16} color={colors.l600} />
          <T w={600} size={14} color={colors.l600}>{t('train.streak')}</T>
        </View>
      )}
      {last && <DrillResult r={last} stat={DRILLS[last.key].stat} level={g.level} need={need(last.key)} />}
      {online && g.level >= BOOTS_FROM && <BootsChip />}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Cta
          style={{ flex: 1 }} disabled={!can} off={!can} busy={busy}
          onPress={() => void startDrill()}
          accessibilityLabel={`${d.name}: ${can ? t('common.start') : t('train.noEnergy')}`}
        >
          <T w={700} size={17} color={can ? colors.ink : colors.g200}>{can ? d.name : t('train.noEnergy')}</T>
          {can && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(13,13,13,.12)', borderRadius: 12, paddingVertical: 3, paddingHorizontal: 8 }}>
              {g.trainFree > 0
                ? <T w={700} size={13} color={colors.ink}>{t('train.freeShort', { n: g.trainFree })}</T>
                : <><Icon name="bolt" size={15} color={colors.ink} /><T w={700} size={14} color={colors.ink}>1</T></>}
            </View>
          )}
        </Cta>
        {online && statSel && (
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
    </ScrollView>
  );
}

/** The boots in use and their talim left; without boots, what a pair would do. Opens the shop. */
function BootsChip() {
  const boots = useGame(s => s.boots);
  const label = boots
    ? t('talim.bootsChip', { name: t(`boots.${boots.id}` as Key), n: boots.usesLeft })
    : t('talim.bootsNone');
  return (
    <PressableScale
      accessibilityRole="button" accessibilityLabel={label} onPress={() => router.navigate('/dukkan')}
      style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingLeft: 8, paddingRight: 12, borderRadius: 22, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line }}
    >
      <Ico name={bootIcon(boots?.id)} size={30} dim={!boots} />
      <T w={600} size={14} color={boots ? colors.g100 : colors.g200}>{label}</T>
      <Icon name="chev" size={16} color={colors.g200} />
    </PressableScale>
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
