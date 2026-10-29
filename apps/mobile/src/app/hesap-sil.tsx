import { useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { num } from '../game/format.ts';
import { useGame } from '../game/store.ts';
import { colors, MAX_FONT_SCALE } from '../theme.ts';
import { Icon, type IconName } from '../ui/Icon.tsx';
import { buzz, Caps, Danger, Ghost, T } from '../ui/kit.tsx';
import { Shell } from '../ui/mahalle.tsx';
import { toast } from '../ui/overlay.tsx';
import { Bubble } from '../ui/sade.tsx';
import { t } from '../i18n/index.ts';

// Hesabı sil: deletes the account and every bit of game data on the server, for good.
// It has its own screen rather than a sheet: the player sees exactly what goes, and types
// a word to confirm, so a stray tap can never do it.

/** "SİL", "sil", "SIL" and "Sil" all count; Turkish keyboards differ on the dotted İ. */
const confirmed = (s: string) => s.trim().toLocaleLowerCase('tr').replace(/ı/g, 'i') === t('delete.word').toLocaleLowerCase('tr').replace(/ı/g, 'i');

export default function HesapSil() {
  const g = useGame();
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = confirmed(word);
  const trophies = g.kariyer?.achievements?.filter(a => a.unlocked).length ?? 0;

  const lost: { icon: IconName; text: string }[] = [
    { icon: 'star', text: t('delete.lostPlayer', { name: g.name, n: g.level }) },
    { icon: 'coin', text: t('delete.lostWallet', { coin: num(g.coins), gem: num(g.gems) }) },
    { icon: 'trophy', text: t('delete.lostCareer', { n: trophies }) },
    ...(g.mahalle ? [{ icon: 'city' as const, text: t('delete.lostMahalle', { name: g.mahalle.name }) }] : []),
  ];

  const run = async () => {
    if (!ok || busy) return;
    buzz('medium');
    setBusy(true);
    try {
      await useGame.getState().deleteAccount();
      // Signed out now: the guard takes the player to the sign-in screen.
      toast(t('delete.done'));
    } catch (e) {
      console.warn('account delete failed', e);
      setBusy(false);
      toast(t('delete.failed'), 'error');
    }
  };

  // The confirm box sits in the footer next to the button, so it stays in view above the keyboard.
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Shell
        title={t('delete.title')}
        footer={
          <>
            <View style={{ gap: 8, marginBottom: 4 }}>
              <T w={600} size={14}>{t('delete.type', { word: t('delete.word') })}</T>
              <View style={{ height: 52, borderRadius: 14, backgroundColor: colors.s2, borderWidth: 1, borderColor: ok ? colors.bad : colors.line, justifyContent: 'center', paddingHorizontal: 14 }}>
                <TextInput maxFontSizeMultiplier={MAX_FONT_SCALE}
                  value={word} onChangeText={setWord} autoCorrect={false} autoCapitalize="characters" autoComplete="off"
                  maxLength={12} returnKeyType="done" onSubmitEditing={() => void run()} editable={!busy}
                  placeholder={t('delete.word')} placeholderTextColor={colors.g400} selectionColor={colors.bad}
                  accessibilityLabel={t('delete.type', { word: t('delete.word') })}
                  style={{ color: colors.g100, fontFamily: 'Inter_600SemiBold', fontSize: 18, letterSpacing: 2, outlineStyle: 'none' } as object}
                />
              </View>
            </View>
            <Danger solid off={!ok} busy={busy} onPress={() => void run()} accessibilityHint={ok ? undefined : t('delete.typeHint', { word: t('delete.word') })}>
              {t('delete.cta')}
            </Danger>
            <Ghost onPress={() => router.back()}>{t('common.cancel')}</Ghost>
          </>
        }
      >
        <View style={{ alignItems: 'center', gap: 10, paddingTop: 8 }}>
          <View style={{ width: 80, height: 80, borderRadius: 26, backgroundColor: '#3A1D19', borderWidth: 2, borderColor: colors.bad, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="trash" size={38} color={colors.bad} />
          </View>
          <T w={700} size={22} style={{ textAlign: 'center' }} accessibilityRole="header">{t('delete.headline')}</T>
          <T size={14} color={colors.g200} style={{ textAlign: 'center', lineHeight: 20 }}>{t('delete.sub')}</T>
        </View>

        <View style={{ gap: 10 }}>
          <Caps>{t('delete.lostTitle')}</Caps>
          <View style={{ borderRadius: 20, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, paddingVertical: 6 }}>
            {lost.map((l, i) => (
              <View key={l.icon} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
                <Icon name={l.icon} size={20} color={colors.g200} />
                <T w={500} size={14} style={{ flex: 1, lineHeight: 19 }}>{l.text}</T>
              </View>
            ))}
          </View>
          <T size={12} color={colors.g300} style={{ lineHeight: 17 }}>{t('delete.note')}</T>
        </View>

        <Bubble text={t('delete.line')} />

      </Shell>
    </KeyboardAvoidingView>
  );
}
