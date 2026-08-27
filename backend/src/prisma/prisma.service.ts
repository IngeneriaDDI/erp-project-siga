import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Cliente Prisma como servicio inyectable.
 * El aislamiento por tenant se aplica en la capa de servicio (cada consulta
 * filtra por tenant_id) y se refuerza con restricciones de BD.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }
}
