-- ==========================================================================
-- Canastilla/recipiente por defecto por empresa (aditivo/nullable).
-- Se prellena en el registro de cosecha; no cambia datos históricos.
-- ==========================================================================
ALTER TABLE "tenants" ADD COLUMN "default_container_id" TEXT;

ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_default_container_fkey"
  FOREIGN KEY ("default_container_id") REFERENCES "containers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
