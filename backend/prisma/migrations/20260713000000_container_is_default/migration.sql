-- ==========================================================================
-- Recipiente por defecto por empresa (aditivo). Como máximo uno activo por tenant.
-- ==========================================================================
ALTER TABLE "containers" ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;

-- Cardinalidad 1: a lo sumo un recipiente por defecto por empresa.
CREATE UNIQUE INDEX "containers_default_unique" ON "containers"("tenant_id") WHERE "is_default" = true;
