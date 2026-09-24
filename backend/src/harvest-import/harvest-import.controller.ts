import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
} from '@nestjs/common';
import { ImportSource, ImportStatus } from '@prisma/client';
import { HarvestImportService } from './harvest-import.service';
import { HarvestImportExportService } from './harvest-import-export.service';
import { CloseBatchDto, ImportCsvDto, OpenBatchDto } from './dto/harvest-import.dto';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/permissions/permission.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { AuthUser } from '../common/types/auth.types';
import { ValidateOptions } from './harvest-import.types';

@Controller('harvest-imports')
export class HarvestImportController {
  constructor(
    private readonly service: HarvestImportService,
    private readonly exporter: HarvestImportExportService,
  ) {}

  /** allowInactive solo lo puede pedir un SUPER_ADMIN (modo histórico). */
  private resolveOptions(actor: AuthUser, allowInactive?: boolean): ValidateOptions {
    const allow = allowInactive === true && actor.role === 'SUPER_ADMIN';
    return { allowInactive: allow, duplicateMode: allow ? 'skip' : 'error' };
  }

  // ---- Validación (dry-run) ----
  @RequirePermissions(PERMISSIONS.HARVEST_RECORDS_IMPORT)
  @Post('validate')
  validate(
    @CurrentUser() actor: AuthUser,
    @TenantId() tenantId: string | null,
    @Body() dto: ImportCsvDto,
  ) {
    // El script (super admin) no aplica el límite de la UI.
    const enforceUiLimit = actor.role !== 'SUPER_ADMIN';
    return this.service.validate(tenantId, dto.csv, this.resolveOptions(actor, dto.allowInactive), enforceUiLimit);
  }

  // ---- Commit desde la UI (job en background) ----
  @RequirePermissions(PERMISSIONS.HARVEST_RECORDS_IMPORT)
  @Post('commit')
  commit(
    @CurrentUser() actor: AuthUser,
    @TenantId() tenantId: string | null,
    @Body() dto: ImportCsvDto,
  ) {
    return this.service.commitInBackground(
      tenantId,
      actor.userId,
      dto.csv,
      this.resolveOptions(actor, dto.allowInactive),
      dto.fileName ?? null,
    );
  }

  // ---- Sesión de lote por chunks (script histórico) ----
  @RequirePermissions(PERMISSIONS.HARVEST_RECORDS_IMPORT)
  @Post('batches')
  openBatch(
    @CurrentUser() actor: AuthUser,
    @TenantId() tenantId: string | null,
    @Body() dto: OpenBatchDto,
  ) {
    const opts = this.resolveOptions(actor, dto.allowInactive);
    return this.service.createBatch(
      tenantId,
      actor.userId,
      ImportSource.SCRIPT,
      dto.fileName ?? null,
      opts.allowInactive,
    );
  }

  @RequirePermissions(PERMISSIONS.HARVEST_RECORDS_IMPORT)
  @Post('batches/:id/chunk')
  chunk(
    @CurrentUser() actor: AuthUser,
    @TenantId() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: ImportCsvDto,
  ) {
    return this.service.ingestChunk(
      tenantId,
      actor.userId,
      id,
      dto.csv,
      this.resolveOptions(actor, dto.allowInactive),
    );
  }

  @RequirePermissions(PERMISSIONS.HARVEST_RECORDS_IMPORT)
  @Post('batches/:id/close')
  closeBatch(
    @TenantId() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: CloseBatchDto,
  ) {
    const status = dto.success === false ? ImportStatus.FAILED : ImportStatus.COMPLETED;
    return this.service.closeBatch(tenantId, id, status);
  }

  @RequirePermissions(PERMISSIONS.HARVEST_RECORDS_IMPORT)
  @Get(':id')
  getBatch(@TenantId() tenantId: string | null, @Param('id') id: string) {
    return this.service.getBatch(tenantId, id);
  }

  @RequirePermissions(PERMISSIONS.HARVEST_RECORDS_REVERT)
  @Post(':id/revert')
  revert(@TenantId() tenantId: string | null, @Param('id') id: string) {
    return this.service.revert(tenantId, id);
  }

  // ---- Exportación / plantilla / referencias ----
  @RequirePermissions(PERMISSIONS.HARVEST_RECORDS_IMPORT)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="plantilla_cosecha.csv"')
  @Get('files/template')
  template() {
    return this.service.templateCsv();
  }

  @RequirePermissions(PERMISSIONS.HARVEST_RECORDS_IMPORT)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="registros_cosecha.csv"')
  @Get('files/export')
  exportRecords(@TenantId() tenantId: string | null) {
    return this.exporter.exportRecords(tenantId);
  }

  @RequirePermissions(PERMISSIONS.HARVEST_RECORDS_IMPORT)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="referencias_trabajadores.csv"')
  @Get('files/references/workers')
  refWorkers(@TenantId() tenantId: string | null) {
    return this.exporter.referencesWorkers(tenantId);
  }

  @RequirePermissions(PERMISSIONS.HARVEST_RECORDS_IMPORT)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="referencias_lotes.csv"')
  @Get('files/references/lots')
  refLots(@TenantId() tenantId: string | null) {
    return this.exporter.referencesLots(tenantId);
  }

  @RequirePermissions(PERMISSIONS.HARVEST_RECORDS_IMPORT)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="referencias_calidades.csv"')
  @Get('files/references/qualities')
  refQualities(@TenantId() tenantId: string | null) {
    return this.exporter.referencesQualities(tenantId);
  }

  @RequirePermissions(PERMISSIONS.HARVEST_RECORDS_IMPORT)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="referencias_canastillas.csv"')
  @Get('files/references/containers')
  refContainers(@TenantId() tenantId: string | null) {
    return this.exporter.referencesContainers(tenantId);
  }
}
