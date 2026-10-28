import { Redirect, router } from 'expo-router';
import { View } from 'react-native';

import { standings, tierName } from '../game/career.ts';
import { useGame } from '../game/store.ts';
import { colors } from '../theme.ts';
import { Caps, Cta, Ghost, H1, T } from '../ui/kit.tsx';
import { Pop } from '../ui/motion.tsx';
import { Shell } from '../ui/mahalle.tsx';
import { Amount, Bubble, Ico } from '../ui/sade.tsx';
import { t } from '../i18n/index.ts';

// Sezon özeti: shown once when a league season ends (the hub opens it). Place, the player's
// club record and the prize; the offers for the next season wait one tap away.

export default function SezonOzeti() {
  const summary = useGame(s => s.seasonSummary);
  const career = useGame(s => s.career);
  if (!summary) return <Redirect href="/" />;

  const table = standings(career);
  const me = table?.rows.find(r => r.index === 0);
  const tier = career?.season?.tier ?? 0;
  const done = () => useGame.setState({ seasonSummary: null });
  const line = summary.place === 1 ? t('season.line.first') : summary.place <= 3 ? t('season.line.top') : t('season.line.rest');

  return (
    <Shell
      back={false}
      footer={
        <>
          <Cta onPress={() => { done(); router.replace('/teklifler'); }}>{t('season.next')}</Cta>
          <Ghost onPress={() => { done(); router.replace('/'); }}>{t('season.home')}</Ghost>
        </>
      }
    >
      <View style={{ alignItems: 'center', gap: 8, paddingTop: 12 }}>
        <Caps>{t('season.title')}</Caps>
        <Pop delay={100}><Ico name="cup" size={summary.place === 1 ? 168 : 128} dim={summary.place > 3} /></Pop>
        <H1 accessibilityRole="header">{t('season.place', { place: summary.place })}</H1>
        <T w={500} size={14} color={colors.g200}>{tierName(tier)}</T>
      </View>

      {me && (
        <View style={{ flexDirection: 'row', borderRadius: 20, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, paddingVertical: 14 }}>
          <Stat value={`${me.points}`} label="P" />
          <Stat value={t('season.record', { w: me.won, d: me.drawn, l: me.lost })} label={`${me.played}`} wide />
          <Stat value={`${me.goalsFor} / ${me.goalsAgainst}`} label={t('season.goals')} wide />
        </View>
      )}

      {summary.prize > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 20, backgroundColor: colors.l900 }}>
          <Caps color={colors.l500}>{t('season.prize')}</Caps>
          <Amount icon="coin" size={30} textSize={22} color={colors.l500}>+{summary.prize}</Amount>
        </View>
      )}

      <Bubble text={line} />
    </Shell>
  );
}

function Stat({ value, label, wide }: { value: string; label: string; wide?: boolean }) {
  return (
    <View style={{ flex: wide ? 2 : 1, alignItems: 'center', gap: 2, paddingHorizontal: 4 }}>
      <T w={700} size={wide ? 15 : 22} numberOfLines={1}>{value}</T>
      <T w={500} size={11} color={colors.g200} numberOfLines={1}>{label}</T>
    </View>
  );
}
