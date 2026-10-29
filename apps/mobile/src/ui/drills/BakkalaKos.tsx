import { KOS_LANES, KOS_LIVES, KOS_OBSTACLES, KOS_SWITCH_MS, kosAdvance, kosObstacles, kosStart, type KosRun, type Move } from '@streetborn/economy';
import { Image } from 'expo-image';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import AnimatedR from 'react-native-reanimated';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { sfx } from '../../audio/audio.ts';
import { t } from '../../i18n/index.ts';
import { colors } from '../../theme.ts';
import { buzz, T } from '../kit.tsx';
import { ICONS } from '../sade.tsx';
import { useShake } from '../motion.tsx';
import { Flash, PRESS_AT_ONCE, useGameClock, type DrillGameHandle, type DrillGameProps } from './common.tsx';

// Bakkala koş (pace): run down the mahalle street to the corner shop. Things
// come down the three lanes; tap left or right to switch lanes in time. The
// third bump ends the run.

/** How long an obstacle is on screen before it reaches the runner, by tier. */
const LEAD_MS = [1400, 1250, 1100] as const;
const PLAYER_FROM_BOTTOM = 120;
const SIZE = 52;

export const BakkalaKos = forwardRef<DrillGameHandle, DrillGameProps>(function BakkalaKos({ seed, tier, running, onScore, onDone }, ref) {
  const obstacles = useMemo(() => kosObstacles(seed, tier), [seed, tier]);
  const { now, at } = useGameClock(running);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [run, setRun] = useState<KosRun>(kosStart);
  const [flash, setFlash] = useState<string | null>(null);
  const moves = useRef<Move[]>([]);
  const lane = useRef(1);
  const laneX = useRef(new Animated.Value(1)).current;
  const done = useRef(false);
  const shake = useShake(8);

  useImperativeHandle(ref, () => ({ inputs: () => moves.current }), []);

  useEffect(() => {
    if (!running || run.over) return;
    const next = kosAdvance(obstacles, moves.current, run, now);
    if (next.next === run.next) return;
    if (next.hits > run.hits) { sfx('error'); buzz('medium'); shake.shake(); setFlash(t('talim.bump')); setTimeout(() => setFlash(null), 600); }
    if (next.passed > run.passed) onScore(next.passed);
    setRun(next);
    if (next.over && !done.current) {
      done.current = true;
      if (next.hits < KOS_LIVES) sfx('unlock');
      setTimeout(() => onDone(moves.current), 800);
    }
  }, [now]);

  const move = (d: -1 | 1) => {
    if (!running || done.current) return;
    moves.current.push({ t: at(), d });
    lane.current = Math.max(0, Math.min(KOS_LANES - 1, lane.current + d));
    Animated.timing(laneX, { toValue: lane.current, duration: KOS_SWITCH_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  };

  const ready = size.w > 0;
  const laneW = Math.min(110, size.w * 0.28);
  const cx = (l: number) => size.w / 2 + (l - 1) * laneW;
  const playerY = size.h - PLAYER_FROM_BOTTOM;
  const speed = (playerY + SIZE) / LEAD_MS[tier];
  const last = obstacles[obstacles.length - 1]!;
  // Dashes on the road scroll with the run.
  const dashOffset = (now * speed) % 60;
  const shopY = playerY - (last.t + 700 - now) * speed - 70;

  return (
    <View style={{ flex: 1 }} onLayout={e => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {ready && (
        <AnimatedR.View style={[{ flex: 1 }, shake.style]}>
          <Svg width={size.w} height={size.h} style={{ position: 'absolute' }}>
            <Rect x={0} y={0} width={size.w} height={size.h} fill="#1A1A1A" />
            <Rect x={0} y={0} width={cx(0) - laneW / 2} height={size.h} fill="#242424" />
            <Rect x={cx(2) + laneW / 2} y={0} width={size.w} height={size.h} fill="#242424" />
            {[0.5, 1.5].map(l => (
              <Path
                key={l} d={`M${cx(l)} ${-60 + dashOffset}V${size.h}`}
                stroke="rgba(255,255,255,.14)" strokeWidth={3} strokeDasharray="26 34"
              />
            ))}
            {/* The corner shop at the end of the street. */}
            {now > last.t - LEAD_MS[tier] && (
              <Rect x={cx(0) - laneW / 2} y={shopY} width={laneW * 3} height={46} rx={8} fill={colors.l900} stroke={colors.l600} strokeWidth={2} />
            )}
            {obstacles.map((o, j) => {
              const y = playerY - (o.t - now) * speed;
              if (y < -SIZE || y > size.h + SIZE || j < run.next - 3) return null;
              return o.lanes.map(l => <ObstacleShape key={`${j}-${l}`} look={o.look} x={cx(l)} y={y} />);
            })}
          </Svg>
          {now > last.t - LEAD_MS[tier] && (
            <View pointerEvents="none" style={{ position: 'absolute', left: cx(0) - laneW / 2, width: laneW * 3, top: shopY, height: 46, alignItems: 'center', justifyContent: 'center' }}>
              <T w={700} size={18} color={colors.l500}>{t('talim.bakkal')}</T>
            </View>
          )}

          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute', top: playerY - 36, left: -36, width: 72, height: 72,
              transform: [{ translateX: laneX.interpolate({ inputRange: [0, 1, 2], outputRange: [cx(0), cx(1), cx(2)] }) }],
            }}
          >
            <Image source={ICONS.oyuncuKosu} style={{ width: '100%', height: '100%' }} contentFit="contain" />
          </Animated.View>

          <View style={{ position: 'absolute', right: 12, top: 12, flexDirection: 'row', gap: 4 }} accessibilityLabel={t('talim.lives', { n: KOS_LIVES - run.hits })}>
            {Array.from({ length: KOS_LIVES }, (_, i) => <Heart key={i} on={i < KOS_LIVES - run.hits} />)}
          </View>
          <View style={{ position: 'absolute', left: 12, top: 12 }}>
            <T w={600} size={12} color={colors.g200}>{run.passed} / {KOS_OBSTACLES}</T>
          </View>
          <Flash text={flash} color={colors.bad} x={size.w / 2} y={playerY - 70} />

          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row' }}>
            {([-1, 1] as const).map(d => (
              <Pressable
                key={d} onPressIn={() => move(d)} {...PRESS_AT_ONCE} style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 18 }}
                accessibilityRole="button" accessibilityLabel={t(d > 0 ? 'talim.right' : 'talim.left')}
              >
                <T w={600} size={14} color={colors.g300}>{d > 0 ? `${t('talim.right')} ›` : `‹ ${t('talim.left')}`}</T>
              </Pressable>
            ))}
          </View>
        </AnimatedR.View>
      )}
    </View>
  );
});

