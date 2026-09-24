import { api } from '../lib/api';

export interface MasterRowError {
  row: number;
  column?: string;
  code: string;
  message: string;
  value?: string;
}
export interface MasterErrorSummaryItem {
  code: string;
  count: number;
  sampleValues: string[];
}
export interface MasterImportReport {
  totalRows: number;
  valid: number;
  skipped: number;
  created: number;
  errorRows: number;
  errors: MasterRowError[];
  errorSummary: MasterErrorSummaryItem[];
}

export type MasterEntity = 'workers' | 'lots';

export const validateMasters = (entity: MasterEntity, csv: string) =>
  api.post<MasterImportReport>(`/masters-imports/${entity}/validate`, { csv }).then((r) => r.data);

export const commitMasters = (entity: MasterEntity, csv: string) =>
  api.post<MasterImportReport>(`/masters-imports/${entity}/commit`, { csv }).then((r) => r.data);

async function download(pathname: string, filename: string) {
  const res = await api.get(pathname, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const downloadWorkersTemplate = () =>
  download('/masters-imports/files/workers-template', 'plantilla_trabajadores.csv');
export const downloadLotsTemplate = () =>
  download('/masters-imports/files/lots-template', 'plantilla_lotes.csv');
export const downloadFarmsReference = () =>
  download('/masters-imports/files/references/farms', 'referencias_fincas.csv');
