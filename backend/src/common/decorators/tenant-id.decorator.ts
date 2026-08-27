import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from '../types/auth.types';

/**
 * Devuelve el tenant EFECTIVO de la petición (fuente de verdad del backend).
 *
 * - Usuarios normales: SIEMPRE su propio tenant (tomado del token JWT).
 *   Nunca se acepta un tenant_id enviado por el cliente.
 * - SUPER_ADMIN: puede operar sobre cualquier tenant indicándolo en el
 *   header `X-Tenant-Id`. Si no lo envía, devuelve null.
 */
export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const request = ctx.switchToHttp().getRequest();
    const user: AuthUser | undefined = request.user;
    if (!user) return null;

    if (user.role === 'SUPER_ADMIN') {
      const header = request.headers['x-tenant-id'];
      return header ? String(header) : null;
    }

    return user.tenantId ?? null;
  },
);
