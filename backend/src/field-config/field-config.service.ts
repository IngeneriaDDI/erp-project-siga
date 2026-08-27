import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { requireTenant } from '../common/tenant/tenant.util';
import {
  HARVEST_CONFIGURABLE_FIELDS,
  HARVEST_MODULE,
  HarvestConfigurableField,
} from '../common/constants/harvest-fields';
import { UpdateHarvestFieldConfigDto } from './dto/field-config.dto';

export interface FieldConfigEntry {
  fieldName: string;
  isVisible: boolean;
  isRequired: boolean;
}

@Injectable()
export class FieldConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /** Devuelve la config de cosecha, completando con defaults los campos faltantes. */
  async getHarvestConfig(tenantId: string | null): Promise<FieldConfigEntry[]> {
    const tid = requireTenant(tenantId);
    const rows = await this.prisma.tenantModuleFieldConfig.findMany({
      where: { tenantId: tid, moduleName: HARVEST_MODULE },
    });
    const byField = new Map(rows.map((r) => [r.fieldName, r]));

    return HARVEST_CONFIGURABLE_FIELDS.map((fieldName) => {
      const existing = byField.get(fieldName);
      return {
        fieldName,
        isVisible: existing ? existing.isVisible : true,
        isRequired: existing ? existing.isRequired : false,
      };
    });
  }

  /** Igual que getHarvestConfig pero como Map, para el módulo de cosecha. */
  async getHarvestConfigMap(
    tenantId: string | null,
  ): Promise<Map<HarvestConfigurableField, { isVisible: boolean; isRequired: boolean }>> {
    const entries = await this.getHarvestConfig(tenantId);
    return new Map(
      entries.map((e) => [
        e.fieldName as HarvestConfigurableField,
        { isVisible: e.isVisible, isRequired: e.isRequired },
      ]),
    );
  }

  /** Upsert de la configuración enviada. */
  async updateHarvestConfig(tenantId: string | null, dto: UpdateHarvestFieldConfigDto) {
    const tid = requireTenant(tenantId);

    // Regla: un campo obligatorio no puede estar oculto.
    for (const item of dto.items) {
      if (item.isRequired && !item.isVisible) {
        throw new BadRequestException(
          `El campo "${item.fieldName}" no puede ser obligatorio y estar oculto a la vez.`,
        );
      }
    }

    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.tenantModuleFieldConfig.upsert({
          where: {
            tenantId_moduleName_fieldName: {
              tenantId: tid,
              moduleName: HARVEST_MODULE,
              fieldName: item.fieldName,
            },
          },
          update: { isVisible: item.isVisible, isRequired: item.isRequired },
          create: {
            tenantId: tid,
            moduleName: HARVEST_MODULE,
            fieldName: item.fieldName,
            isVisible: item.isVisible,
            isRequired: item.isRequired,
          },
        }),
      ),
    );
    return this.getHarvestConfig(tid);
  }
}
