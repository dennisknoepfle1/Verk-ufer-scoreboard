import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

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
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, status')
      .eq('id', s.user.id)
      .maybeSingle();
    if (error) console.warn('Profil konnte nicht geladen werden', error.message);
    else loadedFor.current = s.user.id;
    setProfile((data as Profile | null) ?? null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_OUT') {
        loadedFor.current = null;
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
