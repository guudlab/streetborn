import { BlurView } from 'expo-blur';
import { useFocusEffect } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Easing, Pressable, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { setAmbience, setMusic, sfx } from '../../audio/audio.ts';
import { colors, motion } from '../../theme.ts';
import { Icon, type IconName } from '../../ui/Icon.tsx';
import { markHint, useHint } from '../../game/hints.ts';
import { useGame } from '../../game/store.ts';
import { Spotlight, type Rect } from '../../ui/hint.tsx';
import { buzz, T } from '../../ui/kit.tsx';
import { useReduceMotion } from '../../ui/motion.tsx';
import { t } from '../../i18n/index.ts';

// Kaan's tab bar decision (2026-10-22, option B): a compact centred glass pill
// that hugs its content; the selected tab opens into a lime pill with its
// label, the others stay icon only. Sade UI (2026-10-24): Ana, Gelişim, Yaşam, Dükkân;
// offers open from a card on the home screen.
const TABS: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'home', label: t('tab.career') },
  gelisim: { icon: 'train', label: t('tab.train') },
  yasam: { icon: 'city', label: t('tab.life') },
  dukkan: { icon: 'bag', label: t('tab.shop') },
};

const HEIGHT = 60;
const ITEM = 48;
const resize = LinearTransition.springify().damping(motion.snappy.damping).stiffness(motion.snappy.stiffness);

const APressable = Animated.createAnimatedComponent(Pressable);

function TabBar({ state, navigateToTab, insets }: BottomTabBarProps) {
  // Burak abi's only spotlight: after the first match, on the Gelişim tab (veterans skip it).
  const ready = useGame(s => !!s.character && !s.tutorial && s.level <= 3);
  const spot = useHint('spotTrain') && ready && state.index === 0;
  const trainTab = useRef<{ measureInWindow(cb: (x: number, y: number, w: number, h: number) => void): void } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  useEffect(() => {
    if (!spot) { setRect(null); return; }
    // The pill resizes with a spring (and the screen underneath is still transitioning), and on iOS
    // measureInWindow can report the frame from before that settles, which left the spotlight beside
    // the tab. Poll until two reads in a row agree, then show it.
    let last = '';
    let tries = 0;
    const id = setInterval(() => {
      trainTab.current?.measureInWindow((x, y, w, h) => {
        if (w <= 0) return;
        const key = [x, y, w, h].map(Math.round).join(',');
        if (key === last || ++tries > 20) { clearInterval(id); setRect({ x, y, w, h }); }
        last = key;
      });
    }, 200);
    return () => clearInterval(id);
  }, [spot]);
  const trainRoute = state.routes.find(r => r.name === 'gelisim');
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom, 12) + 14, alignItems: 'center' }}
    >
      <Animated.View
        accessibilityRole="tablist" layout={resize}
        style={{
          height: HEIGHT, borderRadius: HEIGHT / 2, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,.09)',
          shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 15, shadowOffset: { width: 0, height: 10 }, elevation: 12,
        }}
      >
        <BlurView
          intensity={45} tint="dark"
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 5, backgroundColor: 'rgba(38,38,38,.55)' }}
        >
          {state.routes.map((route, i) => {
            const tab = TABS[route.name];
            if (!tab) return null;
            const on = state.index === i;
            return (
              <APressable
                key={route.key} layout={resize} ref={route.name === 'gelisim' ? (r: unknown) => { trainTab.current = r as typeof trainTab.current; } : undefined}
                accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: on }}
                onPress={() => { if (!on) { buzz('select'); sfx('tab'); navigateToTab(route.key); } }}
                style={{
                  height: ITEM, minWidth: ITEM, borderRadius: ITEM / 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 8, paddingLeft: on ? 14 : 0, paddingRight: on ? 18 : 0, backgroundColor: on ? colors.l600 : 'transparent',
                }}
              >
                <Icon name={tab.icon} size={22} color={on ? colors.ink : colors.g200} />
                {on && (
                  <Animated.View entering={FadeIn.duration(motion.base)}>
                    <T w={600} size={14} color={colors.ink} numberOfLines={1}>{tab.label}</T>
                  </Animated.View>
                )}
              </APressable>
            );
          })}
        </BlurView>
      </Animated.View>
      {spot && rect && trainRoute && (
        <Spotlight
          rect={rect} text={t('hint.spotTrain')}
          onSkip={() => markHint('spotTrain')}
          onTarget={() => { markHint('spotTrain'); navigateToTab(trainRoute.key); }}
        />
      )}
    </View>
  );
}

export default function TabsLayout() {
  // The calm menu loop plays on every tab; the match screen swaps it out.
  useFocusEffect(useCallback(() => { setMusic('menu'); setAmbience(null); }, []));
  const still = useReduceMotion();
  return (
    <Tabs
      tabBar={(p) => <TabBar {...p} />}
      // 'shift' slides the screens in the direction of the tab that was tapped (a fade with Reduce Motion).
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.ink },
        animation: still ? 'fade' : 'shift', transitionSpec: { animation: 'timing', config: { duration: 260, easing: Easing.bezier(0.2, 0.8, 0.2, 1) } },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tab.career') }} />
      <Tabs.Screen name="gelisim" options={{ title: t('tab.train') }} />
      <Tabs.Screen name="yasam" options={{ title: t('tab.life') }} />
      <Tabs.Screen name="dukkan" options={{ title: t('tab.shop') }} />
    </Tabs>
  );
}
