import { DEFAULT_CONFIG, type BootsItem } from '@streetborn/economy';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sfx } from '../../audio/audio.ts';
import type { SfxId } from '../../audio/sounds.ts';
import { useGame } from '../../game/store.ts';
import { colors, shadow, TAB_BAR_SPACE } from '../../theme.ts';
import { Icon } from '../../ui/Icon.tsx';
import { EnergyTiles, energyLeft } from '../../ui/energy.tsx';
import { buzz, Cta, Ghost, H1, H3, T, useNow } from '../../ui/kit.tsx';
import { Amount, bootIcon, Ico, Tile } from '../../ui/sade.tsx';
import { closeSheet, openSheet, SheetText, Spinner, toast } from '../../ui/overlay.tsx';
import { HintBubble } from '../../ui/hint.tsx';
import { openLinkSheet } from '../../ui/account.tsx';
import { t, type Key } from '../../i18n/index.ts';

// Gem packs and the season pass are store purchases (RevenueCat comes later), so
// in the iOS/Android app their "buy" only shows the flow. On the web, gem packs
// are sold through Dodo Payments' hosted checkout (store rules keep Dodo out of
// the native app); the gems arrive with Dodo's webhook on the server. Online, gem
// items are bought on the server at the catalog price; offline they show the same
// prototype flow.

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
        if (r === 'ok' || r === 'owned') { sfx('coin'); buzz('medium'); toast(t('shop.bought', { name }), 'success'); }
        else toast(t(r === 'no_gem' ? 'energy.noGem' : 'shop.buyFailed'), 'error');
      }}>{t('shop.gemBuy', { price })}</Cta>
      <Ghost onPress={closeSheet}>{t('common.cancel')}</Ghost>
    </>,
  );
}

function buy(name: string, price: string, sound: SfxId = 'coin') {
  openSheet(
    <>
      <H3>{name}</H3>
      <SheetText>{t('shop.priceLabel')}<T w={600} color={colors.g100}>{price}</T>{t('shop.priceTail')}</SheetText>
      <Cta onPress={() => {
        openSheet(<><H3>{t('shop.waiting')}</H3><Spinner /><SheetText>{t('shop.waitingStore')}</SheetText></>);
        setTimeout(() => { sfx(sound); openSheet(
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

const BOOTS = DEFAULT_CONFIG.training.boots;
const bootName = (id: string) => t(`boots.${id}` as Key);

/** Krampon: details and the coin price on tap. Coin only, so the chain layer never releases them. */
function openBoots(b: BootsItem) {
  const s = useGame.getState();
  const inUse = s.boots?.id === b.id ? s.boots : null;
  const locked = s.level < b.unlockLevel;
  const name = bootName(b.id);
  const buyIt = async () => {
    openSheet(<><H3>{name}</H3><Spinner /></>);
    const r = await useGame.getState().buyBoots(b.id);
    closeSheet();
    if (r === 'ok') { sfx('unlock'); buzz('success'); toast(t('shop.bootsBought', { name }), 'success'); }
    else toast(t(r === 'no_coin' ? 'shop.bootsNoCoin' : r === 'locked' ? 'shop.bootsLocked' : 'shop.buyFailed', { n: b.unlockLevel }), 'error');
  };
  openSheet(
    <>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Ico name={bootIcon(b.id)} size={150} dim={locked} />
        <H3>{name}</H3>
      </View>
      <View style={{ gap: 8 }}>
        <SheetRow icon="star">{t('shop.bootsPerfect')}</SheetRow>
        <SheetRow icon="clock">{t('shop.bootsLasts', { n: b.uses })}</SheetRow>
      </View>
      {inUse ? (
        <>
          <SheetText>{t('shop.bootsInUse', { n: inUse.usesLeft })}</SheetText>
          <Cta onPress={closeSheet}>{t('common.ok')}</Cta>
        </>
      ) : locked ? (
        <>
          <SheetText>{t('shop.bootsLocked', { n: b.unlockLevel })}</SheetText>
          <Cta onPress={closeSheet}>{t('common.ok')}</Cta>
        </>
      ) : (
        <>
          <Cta disabled={s.mode !== 'online'} off={s.mode !== 'online'} onPress={() => void buyIt()} accessibilityLabel={`${t('shop.bootsBuy')}, ${b.price} coin`}>
            <T w={700} size={17} color={colors.ink}>{t('shop.bootsBuy')}</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(13,13,13,.12)', borderRadius: 12, paddingVertical: 3, paddingHorizontal: 8 }}>
              <Ico name="coin" size={18} /><T w={700} size={14} color={colors.ink}>{b.price.toLocaleString('tr-TR')}</T>
            </View>
          </Cta>
          {s.mode !== 'online' && <SheetText>{t('shop.bootsOffline')}</SheetText>}
          <Ghost onPress={closeSheet}>{t('common.cancel')}</Ghost>
        </>
      )}
    </>,
  );
}

const SheetRow = ({ icon, children }: { icon: 'star' | 'clock'; children: string }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.s2 }}>
    <Icon name={icon} size={20} color={colors.l600} />
    <T w={600} size={15} style={{ flex: 1 }}>{children}</T>
  </View>
);

/** The three pairs: the one in use with its talim left, the others with a price or the level they open at. */
function BootsSection() {
  const { level, boots, mode } = useGame();
  // The pair in use comes with the training state.
  useEffect(() => { if (mode === 'online') void useGame.getState().refreshTraining(); }, [mode]);
  return (
    <View style={{ gap: 10 }}>
      <H3>{t('shop.boots')}</H3>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {BOOTS.map(b => {
          const inUse = boots?.id === b.id ? boots : null;
          const locked = level < b.unlockLevel;
          const state = inUse ? t('shop.bootsLeft', { n: inUse.usesLeft, of: b.uses })
            : locked ? t('shop.bootsLevel', { n: b.unlockLevel }) : `${t('shop.bootsUses', { n: b.uses })}, ${b.price} coin`;
          return (
            <Tile key={b.id} selected={!!inUse} onPress={() => openBoots(b)} label={t('shop.bootsA11y', { name: bootName(b.id), state })} style={{ flex: 1, minHeight: 168, gap: 6, justifyContent: 'flex-start' }}>
              <Ico name={bootIcon(b.id)} size={60} dim={locked} />
              <T w={700} size={15} color={locked ? colors.g200 : colors.g100}>{t(`boots.short.${b.id}` as Key)}</T>
              {inUse ? (
                <View style={{ alignSelf: 'stretch', paddingHorizontal: 10, gap: 6 }}>
                  <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.s3, overflow: 'hidden' }}>
                    <View style={{ width: `${(inUse.usesLeft / b.uses) * 100}%`, height: '100%', backgroundColor: colors.l600 }} />
                  </View>
                  <T w={700} size={12} color={colors.l600} style={{ textAlign: 'center' }}>{t('shop.bootsLeft', { n: inUse.usesLeft, of: b.uses })}</T>
                </View>
              ) : locked ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Icon name="lock" size={13} color={colors.g200} />
                  <T w={600} size={12} color={colors.g200}>{t('shop.bootsLevel', { n: b.unlockLevel })}</T>
                </View>
              ) : (
                <>
                  <T w={500} size={12} color={colors.g200}>{t('shop.bootsUses', { n: b.uses })}</T>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.s3, borderRadius: 12, paddingVertical: 3, paddingHorizontal: 8 }}>
                    <Ico name="coin" size={16} /><T w={700} size={13}>{b.price.toLocaleString('tr-TR')}</T>
                  </View>
                </>
              )}
            </Tile>
          );
        })}
      </View>
    </View>
  );
}

