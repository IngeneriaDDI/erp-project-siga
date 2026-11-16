-- Orden de producción abierta al inicio del día.
-- Aditiva: nuevo estado ABIERTA + vínculo directo remisión → orden.
-- (El valor ABIERTA no se usa dentro de esta migración.)

-- 1) Nuevo estado: la orden se abre sin totales y se calcula al cerrar el día.
ALTER TYPE "ProductionOrderStatus" ADD VALUE IF NOT EXISTS 'ABIERTA';

-- 2) Vínculo directo de la remisión con su orden.
ALTER TABLE "harvest_remissions" ADD COLUMN "production_order_id" TEXT;

-- 3) Migrar los vínculos históricos (tabla production_order_remissions).
--    Cada remisión queda ligada a su orden más reciente (en la práctica hay una por día y finca).
UPDATE "harvest_remissions" AS r
SET "production_order_id" = l."production_order_id"
FROM (
  SELECT DISTINCT ON (pr."remission_id") pr."remission_id", pr."production_order_id"
  FROM "production_order_remissions" pr
  JOIN "production_orders" o ON o."id" = pr."production_order_id"
  ORDER BY pr."remission_id", o."created_at" DESC
) AS l
WHERE l."remission_id" = r."id";

ALTER TABLE "harvest_remissions"
  ADD CONSTRAINT "harvest_remissions_production_order_id_fkey"
  FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "harvest_remissions_production_order_id_idx" ON "harvest_remissions"("production_order_id");
