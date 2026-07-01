import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  userName: string | null;
  refreshUserName: () => void;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  userName: null,
  refreshUserName: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState<string | null>(null);

  const loadUserName = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', userId)
      .single();

    if (data?.first_name) {
      setUserName(data.last_name ? `${data.first_name} ${data.last_name.charAt(0)}.` : data.first_name);
    } else {
      setUserName(null);
    }
  }, []);

  useEffect(() => {
    let currentUserId: string | null = null;

    supabase.auth.getSession().then(({ data }) => {
      currentUserId = data.session?.user.id ?? null;
      setSession(data.session);
      setLoading(false);
      if (data.session) loadUserName(data.session.user.id);
    });

    // Supabase re-checks the session — and re-fires this callback — every
    // time the browser tab regains focus, even when nothing about the
    // logged-in user has actually changed. Passing every one of those
    // firings straight through to setSession() hands React a brand-new
    // object reference each time, which cascades into Dashboard's
    // profile-loading effect and briefly shows a full-page loading
    // screen — unmounting whatever card, notes, or in-progress form was
    // open underneath it. Only propagate an update when something real
    // changed: signing out, signing in, or switching to a different user.
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      const newUserId = newSession?.user.id ?? null;
      if (event === 'SIGNED_OUT' || newUserId !== currentUserId) {
        currentUserId = newUserId;
        setSession(newSession);
        if (newSession) {
          loadUserName(newSession.user.id);
        } else {
          setUserName(null);
        }
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [loadUserName]);

  function refreshUserName() {
    if (session) loadUserName(session.user.id);
  }

  return (
    <AuthContext.Provider value={{ session, loading, userName, refreshUserName }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
