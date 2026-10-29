import { DEFAULT_CONFIG } from '@streetborn/economy';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { sfx } from '../audio/audio.ts';
import { leagueToday, multiplierLabel, standings, tierName } from '../game/career.ts';
import { useGame } from '../game/store.ts';
import type { CareerOffer } from '../net/api.ts';
import { colors } from '../theme.ts';
import { openEnergySheet } from './energy.tsx';
import { Icon } from './Icon.tsx';
import { buzz, Caps, Cta, Ghost, H3, T, Track } from './kit.tsx';
import { Shell } from './mahalle.tsx';
import { Enter, PressableScale, Skeleton } from './motion.tsx';
import { ErrorState } from './states.tsx';
import { Amount, Bubble, Ico } from './sade.tsx';
import { closeSheet, openSheet, SheetText, toast } from './overlay.tsx';
import { t } from '../i18n/index.ts';

const KIND_LABEL = {
  direct: 'career.kind.direct', trial: 'career.kind.trial', better: 'career.kind.better',
  renew: 'career.kind.renew', promote: 'career.kind.promote', weaker: 'career.kind.weaker',
} as const;

// Online career screen (opened from the home chip): offers (first, trial, season end),
// the contract with coach trust and the league table, or the road to the first offer.
export function CareerScreen() {
  const career = useGame(s => s.career);
  const tried = useGame(s => s.careerTried);
  const refresh = useGame(s => s.refreshCareer);
  useEffect(() => { void refresh(); }, [refresh]);

  if (!career) {
    return (
      <Shell title={t('offers.title')}>
        {tried ? <ErrorState onRetry={refresh} /> : <CareerSkeleton />}
      </Shell>
    );
  }

  const contract = career.contract?.active ? career.contract : null;
  const lastSeason = career.season?.status === 'done' ? career.season : null;

  return (
    <Shell title={contract ? contract.clubName : t('offers.title')} onRefresh={refresh}>
      {lastSeason && !contract && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 20, backgroundColor: colors.l900 }}>
          <Ico name="cup" size={44} />
          <View style={{ flex: 1, gap: 2 }}>
            <T w={700} size={15} color={colors.l500}>{t('career.lastSeason', { place: lastSeason.place ?? 0, tier: tierName(lastSeason.tier) })}</T>
            {(lastSeason.prize ?? 0) > 0 && <Amount icon="coin" size={18} textSize={14}>+{lastSeason.prize ?? 0}</Amount>}
          </View>
        </View>
      )}

      {contract ? <Contract /> : career.offers.length > 0 ? (
        <View style={{ gap: 12 }}>
          {career.offers.map((o, i) => <Enter key={o.id} i={i}><OfferCard offer={o} /></Enter>)}
        </View>
      ) : <Road />}
    </Shell>
  );
}

