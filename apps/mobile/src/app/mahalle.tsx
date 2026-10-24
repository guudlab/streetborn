import { useEffect } from 'react';
import { Platform, Pressable, Share, View } from 'react-native';

import { useGame } from '../game/store.ts';
import { INVITE_BASE } from '../net/config.ts';
import { colors } from '../theme.ts';
import { Emblem } from '../ui/emblem.tsx';
import { Icon } from '../ui/Icon.tsx';
import { Cta, Ghost, H3, T } from '../ui/kit.tsx';
import { Shell } from '../ui/mahalle.tsx';
import { Amount, Ico } from '../ui/sade.tsx';
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

  const share = () => void shareInvite(mahalle.name, mahalle.code);

  return (
    <Shell
      title={mahalle.name}
      right={free > 0 ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t('mahalle.home.share')} onPress={share} hitSlop={6}
          style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.s2, alignItems: 'center', justifyContent: 'center' }}>
          <Ico name="davet" size={34} />
        </Pressable>
      ) : undefined}
    >
      <View style={{ alignItems: 'center', marginTop: -6 }}>
        <Emblem shape={mahalle.emblem} color={mahalle.color} name={mahalle.name} size={72} />
      </View>

      <TodayCard />

      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Amount icon="oyuncu" size={24}>{members.length} / 12</Amount>
          <Icon name={mahalle.isOpen ? 'city' : 'lock'} size={18} color={colors.g300} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {members.map((m) => {
            const nick = blocked.includes(m.playerId) ? t('report.blockedName') : (m.nick ?? t('mahalle.home.newPlayer'));
            const captain = m.playerId === mahalle.captainId;
            return (
              <Pressable
                key={m.playerId} disabled={m.playerId === me} onPress={() => openPlayerMenu(m.playerId, m.nick)}
                accessibilityRole="button" accessibilityLabel={`${nick}, ${t('mahalle.home.level', { n: m.level })}${captain ? `, ${t('mahalle.home.captain')}` : ''}`}
                style={{ width: '31%', flexGrow: 1, alignItems: 'center', gap: 4, paddingVertical: 12, borderRadius: 18, backgroundColor: colors.s2, borderWidth: 1.5, borderColor: m.playerId === me ? colors.l600 : 'transparent' }}
              >
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.s3, alignItems: 'center', justifyContent: 'center' }}>
                  <T w={700} size={14}>{(m.nick ?? '?').slice(0, 2).toLocaleUpperCase('tr')}</T>
                  {captain && <View style={{ position: 'absolute', top: -4, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.l600, alignItems: 'center', justifyContent: 'center' }}><Icon name="star" size={12} color={colors.ink} /></View>}
                </View>
                <T w={700} size={13} numberOfLines={1} style={{ maxWidth: '90%' }}>{nick}</T>
                <T w={600} size={11} color={colors.g300}>{t('mahalle.home.level', { n: m.level })}</T>
              </Pressable>
            );
          })}
          {free > 0 && (
            <Pressable
              accessibilityRole="button" accessibilityLabel={t('mahalle.home.share')} onPress={share}
              style={{ width: '31%', flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 12, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.g400 }}
            >
              <Icon name="plus" size={26} color={colors.l600} />
              <T w={700} size={13} color={colors.g200}>{t('mahalle.invite.free', { n: free })}</T>
            </Pressable>
          )}
        </View>
      </View>

      {free > 0 && (
        <Pressable accessibilityRole="button" accessibilityLabel={`${t('mahalle.home.code')} ${mahalle.code}. ${t('mahalle.home.share')}`} onPress={share}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.l900 }}>
          <Ico name="anahtar" size={40} />
          <T w={700} size={26} style={{ flex: 1, letterSpacing: 5 }} selectable>{mahalle.code}</T>
          <Icon name="share" size={22} color={colors.l600} />
        </Pressable>
      )}

      <Pressable accessibilityRole="button" onPress={confirmLeave} hitSlop={8} style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center' }}>
        <T w={600} size={14} color={colors.g300}>{t('mahalle.home.leave')}</T>
      </Pressable>
    </Shell>
  );
}
