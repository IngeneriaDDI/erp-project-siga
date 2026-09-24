import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Role } from '@prisma/client';
import { FieldConfigService } from './field-config.service';
import { UpdateHarvestFieldConfigDto } from './dto/field-config.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';

@Controller('module-field-config')
export class FieldConfigController {
  constructor(private readonly service: FieldConfigService) {}

  // Lectura: cualquier usuario (el formulario de cosecha necesita la config).
  @Get('harvest')
  getHarvest(@TenantId() tenantId: string | null) {
    return this.service.getHarvestConfig(tenantId);
  }

  // Ajustes a nivel empresa (p. ej. filtrar trabajadores por finca). Cualquier usuario.
  @Get('harvest-settings')
  getHarvestSettings(@TenantId() tenantId: string | null) {
    return this.service.getTenantHarvestSettings(tenantId);
  }

  // Escritura: solo el administrador global (SUPER_ADMIN).
  @Roles(Role.SUPER_ADMIN)
  @Patch('harvest')
  updateHarvest(
    @TenantId() tenantId: string | null,
    @Body() dto: UpdateHarvestFieldConfigDto,
  ) {
    return this.service.updateHarvestConfig(tenantId, dto);
  }
}
