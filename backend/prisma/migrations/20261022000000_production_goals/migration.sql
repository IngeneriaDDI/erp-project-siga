-- ==========================================================================
-- Metas de producción por lote, año y mes (kg/planta capturado → gramos/planta
-- guardado como Decimal(12,3) exacto). Tabla nueva: no afecta datos existentes.
-- ==========================================================================

CREATE TABLE "lot_production_goals" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "lot_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "meta_gramos_planta" DECIMAL(12,3) NOT NULL,
    "plantas_snapshot" INTEGER NOT NULL,
    "meta_gramos_total" DECIMAL(18,3) NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "lot_production_goals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lot_production_goals_month_check" CHECK ("month" BETWEEN 1 AND 12),
    CONSTRAINT "lot_production_goals_meta_check" CHECK ("meta_gramos_planta" >= 0)
);

-- Un solo valor por lote, año y mes.
CREATE UNIQUE INDEX "lot_production_goals_lot_id_year_month_key" ON "lot_production_goals"("lot_id", "year", "month");
CREATE INDEX "lot_production_goals_tenant_id_year_month_idx" ON "lot_production_goals"("tenant_id", "year", "month");
CREATE INDEX "lot_production_goals_lot_id_idx" ON "lot_production_goals"("lot_id");

ALTER TABLE "lot_production_goals" ADD CONSTRAINT "lot_production_goals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lot_production_goals" ADD CONSTRAINT "lot_production_goals_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
