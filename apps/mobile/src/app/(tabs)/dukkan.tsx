import { Model3D } from '../../ui/Model3D.tsx';
import { Image } from 'expo-image';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sfx } from '../../audio/audio.ts';
import { useGame } from '../../game/store.ts';
import { colors, TAB_BAR_SPACE } from '../../theme.ts';
import { Icon } from '../../ui/Icon.tsx';
import { EnergyOptions, energyLeft } from '../../ui/energy.tsx';
import { buzz, Caps, Card, Cta, Ghost, H1, H3, Price, T, useNow } from '../../ui/kit.tsx';
import { closeSheet, openSheet, SheetText, Spinner, toast } from '../../ui/overlay.tsx';
import { t } from '../../i18n/index.ts';

// Gem packs and the season pass are store purchases (RevenueCat comes later), so
// their "buy" only shows the flow. Online, gem items are bought on the server at
// the catalog price; offline they show the same prototype flow.

const JERSEY = 'forma_sonbahar';

function buyWithGems(id: string, name: string, price: number) {
  const gems = useGame.getState().gems;
  if (gems < price) {
    openSheet(<><H3>{name}</H3><SheetText>{t('shop.noGem')}</SheetText><Cta onPress={closeSheet}>{t('common.ok')}</Cta></>);
    return;
  }
  openSheet(
    <>
      <H3>{name}</H3>
      <SheetText>{t('shop.gemConfirm', { price, balance: gems })}</SheetText>
      <Cta onPress={async () => {
        openSheet(<><H3>{name}</H3><Spinner /></>);
        const r = await useGame.getState().buyItem(id);
        closeSheet();
        if (r === 'ok' || r === 'owned') { sfx('coin'); buzz('medium'); toast(t('shop.bought', { name })); }
        else toast(t(r === 'no_gem' ? 'energy.noGem' : 'shop.buyFailed'));
      }}>{t('shop.gemBuy', { price })}</Cta>
      <Ghost onPress={closeSheet}>{t('common.cancel')}</Ghost>
    </>,
  );
}

