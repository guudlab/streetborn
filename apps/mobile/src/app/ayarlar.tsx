import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useGame } from '../game/store.ts';
import type { DevAction } from '../net/api.ts';
import { colors, radius } from '../theme.ts';
import { openLinkSheet } from '../ui/account.tsx';
import { Icon } from '../ui/Icon.tsx';
import { buzz, Cta, Danger, Ghost, H3, Section, T } from '../ui/kit.tsx';
import { Shell } from '../ui/mahalle.tsx';
import { PressableScale } from '../ui/motion.tsx';
import { closeSheet, openSheet, SheetText, toast } from '../ui/overlay.tsx';
import { SoundToggles } from '../ui/settings.tsx';
import { t } from '../i18n/index.ts';

// Ayarlar: sound, the account, privacy, sign-out and account deletion. Opened from the gear
// on the profile so the profile can be about the player. Red is kept for deletion only.

export default function Ayarlar() {
  const online = useGame(s => s.mode === 'online');
  const testMode = useGame(s => s.testMode);
  useEffect(() => { if (online) void useGame.getState().refreshAccount(); }, [online]);

  return (
    <Shell title={t('settings.title')}>
      <View style={{ gap: 12 }}>
        <Section>{t('profile.sound')}</Section>
        <SoundToggles />
      </View>

      <View style={{ gap: 12 }}>
        <Section>{t('profile.account')}</Section>
        {online ? <AccountCard /> : <T size={14} color={colors.g200}>{t('profile.offline')}</T>}
        <PressableScale
          accessibilityRole="button" accessibilityLabel={t('privacy.title')} onPress={() => { buzz(); router.push('/gizlilik'); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16, borderRadius: 16, backgroundColor: colors.s2 }}
        >
          <Icon name="shield" color={colors.g200} />
          <T w={600} size={15} style={{ flex: 1 }}>{t('privacy.title')}</T>
          <Icon name="chev" size={18} color={colors.g300} />
        </PressableScale>
      </View>

      {online && testMode && <DevTools />}

      {online && <SignOut />}
      {online && (
        <PressableScale
          accessibilityRole="button" hitSlop={8} onPress={() => { buzz(); router.push('/hesap-sil'); }}
          style={{ alignSelf: 'center', minHeight: 44, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <Icon name="trash" size={16} color={colors.bad} />
          <T w={600} size={14} color={colors.bad}>{t('delete.link')}</T>
        </PressableScale>
      )}
    </Shell>
  );
}

function AccountCard() {
  const account = useGame(s => s.account);
  if (!account) return <T size={14} color={colors.g200}>{t('account.loading')}</T>;
  const linked = !account.anonymous;
  const names = [account.email, ...account.providers.map(p => (p === 'apple' ? 'Apple' : 'Google'))].filter(Boolean).join(' · ');
  return (
    <View style={{ gap: 12, padding: 16, borderRadius: radius.lg, backgroundColor: colors.s1, borderWidth: 1, borderColor: linked ? colors.line : colors.l700 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: linked ? colors.l900 : colors.s3, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={linked ? 'check' : 'lock'} size={20} color={linked ? colors.l500 : colors.g200} />
        </View>
        <View style={{ flex: 1 }}>
          <T w={600} size={16}>{linked ? t('profile.linkedTitle') : account.pendingEmail ? t('profile.pendingTitle') : t('profile.guestTitle')}</T>
          <T size={13} color={colors.g200} numberOfLines={2}>{linked ? names : account.pendingEmail ?? t('profile.guestText')}</T>
        </View>
      </View>
      {!linked && !account.pendingEmail && <Cta onPress={openLinkSheet}>{t('profile.link')}</Cta>}
    </View>
  );
}

function SignOut() {
  const [busy, setBusy] = useState(false);
  const account = useGame(s => s.account);
  // Until the account is known, treat it as a guest: the warning is the safe side.
  const guest = !account || account.anonymous;

  const run = async () => {
    setBusy(true);
    try {
      await useGame.getState().signOut();
      closeSheet();
      toast(t('profile.signOutDone'));
    } catch (e) {
      console.warn('sign out failed', e);
      setBusy(false);
      toast(t('profile.signOutFailed'), 'error');
    }
  };

  const ask = () => {
    buzz('medium');
    if (guest) {
      openSheet(
        <>
          <View style={{ alignItems: 'center', gap: 8 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#3A1D19', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="lock" size={24} color={colors.bad} />
            </View>
            <H3 style={{ textAlign: 'center' }}>{t('profile.signOutGuestTitle')}</H3>
          </View>
          <SheetText>{t('profile.signOutGuestText')}</SheetText>
          <Cta onPress={() => { closeSheet(); setTimeout(openLinkSheet, 250); }}>{t('profile.signOutLinkFirst')}</Cta>
          <Danger onPress={() => void run()}>{t('profile.signOutAnyway')}</Danger>
        </>,
      );
      return;
    }
    openSheet(
      <>
        <H3>{t('profile.signOutTitle')}</H3>
        <SheetText>{t('profile.signOutText')}</SheetText>
        <Danger onPress={() => void run()}>{t('profile.signOut')}</Danger>
        <Ghost onPress={closeSheet}>{t('common.cancel')}</Ghost>
      </>,
    );
  };

  // Signing out is not destructive for a linked account, so the button itself stays neutral;
  // the sheet it opens carries the warning.
  return <Ghost onPress={ask} busy={busy} style={{ marginTop: 8 }}>{t('profile.signOut')}</Ghost>;
}

// Test mode: only drawn when the server says this player has the switch; the server checks it again.
function DevTools() {
  const [busy, setBusy] = useState(false);
  const run = async (action: DevAction, value?: number) => {
    if (busy) return;
    setBusy(true);
    try {
      await useGame.getState().devTool(action, value);
      toast(t('dev.done'), 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  const level = useGame(s => s.level);
  const group = (title: string, items: { label: string; action: DevAction; value?: number }[]) => (
    <View style={{ gap: 8 }}>
      <T size={13} color={colors.g200}>{title}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {items.map(i => (
          <Ghost key={i.label} disabled={busy} onPress={() => void run(i.action, i.value)}>{i.label}</Ghost>
        ))}
      </View>
    </View>
  );
  return (
    <View style={{ gap: 16 }}>
      <Section>{t('dev.title')}</Section>
      {group('Zaman', [
        { label: `${t('dev.days')} +1`, action: 'days', value: 1 },
        { label: `${t('dev.days')} +7`, action: 'days', value: 7 },
        { label: `${t('dev.days')} +30`, action: 'days', value: 30 },
        { label: 'Günlük limitleri sıfırla', action: 'resetDay' },
      ])}
      {group('Para', [
        { label: '+1000 coin', action: 'coin', value: 1000 },
        { label: '+10000 coin', action: 'coin', value: 10000 },
        { label: '+100 gem', action: 'gem', value: 100 },
        { label: '+1000 gem', action: 'gem', value: 1000 },
      ])}
      {group('Seviye', [
        { label: `${t('dev.level')} ${level + 1}`, action: 'level', value: level + 1 },
        { label: `${t('dev.level')} 5`, action: 'level', value: 5 },
        { label: `${t('dev.level')} 12`, action: 'level', value: 12 },
        { label: `${t('dev.level')} 20`, action: 'level', value: 20 },
        { label: `${t('dev.level')} 30`, action: 'level', value: 30 },
        { label: 'Statlar 50', action: 'stats', value: 50 },
        { label: 'Statlar 80', action: 'stats', value: 80 },
      ])}
      {group('Enerji ve form', [
        { label: t('dev.energy'), action: 'energy' },
        { label: 'Moral 100', action: 'morale', value: 100 },
        { label: 'Moral 10', action: 'morale', value: 10 },
        { label: 'Sakatla', action: 'injury', value: 1 },
        { label: 'İyileştir', action: 'injury', value: 0 },
      ])}
      {group('Kulüp ve mahalle', [
        { label: 'Teklif: İlçe Amatör', action: 'offer', value: 0 },
        { label: 'Teklif: Süper Amatör', action: 'offer', value: 1 },
        { label: 'Teklif: Bölge Amatör', action: 'offer', value: 2 },
        { label: 'Hoca güveni 90', action: 'trust', value: 90 },
        { label: 'Hoca güveni 10', action: 'trust', value: 10 },
        { label: 'Mahalle saygısı 500', action: 'respect', value: 500 },
        { label: 'Tüm başarımları aç', action: 'achievements', value: 1 },
        { label: 'Başarımları sıfırla', action: 'achievements', value: 0 },
        { label: 'Kariyeri sıfırla (mahalleye dön)', action: 'resetCareer' },
      ])}
    </View>
  );}
