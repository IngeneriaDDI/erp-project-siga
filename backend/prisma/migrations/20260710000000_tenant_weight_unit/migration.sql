-- ==========================================================================
-- Preferencia de unidad de peso por empresa (solo presentación/entrada).
-- La unidad interna/canónica sigue siendo GRAMOS. No migra datos históricos.
-- Empresas existentes quedan en GRAMS (default) → sin cambios de comportamiento.
-- ==========================================================================

CREATE TYPE "WeightUnit" AS ENUM ('GRAMS', 'KILOGRAMS');

ALTER TABLE "tenants"
  ADD COLUMN "weight_unit" "WeightUnit" NOT NULL DEFAULT 'GRAMS';
