-- ==========================================================================
-- Código interno único por EMPRESA (antes era por empresa+finca).
-- Chequeo defensivo: si hay códigos duplicados dentro de una misma empresa,
-- la migración se detiene con un mensaje claro para resolverlos primero.
-- ==========================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "workers"
    GROUP BY "tenant_id", "codigo_interno"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Existen codigos internos duplicados dentro de una misma empresa. Resuelvelos antes de aplicar la unicidad por empresa (revisa: SELECT tenant_id, codigo_interno, count(*) FROM workers GROUP BY 1,2 HAVING count(*) > 1).';
  END IF;
END $$;

-- Reemplaza el índice único (tenant, finca, codigo) por (tenant, codigo).
DROP INDEX "workers_tenant_id_farm_id_codigo_interno_key";
CREATE UNIQUE INDEX "workers_tenant_id_codigo_interno_key" ON "workers"("tenant_id", "codigo_interno");
