import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '../theme.ts';
import { Icon } from './Icon.tsx';
import { Cta, Ghost, T } from './kit.tsx';
import { Enter } from './motion.tsx';
import { Ico, type IconAsset } from './sade.tsx';
import { t } from '../i18n/index.ts';

// The states a screen with server data can be in, besides "loaded": a skeleton in the
// content's shape while loading (motion.tsx), and these two when there is nothing to show.
// Each says what happened in one line and offers the next step.

/**
 * Runs an async action once at a time and tracks it, for "Tekrar dene" and pull to refresh.
 * Errors are left to the action (store refreshes already swallow theirs).
 */
export function useBusy(fn: () => Promise<unknown>): [busy: boolean, run: () => Promise<void>] {
  const [busy, setBusy] = useState(false);
  const live = useRef(true);
  const running = useRef(false);
  useEffect(() => () => { live.current = false; }, []);
  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true; setBusy(true);
    try { await fn(); } catch { /* the screen shows the failure */ } finally {
      running.current = false;
      if (live.current) setBusy(false);
    }
  }, [fn]);
  return [busy, run];
}

/** Loading failed: what went wrong and a retry button that spins while it retries. */
export function ErrorState({ text = t('common.loadFailed'), onRetry, style }: { text?: string; onRetry: () => Promise<unknown>; style?: StyleProp<ViewStyle> }) {
  const [busy, retry] = useBusy(onRetry);
  return (
    <Enter style={[{ alignItems: 'center', gap: 14, paddingVertical: 32, paddingHorizontal: 12 }, style]}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.s2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="info" size={30} color={colors.g200} />
      </View>
      <T w={500} size={15} color={colors.g200} style={{ textAlign: 'center', lineHeight: 21, maxWidth: 300 }} accessibilityLiveRegion="polite">{text}</T>
      <Ghost busy={busy} onPress={() => void retry()} style={{ alignSelf: 'stretch' }}>{t('common.retry')}</Ghost>
    </Enter>
  );
}

/**
 * Nothing here yet: a dimmed 3D icon, one line, and the action that fills the screen.
 * `primary` makes the action the lime button (when it is the screen's one job).
 */
export function EmptyState({ icon, text, action, primary, style }: {
  icon: IconAsset; text: string; action?: { label: string; onPress(): void }; primary?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const Btn = primary ? Cta : Ghost;
  return (
    <Enter style={[{ alignItems: 'center', gap: 12, paddingVertical: 30 }, style]}>
      <Ico name={icon} size={96} dim />
      <T color={colors.g200} style={{ textAlign: 'center', lineHeight: 21, maxWidth: 300 }}>{text}</T>
      {action && <Btn onPress={action.onPress} style={{ alignSelf: 'stretch', marginTop: 4 }}>{action.label}</Btn>}
    </Enter>
  );
}

/** Repeats a skeleton row `n` times with the list's gap. */
export function SkeletonList({ n, gap = 10, children }: { n: number; gap?: number; children: (i: number) => ReactNode }) {
  return <View style={{ gap }}>{Array.from({ length: n }, (_, i) => <View key={i}>{children(i)}</View>)}</View>;
}
