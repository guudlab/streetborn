import { DEFAULT_CONFIG } from '@streetborn/economy';
import { router } from 'expo-router';

import { mmss } from '../game/format.ts';
import { useGame } from '../game/store.ts';
import { colors } from '../theme.ts';
import { sfx } from '../audio/audio.ts';
import { buzz, Ghost, H3, Opt, Price, T } from './kit.tsx';
import { closeSheet, openSheet, SheetText, Spinner, toast } from './overlay.tsx';
import { t } from '../i18n/index.ts';

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
        icon="ad" title={t('energy.ad')} sub={soon ? t('energy.soon') : t('energy.adSub', { n: adsLeft })}
        disabled={soon || !adsLeft || energy >= energyMax}
        onPress={() => {
          openSheet(<><H3>{t('energy.adPlaying')}</H3><Spinner /><SheetText>{t('energy.adPlaceholder')}</SheetText></>);
          setTimeout(() => { closeSheet(); if (useGame.getState().watchAd()) { toast(t('energy.plusOne')); sfx('unlock'); } onDone?.(); }, 2000);
        }}
      />
      <Opt
        icon="gem" title={t('energy.refill')} sub={soon ? t('energy.soon') : t('energy.balance', { n: gems })}
        disabled={soon || gems < 20 || energy >= energyMax} right={<Price gem>20</Price>}
        onPress={() => {
          if (useGame.getState().gemRefill()) { toast(t('energy.refilled')); buzz('medium'); sfx('unlock'); }
          closeSheet(); onDone?.();
        }}
      />
    </>
  );
}

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
