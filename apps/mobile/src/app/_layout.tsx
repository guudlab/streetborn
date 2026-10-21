import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useGame } from '../game/store.ts';
import { colors } from '../theme.ts';
import { OverlayHost } from '../ui/overlay.tsx';

void SplashScreen.preventAutoHideAsync();
// Sign in and load the player once; fall back to local play if it takes too long.
void Promise.race([useGame.getState().init(), new Promise(r => setTimeout(r, 8000))]).then(() => {
  if (useGame.getState().mode === 'loading') useGame.setState({ mode: 'local', offlineReason: 'Sunucu yanıt vermedi' });
});

export default function RootLayout() {
  const [loaded, error] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const ready = useGame(s => s.mode !== 'loading');
  useEffect(() => { if ((loaded || error) && ready) void SplashScreen.hideAsync(); }, [loaded, error, ready]);
  if ((!loaded && !error) || !ready) return null;

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
