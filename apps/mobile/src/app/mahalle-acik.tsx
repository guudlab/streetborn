import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useGame } from '../game/store.ts';
import { listOpenMahalle, type OpenMahalle } from '../net/api.ts';
import { colors } from '../theme.ts';
import { Emblem } from '../ui/emblem.tsx';
import { buzz, Ghost, H1, T } from '../ui/kit.tsx';
import { PressableScale } from '../ui/motion.tsx';
import { mahalleError, Shell } from '../ui/mahalle.tsx';
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
    <Shell
      label={t('mahalle.label')}
      footer={<Ghost onPress={() => router.replace('/mahalle-kur')}>{t('mahalle.open.create')}</Ghost>}
    >
      <View style={{ gap: 6 }}>
        <H1>{t('mahalle.open.title')}</H1>
        <T color={colors.g200} style={{ lineHeight: 21 }}>{t('mahalle.open.sub')}</T>
      </View>
      {error && <T w={500} size={14} color={colors.bad} accessibilityLiveRegion="polite">{error}</T>}
      {list === null && <ActivityIndicator size="large" color={colors.l600} style={{ marginTop: 24 }} />}
      {list?.length === 0 && !error && <T color={colors.g200} style={{ lineHeight: 21 }}>{t('mahalle.open.empty')}</T>}
      <View style={{ gap: 8 }}>
        {list?.map((m) => (
          <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line }}>
            <Emblem shape={m.emblem} color={m.color} name={m.name} size={44} />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <T w={600} size={16} numberOfLines={1}>{m.name}</T>
              <T w={500} size={12} color={colors.g200}>{t('mahalle.open.members', { n: m.memberCount })}</T>
            </View>
            <PressableScale
              accessibilityRole="button" accessibilityLabel={`${t('mahalle.open.join')}: ${m.name}`} disabled={joining !== null}
              onPress={() => void join(m.id)}
              style={{ height: 44, minWidth: 72, paddingHorizontal: 14, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.l600, opacity: joining && joining !== m.id ? 0.5 : 1 }}
            >
              <T w={600} size={14} color={colors.ink}>{t('mahalle.open.join')}</T>
            </PressableScale>
          </View>
        ))}
      </View>
    </Shell>
  );
}
