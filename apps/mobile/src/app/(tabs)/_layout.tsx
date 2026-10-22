import { BlurView } from 'expo-blur';
import { useFocusEffect } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';

import { setAmbience, setMusic, sfx } from '../../audio/audio.ts';
import { useGame } from '../../game/store.ts';
import { colors } from '../../theme.ts';
import { Icon, type IconName } from '../../ui/Icon.tsx';
import { buzz } from '../../ui/kit.tsx';

// Kaan's tab bar decision: icons only, floating full-radius glass pill with
// side and bottom margin; the selected tab is a lime circle with a dark icon.
const TABS: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'home', label: 'Kariyer' },
  gelisim: { icon: 'train', label: 'Gelişim' },
  teklifler: { icon: 'mail', label: 'Teklifler' },
  dukkan: { icon: 'bag', label: 'Dükkân' },
};

const PAD = 9;
const DISC = 50;

function TabBar({ state, navigateToTab, insets }: BottomTabBarProps) {
  const offersBadge = useGame(s => s.scouted && !s.signed);
  // The lime disc slides to the selected tab instead of jumping.
  const [width, setWidth] = useState(0);
  const pos = useRef(new Animated.Value(state.index)).current;
  useEffect(() => {
    Animated.spring(pos, { toValue: state.index, useNativeDriver: Platform.OS !== 'web', speed: 18, bounciness: 6 }).start();
  }, [pos, state.index]);
  const slot = (width - PAD * 2) / state.routes.length;
  const x = pos.interpolate({ inputRange: [0, 1], outputRange: [PAD + (slot - DISC) / 2, PAD + (slot - DISC) / 2 + slot] , extrapolate: 'extend' });
  return (
    <View
      accessibilityRole="tablist"
      style={{
        position: 'absolute', left: 24, right: 24, bottom: Math.max(insets.bottom, 12) + 14, height: 66, borderRadius: 33,
        overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,.09)',
      }}
    >
      <BlurView
        intensity={45} tint="dark"
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: PAD, backgroundColor: 'rgba(38,38,38,.55)' }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {width > 0 && (
          <Animated.View
            pointerEvents="none"
            style={{ position: 'absolute', left: 0, top: (66 - 2 - DISC) / 2, width: DISC, height: DISC, borderRadius: DISC / 2, backgroundColor: colors.l600, transform: [{ translateX: x }] }}
          />
        )}
        {state.routes.map((route, i) => {
          const tab = TABS[route.name];
          if (!tab) return null;
          const on = state.index === i;
          return (
            <Pressable
              key={route.key} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: on }}
              onPress={() => { if (!on) { buzz(); sfx('tab'); navigateToTab(route.key); } }}
              style={{ flex: 1, height: DISC, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name={tab.icon} color={on ? colors.ink : colors.g200} />
              {route.name === 'teklifler' && offersBadge && !on && (
                <View style={{ position: 'absolute', top: 9, left: '50%', marginLeft: 7, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.l600, borderWidth: 2, borderColor: colors.s3 }} />
              )}
            </Pressable>
          );
        })}
      </BlurView>
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