/** Crate, bin, cone or a parked bike: simple shapes, one per lane. */
function ObstacleShape({ look, x, y }: { look: number; x: number; y: number }) {
  const h = SIZE / 2;
  switch (look % 4) {
    case 0: return (
      <G>
        <Rect x={x - h} y={y - h} width={SIZE} height={SIZE} rx={4} fill="#6B4A2B" />
        <Path d={`M${x - h} ${y - h}L${x + h} ${y + h}M${x + h} ${y - h}L${x - h} ${y + h}`} stroke="#59391F" strokeWidth={4} />
      </G>
    );
    case 1: return (
      <G>
        <Rect x={x - h + 4} y={y - h} width={SIZE - 8} height={SIZE} rx={6} fill="#4C5A4C" />
        <Rect x={x - h} y={y - h - 4} width={SIZE} height={10} rx={4} fill="#5E6E5E" />
      </G>
    );
    case 2: return (
      <G>
        <Path d={`M${x} ${y - h - 4}L${x + h - 4} ${y + h}H${x - h + 4}Z`} fill="#FF8A3D" />
        <Path d={`M${x - 10} ${y}H${x + 10}`} stroke="#FFFFFF" strokeWidth={5} />
      </G>
    );
    default: return (
      <G>
        <Circle cx={x - 14} cy={y + 8} r={13} stroke="#B4B4B4" strokeWidth={4} fill="none" />
        <Circle cx={x + 14} cy={y + 8} r={13} stroke="#B4B4B4" strokeWidth={4} fill="none" />
        <Path d={`M${x - 14} ${y + 8}L${x - 2} ${y - 12}L${x + 14} ${y + 8}M${x - 6} ${y - 14}H${x + 4}`} stroke={colors.bad} strokeWidth={4} strokeLinecap="round" fill="none" />
      </G>
    );
  }
}

function Heart({ on }: { on: boolean }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.5 3 4.5 6.8 4.5c2.1 0 3.6 1.2 5.2 3 1.6-1.8 3.1-3 5.2-3 3.8 0 5.9 4 4.4 7.3C19.5 16.4 12 21 12 21z" fill={on ? colors.bad : '#3A3A3A'} />
    </Svg>
  );
}
