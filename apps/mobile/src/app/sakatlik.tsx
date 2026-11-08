import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useGame } from '../game/store.ts';
import { colors } from '../theme.ts';
import { Icon } from '../ui/Icon.tsx';
import { injuryName, timeLeft } from '../ui/kariyer.tsx';
import { Cta, Ghost, T, useNow } from '../ui/kit.tsx';
import { Shell } from '../ui/mahalle.tsx';
import { toast } from '../ui/overlay.tsx';
import { Amount, Bubble } from '../ui/sade.tsx';
import { t } from '../i18n/index.ts';

// Sakatlık: a minor injury keeps the player out of friendlies for a day or two. Mahalle and
// league matches and training stay open, so a missed day never costs coach trust. A massage
// ends it at once for coin.

export default function Sakatlik() {
  const k = useGame(s => s.kariyer);
  const coins = useGame(s => s.coins);
  const now = useNow(30_000);
  const [busy, setBusy] = useState(false);
  const injury = k?.injury ?? null;
  const left = injury ? injury.until - now : 0;

  useEffect(() => { void useGame.getState().refreshKariyer(); }, []);
  // The injury ran out while the screen was open.
  useEffect(() => { if (injury && left <= 0) void useGame.getState().refreshKariyer(); }, [injury, left]);

  if (!injury || left <= 0) {
    return (
      <Shell title={t('injury.header')} footer={<Cta onPress={() => router.back()}>{t('common.continue')}</Cta>}>
        <View style={{ alignItems: 'center', gap: 12, paddingVertical: 40 }}>
          <View style={{ width: 88, height: 88, borderRadius: 28, backgroundColor: colors.l900, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={44} color={colors.l500} />
          </View>
          <T w={600} size={22}>{t('injury.massageDone')}</T>
        </View>
      </Shell>
    );
  }

  const cost = k!.massageCost;
  const heal = async () => {
    setBusy(true);
    const r = await useGame.getState().massage();
    setBusy(false);
    if (r === 'ok') { toast(t('injury.massageDone'), 'success'); router.back(); }
    else toast(t(r === 'no_coin' ? 'injury.noCoin' : 'injury.failed'), 'error');
  };

  return (
    <Shell
      title={t('injury.header')}
      footer={
        <>
          <Cta off={coins < cost} busy={busy} onPress={() => void heal()} accessibilityLabel={`${t('injury.massage')}, ${cost} coin`}>
            <T w={600} size={16} color={coins < cost ? colors.g200 : colors.ink}>{t('injury.massage')}</T>
            <Amount icon="coin" size={24} textSize={15} color={coins < cost ? colors.g200 : colors.ink}>{cost}</Amount>
          </Cta>
          <Ghost onPress={() => router.back()}>{t('common.close')}</Ghost>
        </>
      }
    >
      {/* Time left is the hero number; the injury's name sits under it. */}
      <View style={{ alignItems: 'center', gap: 8, paddingTop: 24 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#3A1D19', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="plus" size={28} color={colors.bad} />
        </View>
        <T w={600} size={48} style={{ lineHeight: 52, fontVariant: ['tabular-nums'] }} accessibilityLiveRegion="polite" accessibilityLabel={t('injury.left', { t: timeLeft(left) })}>{timeLeft(left)}</T>
        <T w={500} size={13} color={colors.g200}>{t('injury.leftLabel')}</T>
        <T w={600} size={20} accessibilityRole="header" style={{ marginTop: 8 }}>{injuryName(injury.kind)}</T>
      </View>
      <Bubble text={t('injury.line')} />
      <T size={13} color={colors.g200} style={{ textAlign: 'center', lineHeight: 19 }}>{t('injury.note')}</T>
    </Shell>
  );
}
