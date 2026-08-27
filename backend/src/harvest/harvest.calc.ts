/**
 * Cálculo oficial de cosecha (fuente de verdad del backend).
 *
 *   peso_total_recipientes = Σ (unidades × peso_unitario_gramos)
 *   gramos_cosechados      = peso_bruto_gramos − peso_total_recipientes
 */
export interface ContainerRowWeights {
  unidades: number;
  pesoUnitarioGramos: number;
}

export interface HarvestCalcResult {
  pesoTotalRecipientesGramos: number;
  gramosCosechados: number;
}

export function calcularCosecha(
  pesoBrutoGramos: number,
  rows: ContainerRowWeights[],
): HarvestCalcResult {
  const pesoTotalRecipientesGramos = rows.reduce(
    (acc, r) => acc + r.unidades * r.pesoUnitarioGramos,
    0,
  );
  return {
    pesoTotalRecipientesGramos,
    gramosCosechados: pesoBrutoGramos - pesoTotalRecipientesGramos,
  };
}
