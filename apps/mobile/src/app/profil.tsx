import { xpNeed } from '@streetborn/economy';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { DEFAULT_CHARACTER, HERO_IMAGE, HERO_MODEL, jerseyTint } from '../game/character.ts';
import { num } from '../game/format.ts';
import { levelProgress, ovr, type StatKey } from '../game/rules.ts';
import { useGame } from '../game/store.ts';
import { colors } from '../theme.ts';
import { openLinkSheet } from '../ui/account.tsx';
import { Emblem } from '../ui/emblem.tsx';
import { Icon } from '../ui/Icon.tsx';
import { buzz, Caps, Cta, Ghost, H3, T, Track } from '../ui/kit.tsx';
import { Model3D } from '../ui/Model3D.tsx';
import { Shell } from '../ui/mahalle.tsx';
import { closeSheet, openSheet, SheetText, toast } from '../ui/overlay.tsx';
import { Ico, Tile, type IconAsset } from '../ui/sade.tsx';
import { SoundToggles } from '../ui/settings.tsx';
import { PressableScale } from '../ui/motion.tsx';
import { t, type Key } from '../i18n/index.ts';

// Profil: who the player is (nickname, level, skills, career numbers, club, mahalle) and
// the account. The sign-out button lives here, at the very bottom, behind a confirmation
// that warns a guest what they would lose.

const SKILLS: { key: StatKey; icon: IconAsset }[] = [
  { key: 'sut', icon: 'sut' }, { key: 'pas', icon: 'pas' }, { key: 'hiz', icon: 'hiz' }, { key: 'fizik', icon: 'fizik' },
];

