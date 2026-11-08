import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { DEFAULT_CHARACTER } from '../game/character.ts';
import { ovr } from '../game/rules.ts';
import { useGame } from '../game/store.ts';
import { ApiError, loadPlayer, type PlayerProfile } from '../net/api.ts';
import { colors, radius } from '../theme.ts';
import { Emblem } from '../ui/emblem.tsx';
import { Icon } from '../ui/Icon.tsx';
import { achIcon } from '../ui/kariyer.tsx';
import { buzz, Caps, Section, T } from '../ui/kit.tsx';
import { Shell } from '../ui/mahalle.tsx';
import { PressableScale, Skeleton } from '../ui/motion.tsx';
import { openPlayerMenu } from '../ui/player-menu.tsx';
import { Ico } from '../ui/sade.tsx';
import { ErrorState } from '../ui/states.tsx';
import { Count, LastRatings, PlaceRow, PlayerCard, SKILLS, STAT_MAX } from './profil.tsx';
import { t, type Key } from '../i18n/index.ts';

// Another player's profile: the same card as Profil, read only. The server returns just the
// public fields (see oyuncu_profil), so there is nothing private to hide on this screen.
// Open it with ?id=<player id> (mahalle, duel) or ?kod=<player code> (search).

export default function Oyuncu() {
  const { id, kod } = useLocalSearchParams<{ id?: string; kod?: string }>();
  const blocked = useGame(s => s.blocked);
  const [p, setP] = useState<PlayerProfile | null>(null);
  const [failed, setFailed] = useState<'gone' | 'error' | 'many' | null>(null);

  const load = useCallback(async () => {
    try {
      setP(await loadPlayer(id ? { id } : { kod: kod ?? '' }));
      setFailed(null);
    } catch (e) {
      const code = e instanceof ApiError ? e.message : '';
      setFailed(code === 'not_found' ? 'gone' : code === 'too_many' ? 'many' : 'error');
    }
  }, [id, kod]);
  useEffect(() => { void load(); }, [load]);

  const isBlocked = !!p && blocked.includes(p.id);
  const menu = p && !p.me ? (
    <PressableScale
      accessibilityRole="button" accessibilityLabel={t('player.menu', { name: p.nick ?? t('mahalle.home.newPlayer') })} hitSlop={6}
      onPress={() => { buzz(); openPlayerMenu(p.id, p.nick); }}
      style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.s2, alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon name="shield" size={20} color={colors.g200} />
    </PressableScale>
  ) : undefined;

  if (!p && !failed) return <Shell title={t('player.title')}><Skeleton height={440} radius={radius.lg} /><Skeleton height={120} radius={radius.lg} /></Shell>;
  if (!p || isBlocked) {
    return (
      <Shell title={t('player.title')}>
        <ErrorState text={t(failed === 'many' ? 'player.tooMany' : failed === 'error' ? 'common.loadFailed' : 'player.notFound')} onRetry={failed === 'error' ? load : async () => router.back()} />
      </Shell>
    );
  }

  const ch = { ...DEFAULT_CHARACTER, ...p.character };
  const name = p.nick ?? t('mahalle.home.newPlayer');
  const best = Math.max(...SKILLS.map(s => p.stats[s.key]));
  return (
    <Shell title={t('player.title')} right={menu} onRefresh={load}>
      <PlayerCard name={name} ch={ch} power={ovr(p.stats)} level={p.level} />

      <View style={{ borderRadius: radius.lg, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }}>
        <PlaceRow label={t('profile.club')} name={p.club ?? t('player.noClub')} icon={<Ico name="kulup" size={40} />} />
        <View style={{ height: 1, backgroundColor: colors.line, marginLeft: 68 }} />
        <PlaceRow
          label={t('profile.mahalle')} name={p.mahalle ? p.mahalle.name : t('profile.noMahalle')}
          icon={p.mahalle ? <Emblem shape={p.mahalle.emblem} color={p.mahalle.color} name={p.mahalle.name} size={40} /> : <Ico name="mahalle" size={40} dim />}
        />
      </View>

      <View style={{ gap: 12 }}>
        <Section right={<Caps>{p.me ? t('player.you') : `${t('player.code')} ${p.kod}`}</Caps>}>{t('profile.career')}</Section>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderRadius: radius.lg, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line }}>
          <Count label={t('profile.matches')} value={p.totals.matches} />
          <View style={{ width: 1, height: 32, backgroundColor: colors.line }} />
          <Count label={t('profile.goals')} value={p.totals.goals} />
          <View style={{ width: 1, height: 32, backgroundColor: colors.line }} />
          <Count label={t('profile.assists')} value={p.totals.assists} />
        </View>
        <LastRatings ratings={[...p.ratings].reverse()} />
      </View>

      <View style={{ gap: 12 }}>
        <Section>{t('profile.skillsTitle')}</Section>
        <View style={{ paddingVertical: 8, paddingHorizontal: 16, borderRadius: radius.lg, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line }}>
          {SKILLS.map(s => {
            const v = p.stats[s.key];
            return (
              <View key={s.key} accessible accessibilityLabel={`${t(`profile.skill.${s.key}` as Key)} ${v}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 44 }}>
                <Ico name={s.icon} size={32} />
                <T w={500} size={15} style={{ width: 48 }}>{t(`profile.skill.${s.key}` as Key)}</T>
                <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.s3, overflow: 'hidden' }}>
                  <View style={{ width: `${Math.min(100, (v / STAT_MAX) * 100)}%`, height: '100%', borderRadius: 3, backgroundColor: v === best ? colors.l600 : colors.g300 }} />
                </View>
                <T w={600} size={16} style={{ width: 32, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{v}</T>
              </View>
            );
          })}
        </View>
      </View>

      {p.trophyCount > 0 && (
        <View style={{ gap: 12 }}>
          <Section right={<Caps>{t('player.trophies', { n: p.trophyCount })}</Caps>}>{t('profile.shelf')}</Section>
          <View style={{ flexDirection: 'row', paddingVertical: 16, paddingHorizontal: 8, borderRadius: radius.lg, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line }}>
            {p.trophies.map(key => (
              <View key={key} style={{ flex: 1, alignItems: 'center', gap: 8 }}>
                <Ico name={achIcon(key)} size={56} />
                <T w={500} size={13} numberOfLines={2} style={{ textAlign: 'center' }}>{t(`ach.${key}` as Key)}</T>
              </View>
            ))}
          </View>
        </View>
      )}
    </Shell>
  );
}
