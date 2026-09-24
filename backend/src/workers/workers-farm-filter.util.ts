/**
 * Regla de negocio: ¿se permite este trabajador para la finca de la operación?
 * - Si la empresa filtra por finca (comportamiento por defecto), el trabajador
 *   debe pertenecer a la finca donde se registra la operación.
 * - Si la empresa NO filtra por finca, se permite cualquier trabajador (el
 *   personal se comparte entre fincas). La pertenencia al tenant y el estado
 *   ACTIVE se validan aparte.
 */
export function isWorkerAllowedForFarm(
  filteredByFarm: boolean,
  workerFarmId: string,
  operationFarmId: string,
): boolean {
  if (!filteredByFarm) return true;
  return workerFarmId === operationFarmId;
}
