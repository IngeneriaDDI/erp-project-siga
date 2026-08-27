import { Controller, Get } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { ALL_PERMISSIONS, ROLE_PERMISSIONS } from '../common/permissions/permission.constants';

// Catálogo de permisos y plantillas por rol (para el editor de permisos).
@Roles(Role.SUPER_ADMIN)
@Controller('permissions')
export class PermissionsController {
  @Get('catalog')
  catalog() {
    return { permissions: ALL_PERMISSIONS, roleTemplates: ROLE_PERMISSIONS };
  }
}
