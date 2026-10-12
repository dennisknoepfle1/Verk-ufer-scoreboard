import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { kv } from './pending';
import { disablePush } from './push';
import { supabase } from './supabase';

export type Profile = {
  id: string;
  full_name: string;
  role: 'seller' | 'admin';
  status: 'pending' | 'active' | 'inactive';
};

type AuthState = {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function readCachedProfile(userId: string): Profile | null {
  try {
    const p = JSON.parse(kv.getItem('profile') ?? 'null') as Profile | null;
    return p?.id === userId ? p : null;
  } catch {
    return null;
  }
}

function writeCachedProfile(p: Profile | null) {
  try {
    kv.setItem('profile', JSON.stringify(p));
  } catch {}
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const loadedFor = useRef<string | null>(null);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      return;
    }
    // Ohne Netz nicht ewig warten: nach 6 Sekunden gilt die Anfrage als gescheitert.
    const query = supabase.from('profiles').select('id, full_name, role, status').eq('id', s.user.id).maybeSingle();
    const timeout = new Promise<{ data: null; error: { message: string } }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: { message: 'Zeitüberschreitung' } }), 6000),
    );
    const { data, error } = await Promise.race([query.then((r) => r), timeout]);
    if (error) {
      console.warn('Profil konnte nicht geladen werden', error.message);
      // Ohne Netz mit dem zuletzt geladenen Profil weiterarbeiten (Offline eintragen).
      setProfile(readCachedProfile(s.user.id));
      return;
    }
    loadedFor.current = s.user.id;
    writeCachedProfile((data as Profile | null) ?? null);
    setProfile((data as Profile | null) ?? null);
  }, []);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        setSession(data.session);
        await loadProfile(data.session);
      })
      .finally(() => setLoading(false));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_OUT') {
        loadedFor.current = null;
        writeCachedProfile(null);
        setProfile(null);
        return;
      }
      // Nur bei neuem Login laden, nicht bei jedem Token-Refresh (sonst flackern offene Formulare weg).
      // Nicht direkt im Callback auf Supabase warten, sonst kann der Client blockieren.
      if (event === 'SIGNED_IN' && s && s.user.id !== loadedFor.current) {
        setLoading(true);
        setTimeout(() => loadProfile(s).finally(() => setLoading(false)), 0);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const value: AuthState = {
    loading,
    session,
    profile,
    refreshProfile: () => loadProfile(session),
    signOut: async () => {
      // Dieses Gerät soll nach dem Abmelden keine Verkaufs-Nachrichten mehr bekommen.
      await Promise.race([disablePush().catch(() => {}), new Promise((r) => setTimeout(r, 3000))]);
      await supabase.auth.signOut();
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth außerhalb von AuthProvider');
  return ctx;
}
