import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';

import { useGame } from '../game/store.ts';
import { ApiError } from '../net/api.ts';
import { finishRedirect, takeRedirect } from '../net/auth.ts';
import { colors } from '../theme.ts';
import { accountError } from '../ui/account.tsx';
import { T } from '../ui/kit.tsx';
import { closeSheet, Spinner, toast } from '../ui/overlay.tsx';
import { t } from '../i18n/index.ts';

// Where Google, Apple and the email links send the player back (https://…/hesap on
// the web, streetborn://hesap in the app). On a phone Google and Apple come back
// through the auth session, which already read the answer; an email link opens the
// app from Mail, and app/+native-intent.tsx holds its URL for this screen.

export default function Hesap() {
  useEffect(() => {
    let live = true;
    void (async () => {
      const s = useGame.getState();
      const url = Platform.OS === 'web' ? window.location.href : takeRedirect();
      if (url) {
        try {
          const type = await finishRedirect(url);
          closeSheet();
          // A sign-in link, or no player before ("Hesabım var"): load the account's player.
          if (type === 'magiclink' || s.auth !== 'in') await s.signedIn();
          else toast(t('account.linkedShort'), 'success');
        } catch (e) {
          // An email confirmation may come back without a session; the account is linked anyway.
          if (!(e instanceof ApiError && e.code === 'no_session')) toast(accountError(e), 'error');
        }
      }
      if (Platform.OS === 'web') window.history.replaceState(null, '', window.location.pathname);
      void useGame.getState().refreshAccount();
      if (live) router.replace(useGame.getState().auth === 'in' ? '/' : '/giris');
    })();
    return () => { live = false; };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <Spinner />
      <T w={600} size={15} color={colors.g200}>{t('account.returning')}</T>
    </View>
  );
}
