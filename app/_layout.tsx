import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import * as Linking from 'expo-linking';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import 'react-native-url-polyfill/auto';

import { ToastProvider } from '@/components/Toast';
import { handleAuthDeepLink } from '@/lib/auth';
import { colors } from '@/lib/colors';

export default function RootLayout() {
  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url) handleAuthDeepLink(url);
    });
    const sub = Linking.addEventListener('url', ({ url }) => {
      handleAuthDeepLink(url);
    });
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.parchment }}>
      {/* ToastProvider OUTSIDE BottomSheetModalProvider so toasts render on top of any sheet. */}
      <ToastProvider>
        <BottomSheetModalProvider>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.parchment } }} />
          <StatusBar style="dark" />
        </BottomSheetModalProvider>
      </ToastProvider>
    </GestureHandlerRootView>
  );
}
