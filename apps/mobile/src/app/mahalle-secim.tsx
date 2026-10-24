import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { setMusic } from '../audio/audio.ts';
import { useGame } from '../game/store.ts';
import { colors } from '../theme.ts';
import { T } from '../ui/kit.tsx';
import { Enter } from '../ui/motion.tsx';
import { Shell } from '../ui/mahalle.tsx';
import { Bubble, Ico, Tile } from '../ui/sade.tsx';
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
    <Shell back={false}>
      <Enter style={{ gap: 18, paddingTop: 8 }}>
        <Bubble text={t('mahalle.pick.title')} size={56} />
      </Enter>
      <View style={{ gap: 12 }}>
        <Enter i={1}>
          <Tile row selected onPress={() => router.push('/mahalle-kur')} label={`${t('mahalle.pick.create')}. ${t('mahalle.pick.createSub')}`} style={{ minHeight: 92 }}>
            <Ico name="mahalle" size={64} />
            <View style={{ flex: 1 }}>
              <T w={700} size={19}>{t('mahalle.pick.create')}</T>
              <T w={500} size={13} color={colors.g200}>{t('mahalle.pick.founder')}</T>
            </View>
          </Tile>
        </Enter>
        <Enter i={2}>
          <Tile row onPress={() => router.push('/mahalle-kod')} label={`${t('mahalle.pick.code')}. ${t('mahalle.pick.codeSub')}`} style={{ minHeight: 92 }}>
            <Ico name="anahtar" size={64} />
            <T w={700} size={19} style={{ flex: 1 }}>{t('mahalle.pick.code')}</T>
          </Tile>
        </Enter>
        <Enter i={3}>
          <Tile row onPress={() => router.push('/mahalle-acik')} label={`${t('mahalle.pick.open')}. ${t('mahalle.pick.openSub')}`} style={{ minHeight: 92 }}>
            <Ico name="mahalleBul" size={64} />
            <T w={700} size={19} style={{ flex: 1 }}>{t('mahalle.pick.open')}</T>
          </Tile>
        </Enter>
      </View>
      <T w={500} size={12} color={colors.g300} style={{ textAlign: 'center' }}>{t('mahalle.pick.later')}</T>
    </Shell>
  );
}
