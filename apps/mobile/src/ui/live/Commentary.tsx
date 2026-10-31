import type { MatchEvent, Moment } from '@streetborn/engine';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';

import { sfx } from '../../audio/audio.ts';
import { burakLine, eventLine, eventsBetween } from '../../game/live.ts';
import type { LiveMatch } from '../../game/store.ts';
import { t } from '../../i18n/index.ts';
import { colors } from '../../theme.ts';
import { Icon, type IconName } from '../Icon.tsx';
import { buzz, T, wait } from '../kit.tsx';
import { useReduceMotion } from '../motion.tsx';

// The live match between the player's moments: the clock runs, a small top-down pitch shows
// who is attacking, and one short line tells each thing that happens. The player can run
// it three times faster or jump to his next moment.

export interface FeedLine {
  id: number; minute: number; text: string; tone: 'us' | 'them' | 'me' | 'info'; icon: IconName | 'card';
  /** Who had the attack, for the momentum bar. */
  team?: 'us' | 'them';
}

/** Game minute length at 1×, ms. 90 minutes of commentary take about 45 s. */
const MINUTE_MS = 500;
/** Extra time a line stays on screen before the clock moves on, ms at 1×. */
const HOLD_MS = { goal: 1500, other: 450 } as const;

/** The speed the player picked last; kept for the next stretch and the next match. */
let speedPref: 1 | 3 = 1;

let lineId = 0;
export const feedLine = (minute: number, text: string, tone: FeedLine['tone'], icon: FeedLine['icon'], team?: FeedLine['team']): FeedLine =>
  ({ id: ++lineId, minute, text, tone, icon, team });

const EVENT_ICON: Record<MatchEvent['kind'], FeedLine['icon']> = {
  goal: 'ball', save: 'shield', miss: 'x', post: 'x', corner: 'chev', card: 'card', offside: 'whistle',
  win: 'chev', counter: 'bolt', attack: 'chev', foul: 'whistle', penalty: 'whistle', run: 'chev', space: 'chev', lost: 'x',
};
/** Steps of an attack, not finishes: they move the ball but not the momentum bar of engine 4. */
const STEP: ReadonlySet<MatchEvent['kind']> = new Set(['card', 'offside', 'win', 'counter', 'attack', 'foul', 'penalty', 'run', 'space', 'lost']);
const CENTER = { x: 0.5, y: 0.5 };

export interface CommentaryProps {
  match: LiveMatch;
  /** Last minute already told (the moment just played, or 0 at kick-off). */
  from: number;
  /** Where the clock stops: the next moment's minute, or 91 at full time. */
  to: number;
  /** The moment waiting at `to`; null at full time. */
  next: Moment | null;
  feed: FeedLine[];
  paused: boolean;
  onLine(line: FeedLine): void;
  onClock(minute: number): void;
  onArrive(): void;
}

