import { BlurView } from 'expo-blur';
import { useFocusEffect } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { useCallback } from 'react';
import { Easing, Pressable, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { setAmbience, setMusic, sfx } from '../../audio/audio.ts';
import { useGame } from '../../game/store.ts';
import { colors, motion } from '../../theme.ts';
import { Icon, type IconName } from '../../ui/Icon.tsx';
import { buzz, T } from '../../ui/kit.tsx';

// Kaan's tab bar decision (2026-10-22, option B): a compact centred glass pill
// that hugs its content; the selected tab opens into a lime pill with its
// label, the others stay icon only.
const TABS: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'home', label: 'Kariyer' },
  gelisim: { icon: 'train', label: 'Gelişim' },
  teklifler: { icon: 'mail', label: 'Teklifler' },
  dukkan: { icon: 'bag', label: 'Dükkân' },
};

const HEIGHT = 60;
const ITEM = 48;
const resize = LinearTransition.springify().damping(motion.snappy.damping).stiffness(motion.snappy.stiffness);

const APressable = Animated.createAnimatedComponent(Pressable);

function TabBar({ state, navigateToTab, insets }: BottomTabBarProps) {
  const offersBadge = useGame(s => s.scouted && !s.signed);
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
                key={route.key} layout={resize}
                accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: on }}
                onPress={() => { if (!on) { buzz(); sfx('tab'); navigateToTab(route.key); } }}
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
                {route.name === 'teklifler' && offersBadge && !on && (
                  <View style={{ position: 'absolute', top: 9, right: 8, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.l600, borderWidth: 2, borderColor: colors.s3 }} />
                )}
              </APressable>
            );
          })}
        </BlurView>
      </Animated.View>
    </View>
  );
}

export default function TabsLayout() {
  // The calm menu loop plays on every tab; the match screen swaps it out.
  useFocusEffect(useCallback(() => { setMusic('menu'); setAmbience(null); }, []));
  return (
    <Tabs
      tabBar={(p) => <TabBar {...p} />}
      // 'shift' slides the screens in the direction of the tab that was tapped.
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.ink },
        animation: 'shift', transitionSpec: { animation: 'timing', config: { duration: 260, easing: Easing.bezier(0.2, 0.8, 0.2, 1) } },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Kariyer' }} />
      <Tabs.Screen name="gelisim" options={{ title: 'Gelişim' }} />
      <Tabs.Screen name="teklifler" options={{ title: 'Teklifler' }} />
      <Tabs.Screen name="dukkan" options={{ title: 'Dükkân' }} />
    </Tabs>
  );
}