// Pack ids and gem counts match DEFAULT_CONFIG.shop.gemPacks; the server pays from the config.
const GEM_PACKS = [['gem_80', 80, 'shop.price.gem1', 40], ['gem_450', 450, 'shop.price.gem2', 48], ['gem_1000', 1000, 'shop.price.gem3', 56]] as const;
const WEB_PAY = Platform.OS === 'web';

/** Web: a linked account opens Dodo's checkout; the page leaves the app and comes back to /dukkan?odeme=<id>. */
async function buyGemPack(pack: string, n: number, price: string) {
  const s = useGame.getState();
  if (!WEB_PAY || s.mode !== 'online') return buy(t('shop.gemPack', { n }), price, 'gem_sparkle');
  if (!s.account) await s.refreshAccount();
  const account = useGame.getState().account;
  if (!account || account.anonymous) {
    openSheet(
      <>
        <H3>{t('shop.web.linkTitle')}</H3>
        <SheetText>{t('shop.web.linkText')}</SheetText>
        <Cta onPress={openLinkSheet}>{t('shop.web.link')}</Cta>
        <Ghost onPress={closeSheet}>{t('common.cancel')}</Ghost>
      </>,
    );
    return;
  }
  openSheet(
    <>
      <H3>{t('shop.gemPack', { n })}</H3>
      <SheetText>{t('shop.priceLabel')}<T w={600} color={colors.g100}>{price}</T>{t('shop.web.priceTail')}</SheetText>
      <Cta onPress={async () => {
        openSheet(<><H3>{t('shop.web.opening')}</H3><Spinner /></>);
        const r = await useGame.getState().gemCheckout(pack);
        if ('url' in r) { window.location.assign(r.url); return; }
        closeSheet();
        if (r.error === 'link_account') openLinkSheet();
        else toast(t(r.error === 'payments_off' ? 'shop.web.off' : r.error === 'limit' ? 'shop.web.limit' : 'shop.web.failed'), 'error');
      }}>{t('shop.confirm', { price })}</Cta>
      <Ghost onPress={closeSheet}>{t('common.cancel')}</Ghost>
    </>,
  );
}

