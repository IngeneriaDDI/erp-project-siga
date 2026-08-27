import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { HarvestService } from './harvest.service';
import { QueryHarvestDto, SaveHarvestRecordDto } from './dto/harvest.dto';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/permissions/permission.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { AuthUser } from '../common/types/auth.types';

@Controller('harvest-records')
export class HarvestController {
  constructor(private readonly service: HarvestService) {}

  // Lectura: permiso granular de ver registros (dentro de su tenant).
  @RequirePermissions(PERMISSIONS.HARVEST_RECORDS_VIEW)
  @Get()
  findAll(@TenantId() tenantId: string | null, @Query() query: QueryHarvestDto) {
    return this.service.findAll(tenantId, query);
  }

  @RequirePermissions(PERMISSIONS.HARVEST_RECORDS_VIEW)
  @Get(':id')
  findOne(@TenantId() tenantId: string | null, @Param('id') id: string) {
    return this.service.findOne(tenantId, id);
  }

  @RequirePermissions(PERMISSIONS.HARVEST_RECORDS_CREATE)
  @Post()
  create(
    @CurrentUser() actor: AuthUser,
    @TenantId() tenantId: string | null,
    @Body() dto: SaveHarvestRecordDto,
  ) {
    return this.service.create(actor, tenantId, dto);
  }

  @RequirePermissions(PERMISSIONS.HARVEST_RECORDS_UPDATE)
  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @TenantId() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: SaveHarvestRecordDto,
  ) {
    return this.service.update(actor, tenantId, id, dto);
  }

  @RequirePermissions(PERMISSIONS.HARVEST_RECORDS_UPDATE)
  @Patch(':id/cancel')
  cancel(@TenantId() tenantId: string | null, @Param('id') id: string) {
    return this.service.cancel(tenantId, id);
  }
}
