import { Redirect, router, Stack, usePathname } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Loading } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { InstructionGateProvider, isGateFree, useInstructionGate } from '@/lib/instructions';

/** Alles in dieser Gruppe braucht ein freigegebenes Konto. */
export default function ActiveLayout() {
  const { loading, session, profile } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Redirect href="/login" />;
  if (profile?.status !== 'active') return <Redirect href="/pending" />;
  return (
    <InstructionGateProvider enabled={profile.role === 'seller'}>
      <Gate>
        <Stack screenOptions={{ headerShown: false }} />
      </Gate>
    </InstructionGateProvider>
  );
}

/** Verkäufer mit unbestätigten Arbeitsanweisungen kommen nur auf die Seite mit den Anweisungen. */
function Gate({ children }: { children: ReactNode }) {
  const { open } = useInstructionGate();
  const path = usePathname();
  const blocked = open.length > 0 && !isGateFree(path);
  useEffect(() => {
    if (blocked) router.replace('/anweisungen');
  }, [blocked]);
  return (
    <>
      {children}
      {/* Bis die Anweisungen offen sind, nichts anderes zeigen oder antippen lassen. */}
      {blocked && (
        <View style={StyleSheet.absoluteFill}>
          <Loading />
        </View>
      )}
    </>
  );
}
