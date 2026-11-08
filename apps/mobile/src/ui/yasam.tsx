import { DEFAULT_CONFIG, lifeShowcase, lifeTop } from '@streetborn/economy';
import { View } from 'react-native';

import { useGame } from '../game/store.ts';
import { t, type Key } from '../i18n/index.ts';
import { colors, radius } from '../theme.ts';
import { buzz, Section, T } from './kit.tsx';
import { feedLine, type FeedLine } from './live/Commentary.tsx';
import { PressableScale } from './motion.tsx';
import { Ico, type IconAsset } from './sade.tsx';

// The Yaşam showcase outside the Yaşam tab (Kaan 2026-11-08 "Şimdi aç + vitrin"): the profile
// row, the badge on the mahalle member card and the kick-off line. Status only.

const LIFE = DEFAULT_CONFIG.lifestyle;

export const LIFE_ICON: Record<string, IconAsset> = {
  ev_oda: 'evOda', bisiklet: 'bisiklet', ev_daire: 'evDaire', araba: 'araba',
  arsa: 'arsa', halisaha: 'halisaha', ev_villa: 'evVilla', spor_araba: 'sporAraba',
};

/** The Yaşam ids among the player's own items. */
export const myLife = () => useGame.getState().owned.filter(o => LIFE_ICON[o.id]).map(o => o.id);

/**
 * The profile row: home, ride and land side by side. A group the player has nothing in yet shows
 * its first item dimmed. On the player's own profile it opens Yaşam.
 */
export function LifeRow({ bought, onPress }: { bought: readonly string[]; onPress?: () => void }) {
  const show = lifeShowcase(bought, LIFE);
  const first = (group: string) => LIFE.items.find(i => i.group === group && i.price > 0)!.id;
  const slots = [
    { group: 'ev', id: show.ev, have: true },
    { group: 'ulasim', id: show.ulasim ?? first('ulasim'), have: !!show.ulasim },
    { group: 'arsa', id: show.arsa ?? first('arsa'), have: !!show.arsa },
  ];
  const label = slots.filter(s => s.have).map(s => t(`life.${s.id}` as Key)).join(', ');
  const body = (
    <View style={{ flexDirection: 'row', paddingVertical: 16, paddingHorizontal: 8, borderRadius: radius.lg, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line }}>
      {slots.map(s => (
        <View key={s.group} style={{ flex: 1, alignItems: 'center', gap: 8 }}>
          <Ico name={LIFE_ICON[s.id]!} size={64} dim={!s.have} />
          <T w={s.have ? 600 : 500} size={13} color={s.have ? colors.g100 : colors.g300} numberOfLines={1}>
            {s.have ? t(`life.${s.id}` as Key) : t(`life.none.${s.group}` as Key)}
          </T>
        </View>
      ))}
    </View>
  );
  return (
    <View style={{ gap: 12 }}>
      <Section>{t('tab.life')}</Section>
      {onPress ? (
        <PressableScale accessibilityRole="button" accessibilityLabel={`${t('tab.life')}: ${label}`} onPress={() => { buzz(); onPress(); }} to={0.98}>
          {body}
        </PressableScale>
      ) : <View accessible accessibilityLabel={`${t('tab.life')}: ${label}`}>{body}</View>}
    </View>
  );
}

/** The dearest item a mahalle mate owns, as a small badge on their card. Null when they own none. */
export function LifeBadge({ bought, size = 24 }: { bought: readonly string[] | undefined; size?: number }) {
  const top = lifeTop(bought ?? [], LIFE);
  if (!top) return null;
  return <Ico name={LIFE_ICON[top]!} size={size} />;
}

/** Spoken name of a mate's dearest item, for the card's accessibility label. */
export const lifeTopName = (bought: readonly string[] | undefined) => {
  const top = lifeTop(bought ?? [], LIFE);
  return top ? t(`life.${top}` as Key) : null;
};

/** The kick-off line when the player came in something: "Maça arabanla geldin." Null on foot. */
export function arrivalLine(): FeedLine | null {
  const ride = lifeShowcase(myLife(), LIFE).ulasim;
  return ride ? feedLine(0, t(`life.arrive.${ride}` as Key), 'me', null) : null;
}