function buy(name: string, price: string) {
  openSheet(
    <>
      <H3>{name}</H3>
      <SheetText>{t('shop.priceLabel')}<T w={600} color={colors.g100}>{price}</T>{t('shop.priceTail')}</SheetText>
      <Cta onPress={() => {
        openSheet(<><H3>{t('shop.waiting')}</H3><Spinner /><SheetText>{t('shop.waitingStore')}</SheetText></>);
        setTimeout(() => { sfx('coin'); openSheet(
          <>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="check" color={colors.l600} /><H3 color={colors.l600}>{t('shop.done')}</H3></View>
            <SheetText>{t('shop.prototype')}</SheetText>
            <Cta onPress={closeSheet}>{t('common.ok')}</Cta>
          </>,
        ); }, 1400);
      }}>{t('shop.confirm', { price })}</Cta>
      <Ghost onPress={closeSheet}>{t('common.cancel')}</Ghost>
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
  const { energy, energyMax, gems, mode, owned, catalog } = useGame();
  const left = energyLeft(now);
  const online = mode === 'online';
  const jerseyPrice = catalog.find(i => i.id === JERSEY)?.priceGem ?? 120;
  const jersey = owned.find(i => i.id === JERSEY);

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: TAB_BAR_SPACE + insets.bottom, gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View><Caps>{t('shop.eyebrow')}</Caps><H1 style={{ marginTop: 4 }}>{t('shop.title')}</H1></View>
        <Model3D model={require('../../../assets/models/canta.glb')} fallback={require('../../../assets/meshy/canta.webp')} poster={require('../../../assets/meshy/canta.webp')} spin style={{ width: 56, height: 56 }} label={t('shop.bag')} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingLeft: 8, paddingRight: 12, borderRadius: 18, backgroundColor: colors.s2 }}>
          <Image source={require('../../../assets/meshy/gem.webp')} style={{ width: 24, height: 24 }} contentFit="contain" accessibilityElementsHidden importantForAccessibility="no" /><T w={600} size={15}>{gems}</T>
        </View>
      </View>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <H3>{t('shop.energy', { energy, max: energyMax })}</H3>
          <T size={13} color={colors.g200}>{left ? t('shop.nextEnergy', { t: left }) : t('shop.energyFull')}</T>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {Array.from({ length: energyMax }, (_, i) => <View key={i} style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: i < energy ? colors.l600 : colors.s3 }} />)}
        </View>
        <View style={{ gap: 8 }}><EnergyOptions /></View>
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <View><Caps>{t('shop.monthly')}</Caps><H3 style={{ marginTop: 2 }}>{t('shop.pass')}</H3></View>
          <View style={{ alignItems: 'flex-end' }}><Price>{t('shop.price.pass')}</Price><T w={500} size={11} color={colors.g300}>{t('shop.samplePrice')}</T></View>
        </View>
        <View style={{ gap: 8 }}>
          <Check>{t('shop.pass.1')}</Check>
          <Check>{t('shop.pass.2')}</Check>
          <Check>{t('shop.pass.3')}</Check>
          <Check>{t('shop.pass.4')}</Check>
          <Check muted>{t('shop.pass.5')}</Check>
        </View>
        <Cta onPress={() => buy(t('shop.pass'), t('shop.price.pass'))}>{t('shop.buy')}</Cta>
      </Card>

      <Card>
        <H3>{t('shop.gems')}</H3>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([[80, 'shop.price.gem1'], [450, 'shop.price.gem2'], [1000, 'shop.price.gem3']] as const).map(([g, pk]) => (
            <Pressable
              key={g} accessibilityRole="button" accessibilityLabel={t('shop.gemPackA11y', { n: g, price: t(pk) })} onPress={() => buy(t('shop.gemPack', { n: g }), t(pk))}
              style={{ flex: 1, borderRadius: 16, backgroundColor: colors.s2, paddingVertical: 14, alignItems: 'center', gap: 6 }}
            >
              <Image source={require('../../../assets/meshy/gem.webp')} style={{ width: 36, height: 36 }} contentFit="contain" accessibilityElementsHidden importantForAccessibility="no" />
              <T w={600} size={17}>{g}</T>
              <T size={13} color={colors.g200}>{t(pk)}</T>
            </Pressable>
          ))}
        </View>
        <T w={500} size={11} color={colors.g300}>{t('shop.gemNote')}</T>
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: colors.l600, alignItems: 'center', justifyContent: 'center' }}>
            <T w={700} size={18} color={colors.ink}>10</T>
          </View>
          <View style={{ flex: 1 }}>
            <T w={600} size={17}>{t('shop.jersey')}</T>
            <T size={13} color={colors.g200}>{t('shop.jerseySub')}</T>
          </View>
          {jersey ? <T w={600} size={13} color={colors.l600}>{jersey.equipped ? t('shop.equipped') : t('shop.owned')}</T> : <Price gem>{jerseyPrice}</Price>}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => openSheet(
            <>
              <H3>{t('shop.releasableTitle')}</H3>
              <SheetText>{t('shop.releasableText1')}</SheetText>
              <SheetText>{t('shop.releasableText2')}</SheetText>
              <Cta onPress={closeSheet}>{t('shop.understood')}</Cta>
            </>,
          )}
          style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.g400, borderRadius: 10, paddingVertical: 4, paddingHorizontal: 8 }}
        >
          <Icon name="lock" size={14} color={colors.g200} />
          <T w={600} size={12} color={colors.g200}>{t('shop.releasable')}</T>
        </Pressable>
        {!online ? <Ghost onPress={() => buy(t('shop.jersey'), t('shop.gemPack', { n: jerseyPrice }))}>{t('shop.buy')}</Ghost>
          : jersey ? <Ghost onPress={() => void useGame.getState().equip(JERSEY, !jersey.equipped).catch(() => toast(t('shop.buyFailed')))}>{jersey.equipped ? t('shop.unequip') : t('shop.equip')}</Ghost>
          : <Ghost onPress={() => buyWithGems(JERSEY, t('shop.jersey'), jerseyPrice)}>{t('shop.buy')}</Ghost>}
      </Card>
    </ScrollView>
  );
}
