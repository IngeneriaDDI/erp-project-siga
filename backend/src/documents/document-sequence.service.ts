import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DocumentType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { requireTenant } from '../common/tenant/tenant.util';
import { defaultPrefix, formatDocumentNumber } from './document-number.util';
import {
  CreateDocumentSequenceDto,
  UpdateDocumentSequenceDto,
} from './dto/document-sequence.dto';

export interface AllocatedSequence {
  sequenceNumber: number;
  documentNumber: string;
}

@Injectable()
export class DocumentSequenceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Asigna el siguiente consecutivo de forma ATÓMICA dentro de una transacción.
   * Usa INSERT ... ON CONFLICT DO UPDATE (nada de MAX+1); a prueba de concurrencia.
   * Si no existe la serie, la crea empezando en 1; si fue configurada, respeta
   * prefijo/relleno/número inicial.
   */
  async allocate(
    tx: Prisma.TransactionClient,
    tenantId: string,
    documentType: DocumentType,
    farmId: string | null = null,
  ): Promise<AllocatedSequence> {
    const prefix = defaultPrefix(documentType as 'REMISSION' | 'PRODUCTION_ORDER');
    const id = randomUUID();

    const rows = await tx.$queryRaw<
      Array<{ current_number: number; prefix: string; padding_length: number; year: number | null }>
    >(Prisma.sql`
      INSERT INTO document_sequences
        (id, tenant_id, document_type, farm_id, prefix, year, current_number, padding_length, active, created_at, updated_at)
      VALUES
        (${id}, ${tenantId}, ${documentType}::"DocumentType", ${farmId}, ${prefix}, NULL, 1, 6, true, now(), now())
      ON CONFLICT (tenant_id, document_type, COALESCE(farm_id, ''), COALESCE(year, 0))
      DO UPDATE SET current_number = document_sequences.current_number + 1, updated_at = now()
      RETURNING current_number, prefix, padding_length, year
    `);

    const row = rows[0];
    if (!row) throw new InternalServerErrorException('No fue posible asignar el consecutivo');

    return {
      sequenceNumber: row.current_number,
      documentNumber: formatDocumentNumber(row.prefix, row.current_number, row.padding_length, row.year),
    };
  }

  // ---- Configuración de consecutivos (SUPER_ADMIN) ----

  listConfig(tenantId: string | null) {
    const tid = requireTenant(tenantId);
    return this.prisma.documentSequence.findMany({
      where: { tenantId: tid },
      orderBy: [{ documentType: 'asc' }, { createdAt: 'asc' }],
    });
  }

  createConfig(tenantId: string | null, dto: CreateDocumentSequenceDto) {
    const tid = requireTenant(tenantId);
    return this.prisma.documentSequence.create({
      data: {
        tenantId: tid,
        documentType: dto.documentType,
        farmId: dto.farmId ?? null,
        year: dto.year ?? null,
        prefix: dto.prefix,
        paddingLength: dto.paddingLength ?? 6,
        currentNumber: dto.currentNumber ?? 0,
        active: dto.active ?? true,
      },
    });
  }

  async updateConfig(tenantId: string | null, id: string, dto: UpdateDocumentSequenceDto) {
    const tid = requireTenant(tenantId);
    const existing = await this.prisma.documentSequence.findFirst({ where: { id, tenantId: tid } });
    if (!existing) throw new NotFoundException('Serie de consecutivos no encontrada');
    return this.prisma.documentSequence.update({
      where: { id },
      data: {
        prefix: dto.prefix,
        paddingLength: dto.paddingLength,
        currentNumber: dto.currentNumber,
        active: dto.active,
      },
    });
  }
}
