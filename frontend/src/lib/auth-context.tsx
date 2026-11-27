import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { fetchCurrentUser, logout as logoutRequest, type AuthUser } from './auth';

type AuthState = {
  user: AuthUser;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

/** Держит пользователя сессии и реагирует на 401 от любого API-запроса. */
export function AuthGate({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: (onAuthenticated: (user: AuthUser) => void) => ReactNode;
}) {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchCurrentUser()
      .then((current) => {
        if (!cancelled) {
          setUser(current);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener('bpmn:unauthorized', onUnauthorized);
    return () => window.removeEventListener('bpmn:unauthorized', onUnauthorized);
  }, []);

  const value = useMemo<AuthState | null>(
    () =>
      user
        ? {
            user,
            logout: async () => {
              try {
                await logoutRequest();
              } finally {
                setUser(null);
              }
            },
          }
        : null,
    [user],
  );

  if (user === undefined) {
    return (
      <section className="page page--centered">
        <p className="empty-state__text">Проверяю вход…</p>
      </section>
    );
  }
  if (user === null || value === null) {
    return <>{fallback(setUser)}</>;
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth доступен только внутри AuthGate');
  }
  return context;
}
