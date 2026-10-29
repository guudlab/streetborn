import { Image } from 'expo-image';
import { useEffect, type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation, Easing, Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import type { HowToKind } from '../../game/rules.ts';
import { t, type Key } from '../../i18n/index.ts';
import { colors } from '../../theme.ts';
import { Cta, T } from '../kit.tsx';
import { ICONS } from '../sade.tsx';

// "Nasıl oynanır": before a mini game's first round, a looping demo shows the
// gesture with a hand on a small copy of the scene, with two or three short
// steps under it. No paragraphs: the hand does the explaining.

const W = 280;
const H = 200;
const KEREM = require('../../../assets/meshy/hero-street-red.webp');
const STEPS: Record<HowToKind, number> = { sut: 3, pas: 2, hiz: 2, fizik: 2, omuz: 2, mShot: 3, mPass: 2, mDefense: 2 };

type Frames = [number[], number[]];
/** Piecewise-linear keyframes over the loop (p runs 0 → 1). */
const kf = (p: number, [at, v]: Frames) => {
  'worklet';
  return interpolate(p, at, v, Extrapolation.CLAMP);
};

function useLoop(ms: number) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: ms, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(p);
  }, [p, ms]);
  return p;
}

/** Absolutely placed and moved by keyframes: x and y are the element's centre. */
function Mover({ p, x, y, size, opacity, scale, rotate, children }: {
  p: SharedValue<number>; x: Frames | number; y: Frames | number; size: { w: number; h: number };
  opacity?: Frames; scale?: Frames; rotate?: Frames; children: ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    const cx = typeof x === 'number' ? x : kf(p.value, x);
    const cy = typeof y === 'number' ? y : kf(p.value, y);
    return {
      opacity: opacity ? kf(p.value, opacity) : 1,
      transform: [
        { translateX: cx - size.w / 2 }, { translateY: cy - size.h / 2 },
        { scale: scale ? kf(p.value, scale) : 1 }, { rotate: `${rotate ? kf(p.value, rotate) : 0}deg` },
      ],
    };
  });
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: size.w, height: size.h }, style]}>{children}</Animated.View>;
}

const HAND = 'M9 11.24V7.5C9 6.12 10.12 5 11.5 5S14 6.12 14 7.5v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z';
const HAND_PX = 46;
/** The hand's fingertip sits at (x, y): the path's tip is near (11.5, 5) of 24. */
function Hand({ p, x, y, opacity }: { p: SharedValue<number>; x: Frames | number; y: Frames | number; opacity?: Frames }) {
  const off = (v: Frames | number, d: number): Frames | number => (typeof v === 'number' ? v + d : [v[0], v[1].map(n => n + d)]);
  return (
    <Mover p={p} x={off(x, HAND_PX / 2 - (11.5 / 24) * HAND_PX)} y={off(y, HAND_PX / 2 - (5 / 24) * HAND_PX)} size={{ w: HAND_PX, h: HAND_PX }} opacity={opacity}>
      <Svg width={HAND_PX} height={HAND_PX} viewBox="0 0 24 24">
        <Path d={HAND} fill={colors.g100} stroke={colors.ink} strokeWidth={0.8} />
      </Svg>
    </Mover>
  );
}

/** A ring that spreads out where the finger lands. */
function Ripple({ p, x, y, at }: { p: SharedValue<number>; x: number; y: number; at: number }) {
  return (
    <Mover p={p} x={x} y={y} size={{ w: 40, h: 40 }} opacity={[[at - 0.001, at, at + 0.14], [0, 0.9, 0]]} scale={[[at, at + 0.14], [0.5, 1.7]]}>
      <View style={{ flex: 1, borderRadius: 20, borderWidth: 3, borderColor: colors.l600 }} />
    </Mover>
  );
}

/** The ring that closes on a target, like the games' timing ring. */
function Closing({ p, x, y, from, to }: { p: SharedValue<number>; x: number; y: number; from: number; to: number }) {
  return (
    <Mover p={p} x={x} y={y} size={{ w: 48, h: 48 }} opacity={[[from - 0.001, from, to, to + 0.04], [0, 1, 1, 0]]} scale={[[from, to], [2.3, 1]]}>
      <View style={{ flex: 1, borderRadius: 24, borderWidth: 2.5, borderColor: colors.l600 }} />
    </Mover>
  );
}

