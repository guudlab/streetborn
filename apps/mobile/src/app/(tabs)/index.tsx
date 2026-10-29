import { Model3D, preloadModels } from '../../ui/Model3D.tsx';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { leagueToday, multiplierLabel } from '../../game/career.ts';
import { DEFAULT_CHARACTER, HERO_IMAGE, HERO_MODEL, jerseyTint } from '../../game/character.ts';
import { ovr } from '../../game/rules.ts';
import { useGame } from '../../game/store.ts';
import { colors, TAB_BAR_SPACE } from '../../theme.ts';
import { Emblem } from '../../ui/emblem.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { openEnergySheet } from '../../ui/energy.tsx';
import { Hud } from '../../ui/hud.tsx';
import { Caps, Cta, T } from '../../ui/kit.tsx';
import { Amount, Bubble, Dot, Ico, Tile } from '../../ui/sade.tsx';
import { toast } from '../../ui/overlay.tsx';
import { ProfileButton, SoundButton } from '../../ui/settings.tsx';
import { Skeleton } from '../../ui/motion.tsx';
import { FormStrip, useKariyerNews } from '../../ui/kariyer.tsx';
import { t } from '../../i18n/index.ts';
import { matchModels } from '../../match3d/Match3D.tsx';

export default function Hub() {
  const insets = useSafeAreaInsets();
  const g = useGame();
  const ch = g.character ?? DEFAULT_CHARACTER;
  const empty = g.energy === 0;
  const online = g.mode === 'online';
  const showOffers = online ? (g.career?.offers.some(o => o.status !== 'trial_failed') ?? false) : g.scouted && !g.signed;
  const league = leagueToday(g.career);

  useEffect(() => {
    if (online && g.auth === 'in') { void useGame.getState().refreshCareer(); void useGame.getState().refreshKariyer(); }
  }, [online, g.auth]);
  useKariyerNews();
  // The browser plays the 3D match: fetch its models once the hub's own model is in.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const id = setTimeout(() => preloadModels(matchModels(ch.hero)), 2500);
    return () => clearTimeout(id);
  }, [ch.hero]);
  const news = g.careerNews;
  useEffect(() => {
    if (!news) return;
    if (news.seasonEnded) {
      // The summary screen replaces the toast; it shows once.
      useGame.setState({ seasonSummary: news.seasonEnded });
      router.push('/sezon-ozeti');
    }
    else if (news.salary > 0) toast(t('career.salaryPaid', { n: news.salary }));
    else if (news.gems?.coin) toast(t('career.welcomeGems', { coin: news.gems.coin, gem: news.gems.gem }));
    else if (news.gems?.levels.length) toast(t('career.levelGems', { level: news.gems.levels[news.gems.levels.length - 1]!, gem: news.gems.gem }));
    useGame.setState({ careerNews: null });
  }, [news]);

  const mahalleId = g.mahalle?.id;
  useEffect(() => { if (mahalleId) void useGame.getState().refreshMahalleToday(); }, [mahalleId]);

  const [starting, setStarting] = useState(false);
  // One big button (sade UI): today's mahalle match first, then the league match, then a friendly.
  const mahalleReady = online && !!g.mahalle && !!g.mahalleToday && !g.mahalleToday.played;
  const leagueReady = !!league && !league.played;
  const kind = mahalleReady ? 'mahalle' : leagueReady ? 'league' : 'energy';
  // An injured player rests from friendlies; mahalle and league matches stay open.
  const injured = kind === 'energy' && !!g.kariyer?.injury;
  const dim = empty || injured;
  const play = async () => {
    if (starting) return;
    if (injured) return router.push('/sakatlik');
    setStarting(true);
    const r = await useGame.getState().startMatch(kind);
    setStarting(false);
    if (r === 'no_energy') return openEnergySheet();
    if (r === 'injured') return router.push('/sakatlik');
    if (r === 'already_played') {
      if (kind === 'mahalle') void useGame.getState().refreshMahalleToday();
      return toast(t(kind === 'mahalle' ? 'mahalle.today.done' : 'league.alreadyPlayed'));
    }
    if (r === 'error') return toast(t('hub.startFailed'));
    router.push('/mac');
  };
  const label = injured ? t('injury.strip') : empty ? t('hub.waitEnergy') : starting ? t('hub.preparing')
    : kind === 'mahalle' ? t('hub.playMahalle') : kind === 'league' ? t('league.play') : league ? t('league.training') : t('hub.play');
  const line = injured ? t('injury.line') : empty ? t('hub.line.rest') : kind === 'mahalle' ? t('hub.line.mahalle') : kind === 'league' ? t('hub.line.league') : t('hub.line.play');

  const contract = online && g.career?.contract?.active ? g.career.contract : null;
  const duel = online ? g.kariyer?.duel : undefined;
  const offers = online ? (g.career?.offers.filter(o => o.status !== 'trial_failed').length ?? 0) : showOffers ? 2 : 0;

  return (
    <View style={{ flex: 1, paddingTop: insets.top + 8, paddingBottom: TAB_BAR_SPACE + insets.bottom }}>
      <Hud />
      {g.offlineReason && (
        <T w={500} size={12} color={colors.g200} style={{ textAlign: 'center', marginTop: 6 }}>
          {t('hub.offline.progress', { reason: g.offlineReason })}
        </T>
      )}

      <View style={{ flex: 1, minHeight: 260 }}>
        {/* Lime floor glow under the player */}
        <Svg width={260} height={46} style={{ position: 'absolute', bottom: 6, alignSelf: 'center' }}>
          <Defs>
            <RadialGradient id="glow" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor={colors.l600} stopOpacity={0.32} />
              <Stop offset="1" stopColor={colors.l600} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx={130} cy={23} rx={130} ry={23} fill="url(#glow)" />
        </Svg>
        <Model3D
          model={HERO_MODEL[ch.hero]} fallback={HERO_IMAGE[ch.hero][ch.jersey]} clip="walk" tint={jerseyTint(ch.jersey)} rotatable
          style={{ flex: 1 }} label={t('hub.heroLabel', { name: g.name })}
        />

        <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 76, top: 14 }}>
          <Bubble text={line} size={36} />
        </View>
        <View style={{ position: 'absolute', right: 16, top: 14, gap: 10 }}><ProfileButton /><SoundButton /></View>
        <Pressable
          accessibilityRole="button" accessibilityLabel={t('hub.ovrA11y', { n: ovr(g.stats) })} onPress={() => router.navigate('/gelisim')}
          style={{ position: 'absolute', right: 20, bottom: 24, alignItems: 'flex-end' }}
        >
          <T w={700} size={44} style={{ lineHeight: 46, letterSpacing: -1 }}>{ovr(g.stats)}</T>
          <Caps>{t('hub.ovr')}</Caps>
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        <FormStrip />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {g.mahalle && (
            <Chip
              label={t('mahalle.card.a11y', { name: g.mahalle.name })} onPress={() => router.push('/mahalle')} dot={mahalleReady}
              icon={<Emblem shape={g.mahalle.emblem} color={g.mahalle.color} name={g.mahalle.name} size={34} />}
            >
              <Amount icon="oyuncu" size={22}>{g.mahalle.members.length}</Amount>
            </Chip>
          )}
          <Chip label={offers ? t('hub.offersBannerN', { n: offers }) : t('offers.title')} onPress={() => router.push('/teklifler')} dot={offers > 0} icon={<Ico name="kulup" size={38} />}>
            {online && !g.career && !g.careerTried ? <Skeleton width={28} height={16} radius={6} style={{ backgroundColor: colors.s3 }} />
              : contract ? <T w={700} size={15}>{multiplierLabel(contract.tier)}</T> : <T w={700} size={15}>{offers}</T>}
          </Chip>
          {online && !g.kariyer && !g.kariyerTried && <Skeleton width="auto" height={58} radius={18} style={{ flex: 1 }} />}
          {duel && (
            <Chip
              label={t('duel.chipA11y', { me: duel.me.score, them: duel.them.score, name: duel.rival.kind === 'npc' ? t('duel.npc') : duel.rival.nick ?? t('duel.friend') })}
              onPress={() => router.push('/rakip')} icon={<Ico name="oyuncuKosu" size={30} />}
            >
              <T w={700} size={14} numberOfLines={1} color={duel.me.score > duel.them.score ? colors.l500 : colors.g100}>{duel.me.score}–{duel.them.score}</T>
            </Chip>
          )}
        </View>

        <Cta off={empty || injured} busy={starting} onPress={() => void play()} accessibilityLabel={label}>
          <Ico name="ball" size={28} dim={dim} />
          <T w={700} size={17} color={dim ? colors.g200 : colors.ink}>{label}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(13,13,13,.12)', borderRadius: 12, paddingVertical: 3, paddingLeft: 4, paddingRight: 8 }}>
            <Icon name="bolt" size={16} color={dim ? colors.g200 : colors.ink} />
            <T w={700} size={14} color={dim ? colors.g200 : colors.ink}>1</T>
          </View>
        </Cta>
      </View>
    </View>
  );
}

/** Small icon card above the play button: an icon, a number and a lime dot when something waits. */
function Chip({ icon, children, dot, label, onPress }: { icon: React.ReactNode; children: React.ReactNode; dot?: boolean; label: string; onPress: () => void }) {
  return (
    <Tile row label={label} onPress={onPress} style={{ flex: 1, minHeight: 58, paddingVertical: 6, paddingHorizontal: 10, gap: 8, borderRadius: 18 }}>
      {icon}
      <View style={{ flex: 1 }}>{children}</View>
      {dot && <Dot />}
    </Tile>
  );
}
