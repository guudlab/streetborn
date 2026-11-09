import { View } from 'react-native';

import { colors } from '../theme.ts';
import { T } from './kit.tsx';
import { t } from '../i18n/index.ts';
import { PressableScale } from './motion.tsx';

/** The assisted-shot switch of both match screens. `nudge` rings it after a mistimed shot. */
export function AssistToggle({ on, nudge, onPress }: { on: boolean; nudge: boolean; onPress(): void }) {
  return (
    <PressableScale accessibilityRole="switch" accessibilityState={{ checked: on }} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingLeft: 8, paddingRight: 12, borderRadius: 22, backgroundColor: 'rgba(13,13,13,.6)' }}>
      <View style={{
        width: 44, height: 26, borderRadius: 13, backgroundColor: on ? colors.l600 : colors.s3, justifyContent: 'center', paddingHorizontal: 3,
        borderWidth: nudge ? 2 : 0, borderColor: 'rgba(207,253,92,.6)',
      }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: on ? colors.ink : colors.g100, alignSelf: on ? 'flex-end' : 'flex-start' }} />
      </View>
      <T w={500} size={13} color={colors.g100}>{t('match.assistedShot')}</T>
    </PressableScale>
  );
}
