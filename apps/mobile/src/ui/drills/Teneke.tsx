import {
  POWER_PERFECT, POWER_TARGET, POWER_TIMED, TENEKE_BALLS, TENEKE_CRATE, TENEKE_WINDOW,
  tenekeLayout, tenekeOver, tenekeShoot, tenekeStart, type TenekeHit, type TenekeShot, type TenekeState,
} from '@streetborn/economy';
import { Image } from 'expo-image';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, View } from 'react-native';
import Svg, { Circle, Defs, G, Path, Pattern, Rect } from 'react-native-svg';

import { sfx } from '../../audio/audio.ts';
import { t } from '../../i18n/index.ts';
import { colors } from '../../theme.ts';
import { buzz } from '../kit.tsx';
import { ICONS } from '../sade.tsx';
import { Flash, useGameClock, type DrillGameHandle, type DrillGameProps } from './common.tsx';

// Teneke devirme (shooting): six cans on a crate by the mahalle wall. Pull back
// anywhere on the scene to aim (the reticle moves opposite the finger), the ring
// around the ball fills and empties while held, and letting go in the green
// shoots. Late is high, early is low, like a match shot.

const TOP = 12;
/** Finger travel to reticle travel. */
const PULL = 2;
/** Time for the ring to fill once, by tier. */
const FILL_MS = [900, 780, 680] as const;
const RING = 38;
const BALL = 34;
const CAN_COLORS = [['#E6E6E6', colors.l600], ['#D9503E', '#F2F2F2']] as const;

/** Power 0..1000 after holding `ms`: up to full, back down, up again. */
const wave = (ms: number, fill: number) => {
  const u = (ms / fill) % 2;
  return Math.round((u < 1 ? u : 2 - u) * 1000);
};

