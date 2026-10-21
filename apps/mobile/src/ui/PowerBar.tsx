import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, View } from 'react-native';

import { colors } from '../theme.ts';

export interface PowerBarHandle { stop(): number }

/** Assisted shot power: oscillates 0..1 until stopped. The sweet spot is ~0.62. */
export const PowerBar = forwardRef<PowerBarHandle>(function PowerBar(_props, ref) {
  const v = useRef(0);
  const a = useRef(new Animated.Value(0)).current;
  const on = useRef(true);
  const [w, setW] = useState(0);

  useEffect(() => {
    let dir = 1, last = Date.now(), raf = 0;
    const tick = () => {
      const now = Date.now();
      v.current += dir * ((now - last) / 1000) * 0.9;
      last = now;
      if (v.current >= 1) { v.current = 1; dir = -1; }
      if (v.current <= 0) { v.current = 0; dir = 1; }
      a.setValue(v.current);
      if (on.current) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { on.current = false; cancelAnimationFrame(raf); };
  }, [a]);

  useImperativeHandle(ref, () => ({ stop() { on.current = false; return v.current; } }));

  return (
    <View onLayout={e => setW(e.nativeEvent.layout.width)} style={{ flex: 1, height: 14, borderRadius: 7, backgroundColor: colors.s3, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', left: '54%', width: '16%', top: 0, bottom: 0, backgroundColor: colors.l900 }} />
      <Animated.View
        style={{ position: 'absolute', top: 0, bottom: 0, width: 4, borderRadius: 2, backgroundColor: colors.g100, left: a.interpolate({ inputRange: [0, 1], outputRange: [-2, w - 2] }) }}
      />
    </View>
  );
});
