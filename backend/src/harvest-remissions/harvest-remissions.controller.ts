import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { HarvestRemissionsService } from './harvest-remissions.service';
import {
  CreateRemissionDto,
  ListRemissionsQueryDto,
  RemissionPreviewQueryDto,
} from './dto/harvest-remission.dto';
import {
  RequirePermissions,
  RequireAnyPermissions,
} from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/permissions/permission.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { AuthUser } from '../common/types/auth.types';

// Acceder a la pantalla de remisiones: basta con CUALQUIER permiso del módulo
// (ver, crear, recibir o rechazar). Así, un operador con solo "crear" o solo
// "recibir" también puede abrir la pantalla y cargar los datos.
const VIEW_REMISSIONS = [
  PERMISSIONS.HARVEST_REMISSIONS_VIEW,
  PERMISSIONS.HARVEST_REMISSIONS_CREATE,
  PERMISSIONS.POSTHARVEST_REMISSIONS_VIEW,
  PERMISSIONS.POSTHARVEST_REMISSIONS_APPROVE,
  PERMISSIONS.POSTHARVEST_REMISSIONS_REJECT,
];

@Controller('harvest-remissions')
export class HarvestRemissionsController {
  constructor(private readonly service: HarvestRemissionsService) {}

  // 'preview' se declara antes que ':id' para que la ruta no lo capture.
  @RequireAnyPermissions(...VIEW_REMISSIONS)
  @Get('preview')
  preview(@TenantId() tenantId: string | null, @Query() query: RemissionPreviewQueryDto) {
    return this.service.preview(tenantId, query);
  }

  @RequireAnyPermissions(...VIEW_REMISSIONS)
  @Get()
  list(@TenantId() tenantId: string | null, @Query() query: ListRemissionsQueryDto) {
    return this.service.list(tenantId, query);
  }

  @RequireAnyPermissions(...VIEW_REMISSIONS)
  @Get(':id')
  findOne(@TenantId() tenantId: string | null, @Param('id') id: string) {
    return this.service.findOne(tenantId, id);
  }

  // Crear remisiones: permiso granular (cuenta admin o cuenta operativa habilitada).
  @RequirePermissions(PERMISSIONS.HARVEST_REMISSIONS_CREATE)
  @Post()
  create(
    @CurrentUser() actor: AuthUser,
    @TenantId() tenantId: string | null,
    @Body() dto: CreateRemissionDto,
  ) {
    return this.service.create(actor, tenantId, dto);
  }

  // Recibir/autorizar en postcosecha: permiso de aprobación.
  @RequirePermissions(PERMISSIONS.POSTHARVEST_REMISSIONS_APPROVE)
  @Post(':id/receive')
  receive(
    @CurrentUser() actor: AuthUser,
    @TenantId() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.service.receive(actor, tenantId, id);
  }

  // Recepción/validación independiente por calidad (Lote + Calidad).
  @RequirePermissions(PERMISSIONS.POSTHARVEST_REMISSIONS_APPROVE)
  @Post(':id/details/:detailId/receive')
  receiveDetail(
    @CurrentUser() actor: AuthUser,
    @TenantId() tenantId: string | null,
    @Param('id') id: string,
    @Param('detailId') detailId: string,
  ) {
    return this.service.setDetailStatus(actor, tenantId, id, detailId, true);
  }

  @RequirePermissions(PERMISSIONS.POSTHARVEST_REMISSIONS_REJECT)
  @Post(':id/details/:detailId/reject')
  rejectDetail(
    @CurrentUser() actor: AuthUser,
    @TenantId() tenantId: string | null,
    @Param('id') id: string,
    @Param('detailId') detailId: string,
  ) {
    return this.service.setDetailStatus(actor, tenantId, id, detailId, false);
  }
}
