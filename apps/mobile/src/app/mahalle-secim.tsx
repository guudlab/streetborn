import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { setMusic } from '../audio/audio.ts';
import { useGame } from '../game/store.ts';
import { colors } from '../theme.ts';
import { CoachFace, H1, Opt, T } from '../ui/kit.tsx';
import { Enter } from '../ui/motion.tsx';
import { Shell } from '../ui/mahalle.tsx';
import { t } from '../i18n/index.ts';

// First step after the sign-in tap: Burak abi asks which mahalle the player is from.
// A player who arrived through an invite link goes straight to that invite.
// Once a mahalle is set, _layout swaps this group for character creation.

export default function MahalleSecim() {
  const invite = useGame(s => s.pendingInvite);
  useEffect(() => { setMusic('menu'); }, []);
  useEffect(() => {
    if (invite) router.replace('/mahalle-davet');
  }, [invite]);

  return (
    <Shell back={false} label={t('mahalle.label')}>
      <Enter style={{ alignItems: 'center', gap: 12, paddingTop: 8 }}>
        <CoachFace size={96} />
        <T w={600} size={12} color={colors.g200} style={{ letterSpacing: 0.8 }}>{t('coach.name').toLocaleUpperCase('tr')}</T>
        <H1 style={{ textAlign: 'center' }}>{t('mahalle.pick.title')}</H1>
        <T color={colors.g200} style={{ textAlign: 'center', lineHeight: 21 }}>{t('mahalle.pick.sub')}</T>
      </Enter>
      <View style={{ gap: 10 }}>
        <Opt icon="home" title={t('mahalle.pick.create')} sub={t('mahalle.pick.createSub')} onPress={() => router.push('/mahalle-kur')} />
        <Opt icon="mail" title={t('mahalle.pick.code')} sub={t('mahalle.pick.codeSub')} onPress={() => router.push('/mahalle-kod')} />
        <Opt icon="whistle" title={t('mahalle.pick.open')} sub={t('mahalle.pick.openSub')} onPress={() => router.push('/mahalle-acik')} />
      </View>
      <T w={500} size={12} color={colors.g300} style={{ textAlign: 'center' }}>{t('mahalle.pick.later')}</T>
    </Shell>
  );
}