export default function Profil() {
  const g = useGame();
  const online = g.mode === 'online';
  const ch = g.character ?? DEFAULT_CHARACTER;
  const contract = g.career?.contract?.active ? g.career.contract : null;
  const totals = g.kariyer?.totals;
  const trophies = g.kariyer?.achievements;
  const unlockedCount = trophies?.filter(a => a.unlocked).length ?? 0;

  useEffect(() => {
    if (!online) return;
    void g.refreshAccount();
    void g.refreshKariyer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  const xpLeft = Math.max(0, xpNeed(g.level + 1) - g.xp);

  return (
    <Shell title={t('profile.title')}>
      {/* Who */}
      <View style={{ borderRadius: 24, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }}>
        <Model3D
          model={HERO_MODEL[ch.hero]} fallback={HERO_IMAGE[ch.hero][ch.jersey]} clip="idle" tint={jerseyTint(ch.jersey)}
          style={{ height: 210 }} label={t('hub.heroLabel', { name: g.name })}
        />
        <View style={{ padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <T w={700} size={24} numberOfLines={1} style={{ flex: 1 }} accessibilityRole="header">{g.name}</T>
            <View style={{ alignItems: 'flex-end' }}>
              <T w={700} size={30} style={{ lineHeight: 32, letterSpacing: -0.5 }}>{ovr(g.stats)}</T>
              <Caps>{t('profile.ovr')}</Caps>
            </View>
          </View>
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T w={600} size={14}>{t('profile.level', { n: g.level })}</T>
              <T w={500} size={13} color={colors.g200}>{t('profile.xpLeft', { n: num(xpLeft) })}</T>
            </View>
            <Track value={levelProgress(g.level, g.xp)} />
          </View>
        </View>
      </View>

      {/* Skills */}
      <View style={{ gap: 10 }}>
        <Caps>{t('profile.skills')}</Caps>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {SKILLS.map(s => (
            <Tile key={s.key} style={{ flex: 1, paddingVertical: 12, gap: 4 }} label={`${t(`profile.skill.${s.key}` as Key)} ${g.stats[s.key]}`}>
              <Ico name={s.icon} size={44} />
              <T w={700} size={20}>{g.stats[s.key]}</T>
              <T w={500} size={11} color={colors.g200}>{t(`profile.skill.${s.key}` as Key)}</T>
            </Tile>
          ))}
        </View>
      </View>

      {/* Career numbers, club and mahalle */}
      <View style={{ gap: 10 }}>
        <Caps>{t('profile.stats')}</Caps>
        {totals && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Count label={t('profile.matches')} value={totals.matches} />
            <Count label={t('profile.goals')} value={totals.goals} />
            <Count label={t('profile.assists')} value={totals.assists} />
          </View>
        )}
        <Tile row label={t('profile.club')} onPress={() => router.push('/teklifler')} style={{ minHeight: 64 }}>
          <Ico name="kulup" size={44} />
          <View style={{ flex: 1 }}>
            <Caps>{t('profile.club')}</Caps>
            <T w={700} size={16} numberOfLines={1}>{contract ? contract.clubName : t('profile.free')}</T>
          </View>
          <Icon name="chev" size={18} color={colors.g300} />
        </Tile>
        <Tile row label={t('profile.mahalle')} onPress={g.mahalle ? () => router.push('/mahalle') : undefined} style={{ minHeight: 64 }}>
          {g.mahalle ? <Emblem shape={g.mahalle.emblem} color={g.mahalle.color} name={g.mahalle.name} size={44} /> : <Ico name="mahalle" size={44} dim />}
          <View style={{ flex: 1 }}>
            <Caps>{t('profile.mahalle')}</Caps>
            <T w={700} size={16} numberOfLines={1}>{g.mahalle ? g.mahalle.name : t('profile.noMahalle')}</T>
          </View>
          {g.mahalle && <Icon name="chev" size={18} color={colors.g300} />}
        </Tile>
        {trophies && (
          <Tile row label={t('profile.trophies')} onPress={() => router.push('/kupalar')} style={{ minHeight: 64 }}>
            <Ico name="cup" size={44} />
            <View style={{ flex: 1 }}>
              <Caps>{t('profile.trophies')}</Caps>
              <T w={700} size={16}>{t('ach.count', { n: unlockedCount, m: trophies.length })}</T>
            </View>
            <Icon name="chev" size={18} color={colors.g300} />
          </Tile>
        )}
      </View>

      {/* Sound */}
      <View style={{ gap: 10 }}>
        <Caps>{t('profile.sound')}</Caps>
        <SoundToggles />
      </View>

      {/* Account */}
      <View style={{ gap: 10 }}>
        <Caps>{t('profile.account')}</Caps>
        {online ? <AccountCard /> : <T size={14} color={colors.g200}>{t('profile.offline')}</T>}
      </View>

      {online && <SignOut />}
    </Shell>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: 12, borderRadius: 18, backgroundColor: colors.s2 }} accessible accessibilityLabel={`${label} ${value}`}>
      <T w={700} size={22}>{num(value)}</T>
      <T w={500} size={12} color={colors.g200}>{label}</T>
    </View>
  );
}

function AccountCard() {
  const account = useGame(s => s.account);
  if (!account) return <T size={14} color={colors.g200}>{t('account.loading')}</T>;
  const linked = !account.anonymous;
  const names = [account.email, ...account.providers.map(p => (p === 'apple' ? 'Apple' : 'Google'))].filter(Boolean).join(' · ');
  return (
    <View style={{ gap: 12, padding: 16, borderRadius: 20, backgroundColor: colors.s1, borderWidth: 1, borderColor: linked ? colors.line : colors.l700 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: linked ? colors.l900 : colors.s3, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={linked ? 'check' : 'lock'} size={20} color={linked ? colors.l500 : colors.g200} />
        </View>
        <View style={{ flex: 1 }}>
          <T w={700} size={16}>{linked ? t('profile.linkedTitle') : account.pendingEmail ? t('profile.pendingTitle') : t('profile.guestTitle')}</T>
          <T size={13} color={colors.g200} numberOfLines={2}>{linked ? names : account.pendingEmail ?? t('profile.guestText')}</T>
        </View>
      </View>
      {!linked && !account.pendingEmail && <Cta onPress={openLinkSheet}>{t('profile.link')}</Cta>}
    </View>
  );
}

function SignOut() {
  const [busy, setBusy] = useState(false);
  const account = useGame(s => s.account);
  // Until the account is known, treat it as a guest: the warning is the safe side.
  const guest = !account || account.anonymous;

  const run = async () => {
    setBusy(true);
    try {
      await useGame.getState().signOut();
      closeSheet();
      toast(t('profile.signOutDone'));
    } catch (e) {
      console.warn('sign out failed', e);
      setBusy(false);
      toast(t('profile.signOutFailed'));
    }
  };

  const ask = () => {
    buzz('medium');
    if (guest) {
      openSheet(
        <>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#3A1D19', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="lock" size={26} color={colors.bad} />
            </View>
            <H3 style={{ textAlign: 'center' }}>{t('profile.signOutGuestTitle')}</H3>
          </View>
          <SheetText>{t('profile.signOutGuestText')}</SheetText>
          <Cta onPress={() => { closeSheet(); setTimeout(openLinkSheet, 250); }}>{t('profile.signOutLinkFirst')}</Cta>
          <DangerButton onPress={() => void run()}>{t('profile.signOutAnyway')}</DangerButton>
        </>,
      );
      return;
    }
    openSheet(
      <>
        <H3>{t('profile.signOutTitle')}</H3>
        <SheetText>{t('profile.signOutText')}</SheetText>
        <DangerButton onPress={() => void run()}>{t('profile.signOut')}</DangerButton>
        <Ghost onPress={closeSheet}>{t('common.cancel')}</Ghost>
      </>,
    );
  };

  return (
    <View style={{ gap: 8, marginTop: 8 }}>
      <DangerButton onPress={ask} off={busy}>{t('profile.signOut')}</DangerButton>
      <T size={12} color={colors.g300} style={{ textAlign: 'center' }}>{t('profile.signOutHint')}</T>
    </View>
  );
}

/** Outlined red button: leaving is allowed but never the loudest thing on the screen. */
function DangerButton({ children, onPress, off }: { children: string; onPress: () => void; off?: boolean }) {
  return (
    <PressableScale
      accessibilityRole="button" disabled={off} onPress={onPress}
      style={{ height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: colors.bad, alignItems: 'center', justifyContent: 'center', opacity: off ? 0.5 : 1 }}
    >
      <T w={600} size={16} color={colors.bad}>{children}</T>
    </PressableScale>
  );
}
