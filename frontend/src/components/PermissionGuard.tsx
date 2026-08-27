import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Bloquea contenido según permisos granulares. La autoridad real está en el
 * backend (guards); esto solo evita mostrar pantallas sin acceso.
 * - allOf: exige TODOS los permisos.
 * - anyOf: exige AL MENOS UNO.
 */
export function PermissionGuard({
  allOf,
  anyOf,
  children,
}: {
  allOf?: string[];
  anyOf?: string[];
  children: ReactNode;
}) {
  const { user, hasPermission, hasAnyPermission } = useAuth();
  if (!user) return <Navigate to="/login" replace />;

  const okAll = allOf && allOf.length > 0 ? hasPermission(...allOf) : true;
  const okAny = anyOf && anyOf.length > 0 ? hasAnyPermission(...anyOf) : true;
  if (!okAll || !okAny) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}
