-- ==========================================================================
-- Catálogos de Variedad y Grupo productivo + datos agronómicos del lote.
-- Todo ADITIVO: columnas nuevas nullable; NO se modifica ni se borra
-- `lots.variedad` (texto) ni `harvest_records.variedad` (snapshot histórico).
-- El enlace lote→variedad del catálogo se hace con el script de backfill
-- (prisma/backfill-varieties.ts), con modo de prueba, tras revisar el mapeo.
-- ==========================================================================

-- Variedades
CREATE TABLE "varieties" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "varieties_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "varieties_tenant_id_idx" ON "varieties"("tenant_id");
CREATE UNIQUE INDEX "varieties_tenant_id_nombre_key" ON "varieties"("tenant_id", "nombre");
ALTER TABLE "varieties" ADD CONSTRAINT "varieties_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Grupos productivos
CREATE TABLE "productive_groups" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "productive_groups_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "productive_groups_tenant_id_idx" ON "productive_groups"("tenant_id");
CREATE UNIQUE INDEX "productive_groups_tenant_id_nombre_key" ON "productive_groups"("tenant_id", "nombre");
ALTER TABLE "productive_groups" ADD CONSTRAINT "productive_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Lotes: nuevos campos opcionales
ALTER TABLE "lots" ADD COLUMN "fecha_siembra" DATE;
ALTER TABLE "lots" ADD COLUMN "variety_id" TEXT;
ALTER TABLE "lots" ADD COLUMN "productive_group_id" TEXT;
CREATE INDEX "lots_variety_id_idx" ON "lots"("variety_id");
CREATE INDEX "lots_productive_group_id_idx" ON "lots"("productive_group_id");
ALTER TABLE "lots" ADD CONSTRAINT "lots_variety_id_fkey" FOREIGN KEY ("variety_id") REFERENCES "varieties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lots" ADD CONSTRAINT "lots_productive_group_id_fkey" FOREIGN KEY ("productive_group_id") REFERENCES "productive_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