/** Back from Dodo's checkout: waits a little for the webhook, then shows what happened. */
function useGemReturn(purchaseId: string | undefined, online: boolean) {
  useEffect(() => {
    if (!WEB_PAY || !online || !purchaseId) return;
    let stop = false;
    openSheet(<><H3>{t('shop.web.checking')}</H3><Spinner /></>);
    const check = async () => {
      for (let i = 0; i < 12 && !stop; i++) {
        const p = await useGame.getState().checkGemPurchase(purchaseId);
        if (stop) return;
        if (!p) break;
        if (p.status === 'paid') {
          closeSheet(); sfx('gem_sparkle'); buzz('success');
          toast(t('shop.web.paid', { n: p.gem }), 'success');
          return;
        }
        if (p.status !== 'pending') break;
        await new Promise(r => setTimeout(r, 2500));
      }
      if (stop) return;
      // Not paid yet (or a cancelled checkout): a late webhook still pays; the wallet shows it on the next load.
      openSheet(<><H3>{t('shop.waiting')}</H3><SheetText>{t('shop.web.pending')}</SheetText><Cta onPress={closeSheet}>{t('common.ok')}</Cta></>);
    };
    // Drop ?odeme= only when done, so a reload in between checks again and clearing it does not stop this run.
    void check().finally(() => { if (!stop) router.setParams({ odeme: undefined }); });
    return () => { stop = true; };
  }, [purchaseId, online]);
}

export default function Dukkan() {
  const insets = useSafeAreaInsets();
  const now = useNow();
  const { energy, energyMax, gems, coins, mode, owned, catalog } = useGame();
  const left = energyLeft(now);
  const online = mode === 'online';
  const jerseyPrice = catalog.find(i => i.id === JERSEY)?.priceGem ?? 120;
  const jersey = owned.find(i => i.id === JERSEY);
  const { odeme } = useLocalSearchParams<{ odeme?: string }>();
  useGemReturn(typeof odeme === 'string' ? odeme : undefined, online);

  const jerseyAction = () => {
    if (!online) return buy(t('shop.jersey'), t('shop.gemPack', { n: jerseyPrice }));
    if (jersey) return void useGame.getState().equip(JERSEY, !jersey.equipped).catch(() => toast(t('shop.buyFailed'), 'error'));
    buyWithGems(JERSEY, t('shop.jersey'), jerseyPrice);
  };

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: TAB_BAR_SPACE + insets.bottom, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
        <H1>{t('tab.shop')}</H1>
        <View style={{ height: 40, paddingLeft: 6, paddingRight: 12, borderRadius: 20, backgroundColor: colors.s2, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Amount icon="coin" size={24}>{coins.toLocaleString('tr-TR')}</Amount>
          <Amount icon="gem" size={26}>{gems}</Amount>
        </View>
      </View>
      <HintBubble id="shopTab" text={t('hint.shopTab')} />
      <Tile row selected label={`${t('shop.pass')}, ${t('shop.price.pass')}`} onPress={openPass} style={[shadow.lime, { paddingVertical: 14 }]}>
        <Ico name="sezonKart" size={64} />
        <View style={{ flex: 1, gap: 4 }}>
          <T w={700} size={17}>{t('shop.pass')}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}><Icon name="bolt" size={14} color={colors.l600} /><T w={700} size={13} color={colors.g200}>6</T></View>
            <Ico name="coin" size={18} />
            <Ico name="milliForma" size={22} />
          </View>
        </View>
        <T w={700} size={15} color={colors.l500}>{t('shop.price.pass')}</T>
      </Tile>

      <BootsSection />

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
        {GEM_PACKS.map(([pack, n, pk, size]) => (
          <Tile key={pack} label={t('shop.gemPackA11y', { n, price: t(pk) })} onPress={() => void buyGemPack(pack, n, t(pk))} style={[{ flex: 1, justifyContent: 'flex-end', minHeight: 140 }, n === 450 && { borderColor: colors.l600 }]}>
            <Ico name={n >= 1000 ? 'gemCase' : 'gemCluster'} size={size + 8} />
            <T w={700} size={18}>{n}</T>
            <T w={600} size={12} color={colors.g200}>{t(pk)}</T>
            {n === 450 && <View style={{ backgroundColor: colors.l600, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}><T w={700} size={11} color={colors.ink}>{t('shop.best')}</T></View>}
          </Tile>
        ))}
      </View>

      <H3>{t('shop.cosmetic')}</H3>
      <Tile row label={`${t('shop.jersey')}, ${jersey ? (jersey.equipped ? t('shop.equipped') : t('shop.owned')) : `${jerseyPrice} ${t('shop.gems')}`}`} onPress={jerseyAction}>
        <Ico name="milliForma" size={60} />
        <View style={{ flex: 1, gap: 2 }}>
          <T w={700} size={16} numberOfLines={1}>{t('shop.jersey')}</T>
          <Pressable accessibilityRole="button" accessibilityLabel={t('shop.releasableTitle')} hitSlop={8} onPress={openJersey}
            style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="info" size={16} color={colors.g300} />
          </Pressable>
        </View>
        {jersey
          ? <T w={700} size={14} color={colors.l600}>{jersey.equipped ? t('shop.equipped') : t('shop.equip')}</T>
          : <Amount icon="gem" size={20}>{jerseyPrice}</Amount>}
      </Tile>
    </ScrollView>
  );
}
