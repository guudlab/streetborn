import { OMUZ_REACH, OMUZ_REPS, omuzReps, pasGoodWindow, pasJudge, type Tap } from '@streetborn/economy';
import { Image } from 'expo-image';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';

import { sfx } from '../../audio/audio.ts';
import { t } from '../../i18n/index.ts';
import { colors } from '../../theme.ts';
import { buzz, T } from '../kit.tsx';
import { ICONS } from '../sade.tsx';
import { Flash, PRESS_AT_ONCE, useGameClock, type DrillGameHandle, type DrillGameProps } from './common.tsx';

// Omuz oku (defense): Kerem comes at you five times and drops a shoulder to the
// side he is going. Tap that side as the ring closes. Only the first tap near a
// rep counts (the server scores it the same way); a rep left alone is lost.

const KEREM = require('../../../assets/meshy/hero-street-red.webp');
const BALL = 26;
/** Kerem starts leaning and the ring starts closing this long before the rep. */
const RING_MS = 800;

export const Omuz = forwardRef<DrillGameHandle, DrillGameProps>(function Omuz({ seed, tier, running, onScore, onDone }, ref) {
  const reps = useMemo(() => omuzReps(seed, tier), [seed, tier]);
  const good = pasGoodWindow(tier);
  const { now, at } = useGameClock(running);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [idx, setIdx] = useState(0);
  const [flash, setFlash] = useState<{ text: string; side: 0 | 1; color: string } | null>(null);
  const taps = useRef<Tap[]>([]);
  // Taps can come faster than renders: the logic reads these.
  const live = useRef({ idx: 0, score: 0, over: false });

  useImperativeHandle(ref, () => ({ inputs: () => taps.current }), []);

  const next = (i: number) => {
    live.current.idx = i + 1;
    setIdx(i + 1);
    if (i + 1 < reps.length) return;
    live.current.over = true;
    sfx('unlock');
    setTimeout(() => onDone(taps.current), 900);
  };

  // A rep left alone is lost.
  useEffect(() => {
    const { idx: i, over } = live.current;
    if (!running || over || i >= reps.length || now <= reps[i]!.t + OMUZ_REACH) return;
    setFlash({ text: t('talim.miss'), side: reps[i]!.s, color: colors.bad });
    sfx('dribble_past');
    next(i);
  }, [now]);

  const press = (s: 0 | 1) => {
    const { idx: i, score, over } = live.current;
    if (!running || over || i >= reps.length) return;
    const tap: Tap = { t: at(), s };
    const rep = reps[i]!;
    // Too early to be an answer: ignored, like on the server.
    if (Math.abs(tap.t - rep.t) > OMUZ_REACH) return;
    taps.current.push(tap);
    const j = pasJudge(rep, tap, tier);
    if (j === 'miss') {
      setFlash({ text: t('talim.miss'), side: s, color: colors.bad });
      sfx('dribble_past');
      buzz('medium');
    } else {
      live.current.score = score + (j === 'perfect' ? 2 : 1);
      onScore(live.current.score);
      setFlash({ text: t(j === 'perfect' ? 'talim.perfect' : 'talim.good'), side: s, color: j === 'perfect' ? colors.l600 : colors.g100 });
      sfx('ball_steal', j === 'perfect' ? 1 : 0.8);
      if (j === 'perfect') buzz('light');
    }
    next(i);
  };

  const ready = size.w > 0;
  const rep = reps[idx];
  const left = rep ? rep.t - now : 0;
  const ring = rep && running && left < RING_MS ? Math.max(0, left) / RING_MS : null;
  // Kerem leans into the side as the ring closes.
  const lean = rep && ring !== null ? (rep.s ? 1 : -1) * (1 - ring) : 0;
  const markY = size.h - 120;
  const mark = (s: 0 | 1) => size.w * (s ? 0.78 : 0.22);
  const kw = Math.min(240, size.w * 0.56);

  return (
    <View style={{ flex: 1 }} onLayout={e => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {ready && (
        <>
          <Svg width={size.w} height={size.h} style={{ position: 'absolute' }}>
            <Rect x={0} y={0} width={size.w} height={size.h} fill="#161616" />
            <Rect x={size.w / 2 - 1} y={0} width={2} height={size.h} fill="#222" />
            {([0, 1] as const).map(s => {
              const on = rep?.s === s && ring !== null;
              return <Circle key={s} cx={mark(s)} cy={markY} r={34} fill={on ? 'rgba(207,253,92,.10)' : 'rgba(255,255,255,.05)'} stroke={on ? colors.l700 : colors.line} strokeWidth={2} />;
            })}
            {ring !== null && rep && (
              <Circle
                cx={mark(rep.s)} cy={markY} r={34 + ring * 60}
                stroke={Math.abs(rep.t - now) <= good ? colors.l600 : colors.g100} strokeWidth={3} fill="none" opacity={0.4 + 0.6 * (1 - ring)}
              />
            )}
          </Svg>

          <View
            pointerEvents="none"
            style={{
              position: 'absolute', left: size.w / 2 - kw / 2, top: markY - 40 - kw * 1.3, width: kw, height: kw * 1.3,
              transform: [{ translateX: lean * 40 }, { rotate: `${lean * 12}deg` }],
            }}
          >
            <Image source={KEREM} style={{ width: '100%', height: '100%' }} contentFit="contain" />
          </View>
          <View pointerEvents="none" style={{ position: 'absolute', left: size.w / 2 - BALL / 2 + lean * 60, top: markY - 40 - BALL, width: BALL, height: BALL }}>
            <Image source={ICONS.ball} style={{ width: '100%', height: '100%' }} contentFit="contain" />
          </View>

          <View style={{ position: 'absolute', right: 12, top: 14 }}>
            <T w={600} size={12} color={colors.g200}>{Math.min(idx, OMUZ_REPS)} / {OMUZ_REPS}</T>
          </View>
          {flash && <Flash text={flash.text} color={flash.color} x={mark(flash.side)} y={markY - 64} />}

          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row' }}>
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
