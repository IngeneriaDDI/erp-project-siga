-- Consecutivo legible por empresa para los registros de cosecha.
-- Aditiva: columna nullable + contador por tenant. El código siempre asigna número.

-- 1) Contador por empresa (último número asignado).
ALTER TABLE "tenants" ADD COLUMN "harvest_record_counter" INTEGER NOT NULL DEFAULT 0;

-- 2) Número del registro.
ALTER TABLE "harvest_records" ADD COLUMN "record_number" INTEGER;

-- 3) Backfill histórico: 1..N por empresa en orden CRONOLÓGICO de cosecha
--    (fecha, luego created_at, luego orden físico de inserción, luego id).
--    Se ordena por fecha porque los datos históricos se cargaron en bloque y su
--    created_at no refleja el orden real. Dentro de un mismo día y mismo
--    created_at, ctid (orden físico) conserva el orden en que se insertaron.
WITH numbered AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY fecha ASC, created_at ASC, ctid ASC, id ASC) AS rn
  FROM "harvest_records"
)
UPDATE "harvest_records" AS h
SET "record_number" = numbered.rn
FROM numbered
WHERE h.id = numbered.id;

-- 4) El contador queda en el máximo asignado por empresa.
UPDATE "tenants" AS t
SET "harvest_record_counter" = COALESCE(
  (SELECT MAX(h."record_number") FROM "harvest_records" h WHERE h."tenant_id" = t.id),
  0
);

-- 5) Unicidad por empresa (varios NULL permitidos por Postgres).
CREATE UNIQUE INDEX "harvest_records_tenant_id_record_number_key"
  ON "harvest_records"("tenant_id", "record_number");
