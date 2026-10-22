import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, Polygon, Polyline, Rect, Stop } from 'react-native-svg';

import { clamp } from '../game/rules.ts';
import { colors } from '../theme.ts';
import { Icon } from './Icon.tsx';
import { T } from './kit.tsx';
import { t } from '../i18n/index.ts';

// The goal seen from behind the player. Ported from sceneSVG/bindShot in the
// prototype: viewBox 390×560, posts x 95..295, crossbar y 150, ground y 262.
export const GOAL = { l: 95, r: 295, top: 150, ground: 262, ballX: 195, ballY: 470 };
const VB_W = 390, VB_H = 560;

export const goalPoint = (tx: number, ty: number) => ({
  x: (GOAL.l + GOAL.r) / 2 + (tx * (GOAL.r - GOAL.l)) / 2,
  y: GOAL.ground - ty * (GOAL.ground - GOAL.top),
});

export interface Target { tx: number; ty: number }

/** Where the shot ended, in goal units (posts at ±1, crossbar at 1), and where the keeper dived. */
export interface ShotAnim { out: 'gol' | 'kurtardi' | 'aut' | 'ust'; fx: number; fy: number; kx: number }
export interface Mate { name: string; open: boolean; x: number; y: number }

export interface ShotSceneHandle {
  animateShot(res: ShotAnim): Promise<void>;
  animatePass(x: number, y: number): Promise<void>;
  setAim(t: Target | null): void;
  reset(): void;
}

interface Props {
  mode: 'swipe' | 'assisted' | 'none';
  wall?: boolean;
  mates?: Mate[];
  onMate?(m: Mate): void;
  onTarget?(t: Target): void;
  onSwipe?(shot: { tx: number; ty: number; power: number }): void;
  onShort?(): void;
}

// Static crowd dots in the stands (same pseudo-random pattern as the prototype).
const STANDS = Array.from({ length: 70 }, (_, i) => ({
  cx: (i * 37) % 390, cy: 70 + ((i * 13) % 60), r: 1 + (i % 3) * 0.5, o: 0.08 + (i % 5) * 0.04,
}));
const NET_V: number[] = [];
for (let x = GOAL.l + 12; x < GOAL.r; x += 12) NET_V.push(x);
const NET_H: number[] = [];
for (let y = GOAL.top + 12; y < GOAL.ground; y += 12) NET_H.push(y);

const Background = () => (
  <>
    <Defs>
      <LinearGradient id="aSky" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#050605" /><Stop offset="1" stopColor="#121A12" />
      </LinearGradient>
      <LinearGradient id="aGrass" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#1B331B" /><Stop offset="1" stopColor="#244A23" />
      </LinearGradient>
    </Defs>
    <Rect width={390} height={560} fill="url(#aSky)" />
    {STANDS.map((s, i) => <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill="#FFF" opacity={s.o} />)}
    <Rect y={150} width={390} height={112} fill="#0F150F" />
    <Polygon points="0,262 390,262 390,560 0,560" fill="url(#aGrass)" />
    {[0, 1, 2, 3, 4].map(i => (
      <Polygon key={i} points={`0,${300 + i * 56} 390,${300 + i * 56} 390,${328 + i * 56} 0,${328 + i * 56}`} fill="#FFF" opacity={0.025} />
    ))}
    <G stroke="#FFF" strokeOpacity={0.55} strokeWidth={2} fill="none">
      <Line x1={0} y1={262} x2={390} y2={262} />
      <Polyline points="128,262 116,298 274,298 262,262" />
      <Polyline points="58,262 20,362 370,362 332,262" />
      <Path d="M150,362 Q195,392 240,362" />
    </G>
    <Circle cx={195} cy={330} r={2.5} fill="#FFF" opacity={0.6} />
    <G stroke="#DADADA" strokeWidth={1} opacity={0.55}>
      {NET_V.map(x => <Line key={x} x1={x} y1={GOAL.top} x2={x + (x - 195) * 0.06} y2={GOAL.ground - 6} />)}
      {NET_H.map(y => <Line key={y} x1={GOAL.l} y1={y} x2={GOAL.r} y2={y} />)}
    </G>
    <Rect x={GOAL.l - 4} y={GOAL.top - 4} width={GOAL.r - GOAL.l + 8} height={5} fill="#F4F4F4" />
    <Rect x={GOAL.l - 4} y={GOAL.top - 4} width={5} height={GOAL.ground - GOAL.top + 4} fill="#F4F4F4" />
    <Rect x={GOAL.r - 1} y={GOAL.top - 4} width={5} height={GOAL.ground - GOAL.top + 4} fill="#F4F4F4" />
  </>
);

