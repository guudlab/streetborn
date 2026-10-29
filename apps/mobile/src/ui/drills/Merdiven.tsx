import { BREATH_MAX, MERDIVEN_MS, breathAt, merdivenStart, merdivenStep, type MerdivenRun, type Tap } from '@streetborn/economy';
import { Image } from 'expo-image';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { sfx } from '../../audio/audio.ts';
import { t } from '../../i18n/index.ts';
import { colors } from '../../theme.ts';
import { buzz, T } from '../kit.tsx';
import { ICONS } from '../sade.tsx';
import { Flash, useGameClock, type DrillGameHandle, type DrillGameProps } from './common.tsx';

// Merdiven (stamina): 20 seconds up the apartment stairs, left foot, right foot.
// Every step fills the breath bar and it empties by itself; the same foot twice
// is a stumble, and a full bar stops the player for a moment. Pace beats mashing.

const STEP_W = 46;
const STEP_H = 28;
const STEPS = 14;

export const Merdiven = forwardRef<DrillGameHandle, DrillGameProps>(function Merdiven({ tier, running, onScore, onDone }, ref) {
  const { now, at } = useGameClock(running);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [run, setRun] = useState<MerdivenRun>(merdivenStart);
  const [flash, setFlash] = useState<string | null>(null);
  const taps = useRef<Tap[]>([]);
  const live = useRef({ run: merdivenStart(), done: false });
  const climb = useRef(new Animated.Value(0)).current;

  useImperativeHandle(ref, () => ({ inputs: () => taps.current }), []);

  useEffect(() => {
    if (!running || live.current.done || now < MERDIVEN_MS) return;
    live.current.done = true;
    sfx('whistle_end');
    setTimeout(() => onDone(taps.current), 700);
  }, [now, running, onDone]);

  const press = (s: 0 | 1) => {
    if (!running || live.current.done) return;
    const tap: Tap = { t: at(), s };
    if (tap.t > MERDIVEN_MS) return;
    taps.current.push(tap);
    const r = merdivenStep(live.current.run, tap, tier);
    live.current.run = r.run;
    setRun(r.run);
    if (r.result === 'step' || r.result === 'out_of_breath') {
      onScore(r.run.steps);
      // The stairs repeat every step: jump one step up-right and slide back down.
      climb.stopAnimation();
      climb.setValue(1);
      Animated.timing(climb, { toValue: 0, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      sfx('tap', 0.6);
    }
    if (r.result === 'same_foot') { setFlash(t('talim.sameFoot')); buzz('medium'); setTimeout(() => setFlash(null), 500); }
    if (r.result === 'out_of_breath') { setFlash(t('talim.outOfBreath')); sfx('error'); buzz('medium'); setTimeout(() => setFlash(null), 1200); }
  };

  const ready = size.w > 0;
  const breath = breathAt(run, now) / BREATH_MAX;
  const stumbling = now < run.stumbleUntil;
  const left = Math.max(0, Math.ceil((MERDIVEN_MS - now) / 1000));
  const nextFoot = run.foot === -1 ? null : ((1 - run.foot) as 0 | 1);
  // The stairs go up to the right; the climber stays put and the stairs slide down.
  const baseX = size.w * 0.3, baseY = size.h - 150;
  const stairs = Array.from({ length: STEPS }, (_, i) => `M${baseX + (i - 3) * STEP_W} ${baseY - (i - 3) * STEP_H}h${STEP_W}v${-STEP_H}`).join('');

  return (
    <View style={{ flex: 1 }} onLayout={e => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {ready && (
        <>
          <Svg width={size.w} height={size.h} style={{ position: 'absolute' }}>
            <Rect x={0} y={0} width={size.w} height={size.h} fill="#181614" />
            <Rect x={size.w * 0.08} y={30} width={10} height={size.h - 60} fill="#26221E" />
          </Svg>
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute', left: -STEP_W, top: 0, width: size.w + STEP_W * 2, height: size.h,
              transform: [
                { translateX: climb.interpolate({ inputRange: [0, 1], outputRange: [0, STEP_W] }) },
                { translateY: climb.interpolate({ inputRange: [0, 1], outputRange: [0, -STEP_H] }) },
              ],
            }}
          >
            <Svg width={size.w + STEP_W * 2} height={size.h} style={{ marginLeft: STEP_W }}>
              <Path d={stairs} stroke="#6A5E52" strokeWidth={6} fill="none" strokeLinejoin="round" />
              <Path d={stairs} stroke="#3A332C" strokeWidth={2} fill="none" transform={`translate(0 8)`} />
            </Svg>
          </Animated.View>
          <View pointerEvents="none" style={{ position: 'absolute', left: baseX - 6, top: baseY - STEP_H - 86, width: 80, height: 92, opacity: stumbling ? 0.45 : 1 }}>
            <Image source={ICONS.oyuncuKosu} style={{ width: '100%', height: '100%' }} contentFit="contain" />
          </View>

          {/* Breath bar and the clock. */}
          <View style={{ position: 'absolute', left: 16, right: 16, top: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, gap: 6 }} accessible accessibilityLabel={`${t('talim.breath')} ${Math.round(breath * 100)}%`}>
              <T w={600} size={12} color={colors.g200}>{t('talim.breath')}</T>
              <View style={{ height: 12, borderRadius: 6, backgroundColor: colors.s3, overflow: 'hidden' }}>
                <View style={{ width: `${breath * 100}%`, height: '100%', borderRadius: 6, backgroundColor: breath >= 0.75 ? colors.bad : colors.l600 }} />
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <T w={700} size={28} accessibilityLabel={t('talim.seconds', { n: left })}>{left}</T>
              <T w={600} size={12} color={colors.g200}>{run.steps}</T>
            </View>
          </View>
          <Flash text={flash} color={colors.bad} x={size.w / 2} y={baseY - STEP_H - 120} />

          <View style={{ position: 'absolute', left: 16, right: 16, bottom: 16, flexDirection: 'row', gap: 12 }}>
            {([0, 1] as const).map(s => (
              <Pressable
                key={s} onPressIn={() => press(s)}
                accessibilityRole="button" accessibilityLabel={t(s ? 'talim.right' : 'talim.left')}
                style={{
                  flex: 1, height: 96, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: colors.s2, borderWidth: 1.5, borderColor: nextFoot === s ? colors.l600 : colors.line,
                }}
              >
                <T w={700} size={18} color={nextFoot === s ? colors.l600 : colors.g100}>{t(s ? 'talim.right' : 'talim.left')}</T>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </View>
  );
});
