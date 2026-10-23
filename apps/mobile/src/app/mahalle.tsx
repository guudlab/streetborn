import { useEffect } from 'react';
import { Platform, Pressable, Share, View } from 'react-native';

import { useGame } from '../game/store.ts';
import { INVITE_BASE } from '../net/config.ts';
import { colors } from '../theme.ts';
import { Emblem } from '../ui/emblem.tsx';
import { Icon } from '../ui/Icon.tsx';
import { Caps, Cta, Ghost, H1, H3, T } from '../ui/kit.tsx';
import { Shell } from '../ui/mahalle.tsx';
import { openPlayerMenu } from '../ui/player-menu.tsx';
import { TodayCard } from '../ui/mahalle-mac.tsx';
import { closeSheet, openSheet, SheetText, toast } from '../ui/overlay.tsx';
import { t } from '../i18n/index.ts';

// The player's mahalle: squad, invite code and link, leave.

async function shareInvite(name: string, code: string) {
  const link = `${INVITE_BASE}/davet/${code}`;
  const message = t('mahalle.home.shareText', { name, link });
  try {
    await Share.share({ message });
  } catch {
    // Desktop browsers have no share sheet: copy the text instead.
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(message).then(() => toast(t('mahalle.home.copied')), () => {});
    }
  }
}

export default function Mahalle() {
  const mahalle = useGame(s => s.mahalle);
  const leave = useGame(s => s.leaveMahalle);
  const refresh = useGame(s => s.refreshMahalle);
  const blocked = useGame(s => s.blocked);
  const me = useGame(s => s.mahalleToday?.me);
  useEffect(() => { void refresh(); }, [refresh]);
  if (!mahalle) return null;

  const members = mahalle.members;
  const free = Math.max(0, 12 - members.length);

  function confirmLeave() {
    openSheet(
      <>
        <H3>{t('mahalle.home.leaveTitle')}</H3>
        <SheetText>{t('mahalle.home.leaveText')}</SheetText>
        <Cta onPress={() => { closeSheet(); void leave(); }}>{t('mahalle.home.leaveYes')}</Cta>
        <Ghost onPress={closeSheet}>{t('common.cancel')}</Ghost>
      </>,
    );
  }

  return (
    <Shell
      label={t('mahalle.label')}
      footer={<Ghost onPress={confirmLeave}>{t('mahalle.home.leave')}</Ghost>}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Emblem shape={mahalle.emblem} color={mahalle.color} name={mahalle.name} size={64} />
        <View style={{ flex: 1, gap: 3 }}>
          <H1 numberOfLines={1}>{mahalle.name}</H1>
          <T w={500} size={13} color={colors.g200}>{mahalle.isOpen ? t('mahalle.home.open') : t('mahalle.home.closed')}</T>
        </View>
      </View>

      <TodayCard />

      <View style={{ gap: 8 }}>
        <Caps>{t('mahalle.home.roster', { n: members.length })}</Caps>
        <View style={{ borderRadius: 20, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }}>
          {members.map((m, i) => (
            <View key={m.playerId} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.line }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.s3, alignItems: 'center', justifyContent: 'center' }}>
                <T w={700} size={12}>{(m.nick ?? '?').slice(0, 2).toLocaleUpperCase('tr')}</T>
              </View>
              <T w={600} size={15} style={{ flex: 1 }} numberOfLines={1}>{blocked.includes(m.playerId) ? t('report.blockedName') : (m.nick ?? t('mahalle.home.newPlayer'))}</T>
              {m.playerId === mahalle.captainId && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 10, backgroundColor: colors.l900 }}>
                  <Icon name="star" size={12} color={colors.l500} /><T w={600} size={11} color={colors.l500}>{t('mahalle.home.captain')}</T>
                </View>
              )}
              <T w={500} size={13} color={colors.g200}>{t('mahalle.home.level', { n: m.level })}</T>
              {m.playerId !== me && (
                <Pressable accessibilityRole="button" accessibilityLabel={t('report.menuA11y', { name: m.nick ?? '' })} hitSlop={8}
                  onPress={() => openPlayerMenu(m.playerId, m.nick)} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="info" size={18} color={colors.g300} />
                </Pressable>
              )}
            </View>
          ))}
          {free > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: colors.line }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.g400, borderStyle: 'dashed' }} />
              <T w={500} size={15} color={colors.g300}>{t('mahalle.home.empty')} · {free}</T>
            </View>
          )}
        </View>
      </View>

      {free > 0 && (
        <View style={{ gap: 10 }}>
          <Caps>{t('mahalle.home.call')}</Caps>
          <View style={{ padding: 16, borderRadius: 20, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.l900, gap: 12, alignItems: 'center' }}>
            <T w={500} size={13} color={colors.g200}>{t('mahalle.home.code')}</T>
            <T w={700} size={32} style={{ letterSpacing: 6 }} selectable>{mahalle.code}</T>
            <Cta style={{ alignSelf: 'stretch' }} onPress={() => void shareInvite(mahalle.name, mahalle.code)}>{t('mahalle.home.share')}</Cta>
          </View>
        </View>
      )}
    </Shell>
  );
}
