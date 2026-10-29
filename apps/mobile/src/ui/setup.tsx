import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors } from '../theme.ts';
import { openSignInSheet } from './account.tsx';
import { Icon } from './Icon.tsx';
import { buzz, T } from './kit.tsx';
import { t } from '../i18n/index.ts';

// The two ways out of the first-run screens: one step back, and "Hesabım var" for a
// player who already has an account and tapped Başla by mistake.

export function SetupBack({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={t('mahalle.back')} hitSlop={6}
      onPress={() => { buzz(); onPress(); }}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.s2, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
    >
      <Icon name="back" color={colors.g100} />
    </Pressable>
  );
}

export function HaveAccount() {
  return (
    <Pressable
      onPress={() => { buzz(); openSignInSheet(); }}
      accessibilityRole="button" accessibilityLabel={t('login.haveAccount')} hitSlop={8}
      style={({ pressed }) => ({ height: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: colors.s2, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.7 : 1 })}
    >
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.g200} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
        <Path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
      </Svg>
      <T w={600} size={13} color={colors.g200}>{t('login.haveAccount')}</T>
    </Pressable>
  );
}

/** Back on the left (when there is somewhere to go), "Hesabım var" on the right. */
export function SetupBar({ onBack, account = true, label }: { onBack?: () => void; account?: boolean; label?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
      {onBack ? <SetupBack onPress={onBack} /> : <View />}
      {label ? <T w={600} size={11} color={colors.g200} style={{ letterSpacing: 1, flex: 1, textAlign: 'center' }}>{label}</T> : null}
      {account ? <HaveAccount /> : <View />}
    </View>
  );
}
