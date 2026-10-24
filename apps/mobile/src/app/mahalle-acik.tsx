import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useGame } from '../game/store.ts';
import { listOpenMahalle, type OpenMahalle } from '../net/api.ts';
import { colors } from '../theme.ts';
import { Emblem } from '../ui/emblem.tsx';
import { Icon } from '../ui/Icon.tsx';
import { buzz, Ghost, T } from '../ui/kit.tsx';
import { mahalleError, Shell } from '../ui/mahalle.tsx';
import { Amount, Ico, Tile } from '../ui/sade.tsx';
import { t } from '../i18n/index.ts';

export default function MahalleAcik() {
  const joinMahalle = useGame(s => s.joinMahalle);
  const [list, setList] = useState<OpenMahalle[] | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listOpenMahalle().then((l) => { if (live) setList(l); }).catch((e) => { if (live) { setList([]); setError(mahalleError(e)); } });
    return () => { live = false; };
  }, []);

  async function join(id: string) {
    if (joining) return;
    buzz();
    setJoining(id); setError(null);
    try { await joinMahalle({ id }); } catch (e) { setError(mahalleError(e)); setJoining(null); }
  }

  return (
    <Shell title={t('mahalle.open.title')} footer={<Ghost onPress={() => router.replace('/mahalle-kur')}>{t('mahalle.open.create')}</Ghost>}>
      {error && <T w={500} size={14} color={colors.bad} accessibilityLiveRegion="polite">{error}</T>}
      {list === null && <ActivityIndicator size="large" color={colors.l600} style={{ marginTop: 24 }} />}
      {list?.length === 0 && !error && (
        <View style={{ alignItems: 'center', gap: 10, paddingTop: 30 }}>
          <Ico name="mahalleBul" size={96} dim />
          <T color={colors.g200} style={{ textAlign: 'center', lineHeight: 21 }}>{t('mahalle.open.empty')}</T>
        </View>
      )}
      <View style={{ gap: 10 }}>
        {list?.map((m) => (
          <Tile
            key={m.id} row label={`${t('mahalle.open.join')}: ${m.name}, ${t('mahalle.open.members', { n: m.memberCount })}`}
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
        ))}
      </View>
    </Shell>
  );
}
