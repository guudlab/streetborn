import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sfx } from '../../audio/audio.ts';
import { useGame } from '../../game/store.ts';
import { colors, TAB_BAR_SPACE } from '../../theme.ts';
import { Icon } from '../../ui/Icon.tsx';
import { EnergyTiles, energyLeft } from '../../ui/energy.tsx';
import { buzz, Cta, Ghost, H1, H3, T, useNow } from '../../ui/kit.tsx';
import { Amount, Ico, Tile } from '../../ui/sade.tsx';
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

/** Season pass details: shown on tap, so the shop itself stays icons and prices. */
function openPass() {
  openSheet(
    <>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Ico name="sezonKart" size={110} />
        <H3>{t('shop.pass')}</H3>
        <T w={500} size={13} color={colors.g200}>{t('shop.monthly')} · {t('shop.price.pass')} ({t('shop.samplePrice')})</T>
      </View>
      <View style={{ gap: 8 }}>
        <Check>{t('shop.pass.1')}</Check>
        <Check>{t('shop.pass.2')}</Check>
        <Check>{t('shop.pass.3')}</Check>
        <Check>{t('shop.pass.4')}</Check>
        <Check muted>{t('shop.pass.5')}</Check>
      </View>
      <Cta onPress={() => buy(t('shop.pass'), t('shop.price.pass'))}>{t('shop.price.pass')}</Cta>
      <Ghost onPress={closeSheet}>{t('common.cancel')}</Ghost>
    </>,
  );
}

function openJersey() {
  openSheet(
    <>
      <H3>{t('shop.releasableTitle')}</H3>
      <SheetText>{t('shop.jerseySub')}</SheetText>
      <SheetText>{t('shop.releasableText1')}</SheetText>
      <SheetText>{t('shop.releasableText2')}</SheetText>
      <Cta onPress={closeSheet}>{t('shop.understood')}</Cta>
    </>,
  );
}

const GEM_PACKS = [[80, 'shop.price.gem1', 40], [450, 'shop.price.gem2', 48], [1000, 'shop.price.gem3', 56]] as const;

export default function Dukkan() {
  const insets = useSafeAreaInsets();
  const now = useNow();
  const { energy, energyMax, gems, mode, owned, catalog } = useGame();
  const left = energyLeft(now);
  const online = mode === 'online';
  const jerseyPrice = catalog.find(i => i.id === JERSEY)?.priceGem ?? 120;
  const jersey = owned.find(i => i.id === JERSEY);

  const jerseyAction = () => {
    if (!online) return buy(t('shop.jersey'), t('shop.gemPack', { n: jerseyPrice }));
    if (jersey) return void useGame.getState().equip(JERSEY, !jersey.equipped).catch(() => toast(t('shop.buyFailed')));
    buyWithGems(JERSEY, t('shop.jersey'), jerseyPrice);
  };

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: TAB_BAR_SPACE + insets.bottom, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
        <H1>{t('tab.shop')}</H1>
        <View style={{ height: 40, paddingLeft: 6, paddingRight: 12, borderRadius: 20, backgroundColor: colors.s2, justifyContent: 'center' }}>
          <Amount icon="gem" size={26}>{gems}</Amount>
        </View>
      </View>

      <View
        accessible accessibilityLabel={`${t('shop.energy', { energy, max: energyMax })}. ${left ? t('shop.nextEnergy', { t: left }) : t('shop.energyFull')}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 22, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line }}
      >
        <Ico name="enerji" size={48} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 5 }}>
            {Array.from({ length: energyMax }, (_, i) => <View key={i} style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: i < energy ? colors.l600 : colors.s3 }} />)}
          </View>
          {left && <T w={600} size={12} color={colors.g200}>{left}</T>}
        </View>
        <T w={700} size={20}>{energy}/{energyMax}</T>
      </View>
      <EnergyTiles />

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {GEM_PACKS.map(([n, pk, size]) => (
          <Tile key={n} label={t('shop.gemPackA11y', { n, price: t(pk) })} onPress={() => buy(t('shop.gemPack', { n }), t(pk))} style={{ flex: 1, justifyContent: 'flex-end', minHeight: 140 }}>
            <Ico name={n >= 1000 ? 'gemCase' : 'gemCluster'} size={size + 8} />
            <T w={700} size={18}>{n}</T>
            <T w={600} size={12} color={colors.g200}>{t(pk)}</T>
          </Tile>
        ))}
      </View>

      <Tile row selected label={`${t('shop.pass')}, ${t('shop.price.pass')}`} onPress={openPass}>
        <Ico name="sezonKart" size={60} />
        <View style={{ flex: 1, gap: 2 }}>
          <T w={700} size={17}>{t('shop.pass')}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}><Icon name="bolt" size={14} color={colors.l600} /><T w={700} size={13} color={colors.g200}>6</T></View>
            <T w={700} size={13} color={colors.g200}>{t('shop.passShort')}</T>
          </View>
        </View>
        <T w={700} size={15} color={colors.l500}>{t('shop.price.pass')}</T>
      </Tile>

      <Tile row label={`${t('shop.jersey')}, ${jersey ? (jersey.equipped ? t('shop.equipped') : t('shop.owned')) : `${jerseyPrice} ${t('shop.gems')}`}`} onPress={jerseyAction}>
        <View style={{ width: 60, height: 60, borderRadius: 16, backgroundColor: colors.l600, alignItems: 'center', justifyContent: 'center' }}>
          <T w={700} size={20} color={colors.ink}>10</T>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <T w={700} size={16}>{t('shop.jersey')}</T>
          <Pressable accessibilityRole="button" accessibilityLabel={t('shop.releasableTitle')} hitSlop={8} onPress={openJersey}
            style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="lock" size={13} color={colors.g200} /><Icon name="info" size={15} color={colors.g200} />
          </Pressable>
        </View>
        {jersey
          ? <T w={700} size={14} color={colors.l600}>{jersey.equipped ? t('shop.equipped') : t('shop.equip')}</T>
          : <Amount icon="gem" size={20}>{jerseyPrice}</Amount>}
      </Tile>
      <T w={500} size={11} color={colors.g300} style={{ textAlign: 'center' }}>{t('shop.gemNote')}</T>
    </ScrollView>
  );
}
