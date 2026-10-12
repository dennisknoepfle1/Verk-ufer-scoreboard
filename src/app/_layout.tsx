import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Screen, H1, Muted } from '@/components/ui';
import { AuthProvider } from '@/lib/auth';
import { isConfigured } from '@/lib/supabase';

export default function RootLayout() {
  if (!isConfigured) {
    return (
      <SafeAreaProvider>
        <Screen>
          <H1>Nicht eingerichtet</H1>
          <Muted>
            Es fehlen EXPO_PUBLIC_SUPABASE_URL und EXPO_PUBLIC_SUPABASE_ANON_KEY. Lege sie in einer .env-Datei an (siehe
            .env.example).
          </Muted>
          <Text />
        </Screen>
      </SafeAreaProvider>
    );
  }
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
