import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { useGame } from '../game/store.ts';
import { previewMahalle, type MahallePreview } from '../net/api.ts';
import { colors } from '../theme.ts';
import { Emblem } from '../ui/emblem.tsx';
import { Cta, T } from '../ui/kit.tsx';
import { mahalleError, Shell } from '../ui/mahalle.tsx';
import { Amount, Ico } from '../ui/sade.tsx';
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
    <Shell title={t('mahalle.code.title')} footer={<Cta off={!preview} disabled={!preview} busy={busy} onPress={join}>{t('mahalle.code.cta')}</Cta>}>
      <Ico name="anahtar" size={96} style={{ alignSelf: 'center', marginTop: 12 }} />

      <Pressable accessibilityRole="none" onPress={() => input.current?.focus()} style={{ flexDirection: 'row', gap: 8 }}>
        {Array.from({ length: LEN }, (_, i) => (
          <View key={i} style={{ flex: 1, height: 60, borderRadius: 14, backgroundColor: colors.s2, borderWidth: 1.5, borderColor: code[i] ? colors.l600 : colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <T w={700} size={26}>{code[i] ?? ''}</T>
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
        <View accessibilityLiveRegion="polite" accessibilityLabel={`${t('mahalle.code.found')}: ${preview.name}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 22, backgroundColor: 'rgba(63,77,24,.38)', borderWidth: 1.5, borderColor: colors.l600 }}>
          <Emblem shape={preview.emblem} color={preview.color} name={preview.name} size={56} />
          <View style={{ flex: 1, gap: 4 }}>
            <T w={700} size={19} numberOfLines={1}>{preview.name}</T>
            <View style={{ flexDirection: 'row', gap: 14 }}>
              <Amount icon="oyuncu" size={20} textSize={14} color={colors.g200}>{preview.memberCount} / 12</Amount>
              {preview.captainNick && <T w={600} size={14} color={colors.g200} numberOfLines={1} style={{ flexShrink: 1 }}>★ {preview.captainNick}</T>}
            </View>
          </View>
        </View>
      )}
      {looked && !preview && <T w={500} size={14} color={colors.bad} style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">{error ?? t('mahalle.code.none')}</T>}
      {preview && error && <T w={500} size={14} color={colors.bad} accessibilityLiveRegion="polite">{error}</T>}
    </Shell>
  );
}
