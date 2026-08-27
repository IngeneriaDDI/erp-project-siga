/** Nombre del módulo en la tabla de configuración de campos. */
export const HARVEST_MODULE = 'harvest';

/** Campos del registro de cosecha configurables por tenant (visibles/obligatorios). */
export const HARVEST_CONFIGURABLE_FIELDS = [
  'primera_fila',
  'ultima_fila',
  'estado_roja',
  'observaciones',
] as const;

export type HarvestConfigurableField = (typeof HARVEST_CONFIGURABLE_FIELDS)[number];

/** Mapa entre el nombre de campo (snake_case) y la propiedad del DTO (camelCase). */
export const HARVEST_FIELD_TO_PROP: Record<HarvestConfigurableField, string> = {
  primera_fila: 'primeraFila',
  ultima_fila: 'ultimaFila',
  estado_roja: 'estadoRoja',
  observaciones: 'observaciones',
};
