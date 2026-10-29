import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '../net/api.ts';
import { colors } from '../theme.ts';
import { Icon } from './Icon.tsx';
import { buzz, T } from './kit.tsx';
import { useBusy } from './states.tsx';
import { t, type Key } from '../i18n/index.ts';

type ShellProps = {
  label?: string; title?: string; right?: ReactNode; back?: boolean; children: ReactNode; footer?: ReactNode;
  /** Pull to refresh: the spinner stays until the promise settles. */
  onRefresh?: () => Promise<unknown>;
};

/**
 * Screen frame of the stack screens: back button and a short title on top, scrolling content,
 * pinned footer. Content scrolls below the status bar and Dynamic Island, never under them.
 */
export function Shell({ label, title, right, back = true, children, footer, onRefresh }: ShellProps) {
  const insets = useSafeAreaInsets();
  const [refreshing, refresh] = useBusy(onRefresh ?? noop);
  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, paddingTop: insets.top }}>
      <ScrollView
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingHorizontal: 20, paddingBottom: 16, gap: 18 }}
        refreshControl={onRefresh && (
          <RefreshControl
            refreshing={refreshing} onRefresh={() => void refresh()}
            tintColor={colors.l600} colors={[colors.ink]} progressBackgroundColor={colors.l600} accessibilityLabel={t('common.refreshing')}
          />
        )}
      >
        {(back || label || title) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
            {/* Opened straight from a link (web), there is nothing to go back to: go home. */}
            {back && (
              <Pressable
                accessibilityRole="button" accessibilityLabel={t('mahalle.back')} hitSlop={6}
                onPress={() => { buzz(); if (router.canGoBack()) router.back(); else router.replace('/'); }}
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.s2, alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="back" color={colors.g100} />
              </Pressable>
            )}
            {label && <T w={600} size={11} color={colors.g200} style={{ letterSpacing: 1 }}>{label}</T>}
            {title && <T w={700} size={20} numberOfLines={1} style={{ flex: 1 }} accessibilityRole="header">{title}</T>}
            {right}
          </View>
        )}
        {children}
      </ScrollView>
      {footer && <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 16) + 8, gap: 10 }}>{footer}</View>}
    </View>
  );
}

const noop = () => Promise.resolve();

/** Player-facing text for an error from the mahalle functions or the name check. */
export function mahalleError(e: unknown): string {
  const code = e instanceof ApiError ? e.code : '';
  const name = /^name_(too_short|too_long|bad_chars|blocked)$/.exec(code);
  if (name) return t(`name.err.${name[1]}` as Key);
  const known = ['full', 'not_found', 'not_open', 'already_member'];
  return t(`mahalle.err.${known.includes(code) ? code : 'generic'}` as Key);
}
