import { UseFormRegister } from 'react-hook-form';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { formatWeight, type WeightUnit } from '../../lib/weight';
import type { Container } from '../../types';

interface RowValue {
  containerId?: string;
  unidades?: number;
}

interface Props {
  fields: { id: string }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>;
  remove: (index: number) => void;
  append: () => void;
  containers: Container[];
  rows: RowValue[];
  unit: WeightUnit; // unidad de presentación de la empresa
}

export function DynamicContainerRows({ fields, register, remove, append, containers, rows, unit }: Props) {
  const pesoUnitGramos = (cid?: string) => containers.find((c) => c.id === cid)?.pesoGramos ?? 0;

  return (
    <div className="space-y-2">
      {fields.map((field, i) => {
        const row = rows?.[i] ?? {};
        const pesoUnit = pesoUnitGramos(row.containerId);
        const unidades = Number(row.unidades) || 0;
        const total = pesoUnit * unidades;
        return (
          <div
            key={field.id}
            className="grid grid-cols-12 items-end gap-2 rounded-md border border-gray-200 bg-gray-50 p-2"
          >
            <div className="col-span-12 sm:col-span-5">
              <Select
                label={i === 0 ? 'Recipiente' : undefined}
                {...register(`containers.${i}.containerId`)}
              >
                <option value="">— Selecciona —</option>
                {containers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} ({formatWeight(c.pesoGramos, unit)})
                  </option>
                ))}
              </Select>
            </div>
            <div className="col-span-4 sm:col-span-2">
              <Input
                label={i === 0 ? 'Unidades' : undefined}
                type="number"
                min={1}
                {...register(`containers.${i}.unidades`, { valueAsNumber: true })}
              />
            </div>
            <div className="col-span-4 sm:col-span-2 text-sm">
              <div className="text-xs text-gray-500">P. unitario</div>
              <div className="py-2">{formatWeight(pesoUnit, unit)}</div>
            </div>
            <div className="col-span-3 sm:col-span-2 text-sm">
              <div className="text-xs text-gray-500">Total</div>
              <div className="py-2 font-medium">{formatWeight(total, unit)}</div>
            </div>
            <div className="col-span-1 flex justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => remove(i)}
                disabled={fields.length === 1}
                title="Quitar recipiente"
              >
                ✕
              </Button>
            </div>
          </div>
        );
      })}
      <Button type="button" variant="secondary" onClick={append}>
        + Agregar recipiente
      </Button>
    </div>
  );
}
