import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import Head from 'expo-router/head';
import { Stack, type StackNavigationOptions } from 'expo-router/js-stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useGame } from '../game/store.ts';
import { colors } from '../theme.ts';
import { OverlayHost } from '../ui/overlay.tsx';

void SplashScreen.preventAutoHideAsync();
// Restore the session (if any) and load the player once.
void useGame.getState().init();

// The JS stack animates the same way on iOS, Android and the web preview
// (on the web it only animates when `animation` is set explicitly).
const slide: StackNavigationOptions = { animation: 'slide_from_right' };
const fade: StackNavigationOptions = { animation: 'fade_from_bottom', gestureEnabled: false };

export default function RootLayout() {
  const [loaded, error] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const auth = useGame(s => s.auth);
  // A returning player waits for the profile; a new one goes to the sign-in screen at once.
  const ready = useGame(s => s.auth === 'none' || (s.auth === 'in' && s.mode !== 'loading'));
  useEffect(() => { if ((loaded || error) && ready) void SplashScreen.hideAsync(); }, [loaded, error, ready]);
  if ((!loaded && !error) || !ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.ink }}>
      {Platform.OS === 'web' && (
        <Head>
          <link rel="manifest" href="/streetborn/manifest.json" />
          <link rel="apple-touch-icon" href="/streetborn/pwa-icon-192.png" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-title" content="StreetBorn" />
        </Head>
      )}
      <SafeAreaProvider>
        {/* On a desktop browser, keep the phone-sized layout centred. */}
        <View style={{ flex: 1, backgroundColor: colors.ink, width: '100%', maxWidth: Platform.OS === 'web' ? 480 : undefined, alignSelf: 'center', overflow: 'hidden' }}>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, cardStyle: { backgroundColor: colors.ink }, ...slide }}>
            <Stack.Protected guard={auth !== 'in'}>
              <Stack.Screen name="giris" options={fade} />
            </Stack.Protected>
            <Stack.Protected guard={auth === 'in'}>
              <Stack.Screen name="(tabs)" options={fade} />
              <Stack.Screen name="mac" options={fade} />
              <Stack.Screen name="mac-sonu" options={fade} />
            </Stack.Protected>
          </Stack>
          <OverlayHost />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
