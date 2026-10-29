import { DEFAULT_CONFIG } from '@streetborn/economy';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { mmss } from '../game/format.ts';
import { useGame } from '../game/store.ts';
import { colors } from '../theme.ts';
import { sfx } from '../audio/audio.ts';
import { Icon } from './Icon.tsx';
import { buzz, Ghost, H3, Opt, Price, T } from './kit.tsx';
import { Amount, Ico, Tile } from './sade.tsx';
import { closeSheet, openSheet, SheetText, Spinner, toast } from './overlay.tsx';
import { t } from '../i18n/index.ts';

export function energyLeft(now: number) {
  const s = useGame.getState();
  const next = s.energyUpdatedAt + DEFAULT_CONFIG.energyRegenSeconds * 1000;
  return s.energy >= s.energyMax ? null : mmss(Math.max(0, next - now));
}

/** The two ways to get energy now: a rewarded ad (+1) and a gem refill. Shared by the rows and the tiles. */
function useEnergyActions(onDone?: () => void) {
  const { adsLeft, energy, energyMax, gems, mode, refillsLeft } = useGame();
  // Rewarded ads need the AdMob SDK in the native app; until then they work offline only.
  const adSoon = mode === 'online';
  const cost = DEFAULT_CONFIG.shop.refillGem;
  const [busy, setBusy] = useState(false);
  useEffect(() => { void useGame.getState().refreshShop(); }, []);
  return {
    adSoon, adsLeft, cost, gems, refillsLeft,
    adOff: adSoon || !adsLeft || energy >= energyMax,
    refillOff: busy || gems < cost || energy >= energyMax || refillsLeft <= 0,
    watchAd() {
      openSheet(<><H3>{t('energy.adPlaying')}</H3><Spinner /><SheetText>{t('energy.adPlaceholder')}</SheetText></>);
      setTimeout(() => { closeSheet(); if (useGame.getState().watchAd()) { toast(t('energy.plusOne')); sfx('energy_charge'); } onDone?.(); }, 2000);
    },
    refill() {
      // The bar fills at once (see gemRefill); only a refusal from the server comes back.
      setBusy(true);
      void useGame.getState().gemRefill().then((r) => {
        setBusy(false);
        if (r !== 'ok') toast(t(REFILL_ERROR[r]), 'error');
      });
      toast(t('energy.refilled', { n: cost }), 'success'); buzz('medium'); sfx('energy_charge');
      closeSheet(); onDone?.();
    },
  };
}

/** Ad (+1) and gem refill rows; used in the "out of energy" sheet. */
export function EnergyOptions({ onDone }: { onDone?: () => void }) {
  const a = useEnergyActions(onDone);
  return (
    <>
      {!a.adSoon && <Opt
        icon="ad" title={t('energy.ad')} sub={t('energy.adSub', { n: a.adsLeft })}
        disabled={a.adOff} onPress={a.watchAd}
      />}
      <Opt
        icon="gem" title={t('energy.refill')}
        sub={a.refillsLeft > 0 ? t('energy.refillSub', { n: a.refillsLeft, g: a.gems }) : t('energy.refillLimit')}
        disabled={a.refillOff} right={<Price gem>{a.cost}</Price>} onPress={a.refill}
      />
    </>
  );
}

/** The same two actions as big icon tiles (shop). */
export function EnergyTiles() {
  const a = useEnergyActions();
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {/* No ad SDK online yet: a dead "Yakında" tile is only noise, so the refill tile stands alone. */}
      {!a.adSoon && <Tile
        onPress={a.watchAd} disabled={a.adOff} style={{ flex: 1, opacity: a.adOff ? 0.5 : 1 }}
        label={`${t('energy.ad')}, ${t('energy.adSub', { n: a.adsLeft })}`}
      >
        <Ico name="enerji" size={48} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Icon name="ad" size={18} color={colors.g100} />
          <T w={700} size={15}>+1</T>
        </View>
      </Tile>}
      <Tile
        row={a.adSoon} onPress={a.refill} disabled={a.refillOff} style={{ flex: 1, opacity: a.refillOff ? 0.5 : 1 }}
        label={`${t('energy.refill')}, ${a.cost} ${t('shop.gems')}`}
      >
        <Ico name="enerji" size={48} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <T w={700} size={15}>{t('energy.fillShort')}</T>
          <Amount icon="gem" size={18} textSize={15}>{a.cost}</Amount>
        </View>
      </Tile>
    </View>
  );
}

const REFILL_ERROR = { no_gem: 'energy.noGem', limit: 'energy.refillLimit', full: 'energy.full', error: 'energy.failed' } as const;

export function openEnergySheet() {
  const left = energyLeft(Date.now());
  const free = useGame.getState().trainFree;
  openSheet(
    <>
      <H3>{t('energy.outTitle')}</H3>
      <SheetText>
        {t('energy.outText', { min: DEFAULT_CONFIG.energyRegenSeconds / 60 })}{left ? <>{t('energy.next')}<T w={600} color={colors.g100}>{left}</T>.</> : null}{t('energy.whileWaiting')}
      </SheetText>
      <EnergyOptions />
      <Ghost onPress={() => { closeSheet(); router.navigate('/gelisim'); }}>
        {free ? t('energy.freeTrain', { n: free }) : t('energy.goTrain')}
      </Ghost>
    </>,
  );
}
