import { DEFAULT_CONFIG, type LifestyleItem } from '@streetborn/economy';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { num } from '../../game/format.ts';
import { useGame } from '../../game/store.ts';
import { colors, radius, TAB_BAR_SPACE } from '../../theme.ts';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { Icon } from '../../ui/Icon.tsx';
import { Caps, Cta, H1, H3, T } from '../../ui/kit.tsx';
import { PressableScale } from '../../ui/motion.tsx';
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
  // The showcase: the best home the player has and the next thing to aim for.
  const home = [...ITEMS].reverse().find(i => i.id.startsWith('ev_') && owned(i));
  const next = ITEMS.find(i => !owned(i));

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
            <T w={600} size={18} color={locked ? colors.g200 : colors.l600}>{t('life.level', { n: i.unlockLevel })}</T>
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
        <View style={{ height: 40, paddingLeft: 8, paddingRight: 12, borderRadius: 20, backgroundColor: colors.s2, justifyContent: 'center' }}>
          <Amount icon="coin" size={26}>{num(coins)}</Amount>
        </View>
      </View>
      <HintBubble id="lifeTab" text={t('hint.lifeTab')} />

      {home && <Showcase home={home} next={next} level={level} onPress={() => open(home)} />}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {ITEMS.map(i => {
          const mine = owned(i);
          const locked = level < i.unlockLevel;
          return (
            <Tile
              key={i.id} onPress={() => open(i)} style={{ width: '48%', flexGrow: 1, minHeight: 152, gap: 4 }}
              label={`${name(i)}, ${mine ? t('life.owned') : locked ? t('life.level', { n: i.unlockLevel }) : `${num(i.price)} coin`}`}
            >
              <Ico name={ICON[i.id]!} size={72} dim={locked} />
              <T w={600} size={15} color={locked ? colors.g200 : colors.g100} numberOfLines={1} style={{ marginTop: 4 }}>{name(i)}</T>
              {mine ? (
                <Icon name="check" size={16} color={colors.l600} />
              ) : locked ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Icon name="lock" size={14} color={colors.g200} />
                  <T w={500} size={13} color={colors.g200}>{t('life.level', { n: i.unlockLevel })}</T>
                </View>
              ) : (
                <Amount icon="coin" size={16} textSize={13}>{num(i.price)}</Amount>
              )}
            </Tile>
          );
        })}
      </View>
    </ScrollView>
  );
}

/**
 * The screen's one lit card: the player's home on a lime floor glow, and the next item to aim for.
 * Status only, like the rest of Yaşam (GDD v3.1 section 8.1).
 */
function Showcase({ home, next, level, onPress }: { home: LifestyleItem; next: LifestyleItem | undefined; level: number; onPress: () => void }) {
  const nextLocked = !!next && level < next.unlockLevel;
  return (
    <PressableScale
      accessibilityRole="button" onPress={onPress} to={0.98}
      accessibilityLabel={`${t('life.home')}: ${name(home)}${next ? `. ${t('life.next')}: ${name(next)}` : ''}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 168, paddingHorizontal: 16, borderRadius: radius.lg, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }}
    >
      <View style={{ width: 148, height: 148, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={148} height={36} style={{ position: 'absolute', bottom: 4 }}>
          <Defs>
            <RadialGradient id="homeGlow" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor={colors.l600} stopOpacity={0.28} />
              <Stop offset="1" stopColor={colors.l600} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx={74} cy={18} rx={74} ry={18} fill="url(#homeGlow)" />
        </Svg>
        <Ico name={ICON[home.id]!} size={140} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Caps>{t('life.home')}</Caps>
        <T w={600} size={22}>{name(home)}</T>
        {next && <>
          <Caps style={{ marginTop: 12 }}>{t('life.next')}</Caps>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            {nextLocked
              ? <><Icon name="lock" size={14} color={colors.g200} /><T w={600} size={15}>{name(next)} · {t('life.level', { n: next.unlockLevel })}</T></>
              : <><Amount icon="coin" size={18} textSize={15}>{num(next.price)}</Amount><T w={600} size={15}>· {name(next)}</T></>}
          </View>
        </>}
      </View>
    </PressableScale>
  );
}