const Spot = ({ x, y, r = 24, children }: { x: number; y: number; r?: number; children?: ReactNode }) => (
  <View style={{ position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: r, borderWidth: 2, borderColor: colors.line, backgroundColor: 'rgba(255,255,255,.05)', alignItems: 'center', justifyContent: 'center' }}>
    {children}
  </View>
);

const img = (source: number, w: number, h = w) => <Image source={source} style={{ width: w, height: h }} contentFit="contain" />;

// Teneke: pull the ball back, aim at the cans, let go.
function TenekeDemo() {
  const p = useLoop(3000);
  const ball: Frames = [[0, 0.18, 0.46, 0.5, 0.64], [92, 92, 72, 72, 198]];
  const ballY: Frames = [[0, 0.18, 0.46, 0.5, 0.64], [126, 126, 148, 148, 40]];
  const cans = [{ x: 186, y: 52, r: -40 }, { x: 210, y: 52, r: 35 }, { x: 198, y: 28, r: 60 }];
  return (
    <>
      {cans.map((c, i) => (
        <Mover key={i} p={p} x={[[0.64, 0.82], [c.x, c.x + c.r / 3]]} y={[[0.64, 0.82], [c.y, c.y + 44]]} rotate={[[0.64, 0.82], [0, c.r * 2]]} opacity={[[0, 0.8, 0.9], [1, 1, 0]]} size={{ w: 18, h: 24 }}>
          <View style={{ flex: 1, borderRadius: 3, backgroundColor: '#B9C0C7', borderWidth: 2, borderColor: '#7D858C' }} />
        </Mover>
      ))}
      {[0.25, 0.42, 0.59, 0.76].map((f, i) => (
        <Mover key={i} p={p} x={92 + (198 - 92) * f} y={126 + (40 - 126) * f} size={{ w: 6, h: 6 }} opacity={[[0.22, 0.32, 0.48, 0.52], [0, 0.8, 0.8, 0]]}>
          <View style={{ flex: 1, borderRadius: 3, backgroundColor: colors.g100 }} />
        </Mover>
      ))}
      <Mover p={p} x={ball} y={ballY} size={{ w: 26, h: 26 }} scale={[[0.5, 0.64], [1, 0.6]]} opacity={[[0, 0.64, 0.72], [1, 1, 0]]}>{img(ICONS.ball, 26)}</Mover>
      <Mover p={p} x={72} y={148} size={{ w: 44, h: 44 }} scale={[[0.2, 0.46], [2, 1]]} opacity={[[0.19, 0.2, 0.46, 0.5], [0, 1, 1, 0]]}>
        <View style={{ flex: 1, borderRadius: 22, borderWidth: 2.5, borderColor: colors.l600 }} />
      </Mover>
      <Hand p={p} x={[[0, 0.16, 0.18, 0.46, 0.56], [130, 92, 92, 72, 60]]} y={[[0, 0.16, 0.18, 0.46, 0.56], [170, 126, 126, 148, 168]]} opacity={[[0, 0.08, 0.16, 0.48, 0.56], [0, 0, 1, 1, 0]]} />
    </>
  );
}

