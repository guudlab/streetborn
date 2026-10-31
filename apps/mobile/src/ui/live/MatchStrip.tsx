import { View } from 'react-native';

import type { Pin } from '../../game/live.ts';
import { t } from '../../i18n/index.ts';
import { colors } from '../../theme.ts';
import { T } from '../kit.tsx';

/** The match on one line: lime rings are the player's moments (filled when they went well), white our other goals, red theirs. */
export function MatchStrip({ pins, goals }: { pins: Pin[]; goals: number }) {
  const mine = pins.filter(p => p.kind === 'mine' || p.kind === 'mineGood').length;
  return (
    <View accessible accessibilityLabel={`${t('post.story')}: ${t('post.storyA11y', { n: mine, g: goals })}`} style={{ gap: 6 }}>
      <T w={600} size={12} color={colors.g300} style={{ letterSpacing: 1.2 }}>{t('post.story').toLocaleUpperCase('tr')}</T>
      <View style={{ height: 22, justifyContent: 'center' }}>
        <View style={{ height: 2, borderRadius: 1, backgroundColor: colors.s3 }} />
        <View style={{ position: 'absolute', left: '50%', top: 4, bottom: 4, width: 1, backgroundColor: colors.g400 }} />
        {pins.map((p, i) => {
          const ring = p.kind === 'mine' || p.kind === 'mineGood';
          const size = ring ? 16 : 10;
          return (
            <View
              key={i}
              style={{
                position: 'absolute', left: `${(Math.min(90, p.minute) / 90) * 100}%`, marginLeft: -size / 2, width: size, height: size, borderRadius: size / 2,
                backgroundColor: p.kind === 'mineGood' ? colors.l600 : p.kind === 'goal' ? colors.g100 : p.kind === 'conceded' ? colors.bad : colors.ink,
                borderWidth: ring ? 2 : 0, borderColor: colors.l600,
              }}
            />
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T size={11} color={colors.g300}>0'</T>
        <T size={11} color={colors.g300}>45'</T>
        <T size={11} color={colors.g300}>90'</T>
      </View>
    </View>
  );
}
