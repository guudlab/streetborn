import { DEFAULT_CONFIG, shootingBonus } from '@streetborn/economy';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { sfx } from '../audio/audio.ts';
import { delta, num } from '../game/format.ts';
import { useGame } from '../game/store.ts';
import type { AchievementView, Choice, FormLevel, InjuryKind, Kariyer } from '../net/api.ts';
import { colors } from '../theme.ts';
import { Icon } from './Icon.tsx';
import { buzz, Cta, H3, T, Track } from './kit.tsx';
import { closeSheet, openSheet, SheetText, toast } from './overlay.tsx';
import { Dot, Ico, Tile, type IconAsset } from './sade.tsx';
import { Skeleton } from './motion.tsx';
import { t, type Key } from '../i18n/index.ts';

// Form, morale, the day's pre-match choice, injuries and achievements: the small
// pieces the hub, the profile and the result screen share.

const k = DEFAULT_CONFIG.kariyer;

export const FORM_COLOR: Record<FormLevel, string> = {
  none: colors.g400, cold: colors.gem, normal: colors.g200, good: colors.l600, hot: colors.l500,
};

export const injuryName = (kind: InjuryKind) => t(`injury.title.${kind}` as Key);

/** "1 gün 3 saat" style time left; minutes only in the last hour. */
export function timeLeft(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60_000));
  if (min < 60) return t('injury.minutes', { n: min });
  const hours = Math.ceil(min / 60);
  return hours < 24 ? t('injury.hours', { n: hours }) : `${t('injury.days', { n: Math.floor(hours / 24) })} ${t('injury.hours', { n: hours % 24 })}`.replace(/ 0 \S+$/, '');
}

/** Shooting points this match gets from form, morale and the day's "work" choice. */
export const shootPoints = (c: Kariyer) => shootingBonus(c.form.level, c.morale, c.choice, DEFAULT_CONFIG);

export const CHOICE_ICON: Record<Choice, IconAsset> = { rest: 'enerji', work: 'sut', hang: 'mahalle' };
const CHOICE_SUB: Record<Choice, () => string> = {
  rest: () => t('choice.rest.sub', { n: k.restMorale }),
  work: () => t('choice.work.sub', { n: k.workShoot, m: delta(k.workMorale, 0) }),
  hang: () => t('choice.hang.sub', { n: k.hangMorale, r: k.hangRespect }),
};
export const choiceName = (c: Choice) => t(`choice.${c}` as Key);

/** One existing icon per achievement; no new 3D asset needed. */
const ACH_ICONS: Record<string, IconAsset> = {
  first_goal: 'sut', ten_matches: 'ball', hat_trick: 'calim', star_match: 'oyuncu', fifty_matches: 'pas', hundred_goals: 'kale',
  first_mahalle: 'mahalle', ten_mahalle: 'arma', first_duel: 'oyuncuKosu', five_duels: 'milliForma',
  first_contract: 'davet', season_done: 'sezonKart', champion: 'cup', level_10: 'hiz', level_20: 'fizik',
};
export const achIcon = (key: string): IconAsset => ACH_ICONS[key] ?? 'cup';
export const achName = (key: string) => t(`ach.${key}` as Key);
export const achDesc = (key: string) => t(`ach.${key}.d` as Key);
/** Ratings are x10; the rating achievement shows as a grade. */
export const achProgress = (a: AchievementView) => (a.key === 'star_match' ? `${num(a.value / 10, 1)} / ${num(a.target / 10, 1)}` : t('ach.progress', { v: num(a.value), n: num(a.target) }));

/** Round form mark: a bolt coloured by how hot the player is. */
export function FormMark({ level, size = 38 }: { level: FormLevel; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.s3, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="bolt" size={size * 0.55} color={FORM_COLOR[level]} />
    </View>
  );
}

/** Last ratings as little chips; the newest is on the left. */
export function RatingChips({ ratings }: { ratings: number[] }) {
  if (ratings.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {ratings.map((r, i) => (
        <View key={i} style={{ minWidth: 42, height: 32, paddingHorizontal: 6, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: r >= 65 ? colors.l900 : colors.s3 }}>
          <T w={700} size={13} color={r >= 65 ? colors.l500 : colors.g100}>{num(r / 10, 1)}</T>
        </View>
      ))}
    </View>
  );
}

/** The hub's form line: form mark, form name and the morale bar. A lime dot means today's prep is open. */
export function FormStrip() {
  const c = useGame(s => s.kariyer);
  const loading = useGame(s => s.mode === 'online' && !s.kariyerTried);
  // First launch: hold the strip's place until the server answers.
  if (!c) return loading ? <Skeleton height={56} radius={18} /> : null;
  if (c.injury) return <InjuryStrip c={c} />;
  const label = t(`form.${c.form.level}` as Key);
  return (
    <Tile
      row label={t('form.a11y', { form: label, morale: c.morale })} onPress={openFormSheet}
      style={{ minHeight: 56, paddingVertical: 6, gap: 12, borderRadius: 18 }}
    >
      <FormMark level={c.form.level} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T w={700} size={15} color={FORM_COLOR[c.form.level]}>{label}</T>
          <T w={600} size={13} color={colors.g200}>{c.morale}</T>
        </View>
        <Track value={c.morale / 100} height={6} color={c.morale < k.moraleLowBelow ? colors.bad : colors.l600} />
      </View>
      {!c.choseToday && <Dot />}
    </Tile>
  );
}

