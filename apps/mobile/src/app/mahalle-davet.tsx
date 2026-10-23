import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useGame } from '../game/store.ts';
import { previewMahalle, type MahallePreview } from '../net/api.ts';
import { colors } from '../theme.ts';
import { Emblem } from '../ui/emblem.tsx';
import { CoachFace, Cta, Ghost, H1, T } from '../ui/kit.tsx';
import { mahalleError, Shell } from '../ui/mahalle.tsx';
import { t } from '../i18n/index.ts';

// Shown when the player opened an invite link: who invited, how many are in, one button.

export default function MahalleDavet() {
  const invite = useGame(s => s.pendingInvite);
  const joinMahalle = useGame(s => s.joinMahalle);
  const setPendingInvite = useGame(s => s.setPendingInvite);
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
      back={false} label={t('mahalle.invite.label')}
      footer={<>
        {usable && <Cta disabled={busy} onPress={join}>{t('mahalle.invite.cta')}</Cta>}
        <Ghost onPress={other}>{t('mahalle.invite.other')}</Ghost>
      </>}
    >
      {preview === undefined && <ActivityIndicator size="large" color={colors.l600} style={{ marginTop: 80 }} />}
      {preview === null && <T color={colors.g200} style={{ textAlign: 'center', marginTop: 80 }}>{t('mahalle.invite.bad')}</T>}
      {preview && (
        <>
          <View style={{ alignItems: 'center', gap: 14, paddingTop: 24 }}>
            <Emblem shape={preview.emblem} color={preview.color} name={preview.name} size={112} />
            <H1 style={{ textAlign: 'center', fontSize: 26, lineHeight: 31 }}>{t('mahalle.invite.title', { name: preview.name })}</H1>
            <T size={15} color={colors.g200} style={{ textAlign: 'center', lineHeight: 22 }}>
              {usable ? t('mahalle.invite.sub', { n: preview.memberCount, free }) : t('mahalle.invite.bad')}
            </T>
          </View>
          {usable && (
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 12, borderRadius: 16, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line }}>
              <CoachFace size={40} />
              <View style={{ flex: 1, gap: 2 }}>
                <T w={600} size={12} color={colors.g200} style={{ letterSpacing: 0.6 }}>{t('coach.name').toLocaleUpperCase('tr')}</T>
                <T w={500} size={15} style={{ lineHeight: 20 }}>{t('mahalle.invite.line')}</T>
              </View>
            </View>
          )}
          {error && <T w={500} size={14} color={colors.bad} accessibilityLiveRegion="polite">{error}</T>}
        </>
      )}
    </Shell>
  );
}
