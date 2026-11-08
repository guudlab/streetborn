import { ligRival, ligTable } from '@streetborn/economy';
import { View } from 'react-native';

import { useGame } from '../game/store.ts';
import { t } from '../i18n/index.ts';
import { colors } from '../theme.ts';
import { Emblem } from './emblem.tsx';
import { Caps, T } from './kit.tsx';
import { BotTag } from './mahalle-mac.tsx';

// The week's Mahalle Ligi group: eight rows, our mahalle and today's rival marked. Without a
// group (new or quiet mahalle) a short note says how to get in on Monday.

const NUM = { width: 30, textAlign: 'right' as const };

export function LigCard() {
  const today = useGame(s => s.mahalleToday);
  if (!today) return null;
  const lig = today.lig ?? null;

  if (!lig) {
    return (
      <View style={{ padding: 16, borderRadius: 20, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, gap: 8 }}>
        <Caps>{t('lig.title')}</Caps>
        <T w={500} size={14} color={colors.g200} style={{ lineHeight: 20 }}>{t('lig.wait')}</T>
      </View>
    );
  }

  const rows = ligTable(lig.results);
  const rivalSlot = ligRival(lig.slot, lig.round);

  return (
    <View style={{ padding: 16, borderRadius: 20, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Caps>{t('lig.title')}</Caps>
        <T w={600} size={12} color={colors.g300}>{t('lig.day', { n: lig.round + 1 })}</T>
      </View>

      <View style={{ gap: 4 }}>
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }}>
          <View style={{ flex: 1 }} />
          <T w={600} size={12} color={colors.g300} style={NUM}>{t('lig.colPlayed')}</T>
          <T w={600} size={12} color={colors.g300} style={NUM}>{t('lig.colGd')}</T>
          <T w={600} size={12} color={colors.g300} style={NUM}>{t('lig.colPts')}</T>
        </View>
        {rows.map((r, i) => {
          const team = lig.teams.find(x => x.slot === r.slot);
          if (!team) return null;
          const mine = r.slot === lig.slot;
          const rival = r.slot === rivalSlot;
          const gd = r.goalsFor - r.goalsAgainst;
          const gdText = gd > 0 ? `+${gd}` : gd < 0 ? `−${Math.abs(gd)}` : '0';
          const label = t('lig.rowA11y', { pos: i + 1, name: team.name, pts: r.points, played: r.played, gd: gdText })
            + (team.bot ? t('lig.botA11y') : '') + (rival ? t('lig.todayA11y') : '');
          return (
            <View
              key={r.slot} accessible accessibilityLabel={label}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: 12,
                backgroundColor: mine ? colors.l900 : colors.s2, borderWidth: 1.5, borderColor: rival ? colors.l700 : 'transparent',
              }}
            >
              <T w={600} size={13} color={mine ? colors.l500 : colors.g300} style={{ width: 16 }}>{i + 1}</T>
              <Emblem shape={team.emblem} color={team.color} name={team.name} size={26} />
              {/* Bot and today's rival go on a second line, so the name keeps the row's width. */}
              <View style={{ flex: 1, minWidth: 0, paddingVertical: 8 }}>
                <T w={mine ? 700 : 600} size={14} numberOfLines={1}>{team.name}</T>
                {(team.bot || rival) && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    {rival && <T w={600} size={12} color={colors.l600}>{t('lig.today')}</T>}
                    {team.bot && <BotTag />}
                  </View>
                )}
              </View>
              <T w={500} size={13} color={colors.g200} style={NUM}>{r.played}</T>
              <T w={500} size={13} color={colors.g200} style={NUM}>{gdText}</T>
              <T w={600} size={14} color={mine ? colors.l500 : colors.g100} style={NUM}>{r.points}</T>
            </View>
          );
        })}
      </View>

      <T w={500} size={12} color={colors.g300} style={{ lineHeight: 17 }}>{t('lig.how')}</T>
    </View>
  );
}
