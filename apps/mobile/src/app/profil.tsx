import { DEFAULT_CONFIG, drillBadge, xpNeed } from '@streetborn/economy';
import { router } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { DEFAULT_CHARACTER, HERO_IMAGE, HERO_MODEL, jerseyTint } from '../game/character.ts';
import { num } from '../game/format.ts';
import { levelProgress, ovr, type DrillKey, type StatKey } from '../game/rules.ts';
import { SERVER_DRILL, useGame } from '../game/store.ts';
import { colors, radius } from '../theme.ts';
import { openLinkSheet } from '../ui/account.tsx';
import { Emblem } from '../ui/emblem.tsx';
import { Icon } from '../ui/Icon.tsx';
import { achIcon } from '../ui/kariyer.tsx';
import { buzz, Caps, Section, T, Track } from '../ui/kit.tsx';
import { Badge } from '../ui/drills/common.tsx';
import { Model3D } from '../ui/Model3D.tsx';
import { Shell } from '../ui/mahalle.tsx';
import { PressableScale, Skeleton } from '../ui/motion.tsx';
import { Ico, type IconAsset } from '../ui/sade.tsx';
import { t, type Key } from '../i18n/index.ts';

// Profil: the player card. Who the player is (güç like a kit number, role, trait, level),
// where they play (club, mahalle), how the career goes (totals, last ratings), skills, the
// newest trophies and the dream picked at the start. Sound, account, sign-out and deletion
// live on /ayarlar behind the gear, so this screen stays about the player.

export const SKILLS: { key: StatKey; icon: IconAsset }[] = [
  { key: 'sut', icon: 'sut' }, { key: 'pas', icon: 'pas' }, { key: 'hiz', icon: 'hiz' }, { key: 'fizik', icon: 'fizik' },
];
const BADGE_DRILLS: DrillKey[] = ['sut', 'pas', 'hiz', 'fizik', 'omuz'];
/** Stats are shown against this ceiling on the bars. */
export const STAT_MAX = 99;

export default function Profil() {
  const g = useGame();
  const online = g.mode === 'online';
  const ch = g.character ?? DEFAULT_CHARACTER;
  const contract = g.career?.contract?.active ? g.career.contract : null;
  const k = g.kariyer;
  const loading = online && !g.kariyerTried && !k;

  const refresh = useCallback(() => Promise.all([g.refreshAccount(), g.refreshKariyer(), g.refreshTraining()]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);
  useEffect(() => { if (online) void refresh(); }, [online, refresh]);

  const settings = (
    <PressableScale
      accessibilityRole="button" accessibilityLabel={t('profile.settings')} hitSlop={6}
      onPress={() => { buzz(); router.push('/ayarlar'); }}
      style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.s2, alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon name="gear" size={20} color={colors.g200} />
    </PressableScale>
  );

  return (
    <Shell title={t('profile.title')} right={settings} onRefresh={online ? refresh : undefined}>
      <PlayerCard name={g.name} ch={ch} power={ovr(g.stats)} level={g.level} xp={g.xp} />

      {/* Where the player plays */}
      <View style={{ borderRadius: radius.lg, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }}>
        <PlaceRow
          label={t('profile.club')} name={contract ? contract.clubName : t('profile.free')}
          icon={<Ico name="kulup" size={40} />} onPress={() => router.push('/teklifler')}
        />
        <View style={{ height: 1, backgroundColor: colors.line, marginLeft: 68 }} />
        <PlaceRow
          label={t('profile.mahalle')} name={g.mahalle ? g.mahalle.name : t('profile.noMahalle')}
          icon={g.mahalle ? <Emblem shape={g.mahalle.emblem} color={g.mahalle.color} name={g.mahalle.name} size={40} /> : <Ico name="mahalle" size={40} dim />}
          onPress={g.mahalle ? () => router.push('/mahalle') : undefined}
        />
      </View>

      {/* Career */}
      <View style={{ gap: 12 }}>
        <Section right={<Caps>{t('profile.dream', { dream: t(`char.dream.${ch.dream}` as Key) })}</Caps>}>{t('profile.career')}</Section>
        {k && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderRadius: radius.lg, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line }}>
              <Count label={t('profile.matches')} value={k.totals.matches} />
              <View style={{ width: 1, height: 32, backgroundColor: colors.line }} />
              <Count label={t('profile.goals')} value={k.totals.goals} />
              <View style={{ width: 1, height: 32, backgroundColor: colors.line }} />
              <Count label={t('profile.assists')} value={k.totals.assists} />
            </View>
            <LastRatings ratings={k.form.ratings} />
          </>
        )}
        {loading && <Skeleton height={80} radius={radius.lg} />}
        {!online && <T size={14} color={colors.g200}>{t('profile.offline')}</T>}
      </View>

      {/* Skills */}
      <Skills />

      {/* Newest trophies */}
      {k && <Shelf achievements={k.achievements} />}

      {online && <GuestStrip />}
    </Shell>
  );
}

