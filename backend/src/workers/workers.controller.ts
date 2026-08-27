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
import { WorkersService } from './workers.service';
import { CreateWorkerDto, QueryWorkerDto, UpdateWorkerDto } from './dto/worker.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { UpdateStatusDto } from '../common/dto/update-status.dto';

@Controller('workers')
export class WorkersController {
  constructor(private readonly service: WorkersService) {}

  @Get()
  findAll(@TenantId() tenantId: string | null, @Query() query: QueryWorkerDto) {
    return this.service.findAll(tenantId, query);
  }

  @Get(':id')
  findOne(@TenantId() tenantId: string | null, @Param('id') id: string) {
    return this.service.findOne(tenantId, id);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN_TENANT)
  @Post()
  create(@TenantId() tenantId: string | null, @Body() dto: CreateWorkerDto) {
    return this.service.create(tenantId, dto);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN_TENANT)
  @Patch(':id')
  update(
    @TenantId() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateWorkerDto,
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
