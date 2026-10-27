import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ProductionGoalsService } from './production-goals.service';
import { GoalsImportService } from './goals-import.service';
import { MasterImportCsvDto } from '../masters-import/dto/masters-import.dto';
import { QueryGoalsDto, SaveGoalsDto, UpdateGoalsDto } from './dto/production-goal.dto';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/permissions/permission.constants';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth.types';

@Controller('production-goals')
export class ProductionGoalsController {
  constructor(
    private readonly service: ProductionGoalsService,
    private readonly importer: GoalsImportService,
  ) {}

  // ---- Importación masiva (rutas fijas antes de ':lotId/:year') ----
  @RequirePermissions(PERMISSIONS.ADMIN_GOALS_MANAGE)
  @Post('import/validate')
  validateImport(@TenantId() tenantId: string | null, @Body() dto: MasterImportCsvDto) {
    return this.importer.validate(tenantId, dto.csv);
  }

  @RequirePermissions(PERMISSIONS.ADMIN_GOALS_MANAGE)
  @Post('import/commit')
  commitImport(
    @TenantId() tenantId: string | null,
    @CurrentUser() actor: AuthUser,
    @Body() dto: MasterImportCsvDto,
  ) {
    return this.importer.commit(tenantId, actor.userId, dto.csv);
  }

  @RequirePermissions(PERMISSIONS.ADMIN_GOALS_MANAGE)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="plantilla_metas.csv"')
  @Get('import/template')
  template() {
    return this.importer.templateCsv();
  }

  @RequirePermissions(PERMISSIONS.ADMIN_GOALS_VIEW)
  @Get()
  list(@TenantId() tenantId: string | null, @Query() query: QueryGoalsDto) {
    return this.service.list(tenantId, query);
  }

  @RequirePermissions(PERMISSIONS.ADMIN_GOALS_VIEW)
  @Get(':lotId/:year')
  findOne(
    @TenantId() tenantId: string | null,
    @Param('lotId', ParseUUIDPipe) lotId: string,
    @Param('year', ParseIntPipe) year: number,
  ) {
    return this.service.findOne(tenantId, lotId, year);
  }

  @RequirePermissions(PERMISSIONS.ADMIN_GOALS_MANAGE)
  @Post()
  create(
    @TenantId() tenantId: string | null,
    @CurrentUser() actor: AuthUser,
    @Body() dto: SaveGoalsDto,
  ) {
    return this.service.create(tenantId, actor.userId, dto);
  }

  @RequirePermissions(PERMISSIONS.ADMIN_GOALS_MANAGE)
  @Patch(':lotId/:year')
  update(
    @TenantId() tenantId: string | null,
    @CurrentUser() actor: AuthUser,
    @Param('lotId', ParseUUIDPipe) lotId: string,
    @Param('year', ParseIntPipe) year: number,
    @Body() dto: UpdateGoalsDto,
  ) {
    return this.service.update(tenantId, actor.userId, lotId, year, dto.months);
  }

  @RequirePermissions(PERMISSIONS.ADMIN_GOALS_MANAGE)
  @Delete(':lotId/:year')
  remove(
    @TenantId() tenantId: string | null,
    @Param('lotId', ParseUUIDPipe) lotId: string,
    @Param('year', ParseIntPipe) year: number,
  ) {
    return this.service.remove(tenantId, lotId, year);
  }
}
