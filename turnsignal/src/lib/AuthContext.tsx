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
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (data.session) loadUserName(data.session.user.id);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        loadUserName(newSession.user.id);
      } else {
        setUserName(null);
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