// Duvar pası: the ring closes on a foot, tap that side.
function PasDemo() {
  const p = useLoop(2800);
  const L = { x: 80, y: 124 }, R = { x: 200, y: 124 }, wall = { x: 140, y: 26 };
  const f = 0.76;
  return (
    <>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 22, backgroundColor: '#2A2421', borderBottomWidth: 3, borderColor: '#1F1A18' }} />
      <Spot x={L.x} y={L.y} />
      <Spot x={R.x} y={R.y} />
      <Closing p={p} x={L.x} y={L.y} from={0.05} to={0.31} />
      <Closing p={p} x={R.x} y={R.y} from={0.55} to={0.81} />
      <Ripple p={p} x={L.x} y={L.y} at={0.31} />
      <Ripple p={p} x={R.x} y={R.y} at={0.81} />
      <Mover
        p={p} size={{ w: 24, h: 24 }}
        x={[[0, 0.06, 0.31, 0.56, 0.81, 1], [R.x + (wall.x - R.x) * f, wall.x, L.x, wall.x, R.x, R.x + (wall.x - R.x) * f]]}
        y={[[0, 0.06, 0.31, 0.56, 0.81, 1], [R.y + (wall.y + 12 - R.y) * f, wall.y + 12, L.y - 14, wall.y + 12, R.y - 14, R.y + (wall.y + 12 - R.y) * f]]}
      >{img(ICONS.ball, 24)}</Mover>
      <Hand
        p={p}
        x={[[0, 0.15, 0.4, 0.65, 0.9, 1], [152, L.x, L.x, R.x, R.x, 152]]}
        y={[[0, 0.27, 0.31, 0.36, 0.77, 0.81, 0.86, 1], [150, 146, L.y, 146, 146, R.y, 146, 150]]}
      />
    </>
  );
}

// Bakkala koş: a crate comes down the lane, tap a side to switch lanes.
function KosDemo() {
  const p = useLoop(2800);
  return (
    <>
      {[105, 175].map(x => <View key={x} style={{ position: 'absolute', left: x - 1, top: 0, bottom: 0, width: 2, backgroundColor: colors.line }} />)}
      <Mover p={p} x={140} y={[[0, 0.85], [-20, 190]]} size={{ w: 30, h: 26 }}>
        <View style={{ flex: 1, borderRadius: 4, backgroundColor: '#8A5A2B', borderWidth: 2, borderColor: '#5E3B1A' }} />
      </Mover>
      <Mover p={p} x={[[0, 0.3, 0.38, 0.82, 0.92], [140, 140, 70, 70, 140]]} y={130} size={{ w: 44, h: 50 }}>{img(ICONS.oyuncuKosu, 44, 50)}</Mover>
      <Ripple p={p} x={44} y={128} at={0.3} />
      <Hand p={p} x={[[0, 0.18, 0.5], [60, 44, 44]]} y={[[0, 0.18, 0.26, 0.3, 0.36], [156, 150, 150, 128, 146]]} opacity={[[0.1, 0.18, 0.5, 0.6], [0, 1, 1, 0]]} />
    </>
  );
}

// Merdiven: left, right, in turn; the climber goes up a step each time.
function MerdivenDemo() {
  const p = useLoop(2600);
  const taps = [0.12, 0.37, 0.62, 0.87];
  const L = { x: 72, y: 140 }, R = { x: 208, y: 140 };
  const up = (d: number): Frames => [[0, ...taps.flatMap(a => [a, a + 0.04]), 0.95, 1], [0, ...taps.flatMap((_, i) => [i * d, (i + 1) * d]), 4 * d, 4 * d]];
  return (
    <>
      {[0, 1, 2, 3, 4].map(i => <View key={i} style={{ position: 'absolute', left: 104 + i * 18, top: 104 - i * 18, width: 72, height: 6, borderRadius: 2, backgroundColor: '#3A3A3A' }} />)}
      <Mover p={p} x={[up(18)[0], up(18)[1].map(v => 118 + v)]} y={[up(-18)[0], up(-18)[1].map(v => 84 + v)]} opacity={[[0, 0.94, 0.97, 1], [1, 1, 0, 0]]} size={{ w: 34, h: 40 }}>{img(ICONS.oyuncuKosu, 34, 40)}</Mover>
      <Spot x={L.x} y={L.y} r={20}><T w={700} size={12} color={colors.g200}>{t('talim.left')}</T></Spot>
      <Spot x={R.x} y={R.y} r={20}><T w={700} size={12} color={colors.g200}>{t('talim.right')}</T></Spot>
      {taps.map((a, i) => <Ripple key={i} p={p} x={i % 2 ? R.x : L.x} y={i % 2 ? R.y : L.y} at={a} />)}
      <Hand
        p={p}
        x={[[0, 0.12, 0.2, 0.3, 0.37, 0.45, 0.55, 0.62, 0.7, 0.8, 0.87, 0.95, 1], [L.x, L.x, L.x, R.x, R.x, R.x, L.x, L.x, L.x, R.x, R.x, R.x, L.x]]}
        y={[[0, 0.08, 0.12, 0.17, 0.33, 0.37, 0.42, 0.58, 0.62, 0.67, 0.83, 0.87, 0.92, 1], [156, 156, L.y, 156, 156, R.y, 156, 156, L.y, 156, 156, R.y, 156, 156]]}
      />
    </>
  );
}

