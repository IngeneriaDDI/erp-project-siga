-- ==========================================================================
-- Carga masiva de registros de cosecha: lotes de importación + trazabilidad.
-- Todo aditivo (columnas nullable) → no afecta registros históricos existentes.
-- ==========================================================================

-- Enums
CREATE TYPE "ImportSource" AS ENUM ('UI', 'SCRIPT');
CREATE TYPE "ImportStatus" AS ENUM ('VALIDATING', 'VALIDATED', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERTED');

-- Lotes de importación
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "source" "ImportSource" NOT NULL,
    "file_name" TEXT,
    "status" "ImportStatus" NOT NULL DEFAULT 'VALIDATED',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "inserted_rows" INTEGER NOT NULL DEFAULT 0,
    "rejected_rows" INTEGER NOT NULL DEFAULT 0,
    "allow_inactive" BOOLEAN NOT NULL DEFAULT false,
    "error_summary" JSONB,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "import_batches_tenant_id_idx" ON "import_batches"("tenant_id");
CREATE INDEX "import_batches_tenant_id_created_at_idx" ON "import_batches"("tenant_id", "created_at");
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- harvest_records: vínculo con el lote + clave natural para idempotencia
ALTER TABLE "harvest_records" ADD COLUMN "import_batch_id" TEXT;
ALTER TABLE "harvest_records" ADD COLUMN "row_hash" TEXT;
ALTER TABLE "harvest_records" ADD CONSTRAINT "harvest_records_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "harvest_records_import_batch_id_idx" ON "harvest_records"("import_batch_id");
-- Índice para agregaciones de Power BI.
CREATE INDEX "harvest_records_tenant_id_fecha_farm_id_quality_id_idx" ON "harvest_records"("tenant_id", "fecha", "farm_id", "quality_id");
-- Idempotencia/duplicados: como máximo una fila por (tenant, clave natural).
CREATE UNIQUE INDEX "harvest_records_tenant_row_hash_unique" ON "harvest_records"("tenant_id", "row_hash") WHERE "row_hash" IS NOT NULL;
