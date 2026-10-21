import { DEFAULT_CONFIG } from '@streetborn/economy';
import { router } from 'expo-router';

import { mmss } from '../game/format.ts';
import { useGame } from '../game/store.ts';
import { colors } from '../theme.ts';
import { buzz, Ghost, H3, Opt, Price, T } from './kit.tsx';
import { closeSheet, openSheet, SheetText, Spinner, toast } from './overlay.tsx';

export function energyLeft(now: number) {
  const s = useGame.getState();
  const next = s.energyUpdatedAt + DEFAULT_CONFIG.energyRegenSeconds * 1000;
  return s.energy >= s.energyMax ? null : mmss(Math.max(0, next - now));
}

/** Ad (+1) and gem refill rows; used in the shop and in the "out of energy" sheet. */
export function EnergyOptions({ onDone }: { onDone?: () => void }) {
  const { adsLeft, energy, energyMax, gems, mode } = useGame();
  // Ads and gem refills need server support (AdMob SSV, a gem spend); until then they work offline only.
  const soon = mode === 'online';
  return (
    <>
      <Opt
        icon="ad" title="Reklam izle" sub={soon ? 'Yakında' : `+1 enerji · bugün ${adsLeft} hak`}
        disabled={soon || !adsLeft || energy >= energyMax}
        onPress={() => {
          openSheet(<><H3>Reklam oynatılıyor</H3><Spinner /><SheetText>Prototip: 2 saniyelik yer tutucu</SheetText></>);
          setTimeout(() => { closeSheet(); if (useGame.getState().watchAd()) toast('+1 enerji'); onDone?.(); }, 2000);
        }}
      />
      <Opt
        icon="gem" title="Enerjiyi doldur" sub={soon ? 'Yakında' : `Bakiye: ${gems} elmas`}
        disabled={soon || gems < 20 || energy >= energyMax} right={<Price gem>20</Price>}
        onPress={() => {
          if (useGame.getState().gemRefill()) { toast('Enerji doldu · −20 elmas'); buzz('medium'); }
          closeSheet(); onDone?.();
        }}
      />
    </>
  );
}

export function openEnergySheet() {
  const t = energyLeft(Date.now());
  const free = useGame.getState().trainFree;
  openSheet(
    <>
      <H3>Enerjin bitti</H3>
      <SheetText>
        Her {DEFAULT_CONFIG.energyRegenSeconds / 60} dakikada 1 enerji dolar.{t ? <> Sonraki: <T w={600} color={colors.g100}>{t}</T>.</> : null} Beklerken ücretsiz antrenman yapabilirsin.
      </SheetText>
      <EnergyOptions />
      <Ghost onPress={() => { closeSheet(); router.navigate('/gelisim'); }}>
        {free ? `Ücretsiz antrenman (${free} kaldı)` : 'Gelişime git'}
      </Ghost>
    </>,
  );
}
