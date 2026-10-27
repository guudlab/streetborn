import type React from 'react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { colors } from '../theme.ts';

// The round timing button of the 3D match: a lime core with a ring around it. The
// ring fills as the timing runs; release (or tap) while it is in the white zone.
// The zones match the engine: TIMING_TARGET 750 ± TIMED_WINDOW 150 is white,
// ± PERFECT_WINDOW 60 is the brighter band.

const SWEET = [0.6, 0.9] as const, PERFECT = [0.69, 0.81] as const;
/** Seconds for the charge ring to go 0 → 1 → 0. */
const CHARGE_PERIOD = 1.25;
const R = 60, RC = 2 * Math.PI * R;

const tri = (t: number) => { const ph = (t / CHARGE_PERIOD) % 1; return ph < 0.5 ? ph * 2 : 2 - ph * 2; };
const ringColor = (p: number) => (p >= SWEET[0] && p <= SWEET[1] ? '#FFFFFF' : p > SWEET[1] ? colors.bad : colors.l600);

export interface RingHandle {
  /** Shows a timing the screen got from elsewhere (the scene's pass or defense ring), 0..1. */
  set(p: number): void;
  /** Keyboard: start or end a charge as if the button were held. */
  press(): void;
  release(): void;
}

interface Props {
  /** charge: hold to fill, release to fire with the power. tap: fires on press. */
  mode: 'charge' | 'tap';
  enabled: boolean;
  size?: number;
  dark?: boolean;
  label: string;
  children: ReactNode;
  onCharge?(): void;
  /** Charge mode: the power at release, 0..1. Tap mode: called on press. */
  onFire(power: number): void;
}

export const RingButton = forwardRef<RingHandle, Props>(function RingButton(
  { mode, enabled, size = 132, dark, label, children, onCharge, onFire }, ref,
) {
  // State, not setNativeProps: react-native-svg on the web ignores setNativeProps, and the
  // ring stood still while the button was held.
  const [p, setP] = useState(0);
  const charging = useRef<{ t0: number; raf: number; p: number } | null>(null);

  const stop = useCallback(() => {
    const c = charging.current;
    if (!c) return null;
    cancelAnimationFrame(c.raf);
    charging.current = null;
    return c.p;
  }, []);
  useEffect(() => () => { stop(); }, [stop]);
  useEffect(() => { if (!enabled) { stop(); setP(0); } }, [enabled, stop, setP]);

  const press = useCallback(() => {
    if (!enabled) return;
    if (mode === 'tap') { onFire(0); return; }
    if (charging.current) return;
    const c = { t0: performance.now(), raf: 0, p: 0 };
    const tick = () => {
      c.p = tri((performance.now() - c.t0) / 1000);
      setP(c.p);
      c.raf = requestAnimationFrame(tick);
    };
    charging.current = c;
    onCharge?.();
    tick();
  }, [enabled, mode, onCharge, onFire, setP]);

  const release = useCallback(() => {
    const power = stop();
    if (power !== null && enabled) onFire(power);
  }, [enabled, onFire, stop]);

  useImperativeHandle(ref, () => ({ set: setP, press, release }), [setP, press, release]);

  // Web: plain pointer events with pointer capture. Pressable's responder gives the press
  // up when a long touch turns into a context menu or a selection, which released the
  // shot early on phones.
  const host = useRef<React.ComponentRef<typeof View>>(null);
  const latest = useRef({ press, release });
  latest.current = { press, release };
  useEffect(() => {
    const el = host.current as unknown as HTMLElement | null;
    if (Platform.OS !== 'web' || !el) return;
    const down = (e: PointerEvent) => {
      if (e.button > 0) return;
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
      latest.current.press();
    };
    const up = () => latest.current.release();
    const menu = (e: Event) => e.preventDefault();
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', menu);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('contextmenu', menu);
    };
  }, []);
  const web = Platform.OS === 'web';

  const inset = size * (dark ? 0.09 : 0.106);
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !enabled }}
      // Native: no press delay, the timing is read when the finger lands.
      ref={host} disabled={!enabled} {...({ delayPressIn: 0, unstable_pressDelay: 0 } as object)}
      onPressIn={web ? undefined : press} onPressOut={web || mode !== 'charge' ? undefined : release}
      // Keyboard activation on the web (Enter/Space on the focused button) for tap buttons.
      onPress={web && mode === 'tap' ? press : undefined}
      style={({ pressed }) => ({ width: size, height: size, opacity: enabled ? 1 : 0.12, transform: [{ scale: pressed ? 0.96 : 1 }], ...(web ? { touchAction: 'none' } : null) } as object)}
    >
      <Svg width={size} height={size} viewBox="0 0 132 132" style={{ position: 'absolute' }}>
        <G rotation={-90} origin="66, 66">
          <Circle cx={66} cy={66} r={R} fill="none" stroke="rgba(13,13,13,0.6)" strokeWidth={10} />
          <Circle cx={66} cy={66} r={R} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={10}
            strokeDasharray={`${(SWEET[1] - SWEET[0]) * RC} ${RC}`} strokeDashoffset={-SWEET[0] * RC} />
          <Circle cx={66} cy={66} r={R} fill="none" stroke="#FFFFFF" strokeWidth={14}
            strokeDasharray={`${(PERFECT[1] - PERFECT[0]) * RC} ${RC}`} strokeDashoffset={-PERFECT[0] * RC} />
          <Circle cx={66} cy={66} r={R} fill="none" stroke={ringColor(p)} strokeWidth={10} strokeLinecap="round"
            strokeDasharray={`${Math.max(0.001, p) * RC} ${RC}`} />
        </G>
      </Svg>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', top: inset, left: inset, right: inset, bottom: inset, borderRadius: size,
          alignItems: 'center', justifyContent: 'center', gap: 2,
          backgroundColor: dark ? colors.s2 : colors.l600, borderWidth: dark ? 2 : 0, borderColor: colors.line,
          boxShadow: dark ? undefined : '0 10px 34px rgba(207,253,92,0.35)',
        }}
      >
        {children}
      </View>
    </Pressable>
  );
});
