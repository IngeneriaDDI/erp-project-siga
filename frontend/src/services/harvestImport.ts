import { api } from '../lib/api';

export interface ImportRowError {
  row: number;
  column?: string;
  code: string;
  message: string;
  value?: string;
}
export interface ImportErrorSummaryItem {
  code: string;
  count: number;
  sampleValues: string[];
}
export interface ImportValidationReport {
  totalRows: number;
  totalRecords: number;
  valid: number;
  skipped: number;
  errorRows: number;
  errors: ImportRowError[];
  errorSummary: ImportErrorSummaryItem[];
}
export interface ImportBatch {
  id: string;
  status: 'VALIDATING' | 'VALIDATED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REVERTED';
  totalRows: number;
  insertedRows: number;
  rejectedRows: number;
  fileName?: string | null;
  createdAt: string;
}

export const validateHarvestCsv = (csv: string) =>
  api.post<ImportValidationReport>('/harvest-imports/validate', { csv }).then((r) => r.data);

export const commitHarvestCsv = (csv: string, fileName?: string) =>
  api.post<ImportBatch>('/harvest-imports/commit', { csv, fileName }).then((r) => r.data);

export const getImportBatch = (id: string) =>
  api.get<ImportBatch>(`/harvest-imports/${id}`).then((r) => r.data);

/** Descarga un CSV del backend (con auth) y dispara la descarga en el navegador. */
async function download(pathname: string, filename: string) {
  const res = await api.get(pathname, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const downloadTemplate = () =>
  download('/harvest-imports/files/template', 'plantilla_cosecha.csv');
export const downloadExport = () =>
  download('/harvest-imports/files/export', 'registros_cosecha.csv');
export const downloadRefWorkers = () =>
  download('/harvest-imports/files/references/workers', 'referencias_trabajadores.csv');
export const downloadRefLots = () =>
  download('/harvest-imports/files/references/lots', 'referencias_lotes.csv');
export const downloadRefQualities = () =>
  download('/harvest-imports/files/references/qualities', 'referencias_calidades.csv');
export const downloadRefContainers = () =>
  download('/harvest-imports/files/references/containers', 'referencias_canastillas.csv');
