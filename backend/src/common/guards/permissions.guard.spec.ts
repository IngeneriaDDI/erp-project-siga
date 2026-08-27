import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import {
  PERMISSIONS_KEY,
  ANY_PERMISSIONS_KEY,
} from '../decorators/require-permissions.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Construye un ExecutionContext falso cuyo req.user tiene los permisos dados,
 * y un Reflector que devuelve la metadata configurada por clave.
 */
function makeContext(
  permissions: string[],
  meta: { public?: boolean; all?: string[]; any?: string[] },
) {
  const reflector = {
    getAllAndOverride: (key: string) => {
      if (key === IS_PUBLIC_KEY) return meta.public ?? false;
      if (key === PERMISSIONS_KEY) return meta.all;
      if (key === ANY_PERMISSIONS_KEY) return meta.any;
      return undefined;
    },
  } as unknown as Reflector;

  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user: { permissions } }) }),
  } as unknown as ExecutionContext;

  return { guard: new PermissionsGuard(reflector), context };
}

describe('PermissionsGuard', () => {
  it('permite rutas sin metadata de permisos', () => {
    const { guard, context } = makeContext([], {});
    expect(guard.canActivate(context)).toBe(true);
  });

  it('permite rutas públicas aunque el usuario no tenga permisos', () => {
    const { guard, context } = makeContext([], { public: true, all: ['harvest.records.view'] });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allOf: exige TODOS los permisos', () => {
    const ok = makeContext(['a', 'b'], { all: ['a', 'b'] });
    expect(ok.guard.canActivate(ok.context)).toBe(true);

    const missing = makeContext(['a'], { all: ['a', 'b'] });
    expect(() => missing.guard.canActivate(missing.context)).toThrow(ForbiddenException);
  });

  it('anyOf: basta con UN permiso (vista cosecha o postcosecha)', () => {
    const ok = makeContext(['postharvest.remissions.view'], {
      any: ['harvest.remissions.view', 'postharvest.remissions.view'],
    });
    expect(ok.guard.canActivate(ok.context)).toBe(true);

    const none = makeContext(['otra'], {
      any: ['harvest.remissions.view', 'postharvest.remissions.view'],
    });
    expect(() => none.guard.canActivate(none.context)).toThrow(ForbiddenException);
  });

  it('un operador sin permiso de crear remisiones es rechazado (403)', () => {
    const { guard, context } = makeContext(['harvest.records.create'], {
      all: ['harvest.remissions.create'],
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
