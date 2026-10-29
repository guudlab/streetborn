import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useGame } from '../game/store.ts';
import { listOpenMahalle, type OpenMahalle } from '../net/api.ts';
import { colors } from '../theme.ts';
import { Emblem } from '../ui/emblem.tsx';
import { Icon } from '../ui/Icon.tsx';
import { buzz, Ghost, T } from '../ui/kit.tsx';
import { mahalleError, Shell } from '../ui/mahalle.tsx';
import { Enter, Skeleton } from '../ui/motion.tsx';
import { Amount, Tile } from '../ui/sade.tsx';
import { EmptyState, ErrorState, SkeletonList } from '../ui/states.tsx';
import { t } from '../i18n/index.ts';

export default function MahalleAcik() {
  const joinMahalle = useGame(s => s.joinMahalle);
  const [list, setList] = useState<OpenMahalle[] | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);
  const reload = useCallback(async () => {
    setError(null);
    try { const l = await listOpenMahalle(); if (live.current) setList(l); }
    catch (e) { if (live.current) { setList([]); setError(mahalleError(e)); } }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  async function join(id: string) {
    if (joining) return;
    buzz();
    setJoining(id); setError(null);
    try { await joinMahalle({ id }); } catch (e) { setError(mahalleError(e)); setJoining(null); }
  }

  return (
    <Shell
      title={t('mahalle.open.title')} onRefresh={list?.length ? reload : undefined}
      footer={list?.length === 0 && !error ? undefined : <Ghost onPress={() => router.replace('/mahalle-kur')}>{t('mahalle.open.create')}</Ghost>}
    >
      {/* A failed join keeps the list; a failed load replaces it with a retry. */}
      {error && !!list?.length && <T w={500} size={14} color={colors.bad} accessibilityLiveRegion="polite">{error}</T>}
      {error && list?.length === 0 && <ErrorState text={error} onRetry={reload} />}
      {list === null && <SkeletonList n={4}>{() => <Skeleton height={72} radius={22} />}</SkeletonList>}
      {list?.length === 0 && !error && (
        <EmptyState icon="mahalleBul" text={t('mahalle.open.empty')} action={{ label: t('mahalle.open.create'), onPress: () => router.replace('/mahalle-kur') }} primary />
      )}
      <View style={{ gap: 10 }}>
        {list?.map((m, i) => (
          <Enter key={m.id} i={i}>
            <Tile
              row label={`${t('mahalle.open.join')}: ${m.name}, ${t('mahalle.open.members', { n: m.memberCount })}`}
              disabled={joining !== null} onPress={() => void join(m.id)} style={{ opacity: joining && joining !== m.id ? 0.5 : 1 }}
            >
              <Emblem shape={m.emblem} color={m.color} name={m.name} size={48} />
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <T w={700} size={17} numberOfLines={1}>{m.name}</T>
                <Amount icon="oyuncu" size={18} textSize={13} color={colors.g200}>{m.memberCount} / 12</Amount>
              </View>
              {joining === m.id ? <ActivityIndicator color={colors.l600} /> : (
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.l600, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="plus" size={22} color={colors.ink} />
                </View>
              )}
            </Tile>
          </Enter>
        ))}
      </View>
    </Shell>
  );
}
