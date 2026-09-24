import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, FileUp, Upload } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Alert, Badge, Spinner } from '../components/ui/misc';
import { getApiErrorMessage } from '../lib/api';
import {
  commitHarvestCsv,
  downloadExport,
  downloadRefContainers,
  downloadRefLots,
  downloadRefQualities,
  downloadRefWorkers,
  downloadTemplate,
  getImportBatch,
  validateHarvestCsv,
  type ImportBatch,
  type ImportValidationReport,
} from '../services/harvestImport';

function buildErrorsCsv(report: ImportValidationReport): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = 'fila,estado,codigo,mensaje,columna,valor';
  const lines = report.errors.map((e) =>
    [e.row, 'ERROR', e.code, esc(e.message), e.column ?? '', esc(e.value ?? '')].join(','),
  );
  return [head, ...lines].join('\n');
}

function triggerDownload(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function HarvestImportPage() {
  const navigate = useNavigate();
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [report, setReport] = useState<ImportValidationReport | null>(null);
  const [validating, setValidating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Polling del estado del lote en background.
  useEffect(() => {
    if (!batch || ['COMPLETED', 'FAILED', 'REVERTED'].includes(batch.status)) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        setBatch(await getImportBatch(batch.id));
      } catch {
        /* reintenta en el próximo tick */
      }
    }, 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [batch]);

  const onFile = async (file: File) => {
    setError(null);
    setReport(null);
    setBatch(null);
    setFileName(file.name);
    setCsv(await file.text());
  };

  const validate = async () => {
    if (!csv) return;
    setValidating(true);
    setError(null);
    setReport(null);
    setBatch(null);
    try {
      setReport(await validateHarvestCsv(csv));
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setValidating(false);
    }
  };

  const confirm = async () => {
    if (!csv) return;
    setCommitting(true);
    setError(null);
    try {
      setBatch(await commitHarvestCsv(csv, fileName));
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setCommitting(false);
    }
  };

  const canConfirm = report && report.errorRows === 0 && report.valid > 0 && !batch;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-content">Importar / Exportar cosecha</h1>
        <Button variant="secondary" leftIcon={<ArrowLeft size={16} />} onClick={() => navigate('/harvest')}>
          Volver
        </Button>
      </div>

      {/* Exportar */}
      <div className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-card">
        <h2 className="font-semibold text-content">Exportar</h2>
        <p className="text-sm text-muted">
          Descarga la plantilla vacía, tus registros actuales (mismo formato del importador) o las
          referencias de la empresa para saber qué valores escribir.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" leftIcon={<Download size={15} />} onClick={() => downloadTemplate()}>
            Plantilla vacía
          </Button>
          <Button variant="outline" size="sm" leftIcon={<Download size={15} />} onClick={() => downloadExport()}>
            Registros actuales
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadRefWorkers()}>
            Ref. trabajadores
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadRefLots()}>
            Ref. lotes
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadRefQualities()}>
            Ref. calidades
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadRefContainers()}>
            Ref. canastillas
          </Button>
        </div>
      </div>

      {/* Importar */}
      <div className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-card">
        <h2 className="font-semibold text-content">Importar (CSV)</h2>
        <p className="text-sm text-muted">
          Sube el CSV. Primero se <strong>valida sin escribir nada</strong>; solo si no hay errores
          podrás confirmar. No hay importación parcial.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-content hover:bg-background">
            <FileUp size={16} />
            <span>{fileName || 'Elegir archivo…'}</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>
          <Button onClick={validate} disabled={!csv || validating} leftIcon={<Upload size={16} />}>
            {validating ? 'Validando…' : 'Validar'}
          </Button>
          {canConfirm && (
            <Button variant="success" onClick={confirm} disabled={committing}>
              {committing ? 'Enviando…' : `Confirmar (${report?.valid} registros)`}
            </Button>
          )}
        </div>

        {error && <Alert>{error}</Alert>}

        {/* Resultado de validación */}
        {report && (
          <div className="space-y-3">
            <div className="grid gap-3 rounded-lg bg-primary-light p-4 sm:grid-cols-4">
              <Metric label="Filas leídas" value={report.totalRows} />
              <Metric label="Válidas" value={report.valid} tone="text-success" />
              <Metric label="Con error" value={report.errorRows} tone={report.errorRows ? 'text-danger' : undefined} />
              <Metric label="Omitidas" value={report.skipped} />
            </div>

            {report.errorRows === 0 ? (
              <Alert variant="success">Sin errores. Puedes confirmar la importación.</Alert>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-danger">
                    Hay errores. Corrige el archivo y vuelve a validar.
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Download size={15} />}
                    onClick={() => triggerDownload(buildErrorsCsv(report), `errores_${fileName || 'cosecha.csv'}`)}
                  >
                    Descargar errores
                  </Button>
                </div>
                <div className="space-y-1">
                  {report.errorSummary.map((s) => (
                    <div key={s.code} className="rounded-lg border border-border p-2 text-sm">
                      <span className="font-medium text-content">{s.count} filas · {s.code}</span>
                      {s.sampleValues.length > 0 && (
                        <span className="text-muted"> — {s.sampleValues.join(', ')}</span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Progreso del lote */}
        {batch && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-content">Importación</span>
              <Badge color={batch.status === 'COMPLETED' ? 'green' : batch.status === 'FAILED' ? 'red' : 'amber'}>
                {batch.status}
              </Badge>
            </div>
            {batch.status === 'PROCESSING' ? (
              <Spinner label={`Procesando… (${batch.insertedRows} insertados)`} />
            ) : (
              <p className="text-sm text-muted">
                Insertados: {batch.insertedRows} · Con error: {batch.rejectedRows} · Lote {batch.id}
              </p>
            )}
            <p className="text-xs text-muted">
              Puedes cerrar esta pantalla; el proceso continúa en el servidor.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-lg font-bold ${tone ?? 'text-content'}`}>{value}</div>
    </div>
  );
}
