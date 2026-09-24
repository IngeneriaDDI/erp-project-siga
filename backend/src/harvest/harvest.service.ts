import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { HarvestStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FieldConfigService } from '../field-config/field-config.service';
import { AuthUser } from '../common/types/auth.types';
import { requireTenant } from '../common/tenant/tenant.util';
import { HarvestConfigurableField } from '../common/constants/harvest-fields';
import { OperationalIdentityService } from '../operational/operational-identity.service';
import { isWorkerAllowedForFarm } from '../workers/workers-farm-filter.util';
import { calcularCosecha } from './harvest.calc';
import { QueryHarvestDto, SaveHarvestRecordDto } from './dto/harvest.dto';

const listInclude = {
  farm: { select: { id: true, nombre: true } },
  worker: { select: { id: true, codigoInterno: true, nombre: true } },
  lot: { select: { id: true, nombreLote: true } },
  quality: { select: { id: true, nombre: true } },
} satisfies Prisma.HarvestRecordInclude;

const detailInclude = {
  farm: { select: { id: true, nombre: true } },
  worker: { select: { id: true, codigoInterno: true, nombre: true } },
  lot: { select: { id: true, nombreLote: true, variedad: true } },
  quality: { select: { id: true, nombre: true } },
  creator: { select: { id: true, nombre: true, email: true } },
  updater: { select: { id: true, nombre: true, email: true } },
  containers: {
    include: { container: { select: { id: true, nombre: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.HarvestRecordInclude;

@Injectable()
export class HarvestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fieldConfig: FieldConfigService,
    private readonly identity: OperationalIdentityService,
  ) {}

  async findAll(tenantId: string | null, query: QueryHarvestDto) {
    const tid = requireTenant(tenantId);

    const where: Prisma.HarvestRecordWhereInput = {
      tenantId: tid,
      farmId: query.farmId,
      workerId: query.workerId,
      lotId: query.lotId,
      qualityId: query.qualityId,
      status: query.status,
    };
    if (query.fechaDesde || query.fechaHasta) {
      const fecha: Prisma.DateTimeFilter = {};
      if (query.fechaDesde) fecha.gte = new Date(query.fechaDesde);
      if (query.fechaHasta) fecha.lte = new Date(query.fechaHasta);
      where.fecha = fecha;
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.harvestRecord.findMany({
        where,
        include: listInclude,
        orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.harvestRecord.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async findOne(tenantId: string | null, id: string) {
    const tid = requireTenant(tenantId);
    const record = await this.prisma.harvestRecord.findFirst({
      where: { id, tenantId: tid },
      include: detailInclude,
    });
    if (!record) throw new NotFoundException('Registro de cosecha no encontrado');
    return record;
  }

  async create(actor: AuthUser, tenantId: string | null, dto: SaveHarvestRecordDto) {
    const tid = requireTenant(tenantId);
    const { header, rows } = await this.validateAndBuild(tid, dto);

    // Identidad efectiva de quien registra (cuenta operativa → trabajador activo).
    const eff = await this.identity.resolveEffectiveActor(actor);

    return this.prisma.harvestRecord.create({
      data: {
        ...header,
        createdBy: actor.userId,
        createdByWorkerId: eff.workerId,
        createdByActorName: eff.displayName,
        containers: { create: rows },
      },
      include: detailInclude,
    });
  }

  async update(
    actor: AuthUser,
    tenantId: string | null,
    id: string,
    dto: SaveHarvestRecordDto,
  ) {
    const tid = requireTenant(tenantId);
    const existing = await this.prisma.harvestRecord.findFirst({
      where: { id, tenantId: tid },
    });
    if (!existing) throw new NotFoundException('Registro de cosecha no encontrado');
    if (existing.status === HarvestStatus.CANCELLED) {
      throw new BadRequestException('No se puede editar un registro anulado');
    }

    const { header, rows } = await this.validateAndBuild(tid, dto);

    // Reemplazo atómico de los recipientes + actualización de la cabecera.
    return this.prisma.$transaction(async (tx) => {
      await tx.harvestRecordContainer.deleteMany({ where: { harvestRecordId: id } });
      return tx.harvestRecord.update({
        where: { id },
        data: {
          ...header,
          updatedBy: actor.userId,
          containers: { create: rows },
        },
        include: detailInclude,
      });
    });
  }

  async cancel(tenantId: string | null, id: string) {
    const tid = requireTenant(tenantId);
    const existing = await this.prisma.harvestRecord.findFirst({
      where: { id, tenantId: tid },
    });
    if (!existing) throw new NotFoundException('Registro de cosecha no encontrado');
    if (existing.status === HarvestStatus.CANCELLED) {
      throw new BadRequestException('El registro ya está anulado');
    }
    return this.prisma.harvestRecord.update({
      where: { id },
      data: { status: HarvestStatus.CANCELLED },
      include: detailInclude,
    });
  }

  /**
   * Valida pertenencia al tenant, estados activos, recipientes, cálculo y
   * configuración de campos. Devuelve la cabecera y las filas listas para persistir.
   */
  private async validateAndBuild(tid: string, dto: SaveHarvestRecordDto) {
    // Finca
    const farm = await this.prisma.farm.findFirst({ where: { id: dto.farmId, tenantId: tid } });
    if (!farm || farm.status !== 'ACTIVE') {
      throw new BadRequestException('Finca inválida o inactiva');
    }

    // Cosechador (validación autoritativa en backend, no solo en el frontend).
    const worker = await this.prisma.worker.findFirst({ where: { id: dto.workerId, tenantId: tid } });
    if (!worker || worker.status !== 'ACTIVE') {
      throw new BadRequestException('Cosechador inválido o inactivo');
    }
    // El filtro por finca es configurable por empresa (default = filtrado).
    const tenantCfg = await this.prisma.tenant.findUnique({
      where: { id: tid },
      select: { workersFilteredByFarm: true },
    });
    const filteredByFarm = tenantCfg?.workersFilteredByFarm ?? true;
    if (!isWorkerAllowedForFarm(filteredByFarm, worker.farmId, dto.farmId)) {
      throw new BadRequestException('El cosechador no pertenece a la finca indicada');
    }

    // Lote
    const lot = await this.prisma.lot.findFirst({ where: { id: dto.lotId, tenantId: tid } });
    if (!lot || lot.status !== 'ACTIVE') {
      throw new BadRequestException('Lote inválido o inactivo');
    }
    if (lot.farmId !== dto.farmId) {
      throw new BadRequestException('El lote no pertenece a la finca indicada');
    }

    // Calidad (activa y visible en cosecha)
    const quality = await this.prisma.quality.findFirst({ where: { id: dto.qualityId, tenantId: tid } });
    if (!quality || quality.status !== 'ACTIVE') {
      throw new BadRequestException('Calidad inválida o inactiva');
    }
    if (!quality.visibleEnCosecha) {
      throw new BadRequestException('La calidad no está habilitada para cosecha');
    }

    // Recipientes (snapshot de peso desde el maestro)
    const containerIds = dto.containers.map((c) => c.containerId);
    const containers = await this.prisma.container.findMany({
      where: { id: { in: containerIds }, tenantId: tid },
    });
    const containerMap = new Map(containers.map((c) => [c.id, c]));

    const rows = dto.containers.map((row) => {
      const container = containerMap.get(row.containerId);
      if (!container) {
        throw new BadRequestException('Un recipiente no existe o pertenece a otro tenant');
      }
      if (container.status !== 'ACTIVE') {
        throw new BadRequestException(`El recipiente "${container.nombre}" está inactivo`);
      }
      const pesoUnitarioGramos = container.pesoGramos; // snapshot autoritativo
      return {
        containerId: container.id,
        unidades: row.unidades,
        pesoUnitarioGramos,
        pesoTotalGramos: row.unidades * pesoUnitarioGramos,
      };
    });

    // Cálculo oficial
    const { pesoTotalRecipientesGramos, gramosCosechados } = calcularCosecha(
      dto.pesoBrutoGramos,
      rows,
    );
    if (pesoTotalRecipientesGramos > dto.pesoBrutoGramos) {
      throw new BadRequestException(
        'La suma del peso de recipientes no puede superar el peso bruto',
      );
    }
    if (gramosCosechados < 0) {
      throw new BadRequestException('Los gramos cosechados no pueden ser negativos');
    }

    // Configuración de campos del tenant
    const optionalFields = await this.applyFieldConfig(tid, dto);

    const header = {
      tenantId: tid,
      farmId: dto.farmId,
      fecha: new Date(dto.fecha),
      workerId: dto.workerId,
      qualityId: dto.qualityId,
      lotId: dto.lotId,
      variedad: lot.variedad, // snapshot desde el lote
      pesoBrutoGramos: dto.pesoBrutoGramos,
      pesoTotalRecipientesGramos,
      gramosCosechados,
      ...optionalFields,
    };

    return { header, rows };
  }

  /**
   * Aplica visibilidad/obligatoriedad configurada por el tenant.
   * - Campos no visibles: se guardan como null aunque el frontend los envíe.
   * - Campos obligatorios: se exige valor.
   * - estado_roja: booleano (true/false/null).
   */
  private async applyFieldConfig(
    tid: string,
    dto: SaveHarvestRecordDto,
  ): Promise<{
    primeraFila: string | null;
    ultimaFila: string | null;
    estadoRoja: boolean | null;
    observaciones: string | null;
  }> {
    const config = await this.fieldConfig.getHarvestConfigMap(tid);
    const cfgOf = (f: HarvestConfigurableField) =>
      config.get(f) ?? { isVisible: true, isRequired: false };

    // Helper para campos de texto (primera_fila, ultima_fila, observaciones).
    const resolveText = (
      field: HarvestConfigurableField,
      raw: string | undefined,
      label: string,
    ): string | null => {
      const cfg = cfgOf(field);
      if (!cfg.isVisible) return null;
      const value = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
      if (cfg.isRequired && !value) {
        throw new BadRequestException(`El campo "${label}" es obligatorio para este cliente`);
      }
      return value;
    };

    const primeraFila = resolveText('primera_fila', dto.primeraFila, 'primera fila');
    const ultimaFila = resolveText('ultima_fila', dto.ultimaFila, 'última fila');
    const observaciones = resolveText('observaciones', dto.observaciones, 'observaciones');

    // estado_roja: booleano.
    const estadoCfg = cfgOf('estado_roja');
    let estadoRoja: boolean | null = null;
    if (estadoCfg.isVisible) {
      estadoRoja = typeof dto.estadoRoja === 'boolean' ? dto.estadoRoja : null;
      if (estadoCfg.isRequired && estadoRoja === null) {
        throw new BadRequestException('El campo "estado roja" es obligatorio para este cliente');
      }
    }

    // Coherencia: si primera y última fila son numéricas, primera <= última.
    if (primeraFila && ultimaFila && /^\d+$/.test(primeraFila) && /^\d+$/.test(ultimaFila)) {
      if (Number(primeraFila) > Number(ultimaFila)) {
        throw new BadRequestException('La primera fila no puede ser mayor que la última fila');
      }
    }

    return { primeraFila, ultimaFila, estadoRoja, observaciones };
  }
}
