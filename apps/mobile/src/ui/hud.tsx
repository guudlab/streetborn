import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';

import { num } from '../game/format.ts';
import { OFFERS, levelProgress } from '../game/rules.ts';
import { tierName } from '../game/career.ts';
import { useGame } from '../game/store.ts';
import { colors } from '../theme.ts';
import { energyLeft } from './energy.tsx';
import { Pill, Ring, T, useNow } from './kit.tsx';
import { Pulse } from './motion.tsx';
import { t } from '../i18n/index.ts';

/** Top bar: level ring + name, coins, energy with regen timer. */
export function Hud() {
  const now = useNow();
  const g = useGame();
  const sync = useGame(s => s.syncEnergy);
  useEffect(() => sync(now), [now, sync]);
  const left = energyLeft(now);
  // Online the line shows the real club and league, or the mahalle before the first contract.
  const contract = g.mode === 'online' ? g.career?.contract : null;
  const line = g.mode === 'online'
    ? contract?.active ? `${contract.clubName} · ${tierName(contract.tier)}` : `${g.mahalle?.name ?? t('hud.mahalle')} · ${t('hud.mahalleLeague')}`
    : `${g.signed ? t('hud.clubSeasonEnd', { club: OFFERS.find(o => o.id === g.signed)!.club }) : g.club} · ${t('hud.league')}`;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 }}>
      <Pressable
        accessibilityRole="button" accessibilityLabel={t('hud.levelA11y', { name: g.name, level: g.level })}
        onPress={() => router.navigate('/gelisim')}
        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}
      >
        <Ring size={44} stroke={3} value={levelProgress(g.level, g.xp)}><Pulse value={g.level}><T w={700} size={16}>{g.level}</T></Pulse></Ring>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T w={600} size={15} numberOfLines={1}>{g.name}</T>
          <T size={12} color={colors.g200} numberOfLines={1}>{line}</T>
        </View>
      </Pressable>
      <Pill image={require("../../assets/meshy/coin.webp")} label={t('hud.coinA11y', { n: num(g.coins) })} onPress={() => router.navigate('/dukkan')}>
        <Pulse value={g.coins}><T w={600} size={15}>{num(g.coins)}</T></Pulse>
      </Pill>
      <Pill
        icon="bolt" iconColor={g.energy === 0 ? colors.g400 : colors.l600}
        label={t('hud.energyA11y', { energy: g.energy, max: g.energyMax }) + (left ? t('hud.energyNext', { t: left }) : '')} onPress={() => router.navigate('/dukkan')}
      >
        <Pulse value={g.energy}><T w={600} size={15}>{g.energy}/{g.energyMax}</T></Pulse>
        {left && <T w={500} size={12} color={colors.g200}>{left}</T>}
      </Pill>
    </View>
  );
}

export function Crest({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}>
      <T w={700} size={12} color={fg}>{text}</T>
    </View>
  );
}
