import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { num } from '../game/format.ts';
import { useGame } from '../game/store.ts';
import { colors } from '../theme.ts';
import { openEnergySheet } from './energy.tsx';
import { Icon } from './Icon.tsx';
import { Caps, Cta, T } from './kit.tsx';
import { Amount, Ico } from './sade.tsx';
import { toast } from './overlay.tsx';
import { t } from '../i18n/index.ts';
import { PressableScale } from './motion.tsx';

const SLOTS = 7;
const PHRASES = ['mahalle.cheer.0', 'mahalle.cheer.1', 'mahalle.cheer.2', 'mahalle.cheer.3', 'mahalle.cheer.4'] as const;

// Today's mahalle match: the day's NPC opponent, the live score of the contributions so far,
// the squad's lines with a cheer button, and yesterday's result.
export function TodayCard() {
  const today = useGame(s => s.mahalleToday);
  const refresh = useGame(s => s.refreshMahalleToday);
  const energy = useGame(s => s.energy);
  const blocked = useGame(s => s.blocked);
  const [starting, setStarting] = useState(false);
  useEffect(() => { void refresh(); }, [refresh]);
  if (!today) return null;

  const list = today.contributions;
  const counted = list.slice(0, SLOTS);
  const ours = counted.reduce((a, c) => a + c.goals + c.assists, 0);
  const theirs = counted.reduce((a, c) => a + c.opponentGoals, 0);
  const fills = Math.max(0, SLOTS - counted.length);

  async function play() {
    if (starting) return;
    setStarting(true);
    const r = await useGame.getState().startMatch('mahalle');
    setStarting(false);
    if (r === 'no_energy') return openEnergySheet();
    if (r === 'already_played') { void refresh(); return; }
    if (r === 'error') return toast(t('hub.startFailed'), 'error');
    router.push('/mac');
  }

  function cheer(to: string, i: number) {
    toast(t(PHRASES[i % PHRASES.length]!));
    useGame.getState().cheer(to, i % PHRASES.length).catch(() => toast(t('mahalle.cheer.failed'), 'error'));
  }

  const last = today.last;
  const mine = last?.summary.payouts.find(p => p.player === today.me);

  const respect = mine ? (mine.respect >= 0 ? `+${mine.respect}` : `−${Math.abs(mine.respect)}`) : '';

  return (
    <View style={{ gap: 10 }}>
      <View style={{ padding: 16, borderRadius: 24, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, gap: 14 }}>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Caps>{today.opponent?.name ?? t('mahalle.today.vsNpc')}</Caps>
          <T w={700} size={44} style={{ lineHeight: 50, letterSpacing: -1 }} accessibilityLabel={t('mahalle.today.scoreA11y', { us: ours, them: theirs })}>{ours} – {theirs}</T>
        </View>
        {/* One figure per slot: the squad's players so far, the rest filled by mahalle kids at midnight. */}
        <View accessible accessibilityLabel={t('mahalle.today.slots', { n: counted.length, total: SLOTS, fills })} style={{ flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
          {Array.from({ length: SLOTS }, (_, i) => <Ico key={i} name={i < counted.length ? 'oyuncuKosu' : 'oyuncu'} size={34} dim={i >= counted.length} />)}
        </View>

        {list.length > 0 && (
          <View style={{ gap: 6 }}>
            {list.map((c, i) => (
              <View key={c.playerId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.s2 }}>
                <T w={600} size={13} color={colors.g300} style={{ width: 14 }}>{i + 1}</T>
                <T w={700} size={15} numberOfLines={1} style={{ flex: 1 }}>{blocked.includes(c.playerId) ? t('report.blockedName') : (c.nick ?? t('mahalle.home.newPlayer'))}</T>
                <View accessible accessibilityLabel={t('mahalle.today.line', { g: c.goals, a: c.assists })} style={{ flexDirection: 'row', gap: 10 }}>
                  <Amount icon="ball" size={18} textSize={14}>{c.goals}</Amount>
                  <Amount icon="pas" size={18} textSize={14}>{c.assists}</Amount>
                </View>
                <T w={700} size={14} color={c.rating >= 70 ? colors.l500 : colors.g100} style={{ minWidth: 30, textAlign: 'right' }}>{num(c.rating, 1)}</T>
                {c.playerId !== today.me && (
                  <PressableScale
                    accessibilityRole="button" accessibilityLabel={t('mahalle.cheer.a11y', { name: c.nick ?? '' })}
                    disabled={c.cheered || today.cheersLeft === 0 || blocked.includes(c.playerId)} onPress={() => cheer(c.playerId, i)}
                    hitSlop={8}
                    style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.cheered ? colors.l900 : colors.s3, opacity: !c.cheered && today.cheersLeft === 0 ? 0.4 : 1 }}
                  >
                    <Icon name="star" size={18} color={c.cheered ? colors.l500 : colors.g100} />
                  </PressableScale>
                )}
              </View>
            ))}
          </View>
        )}

        {today.played ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44 }}>
            <Icon name="check" size={20} color={colors.l600} />
            <T w={600} size={15} color={colors.l600}>{t('mahalle.today.doneShort')}</T>
          </View>
        ) : (
          <Cta onPress={() => void play()} busy={starting} accessibilityLabel={t('mahalle.today.cost', { energy })}>
            <Ico name="ball" size={28} />
            <T w={700} size={17} color={colors.ink}>{t('mahalle.today.play')}</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(13,13,13,.12)', borderRadius: 12, paddingVertical: 3, paddingLeft: 4, paddingRight: 8 }}>
              <Icon name="bolt" size={16} color={colors.ink} /><T w={700} size={14} color={colors.ink}>1</T>
            </View>
          </Cta>
        )}
      </View>

      {last && (
        <View style={{ padding: 14, borderRadius: 20, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Caps>{t('mahalle.last.short')}</Caps>
            <T w={700} size={15} numberOfLines={1} style={{ flex: 1 }}>{t(`mahalle.last.${last.result}`, { us: last.ourGoals, them: last.theirGoals, name: last.opponent.name })}</T>
          </View>
          {mine ? (
            <View accessible accessibilityLabel={t('mahalle.last.mine', { coin: mine.coin, xp: mine.xp, respect })} style={{ flexDirection: 'row', gap: 16 }}>
              <Amount icon="coin" size={22}>+{mine.coin}</Amount>
              <T w={700} size={15}>★ +{mine.xp}</T>
              <T w={700} size={15} color={mine.respect >= 0 ? colors.l500 : colors.bad}>{t('mahalle.last.respectShort', { n: respect })}</T>
            </View>
          ) : <T w={500} size={13} color={colors.g200}>{t('mahalle.last.notPlayed')}</T>}
        </View>
      )}
    </View>
  );
}
