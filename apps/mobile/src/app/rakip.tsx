import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { num } from '../game/format.ts';
import { useGame } from '../game/store.ts';

import { colors } from '../theme.ts';
import { Icon } from '../ui/Icon.tsx';
import { Caps, Cta, Ghost, T } from '../ui/kit.tsx';
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
  useEffect(() => { void useGame.getState().refreshKariyer(); }, []);
  const d = k?.duel;
  if (!d) return <Shell title={t('duel.title')}><T size={14} color={colors.g200}>{t('duel.failed')}</T></Shell>;

  const npc = d.rival.kind === 'npc';
  const rivalName = npc ? t('duel.npc') : d.rival.nick ?? t('duel.friend');
  const ahead = d.me.score > d.them.score, behind = d.me.score < d.them.score;
  const line = d.me.matches === 0 && d.them.score === 0 ? t('duel.line.start', { name: rivalName })
    : ahead ? t('duel.line.lead') : behind ? t('duel.line.behind', { name: rivalName }) : t('duel.line.tie');

  return (
    <Shell
      title={t('duel.title')}
      footer={<><Cta onPress={() => router.back()}>{t('duel.play')}</Cta>{npc && hasMahalle && <Ghost onPress={() => router.replace('/mahalle')}>{t('duel.invite')}</Ghost>}</>}
    >
      <T w={600} size={13} color={colors.g200} style={{ textAlign: 'center' }}>
        {d.daysLeft <= 1 ? t('duel.weekLast') : t('duel.week', { n: d.daysLeft })}
      </T>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <Face letter={name.trim().charAt(0).toLocaleUpperCase('tr')} label={name} sub={t('profile.level', { n: level })} me />
        <T w={700} size={18} color={colors.g300}>{t('duel.vs')}</T>
        <Face letter={rivalName.charAt(0).toLocaleUpperCase('tr')} label={rivalName} sub={t('profile.level', { n: d.rival.level })} />
      </View>

      <View style={{ borderRadius: 20, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 16 }}>
        <Row label={t('duel.goals')} me={d.me.goals} them={d.them.goals} />
        <Row label={t('duel.assists')} me={d.me.assists} them={d.them.assists} />
        <Row label={t('duel.score')} me={d.me.score} them={d.them.score} strong />
        <Row label={t('duel.matches')} me={d.me.matches} them={d.them.matches} last />
      </View>

      <Bubble text={line} />

      <View style={{ borderRadius: 20, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 10 }}>
        <Caps>{t('duel.reward')}</Caps>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Amount icon="coin" size={30} textSize={20} color={colors.l500}>+{d.winCoin}</Amount>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="star" size={20} color={colors.l600} />
            <T w={700} size={16}>+{d.winRespect}</T>
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

function Face({ letter, label, sub, me }: { letter: string; label: string; sub: string; me?: boolean }) {
  return (
    <View style={{ alignItems: 'center', gap: 6, width: 112 }} accessible accessibilityLabel={`${label}, ${sub}`}>
      <View style={{
        width: 88, height: 88, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 2,
        backgroundColor: me ? colors.l900 : colors.awayCrest, borderColor: me ? colors.l600 : colors.line,
      }}>
        <T w={700} size={34} color={me ? colors.l500 : colors.awayCrestText}>{letter}</T>
      </View>
      <T w={700} size={15} numberOfLines={1}>{label}</T>
      <T w={500} size={12} color={colors.g200}>{sub}</T>
    </View>
  );
}

function Row({ label, me, them, strong, last }: { label: string; me: number; them: number; strong?: boolean; last?: boolean }) {
  const size = strong ? 22 : 17;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.line }}>
      <T w={700} size={size} color={me > them ? colors.l500 : colors.g100} style={{ flex: 1 }}>{num(me)}</T>
      <Caps>{label}</Caps>
      <T w={700} size={size} color={them > me ? colors.l500 : colors.g100} style={{ flex: 1, textAlign: 'right' }}>{num(them)}</T>
    </View>
  );
}