export function Commentary({ match, from, to, next, feed, paused, onLine, onClock, onArrive }: CommentaryProps) {
  const reduce = useReduceMotion();
  const [speed, setSpeed] = useState<1 | 3>(speedPref);
  const [arrived, setArrived] = useState(false);
  const speedRef = useRef(speed);
  const skip = useRef(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  speedRef.current = speed;
  const [ball, setBall] = useState(CENTER);
  const [owner, setOwner] = useState<'us' | 'them' | null>(null);
  const [clock, setClock] = useState(from);

  const events = useMemo(() => eventsBetween(match.plan, from, to), [match.plan, from, to]);
  const handlers = useRef({ onLine, onClock, onArrive });
  handlers.current = { onLine, onClock, onArrive };

  useEffect(() => {
    let cancelled = false;
    const tick = async (ms: number) => {
      // Holds while a sheet is open; a skip ends any wait at once.
      for (let left = ms; left > 0 && !skip.current; left -= 50) {
        await wait(50);
        while (pausedRef.current && !cancelled) await wait(100);
        if (cancelled) return;
      }
    };
    // Engine 5 events say where the ball is; after a goal it goes back to the centre spot.
    const chained = match.plan.events?.some(e => e.x !== undefined) ?? false;
    const opener: Partial<Record<'us' | 'them', MatchEvent>> = {};
    let afterGoal = false;
    void (async () => {
      const end = Math.min(to, 91);
      for (let minute = from + 1; minute < end; minute++) {
        if (cancelled) return;
        const here = events.filter(e => e.minute === minute);
        handlers.current.onClock(minute);
        setClock(minute);
        if (!chained) {
          // Engine 4 plans carry no positions: the ball wanders, and goes to the goal of an attack.
          const attack = here.find(e => !STEP.has(e.kind));
          setBall(attack
            ? { x: attack.team === 'us' ? 0.86 : 0.14, y: 0.3 + Math.random() * 0.4 }
            : { x: 0.35 + Math.random() * 0.3, y: 0.25 + Math.random() * 0.5 });
        } else if (afterGoal) {
          setBall(CENTER);
          setOwner(null);
          afterGoal = false;
        }
        for (const e of here) {
          if (chained && e.x !== undefined && e.kind !== 'card') {
            setBall({ x: e.x / 100, y: (e.y ?? 50) / 100 });
            setOwner(e.team);
          }
          if (e.kind === 'win' || e.kind === 'counter') opener[e.team] = e;
          const attacking = !STEP.has(e.kind) ? e.team : undefined;
          const tone = e.kind === 'goal' ? e.team : e.me ? 'me' : 'info';
          handlers.current.onLine(feedLine(minute, eventLine(e, match.names, opener[e.team]), tone, EVENT_ICON[e.kind], attacking));
          if (e.kind === 'goal') {
            afterGoal = true;
            sfx(e.team === 'us' ? 'crowd_cheer' : 'crowd_groan', 0.8);
            if (!skip.current) buzz(e.team === 'us' ? 'success' : 'light');
            const burak = match.kind === 'mahalle' ? burakLine(e, match.names) : null;
            if (burak) handlers.current.onLine(feedLine(minute, burak, 'info', 'smile'));
          }
          await tick(HOLD_MS[e.kind === 'goal' ? 'goal' : 'other'] / speedRef.current);
        }
        await tick(MINUTE_MS / speedRef.current);
      }
      if (cancelled) return;
      if (next) handlers.current.onClock(next.minute);
      setArrived(true);
      if (next) {
        sfx('whistle_start', 0.5);
        buzz('medium');
      }
      await wait(next ? 900 : 300);
      if (!cancelled) handlers.current.onArrive();
    })();
    return () => { cancelled = true; };
    // One run per stretch of the match.
  }, [from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  // Engine 5 knows who is pressing; engine 4 counts the attacks of the last quarter of an hour.
  const momentum = useMemo(() => {
    const engine = match.plan.momentum;
    if (engine) return (engine[Math.min(engine.length - 1, Math.max(0, Math.trunc((clock - 1) / 5)))] ?? 0) * 2;
    const now = feed.at(-1)?.minute ?? 0;
    return feed.filter(l => l.team && l.minute > now - 15).reduce((n, l) => n + (l.team === 'us' ? 1 : -1), 0);
  }, [feed, clock, match.plan.momentum]);

  const pick = (s: 1 | 3) => { speedPref = s; setSpeed(s); buzz('select'); };
  const recent = feed.slice(-6);

  return (
    <View style={{ flex: 1, gap: 14 }}>
      <Radar ball={ball} owner={owner} reduce={reduce} duration={MINUTE_MS / speed} />
      <Momentum value={momentum} />
      <View accessibilityLiveRegion="polite" style={{ flex: 1, gap: 10, overflow: 'hidden' }}>
        {recent.map((l, i) => <Line key={l.id} line={l} old={i < recent.length - 1} />)}
      </View>
      {arrived && next ? (
        <View style={{ alignItems: 'center', paddingVertical: 8 }}>
          <T w={700} size={32} color={next.kind === 'defense' ? colors.bad : colors.l600} style={{ letterSpacing: 1, textShadowColor: 'rgba(207,253,92,.45)', textShadowRadius: 22 }}>
            {next.kind === 'defense' ? t('live.yoursDefense') : next.kind === 'halftime' ? t('live.halftime').toLocaleUpperCase('tr') : t('live.yours')}
          </T>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 6, padding: 4, borderRadius: 999, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line }}>
          <Seg on={speed === 1} label={t('live.speed.normal')} a11y={t('live.speed.normalA11y')} icon="play" onPress={() => pick(1)} />
          <Seg on={speed === 3} label={t('live.speed.fast')} a11y={t('live.speed.fastA11y')} icon="bolt" onPress={() => pick(3)} />
          <Seg on={false} label={t('live.speed.skip')} a11y={t('live.speed.skipA11y')} icon="chev" onPress={() => { skip.current = true; buzz('select'); }} />
        </View>
      )}
    </View>
  );
}

function Seg({ on, label, a11y, icon, onPress }: { on: boolean; label: string; a11y: string; icon: IconName; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ selected: on }} onPress={onPress}
      style={{ flex: 1, height: 40, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: on ? colors.l600 : 'transparent' }}
    >
      <Icon name={icon} size={16} color={on ? colors.ink : colors.g200} />
      <T w={700} size={14} color={on ? colors.ink : colors.g200}>{label}</T>
    </Pressable>
  );
}

