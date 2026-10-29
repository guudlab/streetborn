import { BlurView } from 'expo-blur';
import { useEffect, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, BackHandler, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  FadeIn, FadeOut, FadeOutUp, runOnJS, SlideInDown, SlideInUp, SlideOutDown, useAnimatedKeyboard, useAnimatedStyle, useSharedValue, withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { colors, ease, motion, radius, shadow, space } from '../theme.ts';
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

const DISMISS_PX = 110;
const DISMISS_VELOCITY = 900;

/**
 * Bottom sheet: springs up, slides down when closed, follows a downward drag and closes
 * when flicked or pulled far enough, rides above the keyboard, and closes with the
 * Android back button and the VoiceOver escape gesture.
 */
function Sheet({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const keyboard = useAnimatedKeyboard();
  const drag = useSharedValue(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { closeSheet(); return true; });
    return () => sub.remove();
  }, []);

  const pan = Gesture.Pan()
    .activeOffsetY(12).failOffsetX([-24, 24])
    .onUpdate((e) => { drag.value = Math.max(0, e.translationY); })
    .onEnd((e) => {
      if (drag.value > DISMISS_PX || e.velocityY > DISMISS_VELOCITY) runOnJS(closeSheet)();
      else drag.value = withSpring(0, motion.snappy);
    });

  // Lifted by the keyboard minus the safe area the sheet already sits above.
  const panel = useAnimatedStyle(() => ({
    transform: [{ translateY: drag.value - Math.max(0, keyboard.height.value - insets.bottom) }],
  }));

  return (
    <>
      <Reanimated.View entering={FadeIn.duration(motion.base)} exiting={FadeOut.duration(motion.fast)} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,.55)' }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} accessibilityLabel={t('common.close')} />
      </Reanimated.View>
      <GestureDetector gesture={pan}>
        <Reanimated.View
          accessibilityViewIsModal onAccessibilityEscape={closeSheet}
          entering={SlideInDown.springify().damping(motion.sheet.damping).stiffness(motion.sheet.stiffness).mass(motion.sheet.mass)}
          exiting={SlideOutDown.duration(motion.base).easing(ease.in)}
          style={[{
            position: 'absolute', left: 8, right: 8, bottom: 8 + insets.bottom, borderRadius: radius.sheet, overflow: 'hidden',
            borderWidth: 1, borderColor: 'rgba(255,255,255,.08)',
          }, panel]}
        >
          <BlurView intensity={40} tint="dark" style={{ paddingTop: 10, paddingHorizontal: space.screen, paddingBottom: 28, gap: 14, backgroundColor: 'rgba(30,30,30,.92)' }}>
            <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: colors.g400, alignSelf: 'center', marginBottom: 4 }} />
            {children}
          </BlurView>
        </Reanimated.View>
      </GestureDetector>
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
      pointerEvents="box-none" entering={SlideInUp.springify().damping(motion.sheet.damping).stiffness(motion.sheet.stiffness).mass(motion.sheet.mass)}
      exiting={FadeOutUp.duration(motion.fast)}
      style={{ position: 'absolute', top: insets.top + 12, left: 16, right: 16, alignItems: 'center' }}
    >
      <View
        accessibilityLiveRegion="polite"
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, maxWidth: 440, paddingLeft: icon ? 8 : 16, paddingRight: action ? 6 : 16,
          borderRadius: 22, backgroundColor: colors.g100, ...shadow.float,
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