export const Teneke = forwardRef<DrillGameHandle, DrillGameProps>(function Teneke({ seed, tier, running, onScore, onDone }, ref) {
  const layout = useMemo(() => tenekeLayout(seed, tier), [seed, tier]);
  const [state, setState] = useState<TenekeState>(tenekeStart);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [aim, setAim] = useState<{ x: number; y: number } | null>(null);
  const [power, setPower] = useState(0);
  const [hit, setHit] = useState<TenekeHit | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const shots = useRef<TenekeShot[]>([]);
  const fly = useRef(new Animated.Value(0)).current;
  const { at } = useGameClock(running);

  // Geometry: field x −1000..1000 across the width, y 0..1400 up from the wall's foot.
  const k = size.w / 2000;
  const groundY = TOP + 1400 * k;
  const ball = { x: size.w / 2, y: groundY + Math.max(120, (size.h - groundY) * 0.5) };
  const sx = (x: number) => size.w / 2 + x * k;
  const sy = (y: number) => groundY - y * k;

  // Handlers read the latest values through this ref.
  const live = useRef({ running, state, busy: false, ball, k, groundY, w: size.w, holdStart: 0, aim: null as { x: number; y: number } | null, onScore, onDone });
  live.current = { ...live.current, running, state, ball, k, groundY, w: size.w, onScore, onDone };

  useImperativeHandle(ref, () => ({ inputs: () => shots.current }), []);

  const holding = aim !== null;
  useEffect(() => {
    if (!holding) return;
    let raf = 0;
    const tick = () => {
      setPower(wave(Date.now() - live.current.holdStart, FILL_MS[tier]));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [holding, tier]);

  const shoot = (reticle: { x: number; y: number }, p: number) => {
    const L = live.current;
    const last = shots.current[shots.current.length - 1]?.t ?? -1;
    const shot: TenekeShot = {
      x: Math.max(-1000, Math.min(1000, Math.round((reticle.x - L.w / 2) / L.k))),
      y: Math.max(0, Math.min(1400, Math.round((L.groundY - reticle.y) / L.k))),
      p, t: Math.max(at(), last + 1),
    };
    const r = tenekeShoot(layout, L.state, shot, tier);
    shots.current.push(shot);
    live.current.busy = true;
    sfx(r.hit.power === 'perfect' ? 'kick_power' : 'kick');
    setHit(r.hit);
    fly.setValue(0);
    Animated.timing(fly, { toValue: 1, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => {
      if (r.hit.hit !== null) { sfx('can_hit'); buzz('medium'); }
      else if (r.hit.window) { sfx('glass_crack'); buzz('medium'); setFlash(t('talim.window')); }
      setState(r.state);
      live.current.onScore(r.state.down.filter(Boolean).length);
      setTimeout(() => {
        setFlash(null);
        setHit(null);
        fly.setValue(0);
        live.current.busy = false;
        if (tenekeOver(r.state)) live.current.onDone(shots.current);
      }, r.hit.window ? 1400 : 900);
    });
  };

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => live.current.running && !live.current.busy && !tenekeOver(live.current.state),
    onMoveShouldSetPanResponder: () => false,
    onPanResponderGrant: () => {
      live.current.holdStart = Date.now();
      live.current.aim = { ...live.current.ball };
      sfx('sling_pull');
      setFlash(null);
      setAim(live.current.aim);
    },
    onPanResponderMove: (_, g) => {
      const L = live.current;
      const x = Math.max(0, Math.min(L.w, L.ball.x - g.dx * PULL));
      const y = Math.max(TOP, Math.min(L.groundY, L.ball.y - g.dy * PULL));
      L.aim = { x, y };
      setAim(L.aim);
    },
    onPanResponderRelease: (_, g) => {
      const L = live.current;
      const p = wave(Date.now() - L.holdStart, FILL_MS[tier]);
      const target = L.aim;
      L.aim = null;
      setAim(null);
      setPower(0);
      if (!target || Math.hypot(g.dx, g.dy) < 16) { setFlash(t('talim.pullMore')); return; }
      shoot(target, p);
    },
    onPanResponderTerminate: () => { live.current.aim = null; setAim(null); setPower(0); },
  }), [layout, tier]);

  const ready = size.w > 0;
  const crate = ready ? { l: sx(layout.cans[0]!.x - layout.cans[0]!.w / 2 - 30), r: sx(layout.cans[2]!.x + layout.cans[2]!.w / 2 + 30) } : null;
  const flying = hit !== null;
  const end = hit ? { x: sx(Math.max(-1100, Math.min(1100, hit.hx))), y: sy(Math.max(-50, Math.min(1480, hit.hy))) } : ball;
  const mid = { x: (ball.x + end.x) / 2 + 24, y: Math.min(ball.y, end.y) - 50 };
  const inZone = Math.abs(power - POWER_TARGET) <= POWER_TIMED;

  return (
    <View
      style={{ flex: 1 }} onLayout={e => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      accessible accessibilityLabel={`${t('drill.sut.name')}. ${t('talim.rule.sut')} ${t('talim.ballsLeft', { n: state.balls })}`}
      {...pan.panHandlers}
    >
      {ready && (
        <>
          <Svg width={size.w} height={size.h} style={{ position: 'absolute' }}>
            <Defs>
              <Pattern id="brick" width={52} height={26} patternUnits="userSpaceOnUse">
                <Rect width={52} height={26} fill="#2A2421" />
                <Path d="M0 0.5H52M0 13.5H52M13 0V13M39 13V26" stroke="#1F1A18" strokeWidth={2} />
              </Pattern>
            </Defs>
            <Rect x={0} y={0} width={size.w} height={groundY} fill="url(#brick)" />
            {/* The teyze's windows: anything above the ledge breaks one. */}
            {[0.18, 0.5, 0.82].map((f, i) => {
              const w = size.w * 0.2, x = size.w * f - w / 2, y = sy(1390), h = sy(TENEKE_WINDOW) - y - 8;
              return (
                <G key={i}>
                  <Rect x={x - 4} y={y - 4} width={w + 8} height={h + 8} rx={3} fill="#3A3226" />
                  <Rect x={x} y={y} width={w} height={h} fill="#4A4030" />
                  <Path d={`M${x + w / 2} ${y}V${y + h}M${x} ${y + h / 2}H${x + w}`} stroke="#3A3226" strokeWidth={4} />
                </G>
              );
            })}
            <Rect x={0} y={sy(TENEKE_WINDOW) - 4} width={size.w} height={6} fill="#3A3A3A" />
            <Rect x={size.w * 0.82 + 6} y={sy(TENEKE_WINDOW) - 22} width={16} height={18} rx={3} fill="#7A4A2A" />
            <Path d={`M${size.w * 0.82 + 10} ${sy(TENEKE_WINDOW) - 22}c-2-8 4-12 6-6M${size.w * 0.82 + 18} ${sy(TENEKE_WINDOW) - 22}c2-9 8-6 4 0`} stroke="#5E8A3A" strokeWidth={3} fill="none" strokeLinecap="round" />
            {/* Chalk goal on the wall. */}
            <Path d={`M${sx(-600)} ${groundY}V${sy(1000)}H${sx(600)}V${groundY}`} stroke="rgba(255,255,255,.42)" strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Rect x={0} y={groundY} width={size.w} height={size.h - groundY} fill="#161616" />
            <Rect x={0} y={groundY} width={size.w} height={6} fill="#2E2E2E" />
            {crate && (
              <G>
                <Rect x={crate.l} y={sy(TENEKE_CRATE)} width={crate.r - crate.l} height={TENEKE_CRATE * k} rx={3} fill="#6B4A2B" />
                <Path d={`M${crate.l} ${sy(TENEKE_CRATE * 0.66)}H${crate.r}M${crate.l} ${sy(TENEKE_CRATE * 0.33)}H${crate.r}`} stroke="#59391F" strokeWidth={2} />
              </G>
            )}
            {/* Aim: a dotted path to the reticle, and the power ring with its green zone. */}
            {aim && (
              <>
                <Path d={`M${ball.x} ${ball.y}Q${(ball.x + aim.x) / 2 + 30} ${(ball.y + aim.y) / 2 - 40} ${aim.x} ${aim.y}`} stroke={colors.l600} strokeWidth={4} strokeDasharray="1 11" strokeLinecap="round" fill="none" />
                <Circle cx={aim.x} cy={aim.y} r={17} stroke={colors.l600} strokeWidth={3} fill="rgba(207,253,92,.12)" />
              </>
            )}
            <PowerRing x={ball.x} y={ball.y} power={aim ? power : 0} inZone={inZone} />
          </Svg>

          {layout.cans.map((c, i) => (
            <CanView
              key={i} i={i} down={state.down[i]!} delay={hit ? Math.max(0, hit.fell.indexOf(i)) * 70 : 0}
              x={sx(c.x - c.w / 2)} y={sy(c.y + c.h)} w={c.w * k} h={c.h * k} drop={c.y * k + 10}
            />
          ))}

          {hit?.window && (
            <Svg width={size.w} height={size.h} style={{ position: 'absolute' }} pointerEvents="none">
              <Path d={`M${end.x - 18} ${end.y}L${end.x + 18} ${end.y}M${end.x} ${end.y - 18}L${end.x} ${end.y + 18}M${end.x - 13} ${end.y - 13}L${end.x + 13} ${end.y + 13}M${end.x + 13} ${end.y - 13}L${end.x - 13} ${end.y + 13}`} stroke="rgba(255,255,255,.8)" strokeWidth={2} />
            </Svg>
          )}

          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute', left: -BALL / 2, top: -BALL / 2, width: BALL, height: BALL,
              transform: [
                { translateX: flying ? fly.interpolate({ inputRange: [0, 0.5, 1], outputRange: [ball.x, mid.x, end.x] }) : ball.x },
                { translateY: flying ? fly.interpolate({ inputRange: [0, 0.5, 1], outputRange: [ball.y, mid.y, end.y] }) : ball.y },
                { scale: flying ? fly.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }) : 1 },
              ],
            }}
          >
            <Image source={ICONS.ball} style={{ width: '100%', height: '100%' }} contentFit="contain" />
          </Animated.View>

          <View style={{ position: 'absolute', right: 12, top: TOP + 6, flexDirection: 'row', gap: 4 }} accessibilityLabel={t('talim.ballsLeft', { n: state.balls })}>
            {Array.from({ length: TENEKE_BALLS }, (_, i) => (
              <Image key={i} source={ICONS.ball} style={{ width: 18, height: 18, opacity: i < state.balls ? 1 : 0.2 }} contentFit="contain" />
            ))}
          </View>
          <Flash text={flash} color={hit?.window ? colors.bad : colors.g100} x={size.w / 2} y={groundY + 36} />
        </>
      )}
    </View>
  );
});

