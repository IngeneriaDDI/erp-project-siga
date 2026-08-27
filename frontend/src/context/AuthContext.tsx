import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { api, refreshAccessToken, tenantStore, tokenStore } from '../lib/api';
import type { AuthUser, Role } from '../types';
import type { WeightUnit } from '../lib/weight';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  activeTenantId: string | null;
  /** Unidad de peso efectiva de la empresa (para presentación/entrada). */
  weightUnit: WeightUnit;
  /** Permisos efectivos del usuario (resueltos por el backend). */
  permissions: string[];
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setActiveTenant: (tenantId: string | null, weightUnit?: WeightUnit) => void;
  hasRole: (...roles: Role[]) => boolean;
  /** true si tiene TODOS los permisos indicados. */
  hasPermission: (...perms: string[]) => boolean;
  /** true si tiene AL MENOS UNO de los permisos indicados. */
  hasAnyPermission: (...perms: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  // Unidad de la empresa seleccionada por un SUPER_ADMIN.
  const [activeTenantWeightUnit, setActiveTenantWeightUnit] = useState<WeightUnit>('GRAMS');

  const fetchMe = useCallback(async () => {
    const { data } = await api.get<AuthUser>('/auth/me');
    setUser(data);
    return data;
  }, []);

  useEffect(() => {
    (async () => {
      const token = await refreshAccessToken();
      if (token) {
        try {
          await fetchMe();
        } catch {
          setUser(null);
        }
      }
      setLoading(false);
    })();
  }, [fetchMe]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await api.post('/auth/login', { email, password });
      tokenStore.set(data.accessToken);
      await fetchMe();
    },
    [fetchMe],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignora errores de red al cerrar sesión */
    }
    tokenStore.set(null);
    tenantStore.set(null);
    setActiveTenantId(null);
    setActiveTenantWeightUnit('GRAMS');
    setUser(null);
  }, []);

  const setActiveTenant = useCallback((tenantId: string | null, weightUnit?: WeightUnit) => {
    tenantStore.set(tenantId);
    setActiveTenantId(tenantId);
    setActiveTenantWeightUnit(weightUnit ?? 'GRAMS');
  }, []);

  const hasRole = useCallback(
    (...roles: Role[]) => (user ? roles.includes(user.role) : false),
    [user],
  );

  // SUPER_ADMIN siempre pasa; el resto según permisos efectivos del backend.
  const permissions = useMemo(() => user?.permissions ?? [], [user]);
  const hasPermission = useCallback(
    (...perms: string[]) => {
      if (!user) return false;
      if (user.role === 'SUPER_ADMIN') return true;
      return perms.every((p) => permissions.includes(p));
    },
    [user, permissions],
  );
  const hasAnyPermission = useCallback(
    (...perms: string[]) => {
      if (!user) return false;
      if (user.role === 'SUPER_ADMIN') return true;
      return perms.some((p) => permissions.includes(p));
    },
    [user, permissions],
  );

  // Unidad efectiva: SUPER_ADMIN usa la de la empresa seleccionada;
  // los demás usuarios usan la de su propia empresa (default GRAMS).
  const weightUnit: WeightUnit =
    user?.role === 'SUPER_ADMIN'
      ? activeTenantWeightUnit
      : user?.tenant?.weightUnit ?? 'GRAMS';

  const value = useMemo(
    () => ({
      user,
      loading,
      activeTenantId,
      weightUnit,
      permissions,
      login,
      logout,
      setActiveTenant,
      hasRole,
      hasPermission,
      hasAnyPermission,
    }),
    [
      user,
      loading,
      activeTenantId,
      weightUnit,
      permissions,
      login,
      logout,
      setActiveTenant,
      hasRole,
      hasPermission,
      hasAnyPermission,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
