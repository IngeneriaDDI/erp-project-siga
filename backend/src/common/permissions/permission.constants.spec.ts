import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  effectivePermissions,
} from './permission.constants';
import type { Role } from '@prisma/client';

describe('effectivePermissions', () => {
  it('SUPER_ADMIN siempre tiene TODOS los permisos, ignorando overrides', () => {
    expect(effectivePermissions('SUPER_ADMIN' as Role, [])).toEqual(ALL_PERMISSIONS);
    expect(effectivePermissions('SUPER_ADMIN' as Role, [PERMISSIONS.HARVEST_RECORDS_VIEW])).toEqual(
      ALL_PERMISSIONS,
    );
    expect(effectivePermissions('SUPER_ADMIN' as Role, null)).toEqual(ALL_PERMISSIONS);
  });

  it('ADMIN_TENANT sin override usa la plantilla del rol', () => {
    const perms = effectivePermissions('ADMIN_TENANT' as Role, null);
    expect(perms).toEqual(ROLE_PERMISSIONS.ADMIN_TENANT);
    // El admin gestiona remisiones/órdenes y asigna operadores.
    expect(perms).toContain(PERMISSIONS.HARVEST_REMISSIONS_CREATE);
    expect(perms).toContain(PERMISSIONS.POSTHARVEST_REMISSIONS_APPROVE);
    expect(perms).toContain(PERMISSIONS.OPERATIONAL_ASSIGNMENTS_MANAGE);
  });

  it('OPERADOR_COSECHA por defecto SOLO puede registros de cosecha', () => {
    const perms = effectivePermissions('OPERADOR_COSECHA' as Role, null);
    expect(perms).toEqual(ROLE_PERMISSIONS.OPERADOR_COSECHA);
    expect(perms).toContain(PERMISSIONS.HARVEST_RECORDS_CREATE);
    // No crea remisiones ni órdenes salvo override explícito.
    expect(perms).not.toContain(PERMISSIONS.HARVEST_REMISSIONS_CREATE);
    expect(perms).not.toContain(PERMISSIONS.POSTHARVEST_REMISSIONS_APPROVE);
  });

  it('un override explícito reemplaza a la plantilla del rol (cuenta operativa)', () => {
    const override = [PERMISSIONS.HARVEST_RECORDS_CREATE, PERMISSIONS.HARVEST_REMISSIONS_CREATE];
    const perms = effectivePermissions('OPERADOR_COSECHA' as Role, override);
    expect(perms).toEqual(override);
    // Ya puede crear remisiones porque su CUENTA lo habilita.
    expect(perms).toContain(PERMISSIONS.HARVEST_REMISSIONS_CREATE);
  });

  it('LECTOR solo tiene permisos de lectura', () => {
    const perms = effectivePermissions('LECTOR' as Role, null);
    expect(perms).toContain(PERMISSIONS.HARVEST_RECORDS_VIEW);
    expect(perms).toContain(PERMISSIONS.POSTHARVEST_REMISSIONS_VIEW);
    // Nunca escribe.
    expect(perms).not.toContain(PERMISSIONS.HARVEST_RECORDS_CREATE);
    expect(perms).not.toContain(PERMISSIONS.POSTHARVEST_REMISSIONS_APPROVE);
    expect(perms.every((p) => p.endsWith('.view'))).toBe(true);
  });

  it('un override vacío cae de vuelta a la plantilla del rol (retrocompatible)', () => {
    expect(effectivePermissions('ADMIN_TENANT' as Role, [])).toEqual(ROLE_PERMISSIONS.ADMIN_TENANT);
  });
});