// Omuz oku: Kerem leans one way and the ring closes on that side; tap it.
function OmuzDemo() {
  const p = useLoop(3000);
  const L = { x: 56, y: 136 }, R = { x: 224, y: 136 };
  return (
    <>
      <Spot x={L.x} y={L.y} />
      <Spot x={R.x} y={R.y} />
      <Mover p={p} x={[[0, 0.1, 0.3, 0.45, 0.55, 0.6, 0.8, 0.95, 1], [140, 140, 156, 156, 140, 140, 124, 124, 140]]} y={78} rotate={[[0, 0.1, 0.3, 0.45, 0.55, 0.6, 0.8, 0.95, 1], [0, 0, 14, 14, 0, 0, -14, -14, 0]]} size={{ w: 96, h: 128 }}>
        {img(KEREM, 96, 128)}
      </Mover>
      <Closing p={p} x={R.x} y={R.y} from={0.1} to={0.32} />
      <Closing p={p} x={L.x} y={L.y} from={0.6} to={0.82} />
      <Ripple p={p} x={R.x} y={R.y} at={0.32} />
      <Ripple p={p} x={L.x} y={L.y} at={0.82} />
      <Hand
        p={p}
        x={[[0, 0.1, 0.45, 0.6, 0.95, 1], [L.x, R.x, R.x, L.x, L.x, L.x]]}
        y={[[0, 0.28, 0.32, 0.37, 0.78, 0.82, 0.87, 1], [158, 158, R.y, 158, 158, L.y, 158, 158]]}
      />
    </>
  );
}

/** The match's timing ring as 12 dots around a button: they light one by one, white in the sweet zone. */
function RingDots({ p, x, y, from, step, lit }: { p: SharedValue<number>; x: number; y: number; from: number; step: number; lit: number }) {
  return (
    <>
      {Array.from({ length: 12 }, (_, i) => {
        const a = -Math.PI / 2 + (i / 12) * Math.PI * 2;
        const on = from + i * step;
        const color = i >= 7 && i <= 10 ? colors.g100 : i > 10 ? colors.bad : colors.l600;
        const dx = x + Math.cos(a) * 33, dy = y + Math.sin(a) * 33;
        if (i >= lit) return <View key={i} style={{ position: 'absolute', left: dx - 4, top: dy - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.g400, opacity: 0.4 }} />;
        return (
          <Mover key={i} p={p} x={dx} y={dy} size={{ w: 8, h: 8 }} opacity={[[on - 0.001, on, 0.86, 0.9], [0.25, 1, 1, 0.25]]}>
            <View style={{ flex: 1, borderRadius: 4, backgroundColor: color }} />
          </Mover>
        );
      })}
    </>
  );
}

const Btn = ({ x, y, r = 22, lime, children }: { x: number; y: number; r?: number; lime?: boolean; children: ReactNode }) => (
  <View style={{ position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: r, backgroundColor: lime ? colors.l600 : colors.s3, alignItems: 'center', justifyContent: 'center' }}>
    {children}
  </View>
);