/** The player card. Without xp (someone else's card) the progress row is left out. */
export function PlayerCard({ name, ch, power, level, xp }: { name: string; ch: typeof DEFAULT_CHARACTER; power: number; level: number; xp?: number }) {
  const xpLeft = xp === undefined ? 0 : Math.max(0, xpNeed(level + 1) - xp);
  const role = t(`char.pos.${ch.position}.role` as Key);
  const trait = t(`char.trait.${ch.trait}` as Key);
  return (
    <View
      accessible accessibilityRole="header"
      accessibilityLabel={`${name}, ${role}, ${trait}. ${t('hub.ovr')} ${power}. ${t('profile.level', { n: level })}`}
      style={{ height: 440, borderRadius: radius.lg, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.l900, overflow: 'hidden' }}
    >
      {/* Floodlight on the player: the screen's one lit thing. */}
      <Svg width="100%" height="100%" style={{ position: 'absolute' }} pointerEvents="none">
        <Defs>
          <RadialGradient id="cardGlow" cx="50%" cy="100%" rx="70%" ry="60%">
            <Stop offset="0" stopColor={colors.l600} stopOpacity={0.24} />
            <Stop offset="1" stopColor={colors.l600} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#cardGlow)" />
      </Svg>
      <Model3D
        model={HERO_MODEL[ch.hero]} fallback={HERO_IMAGE[ch.hero][ch.jersey]} clip="idle" tint={jerseyTint(ch.jersey)}
        style={{ position: 'absolute', left: 0, right: 0, top: 12, height: 330 }} label={t('hub.heroLabel', { name })}
      />
      <View style={{ position: 'absolute', left: 20, top: 16 }} pointerEvents="none">
        <T w={600} size={56} style={{ lineHeight: 60, fontVariant: ['tabular-nums'] }}>{power}</T>
        <Caps>{t('hub.ovr')}</Caps>
      </View>
      <View style={{ position: 'absolute', right: 20, top: 20, alignItems: 'flex-end' }} pointerEvents="none">
        <T w={600} size={15}>{role}</T>
        <Caps>{trait}</Caps>
      </View>
      <View style={{ position: 'absolute', left: 20, right: 20, bottom: 20, gap: 8 }} pointerEvents="none">
        <T w={600} size={28} numberOfLines={1}>{name}</T>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T w={600} size={14}>{t('profile.level', { n: level })}</T>
          {xp !== undefined && <T w={500} size={13} color={colors.g200}>{t('profile.xpShort', { n: num(xpLeft) })}</T>}
        </View>
        {xp !== undefined && <Track value={levelProgress(level, xp)} />}
      </View>
    </View>
  );
}

