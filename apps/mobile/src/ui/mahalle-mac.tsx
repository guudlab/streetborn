import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { num } from '../game/format.ts';
import { useGame } from '../game/store.ts';
import { colors } from '../theme.ts';
import { openEnergySheet } from './energy.tsx';
import { Icon } from './Icon.tsx';
import { Caps, Cta, T } from './kit.tsx';
import { toast } from './overlay.tsx';
import { t } from '../i18n/index.ts';

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
    if (r === 'error') return toast(t('hub.startFailed'));
    router.push('/mac');
  }

  function cheer(to: string, i: number) {
    toast(t(PHRASES[i % PHRASES.length]!));
    useGame.getState().cheer(to, i % PHRASES.length).catch(() => toast(t('mahalle.cheer.failed')));
  }

  const last = today.last;
  const mine = last?.summary.payouts.find(p => p.player === today.me);

  return (
    <View style={{ gap: 10 }}>
      <Caps>{t('mahalle.today.label')}</Caps>
      <View style={{ padding: 16, borderRadius: 20, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T w={600} size={15} numberOfLines={1} style={{ flex: 1 }}>{today.opponent?.name ?? t('mahalle.today.vsNpc')}</T>
          <T w={700} size={28} accessibilityLabel={t('mahalle.today.scoreA11y', { us: ours, them: theirs })}>{ours} – {theirs}</T>
        </View>
        <T w={500} size={13} color={colors.g200}>
          {list.length === 0 ? t('mahalle.today.none') : t('mahalle.today.slots', { n: counted.length, total: SLOTS, fills })}
        </T>

        {list.length > 0 && (
          <View style={{ borderRadius: 14, backgroundColor: colors.s2, overflow: 'hidden' }}>
            {list.map((c, i) => (
              <View key={c.playerId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.line }}>
                <T w={600} size={14} numberOfLines={1} style={{ flex: 1 }}>{blocked.includes(c.playerId) ? t('report.blockedName') : (c.nick ?? t('mahalle.home.newPlayer'))}</T>
                <T w={500} size={13} color={colors.g200}>{t('mahalle.today.line', { g: c.goals, a: c.assists })}</T>
                <T w={600} size={14} color={c.rating >= 70 ? colors.l500 : colors.g100}>{num(c.rating, 1)}</T>
                {c.playerId !== today.me && (
                  <Pressable
                    accessibilityRole="button" accessibilityLabel={t('mahalle.cheer.a11y', { name: c.nick ?? '' })}
                    disabled={c.cheered || today.cheersLeft === 0 || blocked.includes(c.playerId)} onPress={() => cheer(c.playerId, i)}
                    hitSlop={8}
                    style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.s3, opacity: c.cheered || today.cheersLeft === 0 ? 0.4 : 1 }}
                  >
                    <Icon name="star" size={18} color={c.cheered ? colors.l500 : colors.g100} />
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        )}

        {today.played ? (
          <T w={500} size={14} color={colors.g200}>{t('mahalle.today.done')}</T>
        ) : (
          <>
            <Cta onPress={() => void play()} busy={starting}>{t('mahalle.today.play')}</Cta>
            <T w={500} size={12} color={colors.g300} style={{ textAlign: 'center' }}>{t('mahalle.today.cost', { energy })}</T>
          </>
        )}
        {today.cheersLeft < 3 && <T w={500} size={12} color={colors.g300}>{t('mahalle.cheer.left', { n: today.cheersLeft })}</T>}
      </View>

      {last && (
        <View style={{ padding: 16, borderRadius: 20, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, gap: 6 }}>
          <Caps>{t('mahalle.last.label')}</Caps>
          <T w={600} size={16}>{t(`mahalle.last.${last.result}`, { us: last.ourGoals, them: last.theirGoals, name: last.opponent.name })}</T>
          <T w={500} size={13} color={colors.g200}>
            {mine
              ? t('mahalle.last.mine', { coin: mine.coin, xp: mine.xp, respect: mine.respect >= 0 ? `+${mine.respect}` : `−${Math.abs(mine.respect)}` })
              : t('mahalle.last.notPlayed')}
          </T>
          {last.summary.turnout && <T w={500} size={13} color={colors.l500}>{t('mahalle.last.turnout')}</T>}
          <T w={500} size={12} color={colors.g300}>{t('mahalle.last.burak', { respect: today.respect })}</T>
        </View>
      )}
    </View>
  );
}
