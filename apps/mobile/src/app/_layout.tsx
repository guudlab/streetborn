import Constants from 'expo-constants';
import { useFonts } from 'expo-font';
import Head from 'expo-router/head';
import { router, usePathname } from 'expo-router';
import { Stack, type StackNavigationOptions } from 'expo-router/js-stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { HERO_MODEL } from '../game/character.ts';
import { useGame } from '../game/store.ts';
import { colors } from '../theme.ts';
import { preloadModels } from '../ui/Model3D.tsx';
import { OverlayHost } from '../ui/overlay.tsx';

void SplashScreen.preventAutoHideAsync();
// Same 250 ms fade as the web boot screen.
SplashScreen.setOptions({ duration: 250, fade: true });
// "/streetborn" on GitHub Pages, "" on Netlify (see app.config.js).
const BASE = Constants.expoConfig?.experiments?.baseUrl ?? '';
// Restore the session (if any) and load the player once.
void useGame.getState().init();

// Inter cut down to Latin + Turkish (and the punctuation and arrows the UI uses):
// ~40 KB per weight as WOFF2 on the web instead of 340 KB, ~115 KB as TTF in the app.
// The web files sit in public/fonts at fixed URLs, so public/index.html can
// preload them while the JavaScript is still downloading.
const webFont = (name: string) => ({ uri: `${BASE}/fonts/${name}.woff2` });
const FONTS = Platform.OS === 'web'
  ? {
    Inter_400Regular: webFont('Inter_400Regular'),
    Inter_500Medium: webFont('Inter_500Medium'),
    Inter_600SemiBold: webFont('Inter_600SemiBold'),
    Inter_700Bold: webFont('Inter_700Bold'),
  }
  : {
    Inter_400Regular: require('../../assets/fonts/Inter_400Regular.ttf'),
    Inter_500Medium: require('../../assets/fonts/Inter_500Medium.ttf'),
    Inter_600SemiBold: require('../../assets/fonts/Inter_600SemiBold.ttf'),
    Inter_700Bold: require('../../assets/fonts/Inter_700Bold.ttf'),
  };

/** Fades out the HTML boot screen from public/index.html (web only). */
function hideBoot() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const boot = document.getElementById('boot');
  if (!boot) return;
  boot.classList.add('out');
  setTimeout(() => boot.remove(), 260);
}

// The JS stack animates the same way on iOS, Android and the web preview
// (on the web it only animates when `animation` is set explicitly).
const slide: StackNavigationOptions = { animation: 'slide_from_right' };
const fade: StackNavigationOptions = { animation: 'fade_from_bottom', gestureEnabled: false };

export default function RootLayout() {
  const [loaded, error] = useFonts(FONTS);
  const auth = useGame(s => s.auth);
  // A new player goes to the sign-in screen at once; a returning one sees the saved
  // profile at once, or waits for the server on the first launch after an update.
  const ready = useGame(s => s.auth === 'none' || (s.auth === 'in' && s.mode !== 'loading' && (s.mode === 'local' || s.mahalleReady)));
  // A signed-in player without a mahalle or a character goes through setup first (local play skips it).
  const hasMahalle = useGame(s => s.mahalle !== null);
  const setup = useGame(s => s.auth === 'in' && s.mode === 'online' && (s.mahalle === null || s.character === null));
  // The player's own 3D model starts loading with the app, so the hub shows it at once.
  const hero = useGame(s => s.character?.hero);
  useEffect(() => { if (hero) preloadModels([HERO_MODEL[hero]]); }, [hero]);
  // Until then the native splash (app) or the HTML boot screen (web) stays up.
  useEffect(() => {
    if ((loaded || error) && ready) { void SplashScreen.hideAsync(); hideBoot(); }
  }, [loaded, error, ready]);
  // The router does not pick which screen of a newly active group opens first, so
  // setup is entered explicitly: mahalle choice, then character creation.
  const stage = !ready ? null : setup ? (hasMahalle ? '/karakter' : '/mahalle-secim') : null;
  // Where a screen whose group just closed goes. Without it the router falls back to the
  // first open route by name, which is /hesap, and the player sees its spinner for a moment.
  const home = stage ?? (auth === 'in' ? '/' : '/giris');
  const entered = useRef<string | null>(null);
  const path = useRef('');
  path.current = usePathname();
  useEffect(() => {
    if (!loaded || entered.current === stage) return;
    entered.current = stage;
    // Let the stack finish rebuilding for the new group first; the guard redirect usually
    // gets there on its own, and a second replace would stack the screen twice.
    const id = setTimeout(() => { if (stage && path.current !== stage) router.replace(stage); }, 120);
    return () => clearTimeout(id);
  }, [stage, loaded]);
  if ((!loaded && !error) || !ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.ink }}>
      {Platform.OS === 'web' && (
        <Head>
          <link rel="manifest" href={`${BASE}/manifest.json`} />
          <link rel="apple-touch-icon" href={`${BASE}/pwa-icon-192.png`} />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-title" content="StreetBorn" />
        </Head>
      )}
      <SafeAreaProvider>
        {/* On a desktop browser, keep the phone-sized layout centred. */}
        <View style={{ flex: 1, backgroundColor: colors.ink, width: '100%', maxWidth: Platform.OS === 'web' ? 480 : undefined, alignSelf: 'center', overflow: 'hidden' }}>
          <StatusBar style="light" />
          {/* cardStyle flex: 1 keeps every screen the window's height on the web, so ScrollViews
              scroll; otherwise the stack lets a card grow to its content inside the clipped frame. */}
          <Stack screenOptions={{ headerShown: false, cardStyle: { backgroundColor: colors.ink, flex: 1 }, ...slide }}>
            <Stack.Protected guard={auth !== 'in'} redirectTo={home}>
              <Stack.Screen name="giris" options={fade} />
            </Stack.Protected>
            <Stack.Protected guard={setup && !hasMahalle} redirectTo={home}>
              <Stack.Screen name="mahalle-secim" options={fade} />
              <Stack.Screen name="mahalle-kur" options={slide} />
              <Stack.Screen name="mahalle-kod" options={slide} />
              <Stack.Screen name="mahalle-acik" options={slide} />
              <Stack.Screen name="mahalle-davet" options={fade} />
            </Stack.Protected>
            <Stack.Protected guard={setup && hasMahalle} redirectTo={home}>
              <Stack.Screen name="karakter" options={fade} />
            </Stack.Protected>
            <Stack.Protected guard={auth === 'in' && !setup} redirectTo={home}>
              <Stack.Screen name="(tabs)" options={fade} />
              <Stack.Screen name="mac" options={fade} />
              <Stack.Screen name="mac-sonu" options={fade} />
              <Stack.Screen name="mahalle" options={slide} />
            </Stack.Protected>
            <Stack.Screen name="hesap" options={fade} />
          </Stack>
          <OverlayHost />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
