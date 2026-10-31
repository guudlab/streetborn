import { DEFAULT_CONFIG } from '@streetborn/economy';
import { useEffect } from 'react';
import { Modal, Pressable, View, type ViewStyle } from 'react-native';

import { t } from '../i18n/index.ts';
import { markHint, useHint, useHints, type HintId } from '../game/hints.ts';
import { useGame } from '../game/store.ts';
import { colors } from '../theme.ts';
import { T } from './kit.tsx';
import { Bubble, Ico, Segments } from './sade.tsx';

const HINT_MS = 9000;

/** Burak abi's one-line tip on a screen's first visit. Tap it or wait and it goes away for good. */
export function HintBubble({ id, text }: { id: HintId; text: string }) {
  const show = useHint(id);
  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(() => markHint(id), HINT_MS);
    return () => clearTimeout(timer);
  }, [show, id]);
  if (!show) return null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={text} accessibilityHint={t('hint.dismiss')} onPress={() => markHint(id)}>
      <Bubble text={text} size={36} />
    </Pressable>
  );
}

export interface Rect { x: number; y: number; w: number; h: number }

/**
 * Dims the screen except one rectangle and lets Burak abi explain it. Tapping the lit
 * rectangle runs `onTarget`; tapping anywhere else, or "Geç", only closes it.
 */
export function Spotlight({ rect, text, onTarget, onSkip }: { rect: Rect; text: string; onTarget: () => void; onSkip: () => void }) {
  const pad = 6;
  const x = rect.x - pad, y = rect.y - pad, w = rect.w + pad * 2, h = rect.h + pad * 2;
  const dim: ViewStyle = { position: 'absolute', backgroundColor: 'rgba(0,0,0,.76)' };
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onSkip} statusBarTranslucent>
      <View style={{ flex: 1 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('hint.skip')} onPress={onSkip} style={[dim, { left: 0, right: 0, top: 0, height: Math.max(0, y) }]} />
        <Pressable accessibilityElementsHidden importantForAccessibility="no" onPress={onSkip} style={[dim, { left: 0, width: Math.max(0, x), top: y, height: h }]} />
        <Pressable accessibilityElementsHidden importantForAccessibility="no" onPress={onSkip} style={[dim, { left: x + w, right: 0, top: y, height: h }]} />
        <Pressable accessibilityElementsHidden importantForAccessibility="no" onPress={onSkip} style={[dim, { left: 0, right: 0, top: y + h, bottom: 0 }]} />
        <Pressable
          accessibilityRole="button" accessibilityLabel={text} onPress={onTarget}
          style={{ position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: h / 2, borderWidth: 2, borderColor: colors.l600, shadowColor: colors.l600, shadowOpacity: 0.6, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } }}
        />
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, top: Math.max(16, y - 120) }}>
          <Bubble text={text} />
          <Pressable accessibilityRole="button" onPress={onSkip} hitSlop={12} style={{ alignSelf: 'flex-end', marginTop: 10, paddingVertical: 6, paddingHorizontal: 12 }}>
            <T w={600} size={14} color={colors.g200}>{t('hint.skip')}</T>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** Burak abi's first jobs and how far along the player is. Offline players have no mahalle, so theirs is shorter. */
export function useJobs() {
  const level = useGame(s => s.level);
  const tutorial = useGame(s => s.tutorial);
  const online = useGame(s => s.mode === 'online');
  const hasMahalle = useGame(s => !!s.mahalle);
  const mahalleReady = useGame(s => s.mahalleReady);
  const trained = useHints(s => !!s.seen.jobTrain);
  const jobs = [
    { key: 'jobs.match' as const, done: true },
    { key: 'jobs.train' as const, done: trained },
    ...(online ? [{ key: 'jobs.mahalle' as const, done: hasMahalle }] : []),
  ];
  const next = jobs.find(j => !j.done);
  return { jobs, next, done: jobs.filter(j => j.done).length, online, show: !tutorial && level <= 3 && (!online || mahalleReady) };
}

/** Under Burak abi's bubble: one pip per first job and the coin reward, with the next task as the accessibility label. */
export function JobsPips() {
  const loaded = useHints(s => s.loaded);
  const { jobs, next, done, online, show } = useJobs();
  if (!loaded || !show || !next) return null;
  return (
    <View accessible accessibilityLabel={`${t('jobs.title')} ${done}/${jobs.length}. ${t('jobs.next', { task: t(next.key) })}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 46, marginTop: 6 }}>
      {jobs.map((j, i) => <View key={i} style={{ width: 16, height: 5, borderRadius: 3, backgroundColor: j.done ? colors.l600 : colors.s3 }} />)}
      {online && <><Ico name="coin" size={16} style={{ marginLeft: 4 }} /><T w={700} size={12} color={colors.g200}>{DEFAULT_CONFIG.shop.jobsCoin}</T></>}
    </View>
  );
}

/** Home card: Burak abi's first jobs and what comes next. The coin reward is paid by the server (claim_jobs), never here. */
export function JobsChip() {
  const loaded = useHints(s => s.loaded);
  const { jobs, next, done, online, show } = useJobs();
  if (!loaded || !show || !next) return null;
  const reward = online ? t('jobs.reward', { n: DEFAULT_CONFIG.shop.jobsCoin }) : '';
  const line = `${t('jobs.next', { task: t(next.key) })}${reward ? ` · ${reward}` : ''}`;
  return (
    <View accessible accessibilityLabel={`${t('jobs.title')} ${done}/${jobs.length}. ${line}`}
      style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.s2, paddingVertical: 10, paddingHorizontal: 14, gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <T w={700} size={13}>{t('jobs.title')}</T>
        <T w={700} size={13} color={colors.l500}>{done}/{jobs.length}</T>
      </View>
      <Segments n={done} of={jobs.length} />
      <T w={500} size={13} color={colors.g200} numberOfLines={2}>{line}</T>
    </View>
  );
}
