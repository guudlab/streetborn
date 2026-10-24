import { DEFAULT_CONFIG } from '@streetborn/economy';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sfx } from '../audio/audio.ts';
import { crestCode, leagueToday, multiplierLabel, standings, tierName } from '../game/career.ts';
import { useGame } from '../game/store.ts';
import type { CareerOffer } from '../net/api.ts';
import { colors, TAB_BAR_SPACE } from '../theme.ts';
import { openEnergySheet } from './energy.tsx';
import { Crest } from './hud.tsx';
import { Icon } from './Icon.tsx';
import { buzz, Caps, Cta, Ghost, H1, H3, T, Track } from './kit.tsx';
import { closeSheet, openSheet, SheetText, toast } from './overlay.tsx';
import { t } from '../i18n/index.ts';

const KIND_LABEL = {
  direct: 'career.kind.direct', trial: 'career.kind.trial', better: 'career.kind.better',
  renew: 'career.kind.renew', promote: 'career.kind.promote', weaker: 'career.kind.weaker',
} as const;

// Online career tab: offers (first, trial, season end), the contract with coach trust
// and the league table, or the road to the first offer.
export function CareerScreen() {
  const insets = useSafeAreaInsets();
  const career = useGame(s => s.career);
  const refresh = useGame(s => s.refreshCareer);
  useEffect(() => { void refresh(); }, [refresh]);
  const pad = { paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: TAB_BAR_SPACE + insets.bottom + 24, gap: 16 };

  if (!career) {
    return <View style={{ flex: 1, ...pad }}><Caps>{t('offers.eyebrow')}</Caps><H1>{t('offers.title')}</H1></View>;
  }

  const contract = career.contract?.active ? career.contract : null;
  const lastSeason = career.season?.status === 'done' ? career.season : null;

  return (
    <ScrollView contentContainerStyle={pad}>
      <View><Caps>{t('offers.eyebrow')}</Caps><H1 style={{ marginTop: 4 }}>{contract ? contract.clubName : t('offers.title')}</H1></View>

      {lastSeason && !contract && (
        <View style={{ padding: 14, borderRadius: 18, backgroundColor: colors.l900, gap: 4 }}>
          <T w={600} size={15} color={colors.l500}>{t('career.lastSeason', { place: lastSeason.place ?? 0, tier: tierName(lastSeason.tier) })}</T>
          {(lastSeason.prize ?? 0) > 0 && <T size={13} color={colors.g100}>{t('career.prize', { n: lastSeason.prize ?? 0 })}</T>}
        </View>
      )}

      {contract ? <Contract /> : career.offers.length > 0 ? (
        <View style={{ gap: 12 }}>
          <Caps>{t('career.offersCount', { n: career.offers.length })}</Caps>
          {career.offers.map(o => <OfferCard key={o.id} offer={o} />)}
        </View>
      ) : <Road />}
    </ScrollView>
  );
}

