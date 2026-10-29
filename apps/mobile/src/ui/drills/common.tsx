import type { DrillInputs, Tier } from '@streetborn/economy';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { DrillKey } from '../../game/rules.ts';
import { colors } from '../../theme.ts';
import { T } from '../kit.tsx';
import { Ico, type IconAsset } from '../sade.tsx';

// Shared pieces of Burak abi's mini games (talim.tsx). The rules and the scoring
// live in packages/economy/src/drills.ts, the same code the server runs; these
// components only draw the game and collect the raw inputs.

/**
 * Spread on game buttons (they fire on onPressIn): react-native-web waits 50 ms
 * before a press starts and drops quicker taps. Native presses start at once
 * and its types don't know the prop.
 */
export const PRESS_AT_ONCE = { delayPressIn: 0 } as object;

export interface DrillGameProps {
  seed: number;
  tier: Tier;
  /** False during the countdown: the scene shows but nothing moves. */
  running: boolean;
  /** The live score, for the star track. */
  onScore(score: number): void;
  /** The game is over; these inputs go to the server. */
  onDone(inputs: DrillInputs): void;
}

export interface DrillGameHandle {
  /** What the player did so far (the close button ends the game early). */
  inputs(): DrillInputs;
}

/**
 * Milliseconds since the game started, refreshed every frame while running.
 * `at()` reads the clock at the moment of a touch, which is what gets sent.
 */
export function useGameClock(running: boolean) {
  const start = useRef<number | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!running) return;
    if (start.current === null) start.current = Date.now();
    let raf = 0;
    const tick = () => {
      setNow(Date.now() - start.current!);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);
  const at = useCallback(() => (start.current === null ? 0 : Date.now() - start.current), []);
  return { now, at };
}

const STAR = 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.3l-5.9 3.2 1.2-6.5L2.5 9.4l6.6-.9z';

export function Star({ size = 22, on, color }: { size?: number; on: boolean; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      <Path d={STAR} fill={color ?? (on ? colors.l600 : '#3A3A3A')} />
    </Svg>
  );
}

/** The live score on a track with the three star marks; fills as the score grows. */
export function StarTrack({ score, stars, left, right }: { score: number; stars: [number, number, number]; left: string; right: string }) {
  const max = stars[2];
  const fill = Math.min(1, score / max);
  return (
    <View style={{ gap: 8 }} accessible accessibilityLabel={`${left}. ${right}`}>
      <View style={{ height: 22, justifyContent: 'center' }}>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.s3, overflow: 'hidden' }}>
          <View style={{ width: `${fill * 100}%`, height: '100%', backgroundColor: colors.l600 }} />
        </View>
        {stars.map((s, i) => (
          <View key={i} style={{ position: 'absolute', left: `${(s / max) * 100}%`, marginLeft: i === 2 ? -22 : -11 }}>
            <Star size={22} on={score >= s} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T w={600} size={13} color={colors.g100}>{left}</T>
        <T w={500} size={13} color={colors.g200}>{right}</T>
      </View>
    </View>
  );
}

/** A short word that pops up where something happened (Mükemmel, Çarptın…). */
export function Flash({ text, color = colors.l600, x, y }: { text: string | null; color?: string; x: number; y: number }) {
  if (!text) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: x - 90, top: y - 14, width: 180, alignItems: 'center' }}>
      <T w={700} size={18} color={color} accessibilityLiveRegion="polite">{text}</T>
    </View>
  );
}

export const DRILL_ICON: Record<DrillKey, IconAsset> = { sut: 'sut', pas: 'pas', hiz: 'hiz', fizik: 'fizik', omuz: 'calim' };

/** Bronze, silver and gold usta badge for a drill record; level 0 is the empty slot. Shows the drill's icon when given. */
const BADGE_METAL = ['#3A3A3A', '#C98A4B', '#C9CED6', '#F2C94C'] as const;
export function Badge({ level, size = 28, drill }: { level: 0 | 1 | 2 | 3; size?: number; drill?: DrillKey }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: BADGE_METAL[level], backgroundColor: level ? 'rgba(255,255,255,.06)' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      {drill ? <Ico name={DRILL_ICON[drill]} size={size * 0.66} dim={!level} /> : <Star size={size * 0.62} on={level > 0} color={BADGE_METAL[level]} />}
    </View>
  );
}
