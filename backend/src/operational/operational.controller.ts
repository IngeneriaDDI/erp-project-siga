import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { OperationalContext } from '@prisma/client';
import { OperationalAssignmentService } from './operational-assignment.service';
import { AssignWorkerDto, SetPositionConfigDto } from './dto/operational.dto';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { AuthUser } from '../common/types/auth.types';
import { PERMISSIONS } from '../common/permissions/permission.constants';

function parseContext(value: string): OperationalContext {
  if ((Object.values(OperationalContext) as string[]).includes(value)) {
    return value as OperationalContext;
  }
  throw new BadRequestException('Contexto operativo inválido');
}

@Controller('operational')
export class OperationalController {
  constructor(private readonly service: OperationalAssignmentService) {}

  // Estado del usuario actual (quién firma / si está bloqueado). Cualquier autenticado.
  @Get('my-status')
  myStatus(@CurrentUser() user: AuthUser) {
    return this.service.myStatus(user);
  }

  @RequirePermissions(PERMISSIONS.OPERATIONAL_ASSIGNMENTS_MANAGE)
  @Get('assignments')
  listActive(@TenantId() tenantId: string | null) {
    return this.service.listActive(tenantId);
  }

  @RequirePermissions(PERMISSIONS.OPERATIONAL_ASSIGNMENTS_MANAGE)
  @Post('assignments')
  assign(
    @CurrentUser() actor: AuthUser,
    @TenantId() tenantId: string | null,
    @Body() dto: AssignWorkerDto,
  ) {
    return this.service.assign(actor, tenantId, dto);
  }

  @RequirePermissions(PERMISSIONS.OPERATIONAL_ASSIGNMENTS_MANAGE)
  @Delete('assignments/:context')
  clear(@TenantId() tenantId: string | null, @Param('context') context: string) {
    return this.service.clear(tenantId, parseContext(context));
  }

  @RequirePermissions(PERMISSIONS.OPERATIONAL_ASSIGNMENTS_MANAGE)
  @Get('assignments/:context/history')
  history(@TenantId() tenantId: string | null, @Param('context') context: string) {
    return this.service.history(tenantId, parseContext(context));
  }

  // Config de posiciones: lectura para admins, escritura solo super admin (identity).
  @RequirePermissions(PERMISSIONS.OPERATIONAL_ASSIGNMENTS_MANAGE)
  @Get('positions')
  getPositions(@TenantId() tenantId: string | null) {
    return this.service.getPositions(tenantId);
  }

  @RequirePermissions(PERMISSIONS.CONFIG_IDENTITY_MANAGE)
  @Put('positions')
  setPosition(@TenantId() tenantId: string | null, @Body() dto: SetPositionConfigDto) {
    return this.service.setPosition(tenantId, dto);
  }
}
