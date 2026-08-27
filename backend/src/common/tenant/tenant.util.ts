import { BadRequestException } from '@nestjs/common';

/**
 * Garantiza que exista un tenant efectivo. Úsalo en servicios que operan
 * sobre datos de un tenant. Si un SUPER_ADMIN no envió X-Tenant-Id, falla.
 */
export function requireTenant(tenantId: string | null): string {
  if (!tenantId) {
    throw new BadRequestException(
      'Falta el contexto de tenant. Si eres SUPER_ADMIN, envía el header X-Tenant-Id.',
    );
  }
  return tenantId;
}
