import { View } from 'react-native';

import { colors } from '../theme.ts';
import { Caps, T } from '../ui/kit.tsx';
import { Shell } from '../ui/mahalle.tsx';
import { PRIVACY, PRIVACY_CONTACT } from '../legal/privacy.ts';
import { lang, t } from '../i18n/index.ts';

// Gizlilik politikası. Open to everyone, signed in or not, so the store listings can link
// to the same page on the web (streetborn.guudlab.workers.dev/gizlilik).

export default function Gizlilik() {
  const p = PRIVACY[lang];
  return (
    <Shell title={t('privacy.title')}>
      <View style={{ gap: 6 }}>
        <T size={15} style={{ lineHeight: 22 }}>{p.intro}</T>
        <T size={12} color={colors.g300}>{p.updated}</T>
      </View>
      {p.sections.map(s => (
        <View key={s.title} style={{ gap: 8 }}>
          <Caps>{s.title}</Caps>
          <View style={{ gap: 10, padding: 16, borderRadius: 20, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line }}>
            {s.body.map(b => <T key={b} size={14} color={colors.g100} style={{ lineHeight: 21 }}>{b}</T>)}
          </View>
        </View>
      ))}
      <View style={{ gap: 8, paddingBottom: 8 }}>
        <Caps>{t('privacy.contact')}</Caps>
        <T size={14} color={colors.g200} style={{ lineHeight: 21 }} selectable>{PRIVACY_CONTACT ?? t('privacy.contactSoon')}</T>
      </View>
    </Shell>
  );
}