// Match shot: tap a corner of the goal, hold ŞUT while the ring fills, let go on white.
function MacSutDemo() {
  const p = useLoop(3800);
  const corner = { x: 88, y: 34 }, ball = { x: 104, y: 136 }, btn = { x: 206, y: 150 };
  return (
    <>
      <View style={{ position: 'absolute', left: 66, top: 18, width: 148, height: 62, borderWidth: 3, borderBottomWidth: 0, borderColor: colors.g100, backgroundColor: 'rgba(255,255,255,.04)' }} />
      {[0, 1, 2, 3].map(i => <View key={i} style={{ position: 'absolute', left: 69, top: 32 + i * 12, width: 142, height: 1, backgroundColor: 'rgba(255,255,255,.12)' }} />)}
      <Mover p={p} x={[[0, 0.62, 0.72], [140, 140, 166]]} y={58} rotate={[[0.62, 0.72], [0, 40]]} size={{ w: 26, h: 40 }}>{img(ICONS.oyuncu, 26, 40)}</Mover>
      <Mover p={p} x={corner.x} y={corner.y} size={{ w: 26, h: 26 }} opacity={[[0.13, 0.14, 0.86, 0.9], [0, 1, 1, 0]]}>
        <View style={{ flex: 1, borderRadius: 13, borderWidth: 3, borderColor: colors.l600 }} />
      </Mover>
      <Ripple p={p} x={corner.x} y={corner.y} at={0.14} />
      <Mover p={p} x={[[0.58, 0.7], [ball.x, corner.x]]} y={[[0.58, 0.7], [ball.y, corner.y]]} scale={[[0.58, 0.7], [1, 0.6]]} opacity={[[0, 0.86, 0.9], [1, 1, 0]]} size={{ w: 24, h: 24 }}>{img(ICONS.ball, 24)}</Mover>
      <Btn x={btn.x} y={btn.y} lime><T w={700} size={13} color={colors.ink} style={{ fontStyle: 'italic' }}>{t('m3.shoot')}</T></Btn>
      <RingDots p={p} x={btn.x} y={btn.y} from={0.32} step={0.025} lit={10} />
      <Mover p={p} x={140} y={104} size={{ w: 120, h: 40 }} opacity={[[0.72, 0.74, 0.88, 0.92], [0, 1, 1, 0]]} scale={[[0.72, 0.78], [0.5, 1]]}>
        <T w={700} size={30} color={colors.l600} style={{ textAlign: 'center', fontStyle: 'italic' }}>{t('m3.big.goal')}</T>
      </Mover>
      <Hand
        p={p}
        x={[[0, 0.12, 0.16, 0.28, 0.56, 0.66], [140, corner.x, corner.x, btn.x, btn.x, btn.x + 10]]}
        y={[[0, 0.1, 0.14, 0.18, 0.28, 0.3, 0.56, 0.66], [180, 50, corner.y, 50, 166, btn.y, btn.y, 176]]}
        opacity={[[0, 0.06, 0.6, 0.68], [0, 1, 1, 0]]}
      />
    </>
  );
}

// Match pass: the red ring is the marked mate; tap the free one while the ring is white.
function MacPasDemo() {
  const p = useLoop(3200);
  const L = { x: 76, y: 64 }, R = { x: 204, y: 64 }, bL = { x: 76, y: 156 }, bR = { x: 204, y: 156 };
  return (
    <>
      <Mover p={p} x={L.x} y={L.y} size={{ w: 30, h: 44 }}>{img(ICONS.oyuncu, 30, 44)}</Mover>
      <Mover p={p} x={L.x + 22} y={L.y + 4} size={{ w: 28, h: 40 }}>{img(KEREM, 28, 40)}</Mover>
      <View style={{ position: 'absolute', left: L.x - 30, top: L.y - 30, width: 60, height: 60, borderRadius: 30, borderWidth: 2.5, borderColor: colors.bad }} />
      <Mover p={p} x={R.x} y={R.y} size={{ w: 30, h: 44 }}>{img(ICONS.oyuncu, 30, 44)}</Mover>
      <Mover p={p} x={[[0.46, 0.62], [140, R.x]]} y={[[0.46, 0.62], [120, R.y + 18]]} opacity={[[0, 0.86, 0.9], [1, 1, 0]]} size={{ w: 20, h: 20 }}>{img(ICONS.ball, 20)}</Mover>
      <Btn x={bL.x} y={bL.y}><T w={700} size={11}>CAN</T></Btn>
      <Btn x={bR.x} y={bR.y}><T w={700} size={11}>MERT</T></Btn>
      <RingDots p={p} x={bR.x} y={bR.y} from={0.12} step={0.03} lit={9} />
      <Ripple p={p} x={bR.x} y={bR.y} at={0.42} />
      <Hand
        p={p}
        x={[[0, 0.2, 0.6], [150, bR.x, bR.x]]}
        y={[[0, 0.2, 0.38, 0.42, 0.48], [196, 176, 176, bR.y, 174]]}
        opacity={[[0, 0.12, 0.6, 0.7], [0, 1, 1, 0]]}
      />
    </>
  );
}

