import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ProductionOrdersService } from './production-orders.service';
import {
  CreateOrderDto,
  ListOrdersQueryDto,
  OrderPreviewQueryDto,
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
    return this.service.create(actor, tenantId, dto);
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
