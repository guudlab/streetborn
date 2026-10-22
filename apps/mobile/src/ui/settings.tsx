import { Pressable, View } from 'react-native';

import { useSound } from '../audio/audio.ts';
import { colors } from '../theme.ts';
import { Icon, type IconName } from './Icon.tsx';
import { H3, T, tap } from './kit.tsx';
import { openSheet } from './overlay.tsx';

/** The two sound toggles; used in the settings sheet and the match pause sheet. */
export function SoundToggles() {
  const s = useSound();
  return (
    <View style={{ gap: 8 }}>
      <Toggle icon="music" label="Müzik" on={s.music} onPress={() => s.setMusicOn(!s.music)} />
      <Toggle icon="sound" label="Ses efektleri" on={s.effects} onPress={() => { s.setEffectsOn(!s.effects); if (!s.effects) tap(); }} />
    </View>
  );
}

export const openSoundSheet = () => openSheet(<><H3>Ses</H3><SoundToggles /></>);

/** Round button that opens the sound sheet; the icon shows whether anything is muted. */
export function SoundButton() {
  const muted = useSound(s => !s.music && !s.effects);
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel="Ses ayarları" onPress={() => { tap(); openSoundSheet(); }}
      style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.s2, alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon name={muted ? 'mute' : 'sound'} size={20} color={colors.g200} />
    </Pressable>
  );
}

function Toggle({ icon, label, on, onPress }: { icon: IconName; label: string; on: boolean; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: on }} onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.s2 }}
    >
      <Icon name={icon} color={on ? colors.l600 : colors.g400} />
      <T w={600} size={15} style={{ flex: 1 }}>{label}</T>
      <View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: on ? colors.l600 : colors.s3, justifyContent: 'center', paddingHorizontal: 3 }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: on ? colors.ink : colors.g100, alignSelf: on ? 'flex-end' : 'flex-start' }} />
      </View>
    </Pressable>
  );
}
