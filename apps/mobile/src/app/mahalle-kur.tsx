import { checkName } from '@streetborn/economy';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { useGame } from '../game/store.ts';
import type { MahalleColor, MahalleEmblem } from '../net/api.ts';
import { colors } from '../theme.ts';
import { Emblem, MAHALLE_COLORS, MAHALLE_COLOR_LIST, MAHALLE_EMBLEM_LIST } from '../ui/emblem.tsx';
import { buzz, Caps, Cta, H1, T } from '../ui/kit.tsx';
import { mahalleError, Shell } from '../ui/mahalle.tsx';
import { t, type Key } from '../i18n/index.ts';

const MAX = 18;

export default function MahalleKur() {
  const createMahalle = useGame(s => s.createMahalle);
  const [name, setName] = useState('');
  const [emblem, setEmblem] = useState<MahalleEmblem>('shield');
  const [color, setColor] = useState<MahalleColor>('lime');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = name.trim().length >= 2;
  async function submit() {
    if (busy || !ready) return;
    const problem = checkName(name, 'mahalle');
    if (problem) { setError(t(`name.err.${problem}`)); return; }
    setBusy(true);
    try {
      // On success the mahalle is set and mahalle-secim moves on to character creation.
      await createMahalle(name.trim(), emblem, color, open);
    } catch (e) {
      setError(mahalleError(e));
    } finally { setBusy(false); }
  }

  return (
    <Shell
      label={t('mahalle.label')}
      footer={<>
        <Cta off={!ready} disabled={!ready} busy={busy} onPress={submit}>{t('mahalle.create.cta')}</Cta>
        <T w={500} size={12} color={colors.g300} style={{ textAlign: 'center' }}>{t('mahalle.create.note')}</T>
      </>}
    >
      <H1>{t('mahalle.create.title')}</H1>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 22, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line }}>
        <Emblem shape={emblem} color={color} name={name} size={72} />
        <View style={{ flex: 1, gap: 3 }}>
          <T w={600} size={20} numberOfLines={1}>{name.trim() || t('mahalle.create.namePlaceholder')}</T>
          <T w={500} size={13} color={colors.g200}>{t('mahalle.create.founder')}</T>
          <T w={500} size={12} color={colors.l500}>{t('mahalle.create.preview')}</T>
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <Caps>{t('mahalle.create.name')}</Caps>
        <View style={{ height: 52, borderRadius: 14, backgroundColor: colors.s2, borderWidth: 1, borderColor: error ? colors.bad : colors.l600, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 8 }}>
          <TextInput
            value={name} onChangeText={(s) => { setName(s.slice(0, MAX)); setError(null); }} maxLength={MAX}
            autoCorrect={false} autoCapitalize="words" returnKeyType="done" onSubmitEditing={submit}
            placeholder={t('mahalle.create.namePlaceholder')} placeholderTextColor={colors.g400} selectionColor={colors.l600}
            accessibilityLabel={t('mahalle.create.name')}
            // outlineStyle hides the browser's focus box on web; the field already has a lime border.
            style={{ flex: 1, color: colors.g100, fontFamily: 'Inter_500Medium', fontSize: 17, outlineStyle: 'none' } as object}
          />
          <T w={500} size={12} color={colors.g300}>{name.length} / {MAX}</T>
        </View>
        {error
          ? <T w={500} size={12} color={colors.bad} accessibilityLiveRegion="polite">{error}</T>
          : <T w={500} size={12} color={colors.g300}>{t('mahalle.create.nameHint')}</T>}
      </View>

      <View style={{ gap: 8 }}>
        <Caps>{t('mahalle.create.emblem')}</Caps>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {MAHALLE_EMBLEM_LIST.map((e) => (
            <Pressable
              key={e} accessibilityRole="radio" accessibilityLabel={t(`mahalle.emblem.${e}` as Key)} accessibilityState={{ selected: emblem === e }}
              onPress={() => { buzz(); setEmblem(e); }}
              style={{ flex: 1, height: 56, borderRadius: 14, backgroundColor: colors.s2, borderWidth: emblem === e ? 2 : 1, borderColor: emblem === e ? colors.l600 : colors.line, alignItems: 'center', justifyContent: 'center' }}
            >
              <Emblem shape={e} color="white" size={34} />
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {MAHALLE_COLOR_LIST.map((c) => (
            <Pressable
              key={c} accessibilityRole="radio" accessibilityLabel={t(`mahalle.color.${c}` as Key)} accessibilityState={{ selected: color === c }}
              hitSlop={4} onPress={() => { buzz(); setColor(c); }}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: MAHALLE_COLORS[c].fill, borderWidth: color === c ? 2 : 1, borderColor: color === c ? colors.l600 : colors.line, alignItems: 'center', justifyContent: 'center' }}
            >
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: MAHALLE_COLORS[c].line }} />
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Caps>{t('mahalle.create.who')}</Caps>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 6, padding: 4, borderRadius: 24, backgroundColor: colors.s2 }}>
          {([[false, 'mahalle.create.invite'], [true, 'mahalle.create.public']] as const).map(([v, k]) => (
            <Pressable
              key={k} accessibilityRole="radio" accessibilityState={{ selected: open === v }}
              onPress={() => { buzz(); setOpen(v); }}
              style={{ flex: 1, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: open === v ? colors.l600 : 'transparent' }}
            >
              <T w={600} size={14} color={open === v ? colors.ink : colors.g200}>{t(k)}</T>
            </Pressable>
          ))}
        </View>
      </View>
    </Shell>
  );
}
