import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useGame } from '../game/store.ts';
import { previewMahalle, type MahallePreview } from '../net/api.ts';
import { colors } from '../theme.ts';
import { Emblem } from '../ui/emblem.tsx';
import { Cta, Ghost, T } from '../ui/kit.tsx';
import { mahalleError, Shell } from '../ui/mahalle.tsx';
import { Amount, Bubble } from '../ui/sade.tsx';
import { SetupBar } from '../ui/setup.tsx';
import { t } from '../i18n/index.ts';

// Shown when the player opened an invite link: who invited, how many are in, one button.

export default function MahalleDavet() {
  const invite = useGame(s => s.pendingInvite);
  const joinMahalle = useGame(s => s.joinMahalle);
  const setPendingInvite = useGame(s => s.setPendingInvite);
  const signOut = useGame(s => s.signOut);
  const [preview, setPreview] = useState<MahallePreview | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!invite) { router.replace('/mahalle-secim'); return; }
    let live = true;
    previewMahalle(invite).then((p) => { if (live) setPreview(p); }).catch(() => { if (live) setPreview(null); });
    return () => { live = false; };
  }, [invite]);

  function other() {
    setPendingInvite(null);
    router.replace('/mahalle-secim');
  }
  async function join() {
    if (busy || !invite) return;
    setBusy(true);
    try { await joinMahalle({ code: invite }); } catch (e) { setError(mahalleError(e)); } finally { setBusy(false); }
  }

  const free = preview ? Math.max(0, 12 - preview.memberCount) : 0;
  const usable = !!preview && free > 0;

  return (
    <Shell
      back={false}
      footer={<>
        {usable && <Cta busy={busy} onPress={join}>{t('mahalle.invite.join')}</Cta>}
        <Ghost onPress={other}>{t('mahalle.invite.other')}</Ghost>
      </>}
    >
      <SetupBar label={t('mahalle.invite.label')} onBack={() => { setPendingInvite(null); void signOut(); }} />
      {preview === undefined && <ActivityIndicator size="large" color={colors.l600} style={{ marginTop: 80 }} />}
      {preview === null && <T color={colors.g200} style={{ textAlign: 'center', marginTop: 80 }}>{t('mahalle.invite.bad')}</T>}
      {preview && (
        <>
          <View style={{ alignItems: 'center', gap: 12, paddingTop: 32 }}>
            <Emblem shape={preview.emblem} color={preview.color} name={preview.name} size={128} />
            <T w={700} size={28} style={{ textAlign: 'center', letterSpacing: -0.4 }} accessibilityRole="header">{preview.name}</T>
            {usable ? (
              <View style={{ flexDirection: 'row', gap: 20 }} accessible accessibilityLabel={t('mahalle.invite.sub', { n: preview.memberCount, free })}>
                <Amount icon="oyuncu" size={28} textSize={17}>{preview.memberCount}</Amount>
                <Amount icon="davet" size={28} textSize={17}>{t('mahalle.invite.free', { n: free })}</Amount>
              </View>
            ) : <T size={15} color={colors.g200} style={{ textAlign: 'center' }}>{t('mahalle.invite.bad')}</T>}
          </View>
          {usable && <Bubble text={t('mahalle.invite.short')} style={{ alignSelf: 'center', marginTop: 12 }} />}
          {error && <T w={500} size={14} color={colors.bad} style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">{error}</T>}
        </>
      )}
    </Shell>
  );
}
