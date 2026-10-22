import { BlurView } from 'expo-blur';
import { useEffect, useRef, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { colors } from '../theme.ts';
import { T } from './kit.tsx';
import { t } from '../i18n/index.ts';

// App-wide bottom sheet and toast, drawn above every screen by <OverlayHost/>.

interface OverlayState {
  sheet: ReactNode | null;
  toast: { text: string; id: number } | null;
  openSheet(content: ReactNode): void;
  closeSheet(): void;
  showToast(text: string): void;
}

export const useOverlay = create<OverlayState>()((set) => ({
  sheet: null,
  toast: null,
  openSheet: (sheet) => set({ sheet }),
  closeSheet: () => set({ sheet: null }),
  showToast: (text) => {
    const id = Date.now();
    set({ toast: { text, id } });
    setTimeout(() => set(s => (s.toast?.id === id ? { toast: null } : s)), 1800);
  },
}));

export const openSheet = (c: ReactNode) => useOverlay.getState().openSheet(c);
export const closeSheet = () => useOverlay.getState().closeSheet();
export const toast = (t: string) => useOverlay.getState().showToast(t);

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

function Toast({ text }: { text: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 12, left: 0, right: 0, alignItems: 'center' }}>
      <View accessibilityLiveRegion="polite" style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, backgroundColor: colors.g100 }}>
        <T w={600} size={14} color={colors.ink}>{text}</T>
      </View>
    </View>
  );
}

export function OverlayHost() {
  const sheet = useOverlay(s => s.sheet);
  const t = useOverlay(s => s.toast);
  return (
    <>
      {sheet && <Sheet>{sheet}</Sheet>}
      {t && <Toast key={t.id} text={t.text} />}
    </>
  );
}
