import { useEffect } from 'react';
import { View } from 'react-native';

import { useGame } from '../game/store.ts';
import type { AchievementView } from '../net/api.ts';
import { colors } from '../theme.ts';
import { achDesc, achIcon, achName, achProgress } from '../ui/kariyer.tsx';
import { Icon } from '../ui/Icon.tsx';
import { Caps, Cta, H3, T, Track } from '../ui/kit.tsx';
import { Skeleton } from '../ui/motion.tsx';
import { ErrorState } from '../ui/states.tsx';
import { Shell } from '../ui/mahalle.tsx';
import { closeSheet, openSheet, SheetText } from '../ui/overlay.tsx';
import { Amount, Ico, Tile } from '../ui/sade.tsx';
import { t, type Key } from '../i18n/index.ts';

// Kupa dolabı: the achievements, three groups of tiles. A locked tile is dimmed and shows
// how far along the player is; unlocking is done by the server and pays its coin once.

const GROUPS = ['match', 'mahalle', 'club'] as const;

export default function Kupalar() {
  const list = useGame(s => s.kariyer?.achievements);
  const tried = useGame(s => s.kariyerTried);
  const loading = !tried && !list;
  const refresh = useGame(s => s.refreshKariyer);
  useEffect(() => { void refresh(); }, [refresh]);
  const done = list?.filter(a => a.unlocked).length ?? 0;

  return (
    <Shell title={t('ach.title')} onRefresh={list ? refresh : undefined} right={list ? <T w={700} size={16} color={colors.l500}>{t('ach.count', { n: done, m: list.length })}</T> : undefined}>
      {list && (
        <View style={{ alignItems: 'center', gap: 10, paddingVertical: 4 }}>
          <Ico name="cup" size={96} dim={done === 0} />
          <View style={{ width: '70%' }}><Track value={list.length ? done / list.length : 0} /></View>
        </View>
      )}
      {loading && (
        <>
          <View style={{ alignItems: 'center', gap: 10, paddingVertical: 4 }}>
            <Skeleton width={96} height={96} radius={30} />
            <Skeleton width="70%" height={8} radius={4} />
          </View>
          {GROUPS.map(g => (
            <View key={g} style={{ gap: 10 }}>
              <Caps>{t(`ach.group.${g}` as Key)}</Caps>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {[0, 1, 2].map(i => <Skeleton key={i} width="31%" height={132} radius={22} />)}
              </View>
            </View>
          ))}
        </>
      )}
      {!loading && !list && <ErrorState onRetry={refresh} />}
      {list && GROUPS.map(g => (
        <View key={g} style={{ gap: 10 }}>
          <Caps>{t(`ach.group.${g}` as Key)}</Caps>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {list.filter(a => a.group === g).map(a => <Trophy key={a.key} a={a} />)}
          </View>
        </View>
      ))}
    </Shell>
  );
}

function Trophy({ a }: { a: AchievementView }) {
  return (
    <Tile
      selected={a.unlocked} onPress={() => open(a)} style={{ flexBasis: '31%', flexGrow: 0, flexShrink: 0, minHeight: 132 }}
      label={t('ach.a11y', { name: achName(a.key), state: a.unlocked ? t('ach.unlocked') : achProgress(a) })}
    >
      <Ico name={achIcon(a.key)} size={52} dim={!a.unlocked} />
      <T w={700} size={12} numberOfLines={2} style={{ textAlign: 'center', minHeight: 30 }} color={a.unlocked ? colors.g100 : colors.g200}>{achName(a.key)}</T>
      {a.unlocked ? <Icon name="check" size={16} color={colors.l600} /> : <T w={600} size={11} color={colors.g300}>{achProgress(a)}</T>}
    </Tile>
  );
}

function open(a: AchievementView) {
  openSheet(
    <>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Ico name={achIcon(a.key)} size={96} dim={!a.unlocked} />
        <H3 style={{ textAlign: 'center' }}>{achName(a.key)}</H3>
      </View>
      <SheetText>{achDesc(a.key)}</SheetText>
      {!a.unlocked && <View style={{ gap: 6 }}><Track value={a.value / a.target} /><T w={600} size={13} color={colors.g200} style={{ textAlign: 'center' }}>{achProgress(a)}</T></View>}
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
        <Caps>{t('ach.reward')}</Caps>
        <Amount icon="coin" size={24} textSize={16}>{a.coin}</Amount>
      </View>
      <Cta onPress={closeSheet}>{t('common.ok')}</Cta>
    </>,
  );
}
