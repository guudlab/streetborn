import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '../theme.ts';
import { OverlayHost } from '../ui/overlay.tsx';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  useEffect(() => { if (loaded || error) void SplashScreen.hideAsync(); }, [loaded, error]);
  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      {/* On a desktop browser, keep the phone-sized layout centred. */}
      <View style={{ flex: 1, backgroundColor: colors.ink, width: '100%', maxWidth: Platform.OS === 'web' ? 480 : undefined, alignSelf: 'center' }}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ink } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="mac" options={{ gestureEnabled: false, animation: 'fade' }} />
          <Stack.Screen name="mac-sonu" options={{ gestureEnabled: false, animation: 'fade' }} />
        </Stack>
        <OverlayHost />
      </View>
    </SafeAreaProvider>
  );
}
