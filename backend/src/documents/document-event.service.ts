import { Injectable } from '@nestjs/common';
import { DocumentEventType, DocumentType, Prisma } from '@prisma/client';

interface EventInput {
  tenantId: string;
  documentType: DocumentType;
  documentId: string;
  event: DocumentEventType;
  userId?: string | null;
  previousStatus?: string | null;
  newStatus?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/** Historial de auditoría de documentos (creación, recepción, aceptación, etc.). */
@Injectable()
export class DocumentEventService {
  /** Acepta un cliente de transacción o el PrismaService (ambos compatibles). */
  async record(tx: Prisma.TransactionClient, data: EventInput): Promise<void> {
    await tx.documentEvent.create({
      data: {
        tenantId: data.tenantId,
        documentType: data.documentType,
        documentId: data.documentId,
        event: data.event,
        userId: data.userId ?? null,
        previousStatus: data.previousStatus ?? null,
        newStatus: data.newStatus ?? null,
        metadata: data.metadata,
      },
    });
  }
}
