import {
  PlayfairDisplay_400Regular,
  PlayfairDisplay_500Medium,
  PlayfairDisplay_600SemiBold,
  PlayfairDisplay_400Regular_Italic,
  useFonts,
} from '@expo-google-fonts/playfair-display';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import * as Linking from 'expo-linking';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, LogBox, Platform, UIManager, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-url-polyfill/auto';

import { Iris } from '@/components/Iris';
import { Onboarding } from '@/components/Onboarding';
import { PostScreenshotPopup } from '@/components/PostScreenshotPopup';
import { SignIn } from '@/components/SignIn';
import { ToastProvider } from '@/components/Toast';
import { drainAnalysisQueue } from '@/lib/analysisQueue';
import { handleAuthDeepLink, useSession } from '@/lib/auth';
import { colors } from '@/lib/colors';
import { FilterProvider } from '@/lib/filtersContext';
import { ScreenshotWatcherProvider } from '@/lib/screenshotWatcher';
import { useOnboardingComplete } from '@/lib/settings';
import { isSupabaseConfigured } from '@/lib/supabase';
import { ThemeProvider, useThemeMode } from '@/lib/themeContext';

// Suppress the "VirtualizedLists should never be nested inside plain
// ScrollViews with the same orientation" warning. We deliberately nest a
// short DraggableFlatList inside the home ScrollView during reorder mode;
// it works fine in practice and the warning is just noise.
LogBox.ignoreLogs([
  'VirtualizedLists should never be nested',
]);

// Enable Android LayoutAnimation so add/remove transitions are smooth.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const RootGate = () => {
  const { session, loading } = useSession();
  const { themeVersion } = useThemeMode();
  const [onboardingDone, setOnboardingDone] = useOnboardingComplete();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.parchment }}>
        <Iris level={3} size={36} color={colors.ink} spinning />
      </View>
    );
  }

  // Local-only mode (no supabase wired): allow through. Otherwise gate on session.
  if (isSupabaseConfigured && !session) return <SignIn />;

  // First-launch onboarding — five-step welcome that introduces local-first
  // privacy, asks for photos + notification permissions, and points the
  // user at upload. Marked complete on finish; replayable from Settings.
  if (!onboardingDone) return <Onboarding onComplete={() => setOnboardingDone(true)} />;

  return (
    <ScreenshotWatcherProvider>
      <Stack
        // Re-key on theme change so the navigator + every screen
        // re-mounts and StyleSheets pick up the new palette/fonts.
        key={themeVersion}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.parchment },
          // Default Android animation can leak transform state on pop in
          // some race conditions (leaves home in a half-translated layout).
          // 'fade' keeps both screens at translateX 0 throughout, no transform.
          animation: 'fade',
        }}
      />
      <PostScreenshotPopup />
    </ScreenshotWatcherProvider>
  );
};

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_400Regular_Italic,
    PlayfairDisplay_500Medium,
    PlayfairDisplay_600SemiBold,
  });

  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url) handleAuthDeepLink(url);
    });
    const sub = Linking.addEventListener('url', ({ url }) => {
      handleAuthDeepLink(url);
    });
    return () => sub.remove();
  }, []);

  // Drain offline analysis queue on startup + each app foreground.
  useEffect(() => {
    void drainAnalysisQueue();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void drainAnalysisQueue();
    });
    return () => sub.remove();
  }, []);

  // Render the splash-style loading state until the editorial serif is on
  // device — prevents flash of system font for the headers.
  if (!fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.parchment,
        }}
      >
        <Iris level={3} size={36} color={colors.ink} spinning />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.parchment }}>
      <ThemeProvider>
      <SafeAreaProvider>
        <ToastProvider>
          <FilterProvider>
            <BottomSheetModalProvider>
              <RootGate />
              <StatusBar style="dark" />
            </BottomSheetModalProvider>
          </FilterProvider>
        </ToastProvider>
      </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