/** The ring around the ball: the power fills it, the green arc is the zone to let go in. */
function PowerRing({ x, y, power, inZone }: { x: number; y: number; power: number; inZone: boolean }) {
  const arc = (r: number, from: number, to: number) => {
    const c = 2 * Math.PI * r;
    return { r, strokeDasharray: `${((to - from) / 1000) * c} ${c}`, strokeDashoffset: -(from / 1000) * c };
  };
  return (
    <G rotation={-90} origin={`${x}, ${y}`}>
      <Circle cx={x} cy={y} r={RING} stroke="rgba(255,255,255,.12)" strokeWidth={6} fill="none" />
      <Circle cx={x} cy={y} stroke={colors.l900} strokeWidth={4} fill="none" {...arc(RING + 7, POWER_TARGET - POWER_TIMED, POWER_TARGET + POWER_TIMED)} />
      <Circle cx={x} cy={y} stroke={colors.l600} strokeWidth={4} fill="none" {...arc(RING + 7, POWER_TARGET - POWER_PERFECT, POWER_TARGET + POWER_PERFECT)} />
      {power > 0 && <Circle cx={x} cy={y} stroke={inZone ? colors.l600 : colors.g100} strokeWidth={6} fill="none" strokeLinecap="round" {...arc(RING, 0, power)} />}
    </G>
  );
}

/** One can; when it goes down it tips over and drops to the ground. */
function CanView({ i, down, delay, x, y, w, h, drop }: { i: number; down: boolean; delay: number; x: number; y: number; w: number; h: number; drop: number }) {
  const a = useRef(new Animated.Value(down ? 1 : 0)).current;
  useEffect(() => {
    if (!down) { a.setValue(0); return; }
    Animated.timing(a, { toValue: 1, duration: 380, delay, easing: Easing.in(Easing.quad), useNativeDriver: true }).start();
  }, [down, delay, a]);
  const [body, band] = CAN_COLORS[i % 2]!;
  const dir = i % 2 ? 1 : -1;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', left: x + 2, top: y, width: w - 4, height: h, borderRadius: 4, backgroundColor: body, overflow: 'hidden',
        transform: [
          { translateX: a.interpolate({ inputRange: [0, 1], outputRange: [0, dir * (16 + i * 4)] }) },
          { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [0, drop] }) },
          { rotate: a.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${dir * 80}deg`] }) },
        ],
      }}
    >
      <View style={{ position: 'absolute', left: 0, right: 0, top: h * 0.3, height: h * 0.24, backgroundColor: band }} />
    </Animated.View>
  );
}