// Match defense: the attacker drops a shoulder; slide that way while the ring is white.
function MacSavunmaDemo() {
  const p = useLoop(3200);
  const bL = { x: 76, y: 156 }, bR = { x: 204, y: 156 };
  return (
    <>
      <Mover p={p} x={[[0, 0.1, 0.36, 0.5, 0.62], [140, 140, 156, 156, 182]]} y={64} rotate={[[0, 0.1, 0.36, 0.62], [0, 0, 14, 14]]} size={{ w: 76, h: 100 }}>
        {img(KEREM, 76, 100)}
      </Mover>
      <Btn x={bL.x} y={bL.y}><T w={700} size={12}>{t('m3.left')}</T></Btn>
      <Btn x={bR.x} y={bR.y}><T w={700} size={12}>{t('m3.right')}</T></Btn>
      <RingDots p={p} x={bR.x} y={bR.y} from={0.12} step={0.03} lit={9} />
      <Ripple p={p} x={bR.x} y={bR.y} at={0.42} />
      <Mover p={p} x={140} y={110} size={{ w: 160, h: 40 }} opacity={[[0.46, 0.48, 0.8, 0.86], [0, 1, 1, 0]]} scale={[[0.46, 0.52], [0.5, 1]]}>
        <T w={700} size={26} color={colors.l600} style={{ textAlign: 'center', fontStyle: 'italic' }}>{t('m3.big.stopped')}</T>
      </Mover>
      <Hand
        p={p}
        x={[[0, 0.2, 0.6], [150, bR.x, bR.x]]}
        y={[[0, 0.2, 0.38, 0.42, 0.48], [196, 176, 176, bR.y, 174]]}
        opacity={[[0, 0.12, 0.6, 0.7], [0, 1, 1, 0]]}
      />
    </>
  );
}

const DEMOS: Record<HowToKind, () => ReactNode> = {
  sut: TenekeDemo, pas: PasDemo, hiz: KosDemo, fizik: MerdivenDemo, omuz: OmuzDemo, mShot: MacSutDemo, mPass: MacPasDemo, mDefense: MacSavunmaDemo,
};

/** The game's two or three steps as numbered chips (the demo card and the countdown show them). */
export function HowToSteps({ drill }: { drill: HowToKind }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
      {Array.from({ length: STEPS[drill] }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingLeft: 6, paddingRight: 14, borderRadius: 20, backgroundColor: colors.s2 }}>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.l600, alignItems: 'center', justifyContent: 'center' }}>
            <T w={700} size={14} color={colors.ink}>{i + 1}</T>
          </View>
          <T w={700} size={15}>{t(`howto.${drill}.${i + 1}` as Key)}</T>
        </View>
      ))}
    </View>
  );
}

/** The demo card shown before a game's first round; also opened from the "?" button. */
export function HowTo({ drill, name, onDone, style }: { drill: HowToKind; name: string; onDone(): void; style?: ViewStyle }) {
  const Demo = DEMOS[drill];
  return (
    <View style={[{ alignItems: 'center', gap: 18, paddingHorizontal: 20 }, style]}>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <T w={600} size={13} color={colors.l600} style={{ letterSpacing: 1.2 }}>{t('howto.title').toLocaleUpperCase('tr')}</T>
        <T w={700} size={24} accessibilityRole="header">{name}</T>
      </View>
      <View
        accessible accessibilityRole="image" accessibilityLabel={t(`howto.${drill}` as Key)}
        style={{ width: W, height: H, borderRadius: 22, overflow: 'hidden', backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line }}
      >
        <Demo />
      </View>
      <HowToSteps drill={drill} />
      <Cta style={{ alignSelf: 'stretch', marginTop: 6 }} onPress={onDone} accessibilityLabel={t('howto.ok')}>
        <T w={700} size={17} color={colors.ink}>{t('howto.ok')}</T>
      </Cta>
    </View>
  );
}