const Wall = () => (
  <G>
    {[-1, 0, 1].map(i => (
      <G key={i} transform={`translate(${185 + i * 22},330)`}>
        <Rect x={-8} y={-34} width={16} height={34} rx={6} fill="#2E3A52" />
        <Circle cy={-40} r={7} fill="#2E3A52" />
      </G>
    ))}
  </G>
);

export const ShotScene = forwardRef<ShotSceneHandle, Props>(function ShotScene({ mode, wall, mates, onMate, onTarget, onSwipe, onShort }, ref) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [ball, setBall] = useState({ x: GOAL.ballX, y: GOAL.ballY, s: 1 });
  const [keeper, setKeeper] = useState({ x: 0, y: 0, rot: 0 });
  const [aim, setAimState] = useState<Target | null>(null);
  const busy = useRef(false);
  const raf = useRef(0);

  // preserveAspectRatio="xMidYMid slice": scale to cover, centre the overflow.
  const k = Math.max(box.w / VB_W, box.h / VB_H) || 1;
  const ox = (box.w - VB_W * k) / 2, oy = (box.h - VB_H * k) / 2;
  const toSvg = (px: number, py: number) => ({ x: (px - ox) / k, y: (py - oy) / k });
  const kRef = useRef({ k, toSvg });
  kRef.current = { k, toSvg };
  const props = useRef({ mode, onTarget, onSwipe, onShort });
  props.current = { mode, onTarget, onSwipe, onShort };

  const run = (dur: number, frame: (e: number, k: number) => void) => new Promise<void>(resolve => {
    cancelAnimationFrame(raf.current);
    const t0 = Date.now();
    const step = () => {
      const kk = Math.min(1, (Date.now() - t0) / dur);
      frame(1 - Math.pow(1 - kk, 2), kk);
      if (kk < 1) raf.current = requestAnimationFrame(step);
      else resolve();
    };
    raf.current = requestAnimationFrame(step);
  });

  useImperativeHandle(ref, () => ({
    async animateShot(res) {
      busy.current = true;
      setAimState(null);
      const end = res.out === 'aut' ? goalPoint(Math.sign(res.fx) * 1.25, Math.min(res.fy, 0.9))
        : res.out === 'ust' ? goalPoint(clamp(res.fx, -1, 1), 1.25)
          : res.out === 'kurtardi' ? goalPoint(res.kx * 0.9, Math.min(res.fy, 0.7))
            : goalPoint(res.fx, res.fy);
      const ctrl = { x: (GOAL.ballX + end.x) / 2 + res.fx * 30, y: Math.min(GOAL.ballY, end.y) - 80 };
      const kTarget = clamp(res.kx, -1, 1) * 95;
      const kRot = res.kx === 0 ? 0 : Math.sign(res.kx) * 70;
      await run(560, (e, kk) => {
        const x = (1 - e) * (1 - e) * GOAL.ballX + 2 * (1 - e) * e * ctrl.x + e * e * end.x;
        const y = (1 - e) * (1 - e) * GOAL.ballY + 2 * (1 - e) * e * ctrl.y + e * e * end.y;
        setBall({ x, y, s: 1 - 0.55 * e });
        const kd = Math.min(1, kk * 1.4);
        setKeeper({ x: kTarget * kd, y: -Math.abs(kRot) * 0.25 * kd, rot: kRot * kd });
      });
      await new Promise(r => setTimeout(r, 260));
    },
    async animatePass(x, y) {
      busy.current = true;
      await run(450, e => setBall({ x: GOAL.ballX + (x - GOAL.ballX) * e, y: GOAL.ballY + (y + 10 - GOAL.ballY) * e, s: 1 - 0.3 * e }));
    },
    setAim: setAimState,
    reset() {
      cancelAnimationFrame(raf.current);
      busy.current = false;
      setBall({ x: GOAL.ballX, y: GOAL.ballY, s: 1 });
      setKeeper({ x: 0, y: 0, rot: 0 });
      setAimState(null);
    },
  }));

  const pan = useMemo(() => {
    let start: { x: number; y: number; t: number } | null = null;
    const vec = (dx: number, dy: number) => ({ tx: clamp(dx / 70, -1.4, 1.4), ty: clamp((-dy - 60) / 260, 0, 1.3) });
    return PanResponder.create({
      onStartShouldSetPanResponder: (e) => {
        const { mode } = props.current;
        if (busy.current || mode === 'none') return false;
        const p = kRef.current.toSvg(e.nativeEvent.locationX, e.nativeEvent.locationY);
        if (mode === 'assisted') {
          if (p.y < GOAL.ground + 30 && p.y > GOAL.top - 40) {
            const t = { tx: clamp((p.x - 195) / 100, -0.98, 0.98), ty: clamp((GOAL.ground - p.y) / (GOAL.ground - GOAL.top), 0.05, 0.95) };
            setAimState(t);
            props.current.onTarget?.(t);
          }
          return false;
        }
        if (Math.hypot(p.x - GOAL.ballX, p.y - GOAL.ballY) > 90) return false;
        start = { ...p, t: Date.now() };
        return true;
      },
      onPanResponderMove: (_e, g) => {
        if (!start) return;
        const s = kRef.current.k;
        const dy = -g.dy / s;
        if (dy < 10) { setAimState(null); return; }
        setAimState(vec(g.dx / s, g.dy / s));
      },
      onPanResponderRelease: (_e, g) => {
        if (!start) return;
        const s = kRef.current.k;
        const dx = g.dx / s, dy = -g.dy / s;
        const dt = Math.max(60, Date.now() - start.t);
        start = null;
        if (dy < 40) { setAimState(null); props.current.onShort?.(); return; }
        const power = clamp(0.35 + (dy / dt) * 0.18, 0.2, 1);
        props.current.onSwipe?.({ ...vec(dx, g.dy / s), power });
      },
      onPanResponderTerminate: () => { start = null; setAimState(null); },
    });
  }, []);

  const aimPt = aim && goalPoint(aim.tx, aim.ty);

  return (
    <View style={{ flex: 1, overflow: 'hidden' }} onLayout={e => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid slice" pointerEvents="none">
        <Background />
        <G transform={`translate(195,${GOAL.ground})`}>
          <G transform={`translate(${keeper.x},${keeper.y}) rotate(${keeper.rot})`}>
            <Rect x={-11} y={-62} width={22} height={34} rx={8} fill="#B4B4B4" />
            <Circle cy={-72} r={9} fill="#C9A27E" />
            <Rect x={-26} y={-60} width={15} height={6} rx={3} fill="#B4B4B4" />
            <Rect x={11} y={-60} width={15} height={6} rx={3} fill="#B4B4B4" />
            <Rect x={-10} y={-30} width={8} height={30} rx={3} fill="#3A3A3A" />
            <Rect x={2} y={-30} width={8} height={30} rx={3} fill="#3A3A3A" />
          </G>
        </G>
        {wall && <Wall />}
        {aimPt && (
          <G>
            <Path
              d={`M${GOAL.ballX},${GOAL.ballY} Q${(GOAL.ballX + aimPt.x) / 2},${Math.min(GOAL.ballY, aimPt.y) - 60} ${aimPt.x},${aimPt.y}`}
              fill="none" stroke={colors.l600} strokeWidth={3} strokeDasharray="2 8" strokeLinecap="round"
            />
            <Circle cx={aimPt.x} cy={aimPt.y} r={9} fill="none" stroke={colors.l600} strokeWidth={3} />
          </G>
        )}
        <G transform={`translate(${ball.x},${ball.y}) scale(${ball.s})`}>
          <Ellipse cx={0} cy={17} rx={16} ry={4} fill="#000" opacity={0.35} />
          <Circle r={16} fill="#FFFFFF" stroke="#1A1A1A" strokeWidth={1.5} />
          <Path d="M0-7 L6.6-2.2 L4.1 5.7 L-4.1 5.7 L-6.6-2.2Z" fill="#1A1A1A" />
        </G>
      </Svg>

      <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} {...pan.panHandlers} />

      {mates?.map(m => (
        <Pressable
          key={m.name} accessibilityRole="button" accessibilityLabel={t('match.mateA11y', { name: m.name, state: m.open ? t('match.openA11y') : t('match.markedA11y') })}
          onPress={() => onMate?.(m)}
          style={{ position: 'absolute', left: ox + m.x * k - 50, top: oy + m.y * k - 40, width: 100, alignItems: 'center', gap: 6 }}
        >
          <View style={{
            width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center',
            backgroundColor: m.open ? 'rgba(207,253,92,.25)' : 'rgba(255,107,90,.25)',
          }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: m.open ? colors.l600 : colors.g200 }}>
              <T w={700} size={15} color={colors.ink}>{m.name}</T>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 10, backgroundColor: 'rgba(13,13,13,.8)' }}>
            <Icon name={m.open ? 'check' : 'x'} size={14} color={m.open ? colors.l600 : colors.bad} />
            <T w={600} size={12}>{m.open ? t('match.open') : t('match.marked')}</T>
          </View>
        </Pressable>
      ))}
    </View>
  );
});