/** The shape of the contract card and two offers, while the first answer is on its way. */
function CareerSkeleton() {
  return (
    <View style={{ gap: 12 }}>
      <Skeleton height={178} radius={24} />
      <Skeleton height={178} radius={24} />
    </View>
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
      toast(t('offers.signed'), 'success'); buzz('success'); sfx('unlock');
    } catch {
      toast(t('career.failed'), { kind: 'error', action: { label: t('common.retry'), onPress: () => void sign() } });
    }
    setBusy(false);
  }

  async function playTrial() {
    setBusy(true);
    const r = await useGame.getState().startMatch('trial', offer.id);
    setBusy(false);
    if (r === 'no_energy') return openEnergySheet();
    if (r !== 'ok') return toast(t('hub.startFailed'), 'error');
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
  const highlight = offer.kind === 'better' || offer.kind === 'promote';
  return (
    <View style={{ borderRadius: 24, backgroundColor: highlight ? 'rgba(63,77,24,.38)' : colors.s1, borderWidth: 1.5, borderColor: highlight ? colors.l600 : colors.line, padding: 14, gap: 12, opacity: failed ? 0.55 : 1 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Ico name="kulup" size={56} />
        <View style={{ flex: 1, gap: 2 }}>
          <T w={700} size={17} numberOfLines={1}>{offer.clubName}</T>
          <T w={600} size={12} color={colors.g200}>{tierName(offer.tier)}</T>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Amount icon="coin" size={22} textSize={16}>{offer.salaryWeekly}</Amount>
          <T w={600} size={11} color={colors.g300}>{t('career.perWeek')}</T>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Tag lime>{multiplierLabel(offer.tier)}</Tag>
        {/* A trial offer says so in its own tag below. */}
        {offer.kind !== 'trial' && <Tag>{t(KIND_LABEL[offer.kind])}</Tag>}
        {needsTrial && <Tag>{t('career.trialShort')}</Tag>}
        {offer.status === 'trial_passed' && <Tag lime>{t('career.trialPassedShort')}</Tag>}
      </View>
      {failed
        ? <T size={13} color={colors.g200}>{t('career.trialFailed')}</T>
        : needsTrial
          ? <Cta busy={busy} onPress={() => void playTrial()}>{t('career.playTrial')}</Cta>
          : <Cta busy={busy} onPress={confirm}>{t('offers.sign')}</Cta>}
    </View>
  );
}

function Tag({ children, lime }: { children: string; lime?: boolean }) {
  return (
    <View style={{ height: 28, paddingHorizontal: 10, borderRadius: 14, justifyContent: 'center', backgroundColor: lime ? colors.l900 : colors.s3 }}>
      <T w={700} size={12} color={lime ? colors.l500 : colors.g100}>{children}</T>
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
      <View style={{ padding: 14, borderRadius: 24, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Ico name="kulup" size={56} />
          <View style={{ flex: 1, gap: 2 }}>
            <T w={600} size={12} color={colors.g200}>{tierName(contract.tier)}</T>
            {today && <T w={700} size={15}>{t('league.dayShort', { n: today.round + 1, total: today.rounds })}</T>}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Amount icon="coin" size={22} textSize={16}>{contract.salaryWeekly}</Amount>
            <Tag lime>{multiplierLabel(contract.tier)}</Tag>
          </View>
        </View>
        <PressableScale
          accessibilityRole="button" accessibilityLabel={`${t('career.trust')} ${career.trust}`}
          onPress={() => openSheet(<><H3>{t('career.trust')}</H3><SheetText>{t('career.trustHint')}</SheetText><Cta onPress={closeSheet}>{t('common.ok')}</Cta></>)}
          style={{ gap: 6 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="whistle" size={18} color={colors.g200} />
            <T w={600} size={14} style={{ flex: 1 }}>{t('career.trust')}</T>
            <T w={700} size={15} color={career.trust >= 70 ? colors.l500 : career.trust < 40 ? colors.bad : colors.g100}>{career.trust}</T>
            <Icon name="info" size={16} color={colors.g300} />
          </View>
          <Track value={career.trust / 100} />
        </PressableScale>
      </View>

      {table && (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ico name="cup" size={24} /><Caps>{t('league.table')}</Caps></View>
          <View style={{ borderRadius: 18, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }}>
            <Row head pos="#" name={t('league.team')} p={t('league.p')} gd={t('league.gd')} pts={t('league.pts')} />
            {rows.map((r, i) => (
              <Row key={r.key} pos={String(i + 1)} name={r.name} p={String(r.played)} gd={String(r.goalsFor - r.goalsAgainst)} pts={String(r.points)} me={r.index === 0} />
            ))}
          </View>
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
    { icon: 'oyuncu' as const, label: t('career.road.level'), have: p.level, need: DEFAULT_CONFIG.offerMinLevel },
    { icon: 'ball' as const, label: t('career.road.matches'), have: p.matches, need: DEFAULT_CONFIG.offerMinMatches },
    { icon: 'mahalle' as const, label: t('career.road.mahalle'), have: p.mahalleMatches, need: DEFAULT_CONFIG.offerMinMahalleMatches },
  ];
  return (
    <View style={{ gap: 14 }}>
      <Ico name="kulup" size={110} style={{ alignSelf: 'center' }} dim />
      <Bubble text={t('career.road.short')} />
      <View style={{ gap: 10 }}>
        {items.map(it => (
          <View key={it.label} accessible accessibilityLabel={`${it.label} ${Math.min(it.have, it.need)} / ${it.need}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 20, backgroundColor: colors.s2 }}>
            <Ico name={it.icon} size={40} />
            <View style={{ flex: 1, gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T w={600} size={14}>{it.label}</T>
                <T w={700} size={14} color={it.have >= it.need ? colors.l500 : colors.g100}>{Math.min(it.have, it.need)} / {it.need}</T>
              </View>
              <Track value={Math.min(1, it.have / it.need)} />
            </View>
            {it.have >= it.need && <Icon name="check" size={20} color={colors.l600} />}
          </View>
        ))}
      </View>
      <Cta onPress={() => router.navigate('/mahalle')}>
        <Ico name="mahalle" size={30} /><T w={700} size={17} color={colors.ink}>{t('career.road.toMahalle')}</T>
      </Cta>
    </View>
  );
}