function OfferCard({ offer }: { offer: CareerOffer }) {
  const [busy, setBusy] = useState(false);
  const trial = offer.kind === 'trial';

  async function sign() {
    closeSheet();
    setBusy(true);
    try {
      await useGame.getState().acceptOffer(offer.id);
      toast(t('offers.signed')); buzz('success'); sfx('unlock');
    } catch {
      toast(t('career.failed'));
    }
    setBusy(false);
  }

  async function playTrial() {
    setBusy(true);
    const r = await useGame.getState().startMatch('trial', offer.id);
    setBusy(false);
    if (r === 'no_energy') return openEnergySheet();
    if (r !== 'ok') return toast(t('hub.startFailed'));
    router.push('/mac');
  }

  const confirm = () => openSheet(
    <>
      <H3>{t('offers.signTitle', { club: offer.clubName })}</H3>
      <SheetText>{t('career.signText', { tier: tierName(offer.tier), n: offer.salaryWeekly, x: multiplierLabel(offer.tier) })}</SheetText>
      <Cta onPress={() => void sign()}>{t('offers.sign')}</Cta>
      <Ghost onPress={closeSheet}>{t('common.cancel')}</Ghost>
    </>,
  );

  const failed = offer.status === 'trial_failed';
  const needsTrial = trial && offer.status === 'open';
  return (
    <View style={{ borderRadius: 22, backgroundColor: colors.s1, borderWidth: 1, borderColor: offer.kind === 'better' || offer.kind === 'promote' ? colors.l600 : colors.line, padding: 16, gap: 12, opacity: failed ? 0.55 : 1 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Crest text={crestCode(offer.clubName)} bg={colors.awayCrest} fg={colors.awayCrestText} />
        <View style={{ flex: 1 }}>
          <T w={600} size={17}>{offer.clubName}</T>
          <T size={13} color={colors.g200}>{tierName(offer.tier)} · {t(KIND_LABEL[offer.kind])}</T>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Term label={t('offers.weekly')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Icon name="coin" size={16} color={colors.l500} /><T w={600} size={15}>{offer.salaryWeekly}</T></View>
        </Term>
        <Term label={t('career.multiplier')}><T w={600} size={15}>{multiplierLabel(offer.tier)}</T></Term>
        <Term label={t('offers.length')}><T w={600} size={13}>{t('career.length')}</T></Term>
      </View>
      {needsTrial && <T size={13} color={colors.g200}>{t('career.trialNote')}</T>}
      {offer.status === 'trial_passed' && <T size={13} color={colors.l500}>{t('career.trialPassed')}</T>}
      {failed
        ? <T size={13} color={colors.g200}>{t('career.trialFailed')}</T>
        : needsTrial
          ? <Cta busy={busy} onPress={() => void playTrial()}>{t('career.playTrial')}</Cta>
          : <Cta busy={busy} onPress={confirm}>{t('offers.sign')}</Cta>}
    </View>
  );
}

function Contract() {
  const career = useGame(s => s.career)!;
  const contract = career.contract!;
  const today = leagueToday(career);
  const table = standings(career);
  const rows = table?.rows ?? [];

  return (
    <>
      <View style={{ padding: 16, borderRadius: 22, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, gap: 12 }}>
        <T size={13} color={colors.g200}>{tierName(contract.tier)}{today ? ` · ${t('league.dayShort', { n: today.round + 1, total: today.rounds })}` : ''}</T>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Term label={t('offers.weekly')}><T w={600} size={15}>{contract.salaryWeekly}</T></Term>
          <Term label={t('career.multiplier')}><T w={600} size={15}>{multiplierLabel(contract.tier)}</T></Term>
        </View>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T w={500} size={14}>{t('career.trust')}</T>
            <T w={600} size={14} color={career.trust >= 70 ? colors.l500 : career.trust < 40 ? colors.bad : colors.g100}>{career.trust}</T>
          </View>
          <Track value={career.trust / 100} />
          <T size={12} color={colors.g300}>{t('career.trustHint')}</T>
        </View>
      </View>

      {table && (
        <View style={{ gap: 8 }}>
          <Caps>{t('league.table')}</Caps>
          <View style={{ borderRadius: 18, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }}>
            <Row head pos="#" name={t('league.team')} p={t('league.p')} gd={t('league.gd')} pts={t('league.pts')} />
            {rows.map((r, i) => (
              <Row key={r.key} pos={String(i + 1)} name={r.name} p={String(r.played)} gd={String(r.goalsFor - r.goalsAgainst)} pts={String(r.points)} me={r.index === 0} />
            ))}
          </View>
          <T size={12} color={colors.g300}>{t('league.note')}</T>
        </View>
      )}
    </>
  );
}

function Row({ pos, name, p, gd, pts, me, head }: { pos: string; name: string; p: string; gd: string; pts: string; me?: boolean; head?: boolean }) {
  const c = head ? colors.g300 : me ? colors.l500 : colors.g100;
  const w = head ? 500 : me ? 700 : 500;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, paddingHorizontal: 12, borderTopWidth: head ? 0 : 1, borderTopColor: colors.line, backgroundColor: me ? colors.l900 : 'transparent' }}>
      <T w={w} size={13} color={c} style={{ width: 18 }}>{pos}</T>
      <T w={w} size={14} color={c} style={{ flex: 1 }} numberOfLines={1}>{name}</T>
      <T w={w} size={13} color={c} style={{ width: 26, textAlign: 'right' }}>{p}</T>
      <T w={w} size={13} color={c} style={{ width: 34, textAlign: 'right' }}>{gd}</T>
      <T w={700} size={13} color={c} style={{ width: 30, textAlign: 'right' }}>{pts}</T>
    </View>
  );
}

/** Before the first offer: what is still missing. */
function Road() {
  const p = useGame(s => s.career)!.progress;
  const items = [
    { label: t('career.road.level'), have: p.level, need: DEFAULT_CONFIG.offerMinLevel },
    { label: t('career.road.matches'), have: p.matches, need: DEFAULT_CONFIG.offerMinMatches },
    { label: t('career.road.mahalle'), have: p.mahalleMatches, need: DEFAULT_CONFIG.offerMinMahalleMatches },
  ];
  return (
    <View style={{ gap: 12 }}>
      <T size={14} color={colors.g200} style={{ lineHeight: 20 }}>{t('career.road.text')}</T>
      <View style={{ padding: 16, borderRadius: 20, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, gap: 14 }}>
        {items.map(it => (
          <View key={it.label} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T w={500} size={14}>{it.label}</T>
              <T w={600} size={14} color={it.have >= it.need ? colors.l500 : colors.g100}>{Math.min(it.have, it.need)} / {it.need}</T>
            </View>
            <Track value={Math.min(1, it.have / it.need)} />
          </View>
        ))}
      </View>
      <Pressable accessibilityRole="button" onPress={() => router.navigate('/mahalle')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
        <Icon name="chev" size={18} color={colors.l500} />
        <T w={600} size={14} color={colors.l500}>{t('career.road.toMahalle')}</T>
      </Pressable>
    </View>
  );
}

function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.s2, borderRadius: 12, padding: 10, gap: 4 }}>
      <Caps style={{ letterSpacing: 0.7 }}>{label}</Caps>
      {children}
    </View>
  );
}
