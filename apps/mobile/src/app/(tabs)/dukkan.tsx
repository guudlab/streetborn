import { Image } from 'expo-image';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGame } from '../../game/store.ts';
import { colors, TAB_BAR_SPACE } from '../../theme.ts';
import { Icon } from '../../ui/Icon.tsx';
import { EnergyOptions, energyLeft } from '../../ui/energy.tsx';
import { Caps, Card, Cta, Ghost, H1, H3, Price, T, useNow } from '../../ui/kit.tsx';
import { closeSheet, openSheet, SheetText, Spinner } from '../../ui/overlay.tsx';

// Prices are samples from the prototype. Store purchases are not wired yet
// (RevenueCat comes later), so "buy" only shows the flow.

function buy(name: string, price: string) {
  openSheet(
    <>
      <H3>{name}</H3>
      <SheetText>Fiyat: <T w={600} color={colors.g100}>{price}</T>. Ödeme App Store veya Google Play üzerinden yapılır.</SheetText>
      <Cta onPress={() => {
        openSheet(<><H3>Ödeme bekleniyor</H3><Spinner /><SheetText>Mağaza onayı bekleniyor…</SheetText></>);
        setTimeout(() => openSheet(
          <>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="check" color={colors.l600} /><H3 color={colors.l600}>Tamamlandı</H3></View>
            <SheetText>Prototip: gerçek ödeme alınmadı, hesaba bir şey eklenmedi.</SheetText>
            <Cta onPress={closeSheet}>Tamam</Cta>
          </>,
        ), 1400);
      }}>{`Onayla · ${price}`}</Cta>
      <Ghost onPress={closeSheet}>Vazgeç</Ghost>
    </>,
  );
}

const Check = ({ children, muted }: { children: string; muted?: boolean }) => (
  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
    <Icon name={muted ? 'info' : 'check'} size={18} color={muted ? colors.g200 : colors.l600} />
    <T size={14} color={muted ? colors.g200 : colors.g100} style={{ flex: 1 }}>{children}</T>
  </View>
);

export default function Dukkan() {
  const insets = useSafeAreaInsets();
  const now = useNow();
  const { energy, energyMax, gems } = useGame();
  const t = energyLeft(now);

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: TAB_BAR_SPACE + insets.bottom, gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View><Caps>Dükkân</Caps><H1 style={{ marginTop: 4 }}>Enerji ve paketler</H1></View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingLeft: 8, paddingRight: 12, borderRadius: 18, backgroundColor: colors.s2 }}>
          <Image source={require('../../../assets/meshy/gem.png')} style={{ width: 24, height: 24 }} contentFit="contain" accessibilityElementsHidden importantForAccessibility="no" /><T w={600} size={15}>{gems}</T>
        </View>
      </View>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <H3>Enerji {energy}/{energyMax}</H3>
          <T size={13} color={colors.g200}>{t ? `Sonraki enerji ${t}` : 'Enerji dolu'}</T>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {Array.from({ length: energyMax }, (_, i) => <View key={i} style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: i < energy ? colors.l600 : colors.s3 }} />)}
        </View>
        <View style={{ gap: 8 }}><EnergyOptions /></View>
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <View><Caps>Aylık</Caps><H3 style={{ marginTop: 2 }}>Sezon bileti</H3></View>
          <View style={{ alignItems: 'flex-end' }}><Price>149,99 TL</Price><T w={500} size={11} color={colors.g300}>örnek fiyat</T></View>
        </View>
        <View style={{ gap: 8 }}>
          <Check>Enerji kapasitesi 5 yerine 6</Check>
          <Check>Reklamsız oyun</Check>
          <Check>Sezon ödüllerinde daha fazla coin</Check>
          <Check>Sezon formasının serbest bırakılabilir sürümü</Check>
          <Check muted>Maçta veya özelliklerde avantaj vermez</Check>
        </View>
        <Cta onPress={() => buy('Sezon bileti', '149,99 TL')}>Satın al</Cta>
      </Card>

      <Card>
        <H3>Elmas</H3>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([[80, '39,99'], [450, '199,99'], [1000, '399,99']] as const).map(([g, p]) => (
            <Pressable
              key={g} accessibilityRole="button" accessibilityLabel={`${g} elmas, ${p} TL`} onPress={() => buy(`${g} elmas`, `${p} TL`)}
              style={{ flex: 1, borderRadius: 16, backgroundColor: colors.s2, paddingVertical: 14, alignItems: 'center', gap: 6 }}
            >
              <Image source={require('../../../assets/meshy/gem.png')} style={{ width: 36, height: 36 }} contentFit="contain" accessibilityElementsHidden importantForAccessibility="no" />
              <T w={600} size={17}>{g}</T>
              <T size={13} color={colors.g200}>{p} TL</T>
            </Pressable>
          ))}
        </View>
        <T w={500} size={11} color={colors.g300}>Örnek fiyatlar. Bonus yüzdesi veya üstü çizili fiyat kullanılmaz.</T>
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: colors.l600, alignItems: 'center', justifyContent: 'center' }}>
            <T w={700} size={18} color={colors.ink}>10</T>
          </View>
          <View style={{ flex: 1 }}>
            <T w={600} size={17}>Sonbahar sezon forması</T>
            <T size={13} color={colors.g200}>Kozmetik · bütün maçlarda giyilir</T>
          </View>
          <Price gem>120</Price>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => openSheet(
            <>
              <H3>Serbest bırakılabilir ne demek?</H3>
              <SheetText>Bu eşya şimdilik sadece oyunda, hesabına bağlı. Zincir katmanı açılırsa (planlanan tarih yok) 30 günlük, kimliği doğrulanmış hesaplar bu eşyayı NFT olarak cüzdanına taşıyabilir.</SheetText>
              <SheetText>Eşyanın bir para değeri olacağına dair bir söz verilmez. Taşımak için ayrıca elmasla basma ücreti ödenir.</SheetText>
              <Cta onPress={closeSheet}>Anladım</Cta>
            </>,
          )}
          style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.g400, borderRadius: 10, paddingVertical: 4, paddingHorizontal: 8 }}
        >
          <Icon name="lock" size={14} color={colors.g200} />
          <T w={600} size={12} color={colors.g200}>Serbest bırakılabilir · zincir katmanı açılınca</T>
        </Pressable>
        <Ghost onPress={() => buy('Sonbahar sezon forması', '120 elmas')}>Satın al</Ghost>
      </Card>
    </ScrollView>
  );
}
