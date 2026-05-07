import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import 'react-native-url-polyfill/auto';

import { handleAuthDeepLink } from '@/lib/auth';
import { colors } from '@/lib/colors';

export default function RootLayout() {
  useEffect(() => {
    // Handle the magic-link redirect that opens the app from the email.
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
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.parchment } }} />
      <StatusBar style="dark" />
    </GestureHandlerRootView>
  );
}
