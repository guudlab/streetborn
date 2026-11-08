import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';

import { ApiError, searchPlayers, type PlayerHit } from '../net/api.ts';
import { colors, MAX_FONT_SCALE, radius } from '../theme.ts';
import { buzz, T } from '../ui/kit.tsx';
import { Shell } from '../ui/mahalle.tsx';
import { PressableScale } from '../ui/motion.tsx';
import { EmptyState } from '../ui/states.tsx';
import { Icon } from '../ui/Icon.tsx';
import { t } from '../i18n/index.ts';

// Player search: a nickname prefix (3+ letters) or the exact 6-character player code. The
// server returns at most 20 hits and hides blocked, private and reported players.

export default function OyuncuAra() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<PlayerHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const text = q.trim();
    if (text.length < 3) { setHits(null); setError(null); return; }
    // Wait for a pause in typing: every search counts against the daily limit.
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        const r = await searchPlayers(text);
        if (mine === seq.current) { setHits(r); setError(null); }
      } catch (e) {
        if (mine !== seq.current) return;
        setHits(null);
        setError(e instanceof ApiError && e.message === 'too_many' ? t('player.tooMany') : t('common.loadFailed'));
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <Shell title={t('player.search')}>
      <View style={{ height: 52, borderRadius: radius.md, backgroundColor: colors.s2, borderWidth: 1, borderColor: colors.l600, justifyContent: 'center', paddingHorizontal: 14 }}>
        <TextInput maxFontSizeMultiplier={MAX_FONT_SCALE}
          value={q} onChangeText={setQ} autoFocus autoCorrect={false} autoCapitalize="none" maxLength={24} returnKeyType="search"
          placeholder={t('player.searchHint')} placeholderTextColor={colors.g400} selectionColor={colors.l600} accessibilityLabel={t('player.search')}
          style={{ color: colors.g100, fontFamily: 'Inter_500Medium', fontSize: 17, outlineStyle: 'none' } as object}
        />
      </View>

      {error && <T w={500} size={14} color={colors.bad} accessibilityLiveRegion="polite">{error}</T>}
      {!error && hits === null && <T size={14} color={colors.g200}>{q.trim().length === 0 ? t('player.searchFirst') : t('player.searchShort')}</T>}
      {!error && hits?.length === 0 && <EmptyState icon="oyuncu" text={t('player.noHits')} />}

      {hits && hits.length > 0 && (
        <View style={{ borderRadius: radius.lg, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }}>
          {hits.map((h, i) => (
            <View key={h.id}>
              {i > 0 && <View style={{ height: 1, backgroundColor: colors.line, marginLeft: 68 }} />}
              <PressableScale
                accessibilityRole="button" accessibilityLabel={t('player.open', { name: h.nick ?? '' })}
                onPress={() => { buzz(); router.push({ pathname: '/oyuncu', params: { kod: h.kod } }); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 16 }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.s3, alignItems: 'center', justifyContent: 'center' }}>
                  <T w={600} size={14}>{(h.nick ?? '?').slice(0, 2).toLocaleUpperCase('tr')}</T>
                </View>
                <View style={{ flex: 1 }}>
                  <T w={600} size={16} numberOfLines={1}>{h.nick}</T>
                  <T w={500} size={13} color={colors.g200} numberOfLines={1}>{[t('profile.level', { n: h.level }), h.mahalle].filter(Boolean).join(' · ')}</T>
                </View>
                <Icon name="chev" size={18} color={colors.g300} />
              </PressableScale>
            </View>
          ))}
        </View>
      )}
    </Shell>
  );
}
