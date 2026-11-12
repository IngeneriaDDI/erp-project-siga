import { Prisma } from '@prisma/client';

/**
 * Orden cronológico estable por fecha: respeta el orden original del archivo
 * dentro del mismo día. Se usa para que el consecutivo de una importación crezca
 * con la fecha aunque el CSV venga desordenado.
 */
export function sortByFechaStable<T extends { fecha: Date }>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.fecha.getTime() - b.item.fecha.getTime() || a.index - b.index)
    .map((x) => x.item);
}

type RawClient = Pick<Prisma.TransactionClient, '$queryRaw'>;

/**
 * Reserva `count` números consecutivos del contador de la empresa y devuelve
 * el PRIMERO del bloque (el bloque es first .. first+count-1).
 *
 * El UPDATE es atómico y toma el bloqueo de fila del tenant: dos registros
 * simultáneos nunca reciben el mismo número. Si se invoca dentro de la misma
 * transacción que inserta el registro, no quedan huecos si esta falla.
 */
export async function allocateRecordNumbers(
  client: RawClient,
  tenantId: string,
  count: number,
): Promise<number> {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('count debe ser un entero >= 1');
  }
  const rows = await client.$queryRaw<{ last: number }[]>`
    UPDATE "tenants"
    SET "harvest_record_counter" = "harvest_record_counter" + ${count}
    WHERE "id" = ${tenantId}
    RETURNING "harvest_record_counter" AS "last"`;
  if (rows.length === 0) throw new Error('Empresa no encontrada al asignar número de registro');
  return Number(rows[0].last) - count + 1;
}
