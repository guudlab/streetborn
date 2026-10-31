import type { Moment, Tactic } from '@streetborn/engine';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';

import { t } from '../../i18n/index.ts';
import { colors } from '../../theme.ts';
import { Icon } from '../Icon.tsx';
import { buzz, Ghost, T } from '../kit.tsx';
import { useReduceMotion } from '../motion.tsx';
import { Bubble, Ico } from '../sade.tsx';
import { Radar } from './Commentary.tsx';

/** Seconds to pick in a decision moment; doubled with Reduce Motion. */
const DECIDE_S = 4;

/**
 * Decision moment: the ball comes to the player and he picks a shot or a pass. The pitch shows
 * the situation (a glowing free teammate, or a clear path to goal); reading it is the skill.
 * No pick in time plays the pass.
 */
export function Decision({ moment, mate, first, onPick }: {
  moment: Moment; mate: string; first: boolean; onPick(kind: 'shot' | 'pass'): void;
}) {
  const reduce = useReduceMotion();
  const total = (reduce ? DECIDE_S * 2 : DECIDE_S) * 1000;
  const bar = useRef(new Animated.Value(1)).current;
  const done = useRef(false);
  const pick = (k: 'shot' | 'pass') => { if (done.current) return; done.current = true; buzz('select'); onPick(k); };
  const pickRef = useRef(pick);
  pickRef.current = pick;
  useEffect(() => {
    const anim = Animated.timing(bar, { toValue: 0, duration: total, useNativeDriver: false });
    anim.start(({ finished }) => { if (finished) pickRef.current('pass'); });
    return () => anim.stop();
  }, [bar, total]);

  // We attack to the right: the left-side teammate runs along the top of the radar.
  const free = moment.best === 'pass' ? (moment.openSide === 'left' ? 'top' : 'bottom') : null;
  return (
    <View style={{ flex: 1, gap: 16, justifyContent: 'center' }}>
      <Radar ball={{ x: 0.6, y: 0.5 }} reduce duration={0} highlight={{ mate: free, lane: moment.best === 'shot' }} />
      <View style={{ alignItems: 'center', gap: 2 }}>
        <T w={700} size={32} color={colors.l600} style={{ letterSpacing: 1, textShadowColor: 'rgba(207,253,92,.45)', textShadowRadius: 22 }}>{t('live.yours')}</T>
        <T size={13} color={colors.g200}>{moment.minute}'</T>
      </View>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.s3, overflow: 'hidden' }}>
        <Animated.View style={{ height: '100%', backgroundColor: colors.l600, width: bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 28 }}>
        <Choice icon="sut" label={t('live.decide.shot')} a11y={t('live.decide.shotA11y')} onPress={() => pick('shot')} />
        <Choice icon="pas" label={t('live.decide.pass')} a11y={t('live.decide.passA11y', { name: mate })} onPress={() => pick('pass')} />
      </View>
      <T size={13} color={colors.g300} style={{ textAlign: 'center' }}>{first ? t('live.decide.hint') : t('live.decide.timeout')}</T>
    </View>
  );
}

function Choice({ icon, label, a11y, onPress }: { icon: 'sut' | 'pas'; label: string; a11y: string; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} style={{ alignItems: 'center', gap: 8 }}>
      {({ pressed }) => (
        <>
          <View style={{ width: 92, height: 92, borderRadius: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.l900 : colors.s2, borderWidth: 1, borderColor: pressed ? colors.l600 : colors.line }}>
            <Ico name={icon} size={48} />
          </View>
          <T w={700} size={16}>{label}</T>
        </>
      )}
    </Pressable>
  );
}

/** Half-time: Burak abi asks one question; the answer shapes the second half. */
export function Halftime({ us, them, onPick }: { us: number; them: number; onPick(t: Tactic | null): void }) {
  const [busy, setBusy] = useState(false);
  const go = (v: Tactic | null) => { if (busy) return; setBusy(true); buzz('select'); onPick(v); };
  const ask = us < them ? t('live.ht.behind') : us > them ? t('live.ht.ahead') : t('live.ht.level');
  return (
    <View style={{ flex: 1, justifyContent: 'center', gap: 18 }}>
      <T w={700} size={13} color={colors.l600} style={{ textAlign: 'center', letterSpacing: 1.6 }}>{t('m3.banner.halftime')}</T>
      <Bubble text={ask} size={46} />
      <View style={{ gap: 10 }}>
        <Option title={t('live.ht.push')} sub={t('live.ht.pushSub')} icon="play" onPress={() => go('push')} />
        <Option title={t('live.ht.hold')} sub={t('live.ht.holdSub')} icon="shield" onPress={() => go('hold')} />
      </View>
      <Ghost onPress={() => go(null)}>{t('live.ht.keep')}</Ghost>
    </View>
  );
}

function Option({ title, sub, icon, onPress }: { title: string; sub: string; icon: 'play' | 'shield'; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`} onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 22, borderWidth: 1,
        borderColor: pressed ? colors.l600 : colors.line, backgroundColor: pressed ? colors.l900 : colors.s1,
      })}
    >
      <View style={{ width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.s2, transform: [{ rotate: icon === 'play' ? '-90deg' : '0deg' }] }}>
        <Icon name={icon} size={20} color={colors.l600} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T w={700} size={17}>{title}</T>
        <T size={13} color={colors.g200}>{sub}</T>
      </View>
    </Pressable>
  );
}
