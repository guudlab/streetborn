import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { useGame } from '../game/store.ts';
import { previewMahalle, type MahallePreview } from '../net/api.ts';
import { colors } from '../theme.ts';
import { Emblem } from '../ui/emblem.tsx';
import { Cta, H1, T } from '../ui/kit.tsx';
import { mahalleError, Shell } from '../ui/mahalle.tsx';
import { t } from '../i18n/index.ts';

const LEN = 6;
// Invite codes skip 0, O, 1 and I.
const clean = (s: string) => s.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, LEN);

export default function MahalleKod() {
  const joinMahalle = useGame(s => s.joinMahalle);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<MahallePreview | null>(null);
  const [looked, setLooked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Looks the mahalle up as soon as the sixth character is in.
  useEffect(() => {
    setPreview(null); setLooked(false); setError(null);
    if (code.length < LEN) return;
    let live = true;
    previewMahalle(code).then((p) => { if (live) { setPreview(p); setLooked(true); } }).catch((e) => { if (live) { setError(mahalleError(e)); setLooked(true); } });
    return () => { live = false; };
  }, [code]);

  async function join() {
    if (busy || !preview) return;
    setBusy(true);
    try { await joinMahalle({ code }); } catch (e) { setError(mahalleError(e)); } finally { setBusy(false); }
  }

  return (
    <Shell
      label={t('mahalle.label')}
      footer={<>
        <Cta off={!preview} disabled={!preview || busy} onPress={join}>{t('mahalle.code.cta')}</Cta>
        <T w={500} size={12} color={colors.g300} style={{ textAlign: 'center' }}>{t('mahalle.code.note')}</T>
      </>}
    >
      <View style={{ gap: 6 }}>
        <H1>{t('mahalle.code.title')}</H1>
        <T color={colors.g200} style={{ lineHeight: 21 }}>{t('mahalle.code.sub')}</T>
      </View>

      <Pressable accessibilityRole="none" onPress={() => input.current?.focus()} style={{ flexDirection: 'row', gap: 8 }}>
        {Array.from({ length: LEN }, (_, i) => (
          <View key={i} style={{ flex: 1, height: 56, borderRadius: 12, backgroundColor: colors.s2, borderWidth: 1, borderColor: code[i] ? colors.l600 : colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <T w={700} size={24}>{code[i] ?? ''}</T>
          </View>
        ))}
        {/* The real input sits invisibly on top of the boxes. */}
        <TextInput
          ref={input} value={code} onChangeText={(s) => setCode(clean(s))} autoFocus autoCapitalize="characters" autoCorrect={false}
          maxLength={LEN} accessibilityLabel={t('mahalle.code.a11y')} selectionColor={colors.l600}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.02, color: colors.ink }}
        />
      </Pressable>

      {preview && (
        <View accessibilityLiveRegion="polite" style={{ gap: 12 }}>
          <T w={600} size={13} color={colors.l600}>{t('mahalle.code.found')}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 22, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line }}>
            <Emblem shape={preview.emblem} color={preview.color} name={preview.name} size={60} />
            <View style={{ flex: 1, gap: 3 }}>
              <T w={600} size={20} numberOfLines={1}>{preview.name}</T>
              <T w={500} size={13} color={colors.g200}>{t('mahalle.code.founder', { nick: preview.captainNick ?? t('mahalle.home.newPlayer'), n: preview.memberCount })}</T>
            </View>
          </View>
        </View>
      )}
      {looked && !preview && <T w={500} size={14} color={colors.bad} accessibilityLiveRegion="polite">{error ?? t('mahalle.code.none')}</T>}
      {preview && error && <T w={500} size={14} color={colors.bad} accessibilityLiveRegion="polite">{error}</T>}
    </Shell>
  );
}
