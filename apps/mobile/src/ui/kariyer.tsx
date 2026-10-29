import { DEFAULT_CONFIG, shootingBonus } from '@streetborn/economy';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { sfx } from '../audio/audio.ts';
import { delta, num } from '../game/format.ts';
import { useGame } from '../game/store.ts';
import type { AchievementView, Choice, FormLevel, InjuryKind, Kariyer } from '../net/api.ts';
import { colors } from '../theme.ts';
import { Icon } from './Icon.tsx';
import { buzz, Caps, Cta, Ghost, H3, T, Track } from './kit.tsx';
import { closeSheet, openSheet, toast } from './overlay.tsx';
import { Ico, Tile, type IconAsset } from './sade.tsx';
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
type Fx = { text: string; good: boolean };
/** What each choice does, as small chips: green when it helps, red when it costs. */
const CHOICE_FX: Record<Choice, () => Fx[]> = {
  rest: () => [{ text: t('choice.fx.morale', { n: delta(k.restMorale, 0) }), good: true }, { text: t('choice.fx.injury'), good: true }],
  work: () => [{ text: t('choice.fx.shoot', { n: delta(k.workShoot, 0) }), good: true }, { text: t('choice.fx.morale', { n: delta(k.workMorale, 0) }), good: k.workMorale >= 0 }],
  hang: () => [{ text: t('choice.fx.morale', { n: delta(k.hangMorale, 0) }), good: true }, { text: t('choice.fx.respect', { n: delta(k.hangRespect, 0) }), good: true }],
};
const fxLabel = (c: Choice) => CHOICE_FX[c]().map(f => f.text).join(', ');
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

/** The hub's form line: form on the left, morale on the right, and a lime "Hazırlan" pill while today's prep is open. */
export function FormStrip() {
  const c = useGame(s => s.kariyer);
  const loading = useGame(s => s.mode === 'online' && !s.kariyerTried);
  // First launch: hold the strip's place until the server answers.
  if (!c) return loading ? <Skeleton height={56} radius={18} /> : null;
  if (c.injury) return <InjuryStrip c={c} />;
  const label = t(`form.${c.form.level}` as Key);
  const low = c.morale < k.moraleLowBelow;
  return (
    <Tile
      row label={t('form.a11y', { form: label, morale: c.morale })} onPress={openFormSheet}
      style={{ minHeight: 56, paddingVertical: 6, paddingRight: 8, gap: 10, borderRadius: 18 }}
    >
      <FormMark level={c.form.level} size={34} />
      <View style={{ minWidth: 64 }}>
        <Caps style={{ fontSize: 10 }}>{t('form.formLabel')}</Caps>
        <T w={700} size={15} color={FORM_COLOR[c.form.level]} numberOfLines={1}>{label}</T>
      </View>
      <View style={{ width: 1, alignSelf: 'stretch', marginVertical: 6, backgroundColor: colors.line }} />
      <View style={{ flex: 1, gap: 5 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Caps style={{ fontSize: 10 }}>{t('form.moraleLabel')}</Caps>
          <T w={700} size={14} color={low ? colors.bad : colors.g100}>{c.morale}</T>
        </View>
        <Track value={c.morale / 100} height={5} color={low ? colors.bad : colors.l600} />
      </View>
      {!c.choseToday
        ? (
          // Lime on dark, not solid lime: the play button stays the one loud thing on the hub.
          <View style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: colors.l900, borderWidth: 1, borderColor: colors.l700, alignItems: 'center', justifyContent: 'center' }}>
            <T w={700} size={13} color={colors.l500}>{t('choice.pill')}</T>
          </View>
        )
        : c.choice
          ? <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.l900, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={16} color={colors.l500} /></View>
          : null}
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
  const [picked, setPicked] = useState<Choice | null>(null);
  if (!c) return null;
  const shoot = shootPoints(c);
  const low = c.morale < k.moraleLowBelow;
  // While a choice waits for its "are you sure", the stats step aside so the sheet stays short.
  if (picked && !c.choseToday) return <Prep c={c} picked={picked} setPicked={setPicked} />;
  return (
    <>
      <H3>{t('form.title')}</H3>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <StatCard label={t('form.formLabel')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <FormMark level={c.form.level} size={30} />
            <T w={700} size={20} color={FORM_COLOR[c.form.level]} numberOfLines={1} style={{ flexShrink: 1 }}>{t(`form.${c.form.level}` as Key)}</T>
          </View>
          <RatingBars ratings={c.form.ratings} />
        </StatCard>
        <StatCard label={t('form.moraleLabel')}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
            <T w={700} size={26} color={low ? colors.bad : colors.g100} style={{ lineHeight: 30 }}>{c.morale}</T>
            <T w={600} size={13} color={colors.g300}>/100</T>
          </View>
          <Track value={c.morale / 100} height={6} color={low ? colors.bad : colors.l600} />
        </StatCard>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{
          paddingHorizontal: 10, height: 28, borderRadius: 14, justifyContent: 'center',
          backgroundColor: shoot > 0 ? colors.l900 : shoot < 0 ? '#3A1D19' : colors.s3,
        }}>
          <T w={700} size={13} color={shoot > 0 ? colors.l500 : shoot < 0 ? colors.bad : colors.g200}>
            {shoot === 0 ? t('form.effect.none') : t('form.effect', { n: delta(shoot, 0) })}
          </T>
        </View>
        <T size={12} color={colors.g300} style={{ flex: 1, lineHeight: 16 }}>{t('form.explainShort')}</T>
      </View>

      <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 2 }} />
      <Prep c={c} picked={picked} setPicked={setPicked} />
    </>
  );
}

function StatCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ flex: 1, gap: 8, padding: 12, borderRadius: 18, backgroundColor: 'rgba(255,255,255,.04)', borderWidth: 1, borderColor: colors.line }}>
      <Caps style={{ fontSize: 10 }}>{label}</Caps>
      {children}
    </View>
  );
}

/** Last ratings as small bars, oldest on the left; good games lime. */
function RatingBars({ ratings }: { ratings: number[] }) {
  if (ratings.length === 0) return <T size={12} color={colors.g300}>{t('form.noRatings')}</T>;
  const shown = [...ratings].reverse();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 22 }} accessible accessibilityLabel={`${t('form.last')}: ${ratings.map(r => num(r / 10, 1)).join(', ')}`}>
      {shown.map((r, i) => (
        <View key={i} style={{ flex: 1, height: Math.max(4, Math.round((Math.min(100, r) / 100) * 22)), borderRadius: 3, backgroundColor: r >= 65 ? colors.l600 : r < 55 ? colors.g400 : colors.g300 }} />
      ))}
    </View>
  );
}

/** Today's pre-match prep. Cards look like options (radio circle); picking one asks once before it is saved. */
function Prep({ c, picked, setPicked }: { c: Kariyer; picked: Choice | null; setPicked: (c: Choice | null) => void }) {
  const [busy, setBusy] = useState(false);

  if (c.choseToday) {
    return (
      <>
        <Caps>{c.choice ? t('choice.todayTitle') : t('choice.title')}</Caps>
        {c.choice
          ? <ChoiceCard choice={c.choice} state="done" />
          : <T size={14} color={colors.g200}>{t('choice.used')}</T>}
        <Cta onPress={closeSheet}>{t('common.ok')}</Cta>
      </>
    );
  }

  const confirm = async () => {
    if (!picked) return;
    buzz('medium');
    setBusy(true);
    const r = await useGame.getState().choose(picked);
    setBusy(false);
    if (r === 'ok') { sfx('tab'); toast(t('choice.saved')); closeSheet(); } else toast(t(r === 'already_chosen' ? 'choice.already' : 'choice.failed'));
  };

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T w={700} size={16}>{t('choice.title')}</T>
        <Caps style={{ fontSize: 10 }}>{t('choice.onceADay')}</Caps>
      </View>
      <View style={{ gap: 8 }} accessibilityRole="radiogroup">
        {(['rest', 'work', 'hang'] as const).map(choice => (
          <ChoiceCard
            key={choice} choice={choice} state={picked === choice ? 'picked' : picked ? 'dim' : 'open'}
            onPress={busy ? undefined : () => { buzz(); setPicked(picked === choice ? null : choice); }}
          />
        ))}
      </View>
      {picked
        ? (
          <View style={{ gap: 10 }}>
            <T w={600} size={14} style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">{t('choice.confirm', { choice: choiceName(picked) })}</T>
            <Cta busy={busy} onPress={() => void confirm()}>{t('choice.confirmYes')}</Cta>
            <Ghost onPress={() => setPicked(null)}>{t('common.cancel')}</Ghost>
          </View>
        )
        : <Ghost onPress={closeSheet}>{t('choice.later')}</Ghost>}
    </>
  );
}

/** One prep option: icon, name, a short flavour line, effect chips and a radio circle. */
function ChoiceCard({ choice, state, onPress }: { choice: Choice; state: 'open' | 'picked' | 'dim' | 'done'; onPress?: () => void }) {
  const on = state === 'picked' || state === 'done';
  return (
    <Tile
      row role="radio" selected={on} onPress={onPress} label={`${choiceName(choice)}. ${fxLabel(choice)}`}
      style={{ minHeight: 76, paddingVertical: 10, gap: 12, opacity: state === 'dim' ? 0.55 : 1 }}
    >
      <Ico name={CHOICE_ICON[choice]} size={44} />
      <View style={{ flex: 1, gap: 6 }}>
        <View>
          <T w={700} size={16}>{choiceName(choice)}</T>
          <T w={500} size={12} color={colors.g200}>{t(`choice.${choice}.flavor` as Key)}</T>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {CHOICE_FX[choice]().map(f => (
            <View key={f.text} style={{ paddingHorizontal: 8, height: 22, borderRadius: 11, justifyContent: 'center', backgroundColor: f.good ? 'rgba(207,253,92,.12)' : 'rgba(255,122,102,.14)' }}>
              <T w={700} size={11} color={f.good ? colors.l500 : colors.bad}>{f.text}</T>
            </View>
          ))}
        </View>
      </View>
      <View style={{
        width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
        borderColor: on ? colors.l600 : colors.g400, backgroundColor: on ? colors.l600 : 'transparent',
      }}>
        {on && <Icon name="check" size={15} color={colors.ink} />}
      </View>
    </Tile>
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
