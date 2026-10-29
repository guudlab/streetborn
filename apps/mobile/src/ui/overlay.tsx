import { BlurView } from 'expo-blur';
import { useEffect, useRef, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import Reanimated, { FadeOutUp, SlideInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { colors, motion } from '../theme.ts';
import { Icon } from './Icon.tsx';
import { buzz, T } from './kit.tsx';
import { t } from '../i18n/index.ts';

// App-wide bottom sheet and toast, drawn above every screen by <OverlayHost/>.

export type ToastKind = 'info' | 'success' | 'error';
/** A toast can carry one action: "Geri al" for an undoable change, "Tekrar dene" after a failure. */
export interface ToastAction { label: string; onPress(): void }
interface ToastState { text: string; kind: ToastKind; action: ToastAction | null; id: number }

// Long enough to read a sentence; longer when there is something to tap.
const TOAST_MS = { info: 2200, success: 2200, error: 3200, action: 4500 } as const;

interface OverlayState {
  sheet: ReactNode | null;
  toast: ToastState | null;
  openSheet(content: ReactNode): void;
  closeSheet(): void;
  showToast(text: string, kind?: ToastKind, action?: ToastAction | null): void;
  hideToast(): void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useOverlay = create<OverlayState>()((set) => ({
  sheet: null,
  toast: null,
  openSheet: (sheet) => set({ sheet }),
  closeSheet: () => set({ sheet: null }),
  showToast: (text, kind = 'info', action = null) => {
    const id = Date.now();
    clearTimeout(toastTimer);
    set({ toast: { text, kind, action, id } });
    if (kind === 'error') buzz('error');
    // VoiceOver ignores live regions; announce the toast explicitly.
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(action ? `${text}. ${action.label}` : text);
    toastTimer = setTimeout(() => set(s => (s.toast?.id === id ? { toast: null } : s)), action ? TOAST_MS.action : TOAST_MS[kind]);
  },
  hideToast: () => { clearTimeout(toastTimer); set({ toast: null }); },
}));

export const openSheet = (c: ReactNode) => useOverlay.getState().openSheet(c);
export const closeSheet = () => useOverlay.getState().closeSheet();

/**
 * Shows a short message at the top. `kind` sets the icon (and an error haptic);
 * pass an action for "Geri al" or "Tekrar dene".
 */
export function toast(text: string, kind: ToastKind | { kind?: ToastKind; action?: ToastAction } = 'info') {
  const o = typeof kind === 'string' ? { kind } : kind;
  useOverlay.getState().showToast(text, o.kind, o.action ?? null);
}

export function SheetText({ children }: { children: ReactNode }) {
  return <T size={15} color={colors.g200} style={{ lineHeight: 22 }}>{children}</T>;
}
export const Spinner = () => <ActivityIndicator size="large" color={colors.l600} style={{ marginVertical: 8 }} />;

function Sheet({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(a, { toValue: 1, duration: 320, useNativeDriver: true }).start(); }, [a]);
  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,.55)', opacity: a }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} accessibilityLabel={t('common.close')} />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        style={{
          position: 'absolute', left: 8, right: 8, bottom: 8 + insets.bottom, borderRadius: 32, overflow: 'hidden',
          borderWidth: 1, borderColor: 'rgba(255,255,255,.08)', opacity: a,
          transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
        }}
      >
        <BlurView intensity={40} tint="dark" style={{ paddingTop: 10, paddingHorizontal: 20, paddingBottom: 28, gap: 14, backgroundColor: 'rgba(30,30,30,.92)' }}>
          <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: colors.g400, alignSelf: 'center', marginBottom: 4 }} />
          {children}
        </BlurView>
      </Animated.View>
    </>
  );
}

const TOAST_ICON = {
  success: { name: 'check', bg: colors.l600 },
  error: { name: 'x', bg: colors.bad },
} as const;

function Toast({ toast: { text, kind, action } }: { toast: ToastState }) {
  const insets = useSafeAreaInsets();
  const icon = kind === 'info' ? null : TOAST_ICON[kind];
  return (
    <Reanimated.View
      pointerEvents="box-none" entering={SlideInUp.springify().damping(motion.snappy.damping).stiffness(motion.snappy.stiffness)}
      exiting={FadeOutUp.duration(motion.fast)}
      style={{ position: 'absolute', top: insets.top + 12, left: 16, right: 16, alignItems: 'center' }}
    >
      <View
        accessibilityLiveRegion="polite"
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, maxWidth: 440, paddingLeft: icon ? 8 : 16, paddingRight: action ? 6 : 16,
          borderRadius: 22, backgroundColor: colors.g100,
          shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10,
        }}
      >
        {icon && (
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: icon.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icon.name} size={16} color={colors.ink} />
          </View>
        )}
        <T w={600} size={14} color={colors.ink} style={{ flexShrink: 1, paddingVertical: 10 }}>{text}</T>
        {action && (
          <Pressable
            accessibilityRole="button" accessibilityLabel={action.label} hitSlop={6}
            onPress={() => { buzz(); useOverlay.getState().hideToast(); action.onPress(); }}
            style={({ pressed }) => ({ minHeight: 34, paddingHorizontal: 12, borderRadius: 17, justifyContent: 'center', backgroundColor: pressed ? 'rgba(13,13,13,.16)' : 'rgba(13,13,13,.08)' })}
          >
            <T w={700} size={14} color={colors.l900}>{action.label}</T>
          </Pressable>
        )}
      </View>
    </Reanimated.View>
  );
}

export function OverlayHost() {
  const sheet = useOverlay(s => s.sheet);
  const t = useOverlay(s => s.toast);
  return (
    <>
      {sheet && <Sheet>{sheet}</Sheet>}
      {t && <Toast key={t.id} toast={t} />}
    </>
  );
}
