import { Pressable, View } from 'react-native';

import { colors } from '../theme.ts';
import { T } from './kit.tsx';
import { t } from '../i18n/index.ts';

/** The assisted-shot switch of both match screens. `nudge` rings it after a mistimed shot. */
export function AssistToggle({ on, nudge, onPress }: { on: boolean; nudge: boolean; onPress(): void }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: on }} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
      <View style={{
        width: 44, height: 26, borderRadius: 13, backgroundColor: on ? colors.l600 : colors.s3, justifyContent: 'center', paddingHorizontal: 3,
        borderWidth: nudge ? 2 : 0, borderColor: 'rgba(207,253,92,.6)',
      }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: on ? colors.ink : colors.g100, alignSelf: on ? 'flex-end' : 'flex-start' }} />
      </View>
      <T w={500} size={14} color={colors.g200}>{t('match.assistedShot')}</T>
    </Pressable>
  );
}