export function PlaceRow({ label, name, icon, onPress }: { label: string; name: string; icon: React.ReactNode; onPress?: () => void }) {
  return (
    <PressableScale
      accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${label}, ${name}`} disabled={!onPress}
      onPress={() => { buzz(); onPress?.(); }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 16 }}
    >
      {icon}
      <View style={{ flex: 1 }}>
        <Caps>{label}</Caps>
        <T w={600} size={16} numberOfLines={1}>{name}</T>
      </View>
      {onPress && <Icon name="chev" size={18} color={colors.g300} />}
    </PressableScale>
  );
}

export function Count({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }} accessible accessibilityLabel={`${label} ${value}`}>
      <T w={600} size={28} style={{ lineHeight: 32, fontVariant: ['tabular-nums'] }}>{num(value)}</T>
      <Caps>{label}</Caps>
    </View>
  );
}

/** The last five match ratings, newest on the right; 8,0 and above lit. */
export function LastRatings({ ratings }: { ratings: number[] }) {
  const shown = ratings.slice(0, 5).reverse();
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessible
      accessibilityLabel={shown.length ? `${t('form.last')}: ${shown.map(r => num(r / 10, 1)).join(', ')}` : t('profile.noRatings')}
    >
      <Caps style={{ width: 48 }}>{t('profile.last5')}</Caps>
      {shown.length === 0 && <T size={13} color={colors.g300}>{t('profile.noRatings')}</T>}
      {shown.map((r, i) => (
        <View key={i} style={{ width: 44, height: 28, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: r >= 80 ? colors.l900 : colors.s3 }}>
          <T w={600} size={14} color={r >= 80 ? colors.l500 : colors.g100} style={{ fontVariant: ['tabular-nums'] }}>{num(r / 10, 1)}</T>
        </View>
      ))}
    </View>
  );
}

/** Skills as bars on the card, the strongest one lit; usta badges under them. */
function Skills() {
  const stats = useGame(s => s.stats);
  const records = useGame(s => s.drillRecords);
  const badges = BADGE_DRILLS.map(d => ({ d, level: drillBadge(SERVER_DRILL[d], records[d], DEFAULT_CONFIG.training) }));
  const earned = badges.filter(b => b.level > 0).length;
  const best = Math.max(...SKILLS.map(s => stats[s.key]));
  return (
    <View style={{ gap: 12 }}>
      <Section right={<Caps>{t('profile.badgeCount', { n: earned, m: badges.length })}</Caps>}>{t('profile.skillsTitle')}</Section>
      <View style={{ paddingVertical: 8, paddingHorizontal: 16, borderRadius: radius.lg, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line }}>
        {SKILLS.map(s => {
          const v = stats[s.key];
          const lit = v === best;
          return (
            <View key={s.key} accessible accessibilityLabel={`${t(`profile.skill.${s.key}` as Key)} ${v}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 44 }}>
              <Ico name={s.icon} size={32} />
              <T w={500} size={15} style={{ width: 48 }}>{t(`profile.skill.${s.key}` as Key)}</T>
              <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.s3, overflow: 'hidden' }}>
                <View style={{ width: `${Math.min(100, (v / STAT_MAX) * 100)}%`, height: '100%', borderRadius: 3, backgroundColor: lit ? colors.l600 : colors.g300 }} />
              </View>
              <T w={600} size={16} style={{ width: 32, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{v}</T>
            </View>
          );
        })}
        <View
          accessible accessibilityLabel={`${t('badge.title')}: ${earned} / ${badges.length}`}
          style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12, paddingBottom: 8, marginTop: 8, borderTopWidth: 1, borderTopColor: colors.line }}
        >
          {badges.map(b => <Badge key={b.d} level={b.level} size={36} drill={b.d} />)}
        </View>
      </View>
    </View>
  );
}

/** The three newest trophies (the server lists them in order; unlocked ones last in time are last). */
function Shelf({ achievements }: { achievements: { key: string; unlocked: boolean }[] }) {
  const unlocked = achievements.filter(a => a.unlocked);
  const shown = unlocked.slice(-3);
  return (
    <View style={{ gap: 12 }}>
      <Section right={(
        <PressableScale accessibilityRole="button" accessibilityLabel={t('profile.trophies')} hitSlop={8} onPress={() => { buzz(); router.push('/kupalar'); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 }}>
          <T w={500} size={13} color={colors.g200}>{t('profile.shelfAll', { n: unlocked.length, m: achievements.length })}</T>
          <Icon name="chev" size={14} color={colors.g200} />
        </PressableScale>
      )}>{t('profile.shelf')}</Section>
      <PressableScale
        accessibilityRole="button" accessibilityLabel={`${t('profile.trophies')}, ${unlocked.length} / ${achievements.length}`}
        onPress={() => { buzz(); router.push('/kupalar'); }}
        style={{ flexDirection: 'row', paddingVertical: 16, paddingHorizontal: 8, borderRadius: radius.lg, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line }}
      >
        {shown.length === 0 && (
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8 }}>
            <Ico name="cup" size={48} dim />
            <T w={500} size={14} color={colors.g200} style={{ flex: 1 }}>{t('profile.shelfEmpty')}</T>
          </View>
        )}
        {shown.map(a => (
          <View key={a.key} style={{ flex: 1, alignItems: 'center', gap: 8 }}>
            <Ico name={achIcon(a.key)} size={56} />
            <T w={500} size={13} numberOfLines={2} style={{ textAlign: 'center' }}>{t(`ach.${a.key}` as Key)}</T>
          </View>
        ))}
      </PressableScale>
    </View>
  );
}

/** A quiet line for guests; the full card and the link button live on Ayarlar. */
function GuestStrip() {
  const account = useGame(s => s.account);
  if (!account || !account.anonymous || account.pendingEmail) return null;
  return (
    <PressableScale
      accessibilityRole="button" accessibilityLabel={`${t('profile.guestTitle')}. ${t('profile.linkShort')}`}
      onPress={() => { buzz(); openLinkSheet(); }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 16, borderRadius: radius.lg, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line }}
    >
      <Icon name="lock" size={20} color={colors.g200} />
      <View style={{ flex: 1 }}>
        <T w={600} size={15}>{t('profile.guestTitle')}</T>
        <T w={500} size={13} color={colors.g200}>{t('profile.guestShort')}</T>
      </View>
      <T w={600} size={15} color={colors.l600}>{t('profile.linkShort')}</T>
    </PressableScale>
  );
}
