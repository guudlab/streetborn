import { DEFAULT_CONFIG, type LifestyleItem } from '@streetborn/economy';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { num } from '../../game/format.ts';
import { useGame } from '../../game/store.ts';
import { colors, TAB_BAR_SPACE } from '../../theme.ts';
import { Icon } from '../../ui/Icon.tsx';
import { Cta, H1, H3, T } from '../../ui/kit.tsx';
import { closeSheet, openSheet, SheetText } from '../../ui/overlay.tsx';
import { Amount, Ico, Tile, type IconAsset } from '../../ui/sade.tsx';
import { HintBubble } from '../../ui/hint.tsx';
import { t, type Key } from '../../i18n/index.ts';

// Yaşam: the house, ride and land the player shows off (GDD v3.1 section 8.1). Status only,
// no match or stat effect. Buying needs the server grant (not built yet), so a tap shows
// what an item costs and when it opens.

const ICON: Record<string, IconAsset> = {
  ev_oda: 'evOda', bisiklet: 'bisiklet', ev_daire: 'evDaire', araba: 'araba',
  arsa: 'arsa', halisaha: 'halisaha', ev_villa: 'evVilla', spor_araba: 'sporAraba',
};
const ITEMS = DEFAULT_CONFIG.lifestyle.items.filter(i => ICON[i.id]);
const name = (i: LifestyleItem) => t(`life.${i.id}` as Key);

export default function Yasam() {
  const insets = useSafeAreaInsets();
  const coins = useGame(s => s.coins);
  const level = useGame(s => s.level);
  // Only the free starter room is owned until buying lands on the server.
  const owned = (i: LifestyleItem) => i.price === 0 && level >= i.unlockLevel;

  function open(i: LifestyleItem) {
    const locked = level < i.unlockLevel;
    openSheet(
      <>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Ico name={ICON[i.id]!} size={120} />
          <H3>{name(i)}</H3>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 18 }}>
          {i.price > 0 && <Amount icon="coin" size={26} textSize={18}>{num(i.price)}</Amount>}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name={locked ? 'lock' : 'check'} size={18} color={locked ? colors.g200 : colors.l600} />
            <T w={700} size={18} color={locked ? colors.g200 : colors.l600}>{t('life.level', { n: i.unlockLevel })}</T>
          </View>
        </View>
        {i.id === 'halisaha' && <SheetText>{t('life.halisahaIncome', { n: DEFAULT_CONFIG.lifestyle.halisahaIncomePerDay })}</SheetText>}
        <SheetText>{owned(i) ? t('life.ownedText') : t('life.soonText')}</SheetText>
        <Cta onPress={closeSheet}>{t('common.ok')}</Cta>
      </>,
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: TAB_BAR_SPACE + insets.bottom, gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
        <H1>{t('tab.life')}</H1>
        <View style={{ height: 40, paddingLeft: 6, paddingRight: 12, borderRadius: 20, backgroundColor: colors.s2, justifyContent: 'center' }}>
          <Amount icon="coin" size={26}>{num(coins)}</Amount>
        </View>
      </View>
      <HintBubble id="lifeTab" text={t('hint.lifeTab')} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {ITEMS.map(i => {
          const mine = owned(i);
          const locked = level < i.unlockLevel;
          return (
            <Tile
              key={i.id} selected={mine} onPress={() => open(i)} style={{ width: '48%', flexGrow: 1, minHeight: 150 }}
              label={`${name(i)}, ${mine ? t('life.owned') : locked ? t('life.level', { n: i.unlockLevel }) : `${num(i.price)} coin`}`}
            >
              <Ico name={ICON[i.id]!} size={84} dim={locked} />
              {mine ? (
                <Icon name="check" size={20} color={colors.l600} />
              ) : locked ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Icon name="lock" size={15} color={colors.g200} />
                  <T w={700} size={14} color={colors.g200}>{t('life.level', { n: i.unlockLevel })}</T>
                </View>
              ) : (
                <Amount icon="coin" size={20} textSize={14}>{num(i.price)}</Amount>
              )}
            </Tile>
          );
        })}
      </View>
    </ScrollView>
  );
}
