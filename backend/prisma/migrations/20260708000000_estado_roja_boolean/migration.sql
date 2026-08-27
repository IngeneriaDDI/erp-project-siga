-- ==========================================================================
-- Cambia harvest_records.estado_roja de TEXT a BOOLEAN.
-- Convierte cualquier valor de texto existente a booleano (null se mantiene).
-- ==========================================================================
ALTER TABLE "harvest_records"
  ALTER COLUMN "estado_roja" TYPE BOOLEAN
  USING (
    CASE
      WHEN "estado_roja" IS NULL THEN NULL
      WHEN lower("estado_roja") IN ('true', 't', '1', 'si', 'sí', 'roja', 'yes') THEN TRUE
      ELSE FALSE
    END
  );
