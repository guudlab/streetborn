import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { num } from '../game/format.ts';
import { useGame } from '../game/store.ts';

import { colors } from '../theme.ts';
import { Icon } from '../ui/Icon.tsx';
import { Caps, Cta, Ghost, T } from '../ui/kit.tsx';
import { Skeleton } from '../ui/motion.tsx';
import { ErrorState } from '../ui/states.tsx';
import { Shell } from '../ui/mahalle.tsx';
import { Amount, Bubble } from '../ui/sade.tsx';
import { t } from '../i18n/index.ts';

// Haftalık rekabet: you against a friend of your mahalle (Kerem, an NPC, when nobody else
// is there). Goals count two, assists one; the server settles the week on Monday.

export default function Rakip() {
  const k = useGame(s => s.kariyer);
  const name = useGame(s => s.name);
  const level = useGame(s => s.level);
  const hasMahalle = useGame(s => s.mahalle !== null);
  const tried = useGame(s => s.kariyerTried);
  const refresh = useGame(s => s.refreshKariyer);
  useEffect(() => { void refresh(); }, [refresh]);
  const d = k?.duel;
  if (!d && !tried) return <RakipSkeleton />;
  if (!d) return <Shell title={t('duel.title')}><ErrorState text={t('duel.failed')} onRetry={refresh} /></Shell>;

  const npc = d.rival.kind === 'npc';
  const rivalName = npc ? t('duel.npc') : d.rival.nick ?? t('duel.friend');
  const ahead = d.me.score > d.them.score, behind = d.me.score < d.them.score;
  const line = d.me.matches === 0 && d.them.score === 0 ? t('duel.line.start', { name: rivalName })
    : ahead ? t('duel.line.lead') : behind ? t('duel.line.behind', { name: rivalName }) : t('duel.line.tie');

  return (
    <Shell
      title={t('duel.title')} onRefresh={refresh}
      footer={<><Cta onPress={() => router.back()}>{t('duel.play')}</Cta>{npc && hasMahalle && <Ghost onPress={() => router.replace('/mahalle')}>{t('duel.invite')}</Ghost>}</>}
    >
      <T w={600} size={13} color={colors.g200} style={{ textAlign: 'center' }}>
        {d.daysLeft <= 1 ? t('duel.weekLast') : t('duel.week', { n: d.daysLeft })}
      </T>

      {/* The week's score is the hero, like a scoreboard: me on the left, the rival on the right. */}
      <View
        accessible accessibilityLabel={`${name} ${d.me.score}, ${rivalName} ${d.them.score}`}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
      >
        <Face letter={name.trim().charAt(0).toLocaleUpperCase('tr')} label={name} sub={t('profile.level', { n: level })} me />
        <View style={{ alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <T w={600} size={48} color={ahead ? colors.l500 : colors.g100} style={{ lineHeight: 52, fontVariant: ['tabular-nums'] }}>{num(d.me.score)}</T>
            <T w={500} size={28} color={colors.g300}>–</T>
            <T w={600} size={48} color={behind ? colors.l500 : colors.g100} style={{ lineHeight: 52, fontVariant: ['tabular-nums'] }}>{num(d.them.score)}</T>
          </View>
          <Caps>{t('duel.score')}</Caps>
        </View>
        <Face letter={rivalName.charAt(0).toLocaleUpperCase('tr')} label={rivalName} sub={t('profile.level', { n: d.rival.level })} />
      </View>

      <View style={{ borderRadius: 20, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 16 }}>
        <Row label={t('duel.goals')} me={d.me.goals} them={d.them.goals} />
        <Row label={t('duel.assists')} me={d.me.assists} them={d.them.assists} />
        <Row label={t('duel.matches')} me={d.me.matches} them={d.them.matches} last />
      </View>

      <Bubble text={line} />

      <View style={{ borderRadius: 20, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 12 }}>
        <Caps>{t('duel.reward')}</Caps>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Amount icon="coin" size={30} textSize={20} color={colors.l500}>+{d.winCoin}</Amount>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="star" size={20} color={colors.l600} />
            <T w={600} size={16}>+{d.winRespect}</T>
          </View>
        </View>
        <T size={13} color={colors.g200} style={{ lineHeight: 19 }}>{npc ? t('duel.npcRule') : t('duel.rule', { n: d.minMatches })}</T>
      </View>

      {d.record.win + d.record.lose + d.record.draw > 0 && (
        <T w={500} size={13} color={colors.g200} style={{ textAlign: 'center' }}>{t('duel.record', { w: d.record.win, l: d.record.lose })}</T>
      )}
    </Shell>
  );
}

/** The duel screen's shape while the first answer is on its way. */
function RakipSkeleton() {
  return (
    <Shell title={t('duel.title')}>
      <Skeleton width={120} height={14} radius={7} style={{ alignSelf: 'center' }} />
      <Skeleton height={108} radius={20} />
      <Skeleton height={146} radius={20} />
      <Skeleton height={56} radius={28} />
      <Skeleton height={120} radius={20} />
    </Shell>
  );
}

function Face({ letter, label, sub, me }: { letter: string; label: string; sub: string; me?: boolean }) {
  return (
    <View style={{ alignItems: 'center', gap: 4, width: 88 }}>
      <View style={{
        width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
        backgroundColor: me ? colors.l900 : colors.awayCrest,
      }}>
        <T w={600} size={22} color={me ? colors.l500 : colors.awayCrestText}>{letter}</T>
      </View>
      <T w={600} size={15} numberOfLines={1}>{label}</T>
      <T w={500} size={12} color={colors.g200}>{sub}</T>
    </View>
  );
}

function Row({ label, me, them, strong, last }: { label: string; me: number; them: number; strong?: boolean; last?: boolean }) {
  const size = strong ? 22 : 17;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.line }}>
      <T w={600} size={size} color={me > them ? colors.l500 : colors.g100} style={{ flex: 1 }}>{num(me)}</T>
      <Caps>{label}</Caps>
      <T w={600} size={size} color={them > me ? colors.l500 : colors.g100} style={{ flex: 1, textAlign: 'right' }}>{num(them)}</T>
    </View>
  );
}

