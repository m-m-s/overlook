import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import 'react-native-url-polyfill/auto';

import { colors } from '@/lib/colors';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.parchment }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.parchment } }} />
      <StatusBar style="dark" />
    </GestureHandlerRootView>
  );
}
