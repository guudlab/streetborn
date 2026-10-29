import { PAS_BEATS, pasBeats, pasGoodWindow, pasJudge, pasPoints, type Tap } from '@streetborn/economy';
import { Image } from 'expo-image';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Defs, Path, Pattern, Rect } from 'react-native-svg';

import { sfx } from '../../audio/audio.ts';
import { t } from '../../i18n/index.ts';
import { colors } from '../../theme.ts';
import { buzz, T } from '../kit.tsx';
import { ICONS } from '../sade.tsx';
import { Flash, PRESS_AT_ONCE, useGameClock, type DrillGameHandle, type DrillGameProps } from './common.tsx';

// Duvar pası (passing): the ball comes back off the garage wall to the left or
// the right foot. Tap that side as the ring closes on it. The beat speeds up and
// the points multiply every six passes; the first miss ends the run.

const WALL = 120;
const BALL = 30;
/** The closing ring shows this long before the beat. */
const RING_MS = 700;
/** Taps this early are ignored instead of counting as a miss. */
const EARLY_IGNORE_MS = 400;

export const DuvarPasi = forwardRef<DrillGameHandle, DrillGameProps>(function DuvarPasi({ seed, tier, running, onScore, onDone }, ref) {
  const beats = useMemo(() => pasBeats(seed, tier), [seed, tier]);
  const good = pasGoodWindow(tier);
  const { now, at } = useGameClock(running);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [idx, setIdx] = useState(0);
  const [over, setOver] = useState<'miss' | 'done' | null>(null);
  const [flash, setFlash] = useState<{ text: string; side: 0 | 1; color: string } | null>(null);
  const taps = useRef<Tap[]>([]);
  const missAt = useRef(0);
  // Taps can come faster than renders: the logic reads these.
  const live = useRef({ idx: 0, score: 0, over: false });

  useImperativeHandle(ref, () => ({ inputs: () => taps.current }), []);

  const end = (kind: 'miss' | 'done') => {
    live.current.over = true;
    setOver(kind);
    missAt.current = at();
    sfx(kind === 'done' ? 'unlock' : 'error');
    if (kind === 'miss') buzz('medium');
    setTimeout(() => onDone(taps.current), 900);
  };

  // A beat left alone is a miss too.
  useEffect(() => {
    const { idx: i, over: done } = live.current;
    if (!running || done || i >= beats.length) return;
    if (now > beats[i]!.t + good) {
      setFlash({ text: t('talim.miss'), side: beats[i]!.s, color: colors.bad });
      end('miss');
    }
  }, [now]);

  const press = (s: 0 | 1) => {
    const { idx, score, over: done } = live.current;
    if (!running || done || idx >= beats.length) return;
    const tap: Tap = { t: at(), s };
    const beat = beats[idx]!;
    if (tap.t < beat.t - EARLY_IGNORE_MS) return;
    taps.current.push(tap);
    const j = pasJudge(beat, tap, tier);
    if (j === 'miss') {
      setFlash({ text: t('talim.miss'), side: s, color: colors.bad });
      end('miss');
      return;
    }
    const next = score + pasPoints(idx, j);
    live.current.score = next;
    live.current.idx = idx + 1;
    onScore(next);
    sfx(j === 'perfect' ? 'kick_power' : 'kick');
    if (j === 'perfect') buzz('light');
    const mult = 1 + Math.trunc(idx / 6);
    setFlash({ text: `${t(j === 'perfect' ? 'talim.perfect' : 'talim.good')}${mult > 1 ? ` ×${mult}` : ''}`, side: s, color: j === 'perfect' ? colors.l600 : colors.g100 });
    setIdx(idx + 1);
    if (idx + 1 >= beats.length) end('done');
  };

  const ready = size.w > 0;
  const footY = size.h - 130;
  const foot = (s: 0 | 1) => ({ x: size.w * (s ? 0.72 : 0.28), y: footY });
  const wall = { x: size.w / 2, y: WALL + 18 };

  // The ball goes foot → wall → the next foot, landing exactly on the beat.
  let ball = wall, scale = 0.7;
  if (ready) {
    const i = Math.min(idx, beats.length - 1);
    const t0 = i === 0 ? 0 : beats[i - 1]!.t, t1 = beats[i]!.t;
    const from = i === 0 ? wall : foot(beats[i - 1]!.s), to = foot(beats[i]!.s);
    const clock = over ? missAt.current : now;
    const u = Math.max(0, Math.min(1.25, (clock - t0) / (t1 - t0)));
    const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, f: number) => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
    if (over === 'miss') ball = { x: to.x + (to.x - wall.x) * 0.4, y: size.h - 40 };
    else if (i === 0 && u < 0.5) ball = wall;
    else if (u < 0.5) { ball = lerp(from, wall, u / 0.5); scale = 1 - 0.3 * (u / 0.5); }
    else { ball = lerp(wall, to, (u - 0.5) / 0.5); scale = 0.7 + 0.3 * ((u - 0.5) / 0.5); }
  }
  const beat = beats[idx];
  const ringLeft = beat ? beat.t - now : 0;
  const ring = beat && running && !over && ringLeft < RING_MS ? Math.max(0, ringLeft) / RING_MS : null;
  const mult = 1 + Math.trunc(Math.min(idx, PAS_BEATS - 1) / 6);

  return (
    <View style={{ flex: 1 }} onLayout={e => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {ready && (
        <>
          <Svg width={size.w} height={size.h} style={{ position: 'absolute' }}>
            <Defs>
              <Pattern id="brick2" width={52} height={26} patternUnits="userSpaceOnUse">
                <Rect width={52} height={26} fill="#2A2421" />
                <Path d="M0 0.5H52M0 13.5H52M13 0V13M39 13V26" stroke="#1F1A18" strokeWidth={2} />
              </Pattern>
            </Defs>
            <Rect x={0} y={0} width={size.w} height={WALL} fill="url(#brick2)" />
            {/* The garage door in the middle of the wall. */}
            <Rect x={size.w * 0.3} y={18} width={size.w * 0.4} height={WALL - 18} fill="#3A3A3A" />
            <Path d={[30, 50, 70, 90].map(y => `M${size.w * 0.3} ${y}H${size.w * 0.7}`).join('')} stroke="#2E2E2E" strokeWidth={3} />
            <Rect x={0} y={WALL} width={size.w} height={size.h - WALL} fill="#161616" />
            <Rect x={0} y={WALL} width={size.w} height={6} fill="#2E2E2E" />
            {([0, 1] as const).map(s => {
              const f = foot(s);
              const next = beat?.s === s && !over;
              return <Circle key={s} cx={f.x} cy={f.y} r={34} fill={next ? 'rgba(207,253,92,.10)' : 'rgba(255,255,255,.05)'} stroke={next ? colors.l700 : colors.line} strokeWidth={2} />;
            })}
            {ring !== null && beat && (
              <Circle
                cx={foot(beat.s).x} cy={foot(beat.s).y} r={34 + ring * 60}
                stroke={Math.abs(beat.t - now) <= good ? colors.l600 : colors.g100} strokeWidth={3} fill="none" opacity={0.4 + 0.6 * (1 - ring)}
              />
            )}
          </Svg>

          <View pointerEvents="none" style={{ position: 'absolute', left: size.w / 2 - 60, top: footY - 150, width: 120, height: 150 }}>
            <Image source={ICONS.oyuncu} style={{ width: '100%', height: '100%' }} contentFit="contain" />
          </View>
          <View pointerEvents="none" style={{ position: 'absolute', left: ball.x - (BALL * scale) / 2, top: ball.y - (BALL * scale) / 2, width: BALL * scale, height: BALL * scale }}>
            <Image source={ICONS.ball} style={{ width: '100%', height: '100%' }} contentFit="contain" />
          </View>

          <View style={{ position: 'absolute', right: 12, top: WALL + 14, alignItems: 'flex-end', gap: 2 }}>
            <T w={700} size={22} color={mult > 1 ? colors.l600 : colors.g200}>×{mult}</T>
            <T w={600} size={12} color={colors.g200}>{Math.min(idx, PAS_BEATS)} / {PAS_BEATS}</T>
          </View>
          {flash && <Flash text={flash.text} color={flash.color} x={foot(flash.side).x} y={footY - 64} />}

          {/* Two big halves: the left foot and the right foot. */}
          <View style={{ position: 'absolute', left: 0, right: 0, top: WALL, bottom: 0, flexDirection: 'row' }}>
            {([0, 1] as const).map(s => (
              <Pressable
                key={s} onPressIn={() => press(s)} {...PRESS_AT_ONCE} style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 24 }}
                accessibilityRole="button" accessibilityLabel={t(s ? 'talim.right' : 'talim.left')}
              >
                <T w={600} size={14} color={colors.g300}>{t(s ? 'talim.right' : 'talim.left')}</T>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </View>
  );
});
