/**
 * Enlaza los lotes existentes con el catálogo de variedades (`varieties`).
 *
 * - Por defecto es un DRY-RUN: solo imprime el mapeo propuesto, NO escribe nada.
 * - Con `--apply` crea las variedades faltantes y llena `lots.variety_id`.
 * - NUNCA modifica `harvest_records.variedad` (snapshot histórico).
 * - `lots.variedad` (texto) solo se unifica al nombre canónico si se pasa
 *   `--sync-text`; por defecto se deja intacto.
 * - Idempotente: solo toca lotes con `variety_id` nulo.
 *
 * Uso:
 *   npm run backfill:varieties                       (prueba)
 *   npm run backfill:varieties -- --apply            (escribe)
 *   npm run backfill:varieties -- --apply --sync-text
 *   npm run backfill:varieties -- --tenant=<uuid>    (limita a una empresa)
 */
import { PrismaClient } from '@prisma/client';
import { normalizeRef } from '../src/harvest-import/csv.util';

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const SYNC_TEXT = args.includes('--sync-text');
const TENANT = args.find((a) => a.startsWith('--tenant='))?.split('=')[1];

async function main() {
  console.log(APPLY ? '== MODO APLICAR ==' : '== MODO PRUEBA (no escribe) ==');

  const tenants = await prisma.tenant.findMany({
    where: TENANT ? { id: TENANT } : undefined,
    orderBy: { nombre: 'asc' },
  });

  for (const tenant of tenants) {
    const lots = await prisma.lot.findMany({
      where: { tenantId: tenant.id, varietyId: null },
      select: { id: true, nombreLote: true, variedad: true },
    });
    console.log(`\nEmpresa: ${tenant.nombre} — lotes sin variedad de catálogo: ${lots.length}`);
    if (lots.length === 0) continue;

    // Agrupa por texto normalizado y cuenta cada escritura original.
    const groups = new Map<string, { spellings: Map<string, number>; lotIds: string[] }>();
    for (const l of lots) {
      const key = normalizeRef(l.variedad);
      const g = groups.get(key) ?? { spellings: new Map(), lotIds: [] };
      const sp = l.variedad.trim();
      g.spellings.set(sp, (g.spellings.get(sp) ?? 0) + 1);
      g.lotIds.push(l.id);
      groups.set(key, g);
    }

    const existing = await prisma.variety.findMany({ where: { tenantId: tenant.id } });
    const byNorm = new Map(existing.map((v) => [normalizeRef(v.nombre), v]));

    for (const [key, g] of groups) {
      // Nombre canónico = escritura más frecuente.
      const canonical = [...g.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const variants = [...g.spellings.entries()].map(([s, n]) => `"${s}" x${n}`).join(', ');
      const found = byNorm.get(key);
      console.log(
        `  ${found ? 'EXISTE ' : 'CREAR  '} "${found?.nombre ?? canonical}"  ← ${variants}  (${g.lotIds.length} lotes)` +
          (g.spellings.size > 1 ? '   ⚠ variantes de escritura' : ''),
      );

      if (!APPLY) continue;

      const variety =
        found ??
        (await prisma.variety.create({ data: { tenantId: tenant.id, nombre: canonical } }));
      byNorm.set(key, variety);
      await prisma.lot.updateMany({
        where: { id: { in: g.lotIds }, tenantId: tenant.id },
        data: SYNC_TEXT
          ? { varietyId: variety.id, variedad: variety.nombre }
          : { varietyId: variety.id },
      });
    }
  }

  console.log(
    APPLY
      ? '\nListo. Variedades enlazadas.'
      : '\nPrueba terminada. Revisa el mapeo y ejecuta con --apply para escribir.',
  );
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
