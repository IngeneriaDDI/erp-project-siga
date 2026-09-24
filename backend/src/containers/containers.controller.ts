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
import { ContainersService } from './containers.service';
import {
  CreateContainerDto,
  QueryContainerDto,
  SetDefaultContainerDto,
  UpdateContainerDto,
} from './dto/container.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { UpdateStatusDto } from '../common/dto/update-status.dto';

@Controller('containers')
export class ContainersController {
  constructor(private readonly service: ContainersService) {}

  @Get()
  findAll(@TenantId() tenantId: string | null, @Query() query: QueryContainerDto) {
    return this.service.findAll(tenantId, query.status);
  }

  @Get(':id')
  findOne(@TenantId() tenantId: string | null, @Param('id') id: string) {
    return this.service.findOne(tenantId, id);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN_TENANT)
  @Post()
  create(@TenantId() tenantId: string | null, @Body() dto: CreateContainerDto) {
    return this.service.create(tenantId, dto);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN_TENANT)
  @Patch(':id')
  update(
    @TenantId() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateContainerDto,
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

  // Marca/desmarca el recipiente por defecto de la empresa (admin del tenant).
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_TENANT)
  @Patch(':id/default')
  setDefault(
    @TenantId() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: SetDefaultContainerDto,
  ) {
    return this.service.setDefault(tenantId, id, dto.isDefault);
  }
}
