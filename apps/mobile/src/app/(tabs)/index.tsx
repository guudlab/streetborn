import { Model3D } from '../../ui/Model3D.tsx';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { crestCode, leagueToday, multiplierLabel, tierName } from '../../game/career.ts';
import { DEFAULT_CHARACTER, HERO_IMAGE, HERO_MODEL, jerseyTint } from '../../game/character.ts';
import { num } from '../../game/format.ts';
import { ovr } from '../../game/rules.ts';
import { useGame } from '../../game/store.ts';
import { colors, TAB_BAR_SPACE } from '../../theme.ts';
import { Emblem } from '../../ui/emblem.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { openEnergySheet } from '../../ui/energy.tsx';
import { Crest, Hud } from '../../ui/hud.tsx';
import { Caps, Cta, T } from '../../ui/kit.tsx';
import { toast } from '../../ui/overlay.tsx';
import { SoundButton } from '../../ui/settings.tsx';
import { t } from '../../i18n/index.ts';

export default function Hub() {
  const insets = useSafeAreaInsets();
  const g = useGame();
  const ch = g.character ?? DEFAULT_CHARACTER;
  const empty = g.energy === 0;
  const online = g.mode === 'online';
  const showOffers = online ? (g.career?.offers.some(o => o.status !== 'trial_failed') ?? false) : g.scouted && !g.signed;
  const league = leagueToday(g.career);

  useEffect(() => { if (online && g.auth === 'in') void useGame.getState().refreshCareer(); }, [online, g.auth]);
  const news = g.careerNews;
  useEffect(() => {
    if (!news) return;
    if (news.seasonEnded) toast(t('career.seasonEnded', { place: news.seasonEnded.place, prize: news.seasonEnded.prize }));
    else if (news.salary > 0) toast(t('career.salaryPaid', { n: news.salary }));
    else if (news.gems?.coin) toast(t('career.welcomeGems', { coin: news.gems.coin, gem: news.gems.gem }));
    else if (news.gems?.levels.length) toast(t('career.levelGems', { level: news.gems.levels[news.gems.levels.length - 1]!, gem: news.gems.gem }));
    useGame.setState({ careerNews: null });
  }, [news]);

  const mahalleId = g.mahalle?.id;
  useEffect(() => { if (mahalleId) void useGame.getState().refreshMahalleToday(); }, [mahalleId]);

  const [starting, setStarting] = useState(false);
  const play = async (kind: 'energy' | 'league' = 'energy') => {
    if (starting) return;
    setStarting(true);
    const r = await useGame.getState().startMatch(kind);
    setStarting(false);
    if (r === 'no_energy') return openEnergySheet();
    if (r === 'already_played') return toast(t('league.alreadyPlayed'));
    if (r === 'error') return toast(t('hub.startFailed'));
    router.push('/mac');
  };
  const leagueReady = league && !league.played;

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

        <View style={{ position: 'absolute', left: 20, top: 26, gap: 10 }}>
          <View>
            <T w={600} size={48} style={{ lineHeight: 50, letterSpacing: -1 }}>{ovr(g.stats)}</T>
            <Caps>{t('hub.ovr')}</Caps>
          </View>
          {([[t('stat.sut'), 'sut'], [t('stat.pas'), 'pas'], [t('stat.hiz'), 'hiz'], [t('stat.fizik'), 'fizik']] as const).map(([l, k]) => (
            <View key={k} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <T w={600} size={11} color={colors.g200} style={{ width: 28, letterSpacing: 0.6 }}>{l}</T>
              <T w={600} size={13}>{g.stats[k]}</T>
            </View>
          ))}
        </View>

        {g.form.length > 0 && <View style={{ position: 'absolute', right: 20, top: 26, gap: 6, alignItems: 'flex-end' }}>
          <Caps>{t('hub.form')}</Caps>
          {g.form.map((r, i) => (
            <View key={i} style={{ minWidth: 40, height: 26, paddingHorizontal: 8, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: r >= 7 ? colors.l900 : colors.s2 }}>
              <T w={600} size={13} color={r >= 7 ? colors.l500 : colors.g100}>{num(r, 1)}</T>
            </View>
          ))}
        </View>}

        <View style={{ position: 'absolute', right: 16, bottom: 8 }}><SoundButton /></View>
      </View>

      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        {g.mahalle && (
          <Pressable
            accessibilityRole="button" accessibilityLabel={t('mahalle.card.a11y', { name: g.mahalle.name })} onPress={() => router.push('/mahalle')}
            style={{ height: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: 16, backgroundColor: colors.s2 }}
          >
            <Emblem shape={g.mahalle.emblem} color={g.mahalle.color} name={g.mahalle.name} size={36} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T w={600} size={15} numberOfLines={1}>{g.mahalle.name}</T>
              <T w={500} size={12} color={g.mahalleToday && !g.mahalleToday.played ? colors.l500 : colors.g200}>
                {g.mahalleToday && !g.mahalleToday.played ? t('mahalle.card.ready') : t('mahalle.card.members', { n: g.mahalle.members.length })}
              </T>
            </View>
            <Icon name="chev" color={colors.g200} />
          </Pressable>
        )}
        {showOffers && (
          <Pressable
            accessibilityRole="button" onPress={() => router.navigate('/teklifler')}
            style={{ height: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.s2 }}
          >
            <Icon name="mail" color={colors.l600} />
            <T w={600} size={15} style={{ flex: 1 }}>{online ? t('hub.offersBannerN', { n: g.career?.offers.length ?? 0 }) : t('hub.offersBanner')}</T>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.l600 }} />
            <Icon name="chev" color={colors.g200} />
          </Pressable>
        )}

        <View style={{ padding: 16, borderRadius: 22, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, gap: 14 }}>
          <Caps>{league ? t('league.day', { n: league.round + 1, total: league.rounds, tier: tierName(league.tier) }) : online ? t('hub.friendly') : t('hub.fixture')}</Caps>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Crest text={league ? crestCode(league.clubName) : t('club.home.code')} bg={colors.l600} fg={colors.ink} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T w={600} size={16} numberOfLines={1}>
                {league ? `${league.clubName} – ${league.opponent}` : online ? t('hub.friendlyTeams', { name: g.name }) : `${t('club.home')} – ${t('club.kartaltepe')}`}
              </T>
              <T size={13} color={colors.g200}>{league?.played ? t('league.playedToday') : t('hub.fixtureMeta')}</T>
            </View>
            <Crest text={league ? crestCode(league.opponent) : t('club.away.code')} bg={colors.awayCrest} fg={colors.awayCrestText} />
          </View>
          <Cta off={empty} busy={starting} onPress={() => void play(leagueReady ? 'league' : 'energy')} accessibilityLabel={empty ? t('hub.waitEnergy') : t('hub.playA11y')}>
            <T w={600} size={17} color={empty ? colors.g200 : colors.ink}>
              {empty ? t('hub.waitEnergy') : starting ? t('hub.preparing') : leagueReady ? t('league.play') : league ? t('league.training') : t('hub.play')}
            </T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(13,13,13,.12)', borderRadius: 12, paddingVertical: 3, paddingLeft: 4, paddingRight: 8 }}>
              <Icon name="bolt" size={16} color={empty ? colors.g200 : colors.ink} />
              <T w={600} size={14} color={empty ? colors.g200 : colors.ink}>1</T>
            </View>
          </Cta>
          {league && (
            <T size={12} color={colors.g300} style={{ textAlign: 'center' }}>
              {leagueReady ? t('league.trainingHint', { x: multiplierLabel(league.tier) }) : t('league.trainingMultiplier', { x: multiplierLabel(league.tier) })}
            </T>
          )}
        </View>
      </View>
    </View>
  );
}
