import { router } from 'expo-router';

import { mmss } from '../game/format.ts';
import { useGame } from '../game/store.ts';
import { colors } from '../theme.ts';
import { buzz, Ghost, H3, Opt, Price, T } from './kit.tsx';
import { closeSheet, openSheet, SheetText, Spinner, toast } from './overlay.tsx';

export function energyLeft(now: number) {
  const s = useGame.getState();
  return s.energy >= s.energyMax ? null : mmss(Math.max(0, s.nextEnergyAt - now));
}

/** Ad (+1) and gem refill rows; used in the shop and in the "out of energy" sheet. */
export function EnergyOptions({ onDone }: { onDone?: () => void }) {
  const { adsLeft, energy, energyMax, gems } = useGame();
  return (
    <>
      <Opt
        icon="ad" title="Reklam izle" sub={`+1 enerji · bugün ${adsLeft} hak`}
        disabled={!adsLeft || energy >= energyMax}
        onPress={() => {
          openSheet(<><H3>Reklam oynatılıyor</H3><Spinner /><SheetText>Prototip: 2 saniyelik yer tutucu</SheetText></>);
          setTimeout(() => { closeSheet(); if (useGame.getState().watchAd()) toast('+1 enerji'); onDone?.(); }, 2000);
        }}
      />
      <Opt
        icon="gem" title="Enerjiyi doldur" sub={`Bakiye: ${gems} elmas`}
        disabled={gems < 20 || energy >= energyMax} right={<Price gem>20</Price>}
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
        Her 30 dakikada 1 enerji dolar.{t ? <> Sonraki: <T w={600} color={colors.g100}>{t}</T>.</> : null} Beklerken ücretsiz antrenman yapabilirsin.
      </SheetText>
      <EnergyOptions />
      <Ghost onPress={() => { closeSheet(); router.navigate('/gelisim'); }}>
        {free ? `Ücretsiz antrenman (${free} kaldı)` : 'Gelişime git'}
      </Ghost>
    </>,
  );
}
