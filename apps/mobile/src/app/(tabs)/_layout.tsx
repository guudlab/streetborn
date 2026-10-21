import { BlurView } from 'expo-blur';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, View } from 'react-native';

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

function TabBar({ state, navigateToTab, insets }: BottomTabBarProps) {
  const offersBadge = useGame(s => s.scouted && !s.signed);
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
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 9, backgroundColor: 'rgba(38,38,38,.55)' }}
      >
        {state.routes.map((route, i) => {
          const tab = TABS[route.name];
          if (!tab) return null;
          const on = state.index === i;
          return (
            <Pressable
              key={route.key} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: on }}
              onPress={() => { if (!on) { buzz(); navigateToTab(route.key); } }}
              style={{ width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.l600 : 'transparent' }}
            >
              <Icon name={tab.icon} color={on ? colors.ink : colors.g200} />
              {route.name === 'teklifler' && offersBadge && !on && (
                <View style={{ position: 'absolute', top: 9, right: 9, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.l600, borderWidth: 2, borderColor: colors.s3 }} />
              )}
            </Pressable>
          );
        })}
      </BlurView>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(p) => <TabBar {...p} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.ink } }}
    >
      <Tabs.Screen name="index" options={{ title: 'Kariyer' }} />
      <Tabs.Screen name="gelisim" options={{ title: 'Gelişim' }} />
      <Tabs.Screen name="teklifler" options={{ title: 'Teklifler' }} />
      <Tabs.Screen name="dukkan" options={{ title: 'Dükkân' }} />
    </Tabs>
  );
}
