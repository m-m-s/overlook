import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import * as Linking from 'expo-linking';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import 'react-native-url-polyfill/auto';

import { SignIn } from '@/components/SignIn';
import { ToastProvider } from '@/components/Toast';
import { handleAuthDeepLink, useSession } from '@/lib/auth';
import { colors } from '@/lib/colors';
import { FilterProvider } from '@/lib/filtersContext';
import { isSupabaseConfigured } from '@/lib/supabase';

const RootGate = () => {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.parchment }}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  // Local-only mode (no supabase wired): allow through. Otherwise gate on session.
  if (isSupabaseConfigured && !session) return <SignIn />;

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.parchment } }} />;
};

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
      <ToastProvider>
        <FilterProvider>
          <BottomSheetModalProvider>
            <RootGate />
            <StatusBar style="dark" />
          </BottomSheetModalProvider>
        </FilterProvider>
      </ToastProvider>
    </GestureHandlerRootView>
  );
}
