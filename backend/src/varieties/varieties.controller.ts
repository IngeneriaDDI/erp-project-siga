import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { VarietiesService } from './varieties.service';
import { CreateVarietyDto, QueryVarietyDto, UpdateVarietyDto } from './dto/variety.dto';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/permissions/permission.constants';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { UpdateStatusDto } from '../common/dto/update-status.dto';

@Controller('varieties')
export class VarietiesController {
  constructor(private readonly service: VarietiesService) {}

  // Lectura abierta a cualquier usuario autenticado (alimenta los desplegables).
  @Get()
  findAll(@TenantId() tenantId: string | null, @Query() query: QueryVarietyDto) {
    return this.service.findAll(tenantId, query);
  }

  @Get(':id')
  findOne(@TenantId() tenantId: string | null, @Param('id') id: string) {
    return this.service.findOne(tenantId, id);
  }

  @RequirePermissions(PERMISSIONS.ADMIN_VARIETIES_MANAGE)
  @Post()
  create(@TenantId() tenantId: string | null, @Body() dto: CreateVarietyDto) {
    return this.service.create(tenantId, dto);
  }

  @RequirePermissions(PERMISSIONS.ADMIN_VARIETIES_MANAGE)
  @Patch(':id')
  update(
    @TenantId() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateVarietyDto,
  ) {
    return this.service.update(tenantId, id, dto);
  }

  @RequirePermissions(PERMISSIONS.ADMIN_VARIETIES_MANAGE)
  @Patch(':id/status')
  setStatus(
    @TenantId() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.service.setStatus(tenantId, id, dto.status);
  }
}
