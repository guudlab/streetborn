import { PERFECT_WINDOW, TIMED_WINDOW, TIMING_TARGET } from '@streetborn/engine';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, View } from 'react-native';

import { colors } from '../theme.ts';
import { T } from './kit.tsx';

export interface SkillBarHandle {
  /** Stops the marker and returns its position for the engine, an integer 0..1000. */
  stop(): number;
}

interface Props {
  label: string;
  /** Text on the right, e.g. what a perfect stop does. */
  hint?: string;
  /** Assisted shot: the marker rests on the target and does not move. */
  locked?: boolean;
  /** Full sweeps per second. */
  speed?: number;
}

// Zones from the engine, as fractions of the bar.
const pct = (v: number) => `${v / 10}%` as const;
const TIMED = { left: pct(TIMING_TARGET - TIMED_WINDOW), width: pct(2 * TIMED_WINDOW) };
const PERFECT = { left: pct(TIMING_TARGET - PERFECT_WINDOW), width: pct(2 * PERFECT_WINDOW) };

/**
 * The timing bar of every skill moment (shot power, pass, slide): a marker sweeps
 * back and forth and the player stops it. Light green is on time, the bright
 * centre is perfect.
 */
export const SkillBar = forwardRef<SkillBarHandle, Props>(function SkillBar({ label, hint, locked = false, speed = 0.9 }, ref) {
  const v = useRef(locked ? TIMING_TARGET / 1000 : 0);
  const a = useRef(new Animated.Value(v.current)).current;
  const on = useRef(!locked);
  const [w, setW] = useState(0);

  useEffect(() => {
    if (locked) return;
    let dir = 1, last = Date.now(), raf = 0;
    const tick = () => {
      const now = Date.now();
      v.current += dir * ((now - last) / 1000) * speed;
      last = now;
      if (v.current >= 1) { v.current = 1; dir = -1; }
      if (v.current <= 0) { v.current = 0; dir = 1; }
      a.setValue(v.current);
      if (on.current) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { on.current = false; cancelAnimationFrame(raf); };
  }, [a, locked, speed]);

  useImperativeHandle(ref, () => ({
    stop() {
      on.current = false;
      return Math.round(Math.max(0, Math.min(1, v.current)) * 1000);
    },
  }));

  return (
    <View style={{ flex: 1, gap: 6 }} accessibilityLabel={label}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <T w={500} size={12} color={colors.g200}>{label}</T>
        {hint ? <T w={500} size={12} color={colors.l500}>{hint}</T> : null}
      </View>
      <View onLayout={e => setW(e.nativeEvent.layout.width)} style={{ height: 22, borderRadius: 11, backgroundColor: colors.s3, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', left: TIMED.left, width: TIMED.width, top: 0, bottom: 0, backgroundColor: colors.l900 }} />
        <View style={{ position: 'absolute', left: PERFECT.left, width: PERFECT.width, top: 0, bottom: 0, backgroundColor: colors.l700 }} />
        <Animated.View
          style={{ position: 'absolute', top: 0, bottom: 0, width: 4, borderRadius: 2, backgroundColor: colors.g100, left: a.interpolate({ inputRange: [0, 1], outputRange: [-2, w - 2] }) }}
        />
      </View>
    </View>
  );
});
