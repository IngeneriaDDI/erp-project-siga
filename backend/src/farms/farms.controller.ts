import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { FarmsService } from './farms.service';
import { CreateFarmDto, QueryFarmDto, UpdateFarmDto } from './dto/farm.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { UpdateStatusDto } from '../common/dto/update-status.dto';

@Controller('farms')
export class FarmsController {
  constructor(private readonly service: FarmsService) {}

  // Lectura: cualquier usuario autenticado (siempre dentro de su tenant).
  @Get()
  findAll(@TenantId() tenantId: string | null, @Query() query: QueryFarmDto) {
    return this.service.findAll(tenantId, query.status);
  }

  @Get(':id')
  findOne(@TenantId() tenantId: string | null, @Param('id') id: string) {
    return this.service.findOne(tenantId, id);
  }

  // Escritura: solo administradores.
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_TENANT)
  @Post()
  create(@TenantId() tenantId: string | null, @Body() dto: CreateFarmDto) {
    return this.service.create(tenantId, dto);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN_TENANT)
  @Patch(':id')
  update(
    @TenantId() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateFarmDto,
  ) {
    return this.service.update(tenantId, id, dto);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN_TENANT)
  @Patch(':id/status')
  setStatus(
    @TenantId() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.service.setStatus(tenantId, id, dto.status);
  }
}
