import type { DefenseOutcome, Side } from '@streetborn/engine';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';

import { colors } from '../theme.ts';

// A defense moment seen from behind the player: the forward runs at you with the
// ball. His shoulder drops to the side he is about to go; that is the cue to read.
// viewBox 390×560 like ShotScene; our goal is behind the camera.

export interface DefenseSceneHandle {
  /** Plays the duel: the forward goes `attack`, the player slides `slide`. */
  animate(outcome: DefenseOutcome, attack: Side, slide: Side): Promise<void>;
}

interface Props { attackSide: Side }

const FWD = { x: 195, y: 250 };
const DEF = { x: 195, y: 430 };
const sign = (s: Side) => (s === 'left' ? -1 : 1);

export const DefenseScene = forwardRef<DefenseSceneHandle, Props>(function DefenseScene({ attackSide }, ref) {
  const [fwd, setFwd] = useState(FWD);
  const [def, setDef] = useState({ ...DEF, rot: 0 });
  const [ball, setBall] = useState({ x: FWD.x + 10 * sign(attackSide), y: FWD.y + 44 });
  const raf = useRef(0);

  const run = (dur: number, frame: (e: number) => void) => new Promise<void>(resolve => {
    cancelAnimationFrame(raf.current);
    const t0 = Date.now();
    const step = () => {
      const k = Math.min(1, (Date.now() - t0) / dur);
      frame(1 - Math.pow(1 - k, 2));
      if (k < 1) raf.current = requestAnimationFrame(step);
      else resolve();
    };
    raf.current = requestAnimationFrame(step);
  });

  useImperativeHandle(ref, () => ({
    async animate(outcome, attack, slide) {
      const ax = sign(attack) * 110, sx = sign(slide) * 90;
      // The duel: both go, the ball stays at the forward's feet.
      await run(520, e => {
        const f = { x: FWD.x + ax * e, y: FWD.y + 150 * e };
        setFwd(f);
        setDef({ x: DEF.x + sx * e, y: DEF.y - 20 * e, rot: sign(slide) * 65 * e });
        setBall({ x: f.x + 10 * sign(attack), y: f.y + 44 });
      });
      const from = { x: FWD.x + ax + 10 * sign(attack), y: FWD.y + 194 };
      const to = outcome === 'stopped' ? { x: DEF.x + sx, y: DEF.y + 30 }
        : outcome === 'conceded' ? { x: FWD.x + ax * 0.4, y: 600 }
          : { x: FWD.x + sign(attack) * 260, y: 600 };
      await run(420, e => setBall({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e }));
      await new Promise(r => setTimeout(r, 200));
    },
  }));

  const lean = sign(attackSide) * 14;
  return (
    <View style={{ flex: 1, overflow: 'hidden' }} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 390 560" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="dGrass" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#1B331B" /><Stop offset="1" stopColor="#244A23" />
          </LinearGradient>
        </Defs>
        <Rect width={390} height={560} fill="url(#dGrass)" />
        {[0, 1, 2, 3, 4, 5].map(i => (
          <Polygon key={i} points={`0,${40 + i * 92} 390,${40 + i * 92} 390,${86 + i * 92} 0,${86 + i * 92}`} fill="#FFF" opacity={0.025} />
        ))}
        <G stroke="#FFF" strokeOpacity={0.5} strokeWidth={2} fill="none">
          <Line x1={0} y1={120} x2={390} y2={120} />
          <Circle cx={195} cy={120} r={60} />
          <Path d="M40,560 L80,470 L310,470 L350,560" />
        </G>

        {/* The forward: away shirt, torso leaning to the side he will take. */}
        <G transform={`translate(${fwd.x},${fwd.y})`}>
          <Ellipse cx={0} cy={44} rx={18} ry={4} fill="#000" opacity={0.3} />
          <Rect x={-9} y={10} width={7} height={32} rx={3} fill="#C9D6F0" />
          <Rect x={2} y={10} width={7} height={32} rx={3} fill="#C9D6F0" />
          <G transform={`rotate(${lean} 0 10)`}>
            <Rect x={-13} y={-26} width={26} height={38} rx={9} fill={colors.awayCrest} />
            <Rect x={-26} y={-24 + (lean < 0 ? 6 : 0)} width={15} height={7} rx={3} fill={colors.awayCrest} />
            <Rect x={11} y={-24 + (lean > 0 ? 6 : 0)} width={15} height={7} rx={3} fill={colors.awayCrest} />
            <Circle cy={-36} r={10} fill="#C9A27E" />
          </G>
        </G>

        {/* The player, seen from behind. */}
        <G transform={`translate(${def.x},${def.y}) rotate(${def.rot})`}>
          <Ellipse cx={0} cy={46} rx={20} ry={5} fill="#000" opacity={0.35} />
          <Rect x={-10} y={12} width={8} height={34} rx={3} fill={colors.l500} />
          <Rect x={2} y={12} width={8} height={34} rx={3} fill={colors.l500} />
          <Rect x={-15} y={-28} width={30} height={42} rx={10} fill={colors.l900} />
          <Circle cy={-40} r={11} fill="#3B2A20" />
        </G>

        <G transform={`translate(${ball.x},${ball.y})`}>
          <Circle r={9} fill="#FFFFFF" stroke="#1A1A1A" strokeWidth={1.2} />
          <Path d="M0-4 L3.8-1.3 L2.4 3.3 L-2.4 3.3 L-3.8-1.3Z" fill="#1A1A1A" />
        </G>
      </Svg>
    </View>
  );
});
