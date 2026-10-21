import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, View } from 'react-native';

import { colors } from '../theme.ts';

export interface TimingBarHandle { stop(): number }

/** Drill mini-game: a marker sweeps back and forth; the target zone is 0.42–0.58.
 *  stop() returns hit quality 0..1 (1 = dead centre). */
export const TimingBar = forwardRef<TimingBarHandle, { speed?: number }>(function TimingBar({ speed = 1.25 }, ref) {
  const v = useRef(0);
  const x = useRef(new Animated.Value(0)).current;
  const running = useRef(true);
  const [w, setW] = useState(0);

  useEffect(() => {
    let dir = 1, last = Date.now(), raf = 0;
    const tick = () => {
      const now = Date.now(), dt = (now - last) / 1000;
      last = now;
      v.current += dir * dt * speed;
      if (v.current >= 1) { v.current = 1; dir = -1; }
      if (v.current <= 0) { v.current = 0; dir = 1; }
      x.setValue(v.current);
      if (running.current) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { running.current = false; cancelAnimationFrame(raf); };
  }, [speed, x]);

  useImperativeHandle(ref, () => ({
    stop() {
      running.current = false;
      return Math.max(0, Math.min(1, 1 - Math.abs(v.current - 0.5) / 0.5));
    },
  }));

  return (
    <View onLayout={e => setW(e.nativeEvent.layout.width)} style={{ height: 44, borderRadius: 12, backgroundColor: colors.s3, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', left: '42%', width: '16%', top: 0, bottom: 0, backgroundColor: colors.l900 }}>
        <View style={{ position: 'absolute', left: '31%', width: '38%', top: 0, bottom: 0, backgroundColor: colors.l700, opacity: 0.55 }} />
      </View>
      <Animated.View
        style={{
          position: 'absolute', top: 4, bottom: 4, width: 6, marginLeft: -3, borderRadius: 3, backgroundColor: colors.g100,
          left: x.interpolate({ inputRange: [0, 1], outputRange: [0, w] }),
        }}
      />
    </View>
  );
});