function InjuryStrip({ c }: { c: Kariyer }) {
  const left = timeLeft(c.injury!.until - Date.now());
  return (
    <Tile
      row label={t('injury.stripA11y', { kind: injuryName(c.injury!.kind), t: left })} onPress={() => router.push('/sakatlik')}
      style={{ minHeight: 56, paddingVertical: 6, gap: 12, borderRadius: 18, borderColor: colors.bad, backgroundColor: 'rgba(58,29,25,.5)' }}
    >
      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#3A1D19', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="plus" size={22} color={colors.bad} />
      </View>
      <View style={{ flex: 1 }}>
        <T w={700} size={15} color={colors.bad}>{t('injury.strip')}</T>
        <T w={500} size={13} color={colors.g200} numberOfLines={1}>{injuryName(c.injury!.kind)}</T>
      </View>
      <T w={700} size={14}>{left}</T>
    </Tile>
  );
}

export function openFormSheet() {
  void useGame.getState().refreshKariyer();
  openSheet(<FormSheet />);
}

function FormSheet() {
  const c = useGame(s => s.kariyer);
  if (!c) return null;
  const shoot = shootPoints(c);
  return (
    <>
      <H3>{t('form.title')}</H3>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <FormMark level={c.form.level} size={52} />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T w={700} size={20} color={FORM_COLOR[c.form.level]}>{t(`form.${c.form.level}` as Key)}</T>
            <T w={600} size={14} color={colors.g200}>{t('form.moraleLabel')} {c.morale}</T>
          </View>
          <Track value={c.morale / 100} height={8} color={c.morale < k.moraleLowBelow ? colors.bad : colors.l600} />
        </View>
      </View>
      {c.form.ratings.length > 0 && (
        <View style={{ gap: 6 }}>
          <T w={600} size={12} color={colors.g200}>{t('form.last')}</T>
          <RatingChips ratings={c.form.ratings} />
        </View>
      )}
      <T w={700} size={15} color={shoot > 0 ? colors.l500 : shoot < 0 ? colors.bad : colors.g200}>
        {shoot === 0 ? t('form.effect.none') : t('form.effect', { n: delta(shoot, 0) })}
      </T>
      <SheetText>{t('form.explain')}</SheetText>

      <T w={600} size={14}>{c.choseToday ? (c.choice ? t('choice.done', { choice: choiceName(c.choice) }) : t('choice.used')) : t('choice.title')}</T>
      {!c.choseToday && <ChoiceTiles />}
      {c.choseToday && c.choice && (
        <Tile row selected style={{ minHeight: 64 }}>
          <Ico name={CHOICE_ICON[c.choice]} size={40} />
          <View style={{ flex: 1 }}><T w={700} size={16}>{choiceName(c.choice)}</T><T w={500} size={13} color={colors.g200}>{CHOICE_SUB[c.choice]()}</T></View>
          <Icon name="check" size={20} color={colors.l600} />
        </Tile>
      )}
      <Cta onPress={closeSheet}>{t('common.ok')}</Cta>
    </>
  );
}

/** The three pre-match choices; picking one saves it for the day. */
function ChoiceTiles() {
  const pick = async (choice: Choice) => {
    buzz('medium');
    const r = await useGame.getState().choose(choice);
    if (r === 'ok') { sfx('tab'); toast(t('choice.saved')); } else toast(t(r === 'already_chosen' ? 'choice.already' : 'choice.failed'));
  };
  return (
    <View style={{ gap: 8 }}>
      {(['rest', 'work', 'hang'] as const).map(choice => (
        <Tile key={choice} row label={`${choiceName(choice)}. ${CHOICE_SUB[choice]()}`} onPress={() => void pick(choice)} style={{ minHeight: 64, paddingVertical: 8 }}>
          <Ico name={CHOICE_ICON[choice]} size={40} />
          <View style={{ flex: 1 }}>
            <T w={700} size={16}>{choiceName(choice)}</T>
            <T w={500} size={13} color={colors.g200}>{CHOICE_SUB[choice]()}</T>
          </View>
        </Tile>
      ))}
    </View>
  );
}

/** Shows once what happened since the last visit: new trophies and last week's duel. Mount it on the hub. */
export function useKariyerNews() {
  const news = useGame(s => s.kariyerNews);
  useEffect(() => {
    if (!news) return;
    const lines: string[] = [];
    for (const d of news.settled) {
      if (d.status === 'void') lines.push(t('duel.settled.void'));
      else if (d.status === 'win') lines.push(t('duel.settled.win', { coin: d.coin }));
      else if (d.status === 'draw') lines.push(t('duel.settled.draw'));
      else lines.push(t('duel.settled.lose', { name: d.rivalNick ?? t('duel.npc') }));
    }
    for (const u of news.unlocked) lines.push(t('ach.newCoin', { name: achName(u.key), coin: u.coin }));
    // Toasts replace each other, so the most important line goes last: it stays on screen.
    if (lines.length > 0) { sfx('unlock'); toast(lines[lines.length - 1]!); }
    useGame.setState({ kariyerNews: null });
  }, [news]);
}
