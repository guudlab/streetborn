import { checkName } from '@streetborn/economy';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { useGame } from '../game/store.ts';
import type { MahalleColor, MahalleEmblem } from '../net/api.ts';
import { colors } from '../theme.ts';
import { Emblem, MAHALLE_COLORS, MAHALLE_COLOR_LIST, MAHALLE_EMBLEM_LIST } from '../ui/emblem.tsx';
import { buzz, Cta, T } from '../ui/kit.tsx';
import { mahalleError, Shell } from '../ui/mahalle.tsx';
import { Amount, Ico, Tile } from '../ui/sade.tsx';
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
    <Shell title={t('mahalle.create.title')} footer={<Cta off={!ready} disabled={!ready} busy={busy} onPress={submit}>{t('mahalle.create.cta')}</Cta>}>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Emblem shape={emblem} color={color} name={name} size={104} />
        <T w={700} size={22} numberOfLines={1}>{name.trim() || t('mahalle.create.namePlaceholder')}</T>
        <Amount icon="oyuncu" size={20} color={colors.g200} textSize={13}>1 / 12</Amount>
      </View>

      <View style={{ gap: 6 }}>
        <View style={{ height: 56, borderRadius: 18, backgroundColor: colors.s2, borderWidth: 1.5, borderColor: error ? colors.bad : colors.l600, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8 }}>
          <TextInput
            value={name} onChangeText={(s) => { setName(s.slice(0, MAX)); setError(null); }} maxLength={MAX}
            autoCorrect={false} autoCapitalize="words" returnKeyType="done" onSubmitEditing={submit}
            placeholder={t('mahalle.create.namePlaceholder')} placeholderTextColor={colors.g400} selectionColor={colors.l600}
            accessibilityLabel={t('mahalle.create.name')}
            // outlineStyle hides the browser's focus box on web; the field already has a lime border.
            style={{ flex: 1, color: colors.g100, fontFamily: 'Inter_600SemiBold', fontSize: 18, outlineStyle: 'none' } as object}
          />
          <T w={500} size={12} color={colors.g300} numberOfLines={1} style={{ flexShrink: 0 }}>{name.length}/{MAX}</T>
        </View>
        {error && <T w={500} size={12} color={colors.bad} accessibilityLiveRegion="polite">{error}</T>}
      </View>

      <View accessibilityRole="radiogroup" accessibilityLabel={t('mahalle.create.emblem')} style={{ flexDirection: 'row', gap: 10 }}>
        {MAHALLE_EMBLEM_LIST.map((e) => (
          <Tile key={e} role="radio" selected={emblem === e} label={t(`mahalle.emblem.${e}` as Key)} onPress={() => setEmblem(e)} style={{ flex: 1, height: 72 }}>
            <Emblem shape={e} color={color} size={44} />
          </Tile>
        ))}
      </View>

      <View accessibilityRole="radiogroup" accessibilityLabel={t('mahalle.create.color')} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {MAHALLE_COLOR_LIST.map((c) => (
          <Pressable
            key={c} accessibilityRole="radio" accessibilityLabel={t(`mahalle.color.${c}` as Key)} accessibilityState={{ selected: color === c }}
            hitSlop={4} onPress={() => { buzz(); setColor(c); }}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: MAHALLE_COLORS[c].fill, borderWidth: color === c ? 3 : 1, borderColor: color === c ? colors.g100 : colors.line, alignItems: 'center', justifyContent: 'center' }}
          >
            <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: MAHALLE_COLORS[c].line }} />
          </Pressable>
        ))}
      </View>

      <View accessibilityRole="radiogroup" accessibilityLabel={t('mahalle.create.who')} style={{ flexDirection: 'row', gap: 10 }}>
        {([[false, 'mahalle.create.invite', 'davet'], [true, 'mahalle.create.public', 'mahalleBul']] as const).map(([v, k, icon]) => (
          <Tile key={k} row role="radio" selected={open === v} label={t(k)} onPress={() => setOpen(v)} style={{ flex: 1, minHeight: 60, gap: 8 }}>
            <Ico name={icon} size={36} />
            <T w={700} size={15}>{t(k)}</T>
          </Tile>
        ))}
      </View>
    </Shell>
  );
}
