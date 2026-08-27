-- ==========================================================================
-- Granularidad Lote + Calidad
--   Remisiones: recepción/validación independiente por calidad.
--   Órdenes:    detalle base por (lote, calidad).
-- No modifica datos ni cálculos existentes por lote.
-- ==========================================================================

-- Estado de recepción por calidad dentro de una remisión.
CREATE TYPE "RemissionDetailStatus" AS ENUM ('PENDIENTE_RECEPCION', 'RECIBIDA', 'RECHAZADA');

-- Nuevas columnas en el detalle de remisión (por calidad).
ALTER TABLE "harvest_remission_details"
  ADD COLUMN "status" "RemissionDetailStatus" NOT NULL DEFAULT 'PENDIENTE_RECEPCION',
  ADD COLUMN "received_by" TEXT,
  ADD COLUMN "received_at" TIMESTAMP(3);

ALTER TABLE "harvest_remission_details"
  ADD CONSTRAINT "harvest_remission_details_received_by_fkey"
  FOREIGN KEY ("received_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Compatibilidad: si la remisión ya estaba RECIBIDA, sus calidades quedan RECIBIDA.
UPDATE "harvest_remission_details" AS d
SET "status" = 'RECIBIDA',
    "received_by" = r."received_by",
    "received_at" = r."received_at"
FROM "harvest_remissions" AS r
WHERE d."remission_id" = r."id" AND r."status" = 'RECIBIDA';

-- Nueva tabla: detalle por Lote + Calidad de la orden de producción.
CREATE TABLE "production_order_lot_quality_details" (
    "id" TEXT NOT NULL,
    "production_order_id" TEXT NOT NULL,
    "lot_id" TEXT NOT NULL,
    "quality_id" TEXT NOT NULL,
    "peso_gramos" INTEGER NOT NULL,
    "canastillas" INTEGER NOT NULL,
    CONSTRAINT "production_order_lot_quality_details_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "polqd_order_idx" ON "production_order_lot_quality_details"("production_order_id");

ALTER TABLE "production_order_lot_quality_details"
  ADD CONSTRAINT "polqd_order_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "production_order_lot_quality_details"
  ADD CONSTRAINT "polqd_lot_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_order_lot_quality_details"
  ADD CONSTRAINT "polqd_quality_fkey" FOREIGN KEY ("quality_id") REFERENCES "qualities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
