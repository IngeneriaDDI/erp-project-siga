/**
 * Seed idempotente (usa upsert) — se puede ejecutar varias veces sin duplicar.
 * Crea: SUPER_ADMIN, tenant demo, finca demo, usuarios, cosechadores, lotes,
 * recipientes, calidades, configuración del módulo de cosecha y un registro
 * de cosecha de ejemplo.
 */
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// IDs fijos para que el seed sea determinístico e idempotente.
const DEMO_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEMO_FARM_ID = '00000000-0000-0000-0000-000000000002';

async function main() {
  const superEmail = process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@erp-agricola.com';
  const superPassword = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'Admin123*';

  // --- SUPER_ADMIN (dueño de la plataforma, sin tenant) ---
  const superAdmin = await prisma.user.upsert({
    where: { email: superEmail },
    update: {},
    create: {
      email: superEmail,
      nombre: 'Super Admin',
      passwordHash: await bcrypt.hash(superPassword, 10),
      role: Role.SUPER_ADMIN,
      tenantId: null,
    },
  });

  // --- Tenant demo ---
  const tenant = await prisma.tenant.upsert({
    where: { id: DEMO_TENANT_ID },
    update: {},
    create: {
      id: DEMO_TENANT_ID,
      nombre: 'Finca Arandanera Demo',
      nit: '900123456-7',
    },
  });

  // --- Finca demo ---
  const farm = await prisma.farm.upsert({
    where: { id: DEMO_FARM_ID },
    update: {},
    create: {
      id: DEMO_FARM_ID,
      tenantId: tenant.id,
      nombre: 'Finca Principal',
      ubicacion: 'Cundinamarca, Colombia',
    },
  });

  // --- Usuarios del tenant demo ---
  const adminTenant = await prisma.user.upsert({
    where: { email: 'admin.demo@erp-agricola.com' },
    update: {},
    create: {
      email: 'admin.demo@erp-agricola.com',
      nombre: 'Administrador Demo',
      passwordHash: await bcrypt.hash('Admin123*', 10),
      role: Role.ADMIN_TENANT,
      tenantId: tenant.id,
    },
  });

  const operador = await prisma.user.upsert({
    where: { email: 'operador.demo@erp-agricola.com' },
    update: {},
    create: {
      email: 'operador.demo@erp-agricola.com',
      nombre: 'Operador Cosecha Demo',
      passwordHash: await bcrypt.hash('Operador123*', 10),
      role: Role.OPERADOR_COSECHA,
      tenantId: tenant.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'lector.demo@erp-agricola.com' },
    update: {},
    create: {
      email: 'lector.demo@erp-agricola.com',
      nombre: 'Lector Demo',
      passwordHash: await bcrypt.hash('Lector123*', 10),
      role: Role.LECTOR,
      tenantId: tenant.id,
    },
  });

  // --- Cosechadores demo ---
  const workersData = [
    { codigoInterno: 'W001', nombre: 'Juan Pérez', areaTrabajo: 'Bloque A' },
    { codigoInterno: 'W002', nombre: 'María Gómez', areaTrabajo: 'Bloque A' },
    { codigoInterno: 'W003', nombre: 'Carlos Ruiz', areaTrabajo: 'Bloque B' },
  ];
  for (const w of workersData) {
    await prisma.worker.upsert({
      where: {
        // Código interno único por empresa (ya no por finca).
        tenantId_codigoInterno: {
          tenantId: tenant.id,
          codigoInterno: w.codigoInterno,
        },
      },
      update: {},
      create: { ...w, tenantId: tenant.id, farmId: farm.id },
    });
  }

  // --- Lotes demo (la variedad vive en el lote) ---
  const lotsData = [
    { nombreLote: 'Lote 1', variedad: 'Biloxi', numeroPlantas: 1200 },
    { nombreLote: 'Lote 2', variedad: 'Ventura', numeroPlantas: 950 },
    { nombreLote: 'Lote 3', variedad: 'Emerald', numeroPlantas: 1100 },
  ];
  for (const l of lotsData) {
    await prisma.lot.upsert({
      where: { farmId_nombreLote: { farmId: farm.id, nombreLote: l.nombreLote } },
      update: {},
      create: { ...l, tenantId: tenant.id, farmId: farm.id },
    });
  }

  // --- Recipientes demo (peso en gramos) ---
  const containersData = [
    { nombre: 'Canastilla pequeña', pesoGramos: 500 },
    { nombre: 'Canastilla grande', pesoGramos: 800 },
    { nombre: 'Balde', pesoGramos: 1000 },
  ];
  for (const c of containersData) {
    await prisma.container.upsert({
      where: { tenantId_nombre: { tenantId: tenant.id, nombre: c.nombre } },
      update: {},
      create: { ...c, tenantId: tenant.id },
    });
  }

  // --- Calidades demo (Descarte no visible en cosecha, para demostrar el flag) ---
  const qualitiesData = [
    { nombre: 'Primera', visibleEnCosecha: true },
    { nombre: 'Segunda', visibleEnCosecha: true },
    { nombre: 'Roja', visibleEnCosecha: true },
    { nombre: 'Descarte', visibleEnCosecha: false },
  ];
  for (const q of qualitiesData) {
    await prisma.quality.upsert({
      where: { tenantId_nombre: { tenantId: tenant.id, nombre: q.nombre } },
      update: {},
      create: { ...q, tenantId: tenant.id },
    });
  }

  // --- Configuración del módulo de cosecha (campos configurables) ---
  const fieldConfigData = [
    { fieldName: 'primera_fila', isVisible: true, isRequired: false },
    { fieldName: 'ultima_fila', isVisible: true, isRequired: false },
    { fieldName: 'estado_roja', isVisible: true, isRequired: false },
    { fieldName: 'observaciones', isVisible: true, isRequired: false },
  ];
  for (const f of fieldConfigData) {
    await prisma.tenantModuleFieldConfig.upsert({
      where: {
        tenantId_moduleName_fieldName: {
          tenantId: tenant.id,
          moduleName: 'harvest',
          fieldName: f.fieldName,
        },
      },
      update: {},
      create: { ...f, tenantId: tenant.id, moduleName: 'harvest' },
    });
  }

  // --- Registro de cosecha de ejemplo (solo si aún no hay ninguno) ---
  const existingHarvest = await prisma.harvestRecord.count({ where: { tenantId: tenant.id } });
  if (existingHarvest === 0) {
    const worker = await prisma.worker.findFirstOrThrow({
      where: { tenantId: tenant.id, codigoInterno: 'W001' },
    });
    const lot = await prisma.lot.findFirstOrThrow({
      where: { farmId: farm.id, nombreLote: 'Lote 1' },
    });
    const quality = await prisma.quality.findFirstOrThrow({
      where: { tenantId: tenant.id, nombre: 'Primera' },
    });
    const cPequena = await prisma.container.findFirstOrThrow({
      where: { tenantId: tenant.id, nombre: 'Canastilla pequeña' },
    });
    const cGrande = await prisma.container.findFirstOrThrow({
      where: { tenantId: tenant.id, nombre: 'Canastilla grande' },
    });

    const pesoBruto = 12000;
    const rows = [
      { container: cPequena, unidades: 2 },
      { container: cGrande, unidades: 1 },
    ];
    const pesoTotalRecipientes = rows.reduce(
      (acc, r) => acc + r.unidades * r.container.pesoGramos,
      0,
    );

    await prisma.harvestRecord.create({
      data: {
        tenantId: tenant.id,
        farmId: farm.id,
        fecha: new Date('2026-07-06'),
        workerId: worker.id,
        qualityId: quality.id,
        lotId: lot.id,
        variedad: lot.variedad,
        pesoBrutoGramos: pesoBruto,
        pesoTotalRecipientesGramos: pesoTotalRecipientes,
        gramosCosechados: pesoBruto - pesoTotalRecipientes,
        observaciones: 'Registro de ejemplo generado por el seed.',
        createdBy: operador.id,
        containers: {
          create: rows.map((r) => ({
            containerId: r.container.id,
            unidades: r.unidades,
            pesoUnitarioGramos: r.container.pesoGramos,
            pesoTotalGramos: r.unidades * r.container.pesoGramos,
          })),
        },
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log('Seed completado.');
  // eslint-disable-next-line no-console
  console.log(`  SUPER_ADMIN: ${superAdmin.email} / ${superPassword}`);
  // eslint-disable-next-line no-console
  console.log('  ADMIN_TENANT: admin.demo@erp-agricola.com / Admin123*');
  // eslint-disable-next-line no-console
  console.log('  OPERADOR_COSECHA: operador.demo@erp-agricola.com / Operador123*');
  // eslint-disable-next-line no-console
  console.log('  LECTOR: lector.demo@erp-agricola.com / Lector123*');
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