function Line({ line, old }: { line: FeedLine; old: boolean }) {
  const a = useRef(new Animated.Value(0)).current;
  const reduce = useReduceMotion();
  useEffect(() => {
    if (reduce) a.setValue(1);
    else Animated.timing(a, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [a, reduce]);
  const tint = line.tone === 'us' || line.tone === 'me' ? colors.l600 : line.tone === 'them' ? colors.bad : colors.g200;
  return (
    <Animated.View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: Animated.multiply(a, old ? 0.5 : 1), transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
      <View style={{ width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.s2 }}>
        {line.icon === 'card'
          ? <View style={{ width: 10, height: 14, borderRadius: 2, backgroundColor: '#FFC94D' }} />
          : <Icon name={line.icon} size={15} color={tint} />}
      </View>
      <T size={12} color={colors.g300} style={{ width: 28 }}>{line.minute}'</T>
      <T w={line.tone === 'info' ? 400 : 600} size={15} color={line.tone === 'info' ? colors.g200 : colors.g100} style={{ flex: 1 }}>{line.text}</T>
    </Animated.View>
  );
}

function Momentum({ value }: { value: number }) {
  const pct = Math.max(22, Math.min(78, 50 + value * 7));
  const label = value > 1 ? t('live.momentum.us') : value < -1 ? t('live.momentum.them') : t('live.momentum.even');
  return (
    <View accessible accessibilityLabel={label} style={{ gap: 6 }}>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.awayCrest, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: colors.l600 }} />
      </View>
      <T w={600} size={11} color={colors.g300} style={{ letterSpacing: 0.8 }}>{label.toLocaleUpperCase('tr')}</T>
    </View>
  );
}

/** Formation on a 0..1 pitch, we attack to the right. Index 3 is the player. */
const US = [[0.08, 0.5], [0.28, 0.28], [0.28, 0.72], [0.55, 0.5], [0.5, 0.22], [0.5, 0.78]] as const;
const THEM = US.map(([x, y]) => [1 - x, y] as const);
export const ME = 3;

