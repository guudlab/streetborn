import { router } from 'expo-router';
import { View } from 'react-native';

import { useSound } from '../audio/audio.ts';
import { useGame } from '../game/store.ts';
import { AccountRow } from './account.tsx';
import { colors } from '../theme.ts';
import { Icon, type IconName } from './Icon.tsx';
import { H3, T, tap } from './kit.tsx';
import { closeSheet, openSheet } from './overlay.tsx';
import { t } from '../i18n/index.ts';
import { PressableScale } from './motion.tsx';

/** The two sound toggles; used in the settings sheet and the match pause sheet. */
export function SoundToggles() {
  const s = useSound();
  return (
    <View style={{ gap: 8 }}>
      <Toggle icon="music" label={t('sound.music')} on={s.music} onPress={() => s.setMusicOn(!s.music)} />
      <Toggle icon="sound" label={t('sound.effects')} on={s.effects} onPress={() => { s.setEffectsOn(!s.effects); if (!s.effects) tap(); }} />
    </View>
  );
}

/** Hub settings: sound and the account (guest or linked). */
export function openSettingsSheet() {
  void useGame.getState().refreshAccount();
  openSheet(<><H3>{t('settings.title')}</H3><SoundToggles /><ProfileRow /><AccountRow /></>);
}

/** Opens the profile screen, where the account and the sign-out button live. */
function ProfileRow() {
  const name = useGame(s => s.name);
  const online = useGame(s => s.mode === 'online');
  if (!online) return null;
  return (
    <PressableScale
      accessibilityRole="button" accessibilityLabel={t('profile.a11y')} onPress={() => { tap(); closeSheet(); router.push('/profil'); }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.s2 }}
    >
      <Avatar name={name} size={28} />
      <T w={600} size={15} style={{ flex: 1 }} numberOfLines={1}>{t('profile.title')}</T>
      <Icon name="chev" size={18} color={colors.g300} />
    </PressableScale>
  );
}

/** Round initial of the nickname. */
export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.l900, borderWidth: 1.5, borderColor: colors.l700, alignItems: 'center', justifyContent: 'center' }}>
      <T w={700} size={size * 0.42} color={colors.l500}>{name.trim().charAt(0).toLocaleUpperCase('tr') || '?'}</T>
    </View>
  );
}

/** Round button that opens the profile; sits above the sound button on the hub. */
export function ProfileButton() {
  const name = useGame(s => s.name);
  const online = useGame(s => s.mode === 'online');
  if (!online) return null;
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={t('profile.a11y')} onPress={() => { tap(); router.push('/profil'); }} hitSlop={4}>
      <Avatar name={name} />
    </PressableScale>
  );
}

/** Round button that opens the settings sheet; the icon shows whether anything is muted. */
export function SoundButton() {
  const muted = useSound(s => !s.music && !s.effects);
  return (
    <PressableScale
      accessibilityRole="button" accessibilityLabel={t('sound.settings')} onPress={() => { tap(); openSettingsSheet(); }}
      style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.s2, alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon name={muted ? 'mute' : 'sound'} size={20} color={colors.g200} />
    </PressableScale>
  );
}

function Toggle({ icon, label, on, onPress }: { icon: IconName; label: string; on: boolean; onPress(): void }) {
  return (
    <PressableScale
      accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: on }} onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.s2 }}
    >
      <Icon name={icon} color={on ? colors.l600 : colors.g400} />
      <T w={600} size={15} style={{ flex: 1 }}>{label}</T>
      <View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: on ? colors.l600 : colors.s3, justifyContent: 'center', paddingHorizontal: 3 }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: on ? colors.ink : colors.g100, alignSelf: on ? 'flex-end' : 'flex-start' }} />
      </View>
    </PressableScale>
  );
}
