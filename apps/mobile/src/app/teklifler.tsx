import { useState } from 'react';
import { View } from 'react-native';

import { sfx } from '../audio/audio.ts';
import { OFFERS } from '../game/rules.ts';
import { useGame } from '../game/store.ts';
import { colors } from '../theme.ts';
import { CareerScreen } from '../ui/career-screen.tsx';
import { Icon } from '../ui/Icon.tsx';
import { buzz, Cta, Ghost, H3, T } from '../ui/kit.tsx';
import { Shell } from '../ui/mahalle.tsx';
import { closeSheet, openSheet, SheetText, toast } from '../ui/overlay.tsx';
import { Amount, Ico, Tile } from '../ui/sade.tsx';
import { t } from '../i18n/index.ts';

// Offers and the club: no longer a tab (sade UI), opened from the club card on the home screen.

export default function Teklifler() {
  const online = useGame(s => s.mode === 'online');
  return online ? <CareerScreen /> : <LocalOffers />;
}

/** The offline prototype flow (local mode only). */
function LocalOffers() {
  const { scouted, signed, trialAccepted } = useGame();
  const [sel, setSel] = useState('kartaltepe');
  const offer = OFFERS.find(o => o.id === sel)!;

  if (!scouted || signed) {
    const o = OFFERS.find(x => x.id === signed);
    return (
      <Shell title={t('offers.title')}>
        <View style={{ alignItems: 'center', paddingVertical: 40, gap: 12 }}>
          <Ico name="kulup" size={110} dim={!o} />
          <H3 style={{ textAlign: 'center' }}>{o ? t('offers.signedTitle', { club: o.club }) : t('offers.none')}</H3>
          <T size={14} color={colors.g200} style={{ textAlign: 'center', lineHeight: 20 }}>{o ? t('offers.signedText') : t('offers.noneText')}</T>
        </View>
      </Shell>
    );
  }

  const confirm = () => openSheet(
    <>
      <H3>{offer.req ? t('offers.trialTitle', { club: offer.club }) : t('offers.signTitle', { club: offer.club })}</H3>
      <SheetText>{offer.req ? t('offers.trialText', { req: offer.req }) : t('offers.signText')}</SheetText>
      <Cta onPress={() => {
        closeSheet();
        if (offer.req) { useGame.getState().acceptTrial(); toast(t('offers.trialAdded')); return; }
        useGame.getState().sign(offer.id); toast(t('offers.signed')); buzz('success'); sfx('unlock');
      }}>{offer.req ? t('offers.accept') : t('offers.sign')}</Cta>
      <Ghost onPress={closeSheet}>{t('common.cancel')}</Ghost>
    </>,
  );

  return (
    <Shell
      title={t('offers.count')}
      footer={offer.req && trialAccepted
        ? <Cta off disabled>{t('offers.trialInCalendar')}</Cta>
        : <Cta onPress={confirm}>{offer.req ? t('offers.acceptTrial') : t('offers.sign')}</Cta>}
    >
      <View accessibilityRole="radiogroup" style={{ gap: 12 }}>
        {OFFERS.map(o => (
          <Tile key={o.id} role="radio" selected={o.id === sel} onPress={() => setSel(o.id)} label={`${o.club}, ${o.weekly} coin`} style={{ alignItems: 'stretch', paddingHorizontal: 14, gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <Ico name="kulup" size={52} />
              <View style={{ flex: 1 }}>
                <T w={700} size={17}>{o.club}</T>
                <T w={600} size={12} color={colors.g200}>{o.league}</T>
              </View>
              <Amount icon="coin" size={22} textSize={16}>{o.weekly}</Amount>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <T w={700} size={13} color={colors.g200}>★ {o.role}</T>
              {o.req && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Icon name="lock" size={14} color={colors.g200} /><T w={600} size={12} color={colors.g200} numberOfLines={1}>{o.req}</T></View>}
            </View>
          </Tile>
        ))}
      </View>
    </Shell>
  );
}
