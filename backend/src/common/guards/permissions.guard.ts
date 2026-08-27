import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PERMISSIONS_KEY,
  ANY_PERMISSIONS_KEY,
} from '../decorators/require-permissions.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthUser } from '../types/auth.types';

/**
 * Valida permisos granulares declarados con @RequirePermissions / @RequireAnyPermissions.
 * Convive con RolesGuard: si una ruta no declara permisos, este guard la deja pasar.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const anyRequired = this.reflector.getAllAndOverride<string[]>(
      ANY_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const hasAllRule = !!required && required.length > 0;
    const hasAnyRule = !!anyRequired && anyRequired.length > 0;
    if (!hasAllRule && !hasAnyRule) return true;

    const request = context.switchToHttp().getRequest();
    const user: AuthUser | undefined = request.user;
    const perms = user?.permissions ?? [];

    if (hasAllRule && !required.every((p) => perms.includes(p))) {
      throw new ForbiddenException('No tienes permisos para realizar esta acción');
    }
    if (hasAnyRule && !anyRequired.some((p) => perms.includes(p))) {
      throw new ForbiddenException('No tienes permisos para realizar esta acción');
    }
    return true;
  }
}
