import { Body, Controller, Get, Header, Post } from '@nestjs/common';
import { MastersImportService } from './masters-import.service';
import { MasterImportCsvDto } from './dto/masters-import.dto';
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/permissions/permission.constants';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { WORKER_TEMPLATE, LOT_TEMPLATE } from './masters-import.constants';

@Controller('masters-imports')
export class MastersImportController {
  constructor(private readonly service: MastersImportService) {}

  // ---- Trabajadores ----
  @RequirePermissions(PERMISSIONS.ADMIN_WORKERS_MANAGE)
  @Post('workers/validate')
  validateWorkers(@TenantId() tenantId: string | null, @Body() dto: MasterImportCsvDto) {
    return this.service.validateWorkers(tenantId, dto.csv);
  }

  @RequirePermissions(PERMISSIONS.ADMIN_WORKERS_MANAGE)
  @Post('workers/commit')
  importWorkers(@TenantId() tenantId: string | null, @Body() dto: MasterImportCsvDto) {
    return this.service.importWorkers(tenantId, dto.csv);
  }

  // ---- Lotes ----
  @RequirePermissions(PERMISSIONS.ADMIN_LOTS_MANAGE)
  @Post('lots/validate')
  validateLots(@TenantId() tenantId: string | null, @Body() dto: MasterImportCsvDto) {
    return this.service.validateLots(tenantId, dto.csv);
  }

  @RequirePermissions(PERMISSIONS.ADMIN_LOTS_MANAGE)
  @Post('lots/commit')
  importLots(@TenantId() tenantId: string | null, @Body() dto: MasterImportCsvDto) {
    return this.service.importLots(tenantId, dto.csv);
  }

  // ---- Plantillas y referencias ----
  @RequirePermissions(PERMISSIONS.ADMIN_WORKERS_MANAGE)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="plantilla_trabajadores.csv"')
  @Get('files/workers-template')
  workersTemplate() {
    return WORKER_TEMPLATE.join(',');
  }

  @RequirePermissions(PERMISSIONS.ADMIN_LOTS_MANAGE)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="plantilla_lotes.csv"')
  @Get('files/lots-template')
  lotsTemplate() {
    return LOT_TEMPLATE.join(',');
  }

  @RequireAnyPermissions(PERMISSIONS.ADMIN_WORKERS_MANAGE, PERMISSIONS.ADMIN_LOTS_MANAGE)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="referencias_fincas.csv"')
  @Get('files/references/farms')
  farmsReference(@TenantId() tenantId: string | null) {
    return this.service.farmsReferenceCsv(tenantId);
  }
}
