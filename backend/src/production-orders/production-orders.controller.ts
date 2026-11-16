import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ProductionOrdersService } from './production-orders.service';
import {
  CreateOrderDto,
  ListOrdersQueryDto,
  OrderPreviewQueryDto,
  UpdateOrderDateDto,
} from './dto/production-order.dto';
import {
  RequirePermissions,
  RequireAnyPermissions,
} from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/permissions/permission.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { AuthUser } from '../common/types/auth.types';

// Acceder a la pantalla de órdenes: basta con CUALQUIER permiso del módulo
// (ver, crear, aceptar o rechazar).
const VIEW_ORDERS = [
  PERMISSIONS.HARVEST_PRODUCTION_ORDERS_VIEW,
  PERMISSIONS.HARVEST_PRODUCTION_ORDERS_CREATE,
  PERMISSIONS.POSTHARVEST_PRODUCTION_ORDERS_VIEW,
  PERMISSIONS.POSTHARVEST_PRODUCTION_ORDERS_APPROVE,
  PERMISSIONS.POSTHARVEST_PRODUCTION_ORDERS_REJECT,
];

@Controller('production-orders')
export class ProductionOrdersController {
  constructor(private readonly service: ProductionOrdersService) {}

  @RequireAnyPermissions(...VIEW_ORDERS)
  @Get('preview')
  preview(@TenantId() tenantId: string | null, @Query() query: OrderPreviewQueryDto) {
    return this.service.preview(tenantId, query);
  }

  @RequireAnyPermissions(...VIEW_ORDERS)
  @Get()
  list(@TenantId() tenantId: string | null, @Query() query: ListOrdersQueryDto) {
    return this.service.list(tenantId, query);
  }

  @RequireAnyPermissions(...VIEW_ORDERS)
  @Get(':id')
  findOne(@TenantId() tenantId: string | null, @Param('id') id: string) {
    return this.service.findOne(tenantId, id);
  }

  // Crear órdenes: permiso granular (cuenta admin o cuenta operativa habilitada).
  @RequirePermissions(PERMISSIONS.HARVEST_PRODUCTION_ORDERS_CREATE)
  @Post()
  create(
    @CurrentUser() actor: AuthUser,
    @TenantId() tenantId: string | null,
    @Body() dto: CreateOrderDto,
  ) {
    // Abre la orden del día (sin totales).
    return this.service.open(actor, tenantId, dto);
  }

  // "Cerrar y calcular": totales con TODOS los registros de la finca ese día.
  @RequirePermissions(PERMISSIONS.HARVEST_PRODUCTION_ORDERS_CREATE)
  @Post(':id/close')
  close(
    @CurrentUser() actor: AuthUser,
    @TenantId() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.service.close(actor, tenantId, id);
  }

  // Reabrir, recalcular y corregir la fecha de una orden (nunca si ya fue aceptada).
  @RequirePermissions(PERMISSIONS.HARVEST_PRODUCTION_ORDERS_REOPEN)
  @Post(':id/reopen')
  reopen(
    @CurrentUser() actor: AuthUser,
    @TenantId() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.service.reopen(actor, tenantId, id);
  }

  @RequirePermissions(PERMISSIONS.HARVEST_PRODUCTION_ORDERS_REOPEN)
  @Post(':id/recalculate')
  recalculate(
    @CurrentUser() actor: AuthUser,
    @TenantId() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.service.recalculate(actor, tenantId, id);
  }

  @RequirePermissions(PERMISSIONS.HARVEST_PRODUCTION_ORDERS_REOPEN)
  @Patch(':id/date')
  updateDate(
    @CurrentUser() actor: AuthUser,
    @TenantId() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateOrderDateDto,
  ) {
    return this.service.updateDate(actor, tenantId, id, dto);
  }

  // Aceptar/autorizar en postcosecha: permiso de aprobación.
  @RequirePermissions(PERMISSIONS.POSTHARVEST_PRODUCTION_ORDERS_APPROVE)
  @Post(':id/accept')
  accept(
    @CurrentUser() actor: AuthUser,
    @TenantId() tenantId: string | null,
    @Param('id') id: string,
  ) {
    return this.service.accept(actor, tenantId, id);
  }
}
