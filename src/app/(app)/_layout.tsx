import { Redirect, Stack } from 'expo-router';

import { Loading } from '@/components/ui';
import { useAuth } from '@/lib/auth';

/** Alles in dieser Gruppe braucht ein freigegebenes Konto. */
export default function ActiveLayout() {
  const { loading, session, profile } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Redirect href="/login" />;
  if (profile?.status !== 'active') return <Redirect href="/pending" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
