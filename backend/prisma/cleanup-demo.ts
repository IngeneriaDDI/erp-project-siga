/**
 * Elimina SOLO los datos de demostración que crea `seed.ts` localmente
 * (tenant demo + su finca/usuarios/maestros/registro de ejemplo, y el
 * SUPER_ADMIN de demo con contraseña conocida). No toca ningún dato real
 * de otro tenant. Pensado para correr UNA vez contra la base de datos de
 * producción después de restaurar un dump completo desde local.
 *
 * Uso:
 *   $env:DATABASE_URL="<url pública de Railway>"
 *   npx ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/cleanup-demo.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEMO_SUPER_ADMIN_EMAIL = process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@erp-agricola.com';

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { id: DEMO_TENANT_ID } });
  if (!tenant) {
    // eslint-disable-next-line no-console
    console.log('No hay tenant demo en esta base de datos. Nada que limpiar.');
  } else {
    // eslint-disable-next-line no-console
    console.log(`Eliminando tenant demo: ${tenant.nombre} (${tenant.id})...`);

    await prisma.$transaction([
      prisma.harvestRecord.deleteMany({ where: { tenantId: DEMO_TENANT_ID } }),
      prisma.tenantModuleFieldConfig.deleteMany({ where: { tenantId: DEMO_TENANT_ID } }),
      prisma.quality.deleteMany({ where: { tenantId: DEMO_TENANT_ID } }),
      prisma.container.deleteMany({ where: { tenantId: DEMO_TENANT_ID } }),
      prisma.lot.deleteMany({ where: { tenantId: DEMO_TENANT_ID } }),
      prisma.worker.deleteMany({ where: { tenantId: DEMO_TENANT_ID } }),
      prisma.user.deleteMany({ where: { tenantId: DEMO_TENANT_ID } }),
      prisma.farm.deleteMany({ where: { tenantId: DEMO_TENANT_ID } }),
      prisma.tenant.delete({ where: { id: DEMO_TENANT_ID } }),
    ]);

    // eslint-disable-next-line no-console
    console.log('Tenant demo eliminado.');
  }

  // El SUPER_ADMIN de demo no tiene tenantId (es null), así que se borra aparte.
  const demoSuperAdmin = await prisma.user.findUnique({ where: { email: DEMO_SUPER_ADMIN_EMAIL } });
  if (demoSuperAdmin && demoSuperAdmin.tenantId === null) {
    await prisma.user.delete({ where: { id: demoSuperAdmin.id } });
    // eslint-disable-next-line no-console
    console.log(`SUPER_ADMIN de demo eliminado: ${DEMO_SUPER_ADMIN_EMAIL}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`No se encontró SUPER_ADMIN de demo con email ${DEMO_SUPER_ADMIN_EMAIL} (o ya no existe).`);
  }

  // eslint-disable-next-line no-console
  console.log('Limpieza completada.');
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
