-- ==========================================================================
-- Config por empresa: filtrar el selector de trabajadores por finca.
-- Aditivo, default true = comportamiento actual (no afecta a tenants existentes).
-- ==========================================================================
ALTER TABLE "tenants"
  ADD COLUMN "workers_filtered_by_farm" BOOLEAN NOT NULL DEFAULT true;
