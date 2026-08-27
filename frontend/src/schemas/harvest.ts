import { z } from 'zod';

export const harvestSchema = z.object({
  fecha: z.string().min(1, 'La fecha es obligatoria'),
  farmId: z.string().uuid('Selecciona una finca'),
  workerId: z.string().uuid('Selecciona un cosechador'),
  lotId: z.string().uuid('Selecciona un lote'),
  qualityId: z.string().uuid('Selecciona una calidad'),
  pesoBrutoGramos: z
    .number({ invalid_type_error: 'Peso inválido' })
    .int('El peso debe ser un entero')
    .positive('El peso bruto debe ser mayor que cero'),
  containers: z
    .array(
      z.object({
        containerId: z.string().uuid('Selecciona un recipiente'),
        unidades: z
          .number({ invalid_type_error: 'Unidades inválidas' })
          .int('Unidades debe ser un entero')
          .positive('Unidades debe ser mayor que cero'),
      }),
    )
    .min(1, 'Agrega al menos un recipiente'),
});

export type HarvestSchema = z.infer<typeof harvestSchema>;
