import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useGame } from '../game/store.ts';
import { previewMahalle, type MahallePreview } from '../net/api.ts';
import { colors } from '../theme.ts';
import { Emblem } from '../ui/emblem.tsx';
import { Cta, Ghost, T } from '../ui/kit.tsx';
import { mahalleError, Shell } from '../ui/mahalle.tsx';
import { Skeleton } from '../ui/motion.tsx';
import { Amount, Bubble } from '../ui/sade.tsx';
import { EmptyState, ErrorState } from '../ui/states.tsx';
import { SetupBar } from '../ui/setup.tsx';
import { t } from '../i18n/index.ts';

// Shown when the player opened an invite link: who invited, how many are in, one button.

export default function MahalleDavet() {
  const invite = useGame(s => s.pendingInvite);
  const joinMahalle = useGame(s => s.joinMahalle);
  const setPendingInvite = useGame(s => s.setPendingInvite);
  const signOut = useGame(s => s.signOut);
  // undefined while loading, null for a bad or full invite, 'error' when the server could not be reached.
  const [preview, setPreview] = useState<MahallePreview | null | undefined | 'error'>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);
  const load = useCallback(async () => {
    if (!invite) return;
    try { const p = await previewMahalle(invite); if (live.current) setPreview(p); }
    catch { if (live.current) setPreview('error'); }
  }, [invite]);
  useEffect(() => {
    if (!invite) { router.replace('/mahalle-secim'); return; }
    void load();
  }, [invite, load]);

  function other() {
    setPendingInvite(null);
    router.replace('/mahalle-secim');
  }
  async function join() {
    if (busy || !invite) return;
    setBusy(true);
    try { await joinMahalle({ code: invite }); } catch (e) { setError(mahalleError(e)); } finally { setBusy(false); }
  }

  const info = preview && preview !== 'error' ? preview : null;
  const free = info ? Math.max(0, 12 - info.memberCount) : 0;
  const usable = !!info && free > 0;

  return (
    <Shell
      back={false}
      footer={<>
        {usable && <Cta busy={busy} onPress={join}>{t('mahalle.invite.join')}</Cta>}
        <Ghost onPress={other}>{t('mahalle.invite.other')}</Ghost>
      </>}
    >
      <SetupBar label={t('mahalle.invite.label')} onBack={() => { setPendingInvite(null); void signOut(); }} />
      {preview === undefined && (
        <View style={{ alignItems: 'center', gap: 12, paddingTop: 32 }}>
          <Skeleton width={128} height={128} radius={64} />
          <Skeleton width={180} height={26} radius={8} />
          <Skeleton width={140} height={18} radius={8} />
        </View>
      )}
      {preview === 'error' && <ErrorState onRetry={load} style={{ marginTop: 48 }} />}
      {preview === null && <EmptyState icon="davet" text={t('mahalle.invite.bad')} style={{ marginTop: 48 }} />}
      {info && (
        <>
          <View style={{ alignItems: 'center', gap: 12, paddingTop: 32 }}>
            <Emblem shape={info.emblem} color={info.color} name={info.name} size={128} />
            <T w={700} size={28} style={{ textAlign: 'center', letterSpacing: -0.4 }} accessibilityRole="header">{info.name}</T>
            {usable ? (
              <View style={{ flexDirection: 'row', gap: 20 }} accessible accessibilityLabel={t('mahalle.invite.sub', { n: info.memberCount, free })}>
                <Amount icon="oyuncu" size={28} textSize={17}>{info.memberCount}</Amount>
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
