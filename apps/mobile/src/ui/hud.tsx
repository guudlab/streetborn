import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { num } from '../game/format.ts';
import { levelProgress } from '../game/rules.ts';
import { useGame } from '../game/store.ts';
import { colors } from '../theme.ts';
import { energyLeft } from './energy.tsx';
import { Pill, Ring, T, useNow } from './kit.tsx';
import { PressableScale, Pulse } from './motion.tsx';
import { ICONS } from './sade.tsx';
import { t } from '../i18n/index.ts';

/**
 * Top bar of the sade UI: level ring, energy (with the regen timer), coin and gem.
 * Numbers and icons only; the ring opens Gelişim, the rest open the shop.
 */
export function Hud() {
  const now = useNow();
  const g = useGame();
  const sync = useGame(s => s.syncEnergy);
  useEffect(() => sync(now), [now, sync]);
  const left = energyLeft(now);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 }}>
      <PressableScale
        accessibilityRole="button" accessibilityLabel={t('hud.levelA11y', { name: g.name, level: g.level })}
        onPress={() => router.navigate('/gelisim')} hitSlop={4}
      >
        <Ring size={44} stroke={3} value={levelProgress(g.level, g.xp)}><Pulse value={g.level}><T w={700} size={16}>{g.level}</T></Pulse></Ring>
      </PressableScale>
      <Pill
        image={ICONS.enerji}
        label={t('hud.energyA11y', { energy: g.energy, max: g.energyMax }) + (left ? t('hud.energyNext', { t: left }) : '')} onPress={() => router.navigate('/dukkan')}
      >
        <Pulse value={g.energy}><T w={700} size={15} color={g.energy === 0 ? colors.g300 : colors.g100}>{g.energy}</T></Pulse>
        {left && <T w={500} size={12} color={colors.g200}>{left}</T>}
      </Pill>
      <View style={{ flex: 1 }} />
      <Pill image={ICONS.coin} label={t('hud.coinA11y', { n: num(g.coins) })} onPress={() => router.navigate('/dukkan')}>
        <Pulse value={g.coins}><T w={700} size={15}>{num(g.coins)}</T></Pulse>
      </Pill>
      <Pill image={ICONS.gem} label={t('hud.gemA11y', { n: g.gems })} onPress={() => router.navigate('/dukkan')}>
        <Pulse value={g.gems}><T w={700} size={15}>{g.gems}</T></Pulse>
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
