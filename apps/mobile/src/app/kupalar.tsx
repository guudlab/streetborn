import { useEffect } from 'react';
import { View } from 'react-native';

import { useGame } from '../game/store.ts';
import type { AchievementView } from '../net/api.ts';
import { colors } from '../theme.ts';
import { achDesc, achIcon, achName, achProgress } from '../ui/kariyer.tsx';
import { Caps, Cta, H3, Section, T, Track } from '../ui/kit.tsx';
import { Enter, Skeleton } from '../ui/motion.tsx';
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
    <Shell title={t('ach.title')} onRefresh={list ? refresh : undefined}>
      {list && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16 }} accessible accessibilityLabel={t('ach.count', { n: done, m: list.length })}>
          <View>
            <T w={600} size={56} style={{ lineHeight: 60, fontVariant: ['tabular-nums'] }}>{done}</T>
            <Caps>{t('ach.ofTotal', { m: list.length })}</Caps>
          </View>
          <View style={{ flex: 1, paddingBottom: 8 }}><Track value={list.length ? done / list.length : 0} /></View>
        </View>
      )}
      {list && <NextTrophy list={list} />}
      {loading && (
        <>
          <View style={{ alignItems: 'center', gap: 12, paddingVertical: 4 }}>
            <Skeleton width={96} height={96} radius={30} />
            <Skeleton width="70%" height={8} radius={4} />
          </View>
          {GROUPS.map(g => (
            <View key={g} style={{ gap: 12 }}>
              <Section>{t(`ach.group.${g}` as Key)}</Section>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[0, 1, 2].map(i => <Skeleton key={i} width="31%" height={132} radius={20} />)}
              </View>
            </View>
          ))}
        </>
      )}
      {!loading && !list && <ErrorState onRetry={refresh} />}
      {list && GROUPS.map(g => (
        <View key={g} style={{ gap: 12 }}>
          <Section>{t(`ach.group.${g}` as Key)}</Section>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {list.filter(a => a.group === g).map((a, i) => <Trophy key={a.key} a={a} i={i} />)}
          </View>
        </View>
      ))}
    </Shell>
  );
}

function Trophy({ a, i }: { a: AchievementView; i: number }) {
  // Unlocked trophies are in full colour; locked ones are dimmed with a thin progress bar.
  // No lime frames here: the one lit card on this screen is the next trophy above.
  return (
    <Enter i={i} style={{ flexBasis: '31%', flexGrow: 0, flexShrink: 0 }}>
      <Tile
        onPress={() => open(a)} style={{ minHeight: 128 }}
        label={t('ach.a11y', { name: achName(a.key), state: a.unlocked ? t('ach.unlocked') : achProgress(a) })}
      >
        <Ico name={achIcon(a.key)} size={52} dim={!a.unlocked} />
        <T w={a.unlocked ? 600 : 500} size={12} numberOfLines={2} style={{ textAlign: 'center', minHeight: 32 }} color={a.unlocked ? colors.g100 : colors.g200}>{achName(a.key)}</T>
        {!a.unlocked && (
          <View style={{ width: 56, height: 4, borderRadius: 2, backgroundColor: colors.s3, overflow: 'hidden' }}>
            <View style={{ width: `${Math.min(100, (a.value / a.target) * 100)}%`, height: '100%', backgroundColor: colors.g300 }} />
          </View>
        )}
      </Tile>
    </Enter>
  );
}

/** The locked trophy the player is closest to, with its reward: the screen's lit card. */
function NextTrophy({ list }: { list: AchievementView[] }) {
  const next = list.filter(a => !a.unlocked).sort((x, y) => y.value / y.target - x.value / x.target)[0];
  if (!next) return null;
  return (
    <Tile
      row selected onPress={() => open(next)} style={{ minHeight: 88 }}
      label={`${t('ach.next')}: ${achName(next.key)}, ${achProgress(next)}`}
    >
      <Ico name={achIcon(next.key)} size={56} />
      <View style={{ flex: 1, gap: 2 }}>
        <Caps>{t('ach.next')}</Caps>
        <T w={600} size={17} numberOfLines={1}>{achName(next.key)}</T>
        <T w={500} size={13} color={colors.g200} numberOfLines={2}>{t('ach.nextReward', { coin: next.coin })}</T>
      </View>
      <T w={600} size={22} style={{ fontVariant: ['tabular-nums'] }}>{achProgress(next)}</T>
    </Tile>
  );
}

function open(a: AchievementView) {
  openSheet(
    <>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Ico name={achIcon(a.key)} size={96} dim={!a.unlocked} />
        <H3 style={{ textAlign: 'center' }}>{achName(a.key)}</H3>
      </View>
      <SheetText>{achDesc(a.key)}</SheetText>
      {!a.unlocked && <View style={{ gap: 8 }}><Track value={a.value / a.target} /><T w={600} size={13} color={colors.g200} style={{ textAlign: 'center' }}>{achProgress(a)}</T></View>}
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
        <Caps>{t('ach.reward')}</Caps>
        <Amount icon="coin" size={24} textSize={16}>{a.coin}</Amount>
      </View>
      <Cta onPress={closeSheet}>{t('common.ok')}</Cta>
    </>,
  );
}