/** The small top-down pitch. Players lean toward the ball; Reduce Motion moves them without gliding. */
export function Radar({ ball, owner = null, reduce, duration, highlight, height = 168 }: {
  ball: { x: number; y: number }; reduce: boolean; duration: number; height?: number;
  /** The team on the ball stands out; the other one fades a little. */
  owner?: 'us' | 'them' | null;
  /** Decision moments: which of our players glows (the free teammate) and whether the path to goal is open. */
  highlight?: { mate: 'top' | 'bottom' | null; lane: boolean };
}) {
  const [w, setW] = useState(0);
  const bx = useRef(new Animated.Value(ball.x)).current;
  const by = useRef(new Animated.Value(ball.y)).current;
  useEffect(() => {
    if (reduce) { bx.setValue(ball.x); by.setValue(ball.y); return; }
    const anim = Animated.parallel([
      Animated.timing(bx, { toValue: ball.x, duration: Math.max(200, duration * 1.6), useNativeDriver: true }),
      Animated.timing(by, { toValue: ball.y, duration: Math.max(200, duration * 1.6), useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [ball, reduce, duration, bx, by]);

  const pad = 10, iw = Math.max(0, w - pad * 2), ih = height - pad * 2;
  const shift = Animated.multiply(Animated.add(bx, -0.5), iw * 0.3);
  const dot = (x: number, y: number, size: number, color: string, glow = false, key?: string, faded = false) => (
    <Animated.View
      key={key}
      style={{
        position: 'absolute', left: pad + x * iw - size / 2, top: pad + y * ih - size / 2, width: size, height: size, borderRadius: size / 2, backgroundColor: color,
        opacity: faded ? 0.5 : 1,
        transform: [{ translateX: shift }],
        ...(glow ? { shadowColor: colors.l600, shadowOpacity: 0.9, shadowRadius: 8, borderWidth: 3, borderColor: 'rgba(207,253,92,.3)' } : null),
      }}
    />
  );
  return (
    <View
      onLayout={e => setW(e.nativeEvent.layout.width)}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ height, borderRadius: 18, backgroundColor: '#12200F', borderWidth: 1, borderColor: 'rgba(207,253,92,.16)', overflow: 'hidden' }}
    >
      <View style={{ position: 'absolute', left: pad, right: pad, top: pad, bottom: pad, borderWidth: 1, borderColor: 'rgba(207,253,92,.16)', borderRadius: 6 }} />
      <View style={{ position: 'absolute', left: '50%', top: pad, bottom: pad, width: 1, backgroundColor: 'rgba(207,253,92,.16)' }} />
      <View style={{ position: 'absolute', left: '50%', top: '50%', width: 40, height: 40, marginLeft: -20, marginTop: -20, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(207,253,92,.16)' }} />
      <View style={{ position: 'absolute', left: pad, top: '50%', width: 24, height: 64, marginTop: -32, borderWidth: 1, borderLeftWidth: 0, borderColor: 'rgba(207,253,92,.16)' }} />
      <View style={{ position: 'absolute', right: pad, top: '50%', width: 24, height: 64, marginTop: -32, borderWidth: 1, borderRightWidth: 0, borderColor: 'rgba(207,253,92,.16)' }} />
      {highlight?.lane && <View style={{ position: 'absolute', left: pad + 0.6 * iw, right: pad, top: '50%', height: 18, marginTop: -9, borderRadius: 9, backgroundColor: 'rgba(207,253,92,.12)' }} />}
      {w > 0 && THEM.map(([x, y], i) => {
        // Decision moments: defenders close down the free teammate or the path to goal.
        const yy = highlight ? (highlight.lane ? (i % 2 ? 0.2 : 0.8) : y) : y;
        return dot(x, yy, 9, '#6A7894', false, `t${i}`, owner === 'us');
      })}
      {w > 0 && US.map(([x, y], i) => {
        const free = highlight?.mate && ((highlight.mate === 'top' && i === 4) || (highlight.mate === 'bottom' && i === 5));
        return dot(x, y, i === ME ? 14 : free ? 12 : 9, i === ME || free ? colors.l600 : colors.l700, i === ME || !!free, `u${i}`, owner === 'them' && i !== ME);
      })}
      {w > 0 && (
        <Animated.View
          style={{
            position: 'absolute', left: pad - 3.5, top: pad - 3.5, width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff',
            transform: [{ translateX: Animated.multiply(bx, iw) }, { translateY: Animated.multiply(by, ih) }],
          }}
        />
      )}
    </View>
  );
}
