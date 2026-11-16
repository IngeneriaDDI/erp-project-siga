-- Remisiones parciales: un registro de cosecha solo puede pertenecer a UNA remisión activa.
-- Aditiva: columna con default true + índice único parcial. Las remisiones históricas
-- (una por día y lote, sin solapes) no se alteran.

-- 0) Ya no se limita a una remisión por día y lote (la exclusividad pasa a ser por registro).
DROP INDEX IF EXISTS "harvest_remissions_active_unique";

-- 1) Marca de fuente activa.
ALTER TABLE "harvest_remission_sources" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- 2) Las fuentes de remisiones anuladas quedan liberadas.
UPDATE "harvest_remission_sources" AS s
SET "active" = false
FROM "harvest_remissions" AS r
WHERE r."id" = s."remission_id" AND r."status" = 'ANULADA';

-- 3) Defensivo: si algún registro apareciera en más de una fuente activa, solo se
--    conserva la más reciente (no debería ocurrir: había una remisión por día y lote).
WITH ranked AS (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY "harvest_record_id" ORDER BY "created_at" DESC, "id" DESC) AS rn
  FROM "harvest_remission_sources"
  WHERE "active" = true
)
UPDATE "harvest_remission_sources" AS s
SET "active" = false
FROM ranked
WHERE s."id" = ranked."id" AND ranked.rn > 1;

-- 4) Exclusividad a nivel de base de datos (protege contra remisiones simultáneas).
CREATE UNIQUE INDEX "harvest_remission_sources_record_active_key"
  ON "harvest_remission_sources"("harvest_record_id")
  WHERE "active" = true;
