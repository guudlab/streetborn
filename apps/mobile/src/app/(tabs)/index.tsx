import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { tr } from '../../game/format.ts';
import { ovr } from '../../game/rules.ts';
import { useGame } from '../../game/store.ts';
import { colors, TAB_BAR_SPACE } from '../../theme.ts';
import { Icon } from '../../ui/Icon.tsx';
import { openEnergySheet } from '../../ui/energy.tsx';
import { Crest, Hud } from '../../ui/hud.tsx';
import { Caps, Cta, T } from '../../ui/kit.tsx';
import { toast } from '../../ui/overlay.tsx';

const hero = require('../../../assets/hero-alt.webp');

export default function Hub() {
  const insets = useSafeAreaInsets();
  const g = useGame();
  const empty = g.energy === 0;
  const showOffers = g.scouted && !g.signed;

  const [starting, setStarting] = useState(false);
  const play = async () => {
    if (starting) return;
    setStarting(true);
    const r = await useGame.getState().startMatch();
    setStarting(false);
    if (r === 'no_energy') return openEnergySheet();
    if (r === 'error') return toast('Maç başlatılamadı, bağlantını kontrol et');
    router.push('/mac');
  };

  return (
    <View style={{ flex: 1, paddingTop: insets.top + 8, paddingBottom: TAB_BAR_SPACE + insets.bottom }}>
      <Hud />
      {g.offlineReason && (
        <T w={500} size={12} color={colors.g200} style={{ textAlign: 'center', marginTop: 6 }}>
          {g.offlineReason} · ilerleme kaydedilmiyor
        </T>
      )}

      <View style={{ flex: 1, minHeight: 260 }}>
        {/* Lime floor glow under the player */}
        <Svg width={260} height={46} style={{ position: 'absolute', bottom: 6, alignSelf: 'center' }}>
          <Defs>
            <RadialGradient id="glow" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor={colors.l600} stopOpacity={0.32} />
              <Stop offset="1" stopColor={colors.l600} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx={130} cy={23} rx={130} ry={23} fill="url(#glow)" />
        </Svg>
        <Image source={hero} contentFit="contain" style={{ flex: 1 }} accessibilityLabel={`${g.name}, mahalle forması ile (dokusuz model)`} />

        <View style={{ position: 'absolute', left: 20, top: 26, gap: 10 }}>
          <View>
            <T w={600} size={48} style={{ lineHeight: 50, letterSpacing: -1 }}>{ovr(g.stats)}</T>
            <Caps>Genel güç</Caps>
          </View>
          {([['ŞUT', 'sut'], ['PAS', 'pas'], ['HIZ', 'hiz'], ['FİZ', 'fizik']] as const).map(([l, k]) => (
            <View key={k} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <T w={600} size={11} color={colors.g200} style={{ width: 28, letterSpacing: 0.6 }}>{l}</T>
              <T w={600} size={13}>{g.stats[k]}</T>
            </View>
          ))}
        </View>

        {g.form.length > 0 && <View style={{ position: 'absolute', right: 20, top: 26, gap: 6, alignItems: 'flex-end' }}>
          <Caps>Form</Caps>
          {g.form.map((r, i) => (
            <View key={i} style={{ minWidth: 40, height: 26, paddingHorizontal: 8, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: r >= 7 ? colors.l900 : colors.s2 }}>
              <T w={600} size={13} color={r >= 7 ? colors.l500 : colors.g100}>{tr(r, 1)}</T>
            </View>
          ))}
        </View>}
      </View>

      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        {showOffers && (
          <Pressable
            accessibilityRole="button" onPress={() => router.navigate('/teklifler')}
            style={{ height: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.s2 }}
          >
            <Icon name="mail" color={colors.l600} />
            <T w={600} size={15} style={{ flex: 1 }}>2 kulüpten teklif var</T>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.l600 }} />
            <Icon name="chev" color={colors.g200} />
          </Pressable>
        )}

        <View style={{ padding: 16, borderRadius: 22, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, gap: 14 }}>
          <Caps>Hafta 10 · Lig maçı</Caps>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Crest text="YIL" bg={colors.l600} fg={colors.ink} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T w={600} size={16} numberOfLines={1}>Yıldırımspor – Kartaltepe SK</T>
              <T size={13} color={colors.g200}>3 pozisyon · yaklaşık 3 dk</T>
            </View>
            <Crest text="KAR" bg={colors.awayCrest} fg={colors.awayCrestText} />
          </View>
          <Cta off={empty} onPress={play} accessibilityLabel={empty ? 'Enerji bekleniyor' : 'Maça çık, 1 enerji'}>
            <T w={600} size={17} color={empty ? colors.g200 : colors.ink}>{empty ? 'Enerji bekleniyor' : starting ? 'Maç hazırlanıyor…' : 'Maça çık'}</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(13,13,13,.12)', borderRadius: 12, paddingVertical: 3, paddingLeft: 4, paddingRight: 8 }}>
              <Icon name="bolt" size={16} color={empty ? colors.g200 : colors.ink} />
              <T w={600} size={14} color={empty ? colors.g200 : colors.ink}>1</T>
            </View>
          </Cta>
        </View>
      </View>
    </View>
  );
}
