import { useState } from 'react';
import { Download, FileUp, Upload } from 'lucide-react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Alert, Badge } from './ui/misc';
import { getApiErrorMessage } from '../lib/api';
import {
  commitMasters,
  downloadFarmsReference,
  downloadLotsTemplate,
  downloadWorkersTemplate,
  validateMasters,
  type MasterEntity,
  type MasterImportReport,
} from '../services/mastersImport';

function buildErrorsCsv(report: MasterImportReport): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = report.errors.map((e) =>
    [e.row, e.code, esc(e.message), e.column ?? '', esc(e.value ?? '')].join(','),
  );
  return ['fila,codigo,mensaje,columna,valor', ...lines].join('\n');
}

function triggerDownload(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Botón + modal de carga masiva para un maestro (trabajadores o lotes). */
export function MasterImportButton({
  entity,
  onDone,
}: {
  entity: MasterEntity;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [report, setReport] = useState<MasterImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<MasterImportReport | null>(null);

  const noun = entity === 'workers' ? 'trabajadores' : 'lotes';
  const reset = () => {
    setCsv(null);
    setFileName('');
    setReport(null);
    setError(null);
    setDone(null);
  };

  const onFile = async (file: File) => {
    reset();
    setFileName(file.name);
    setCsv(await file.text());
  };

  const validate = async () => {
    if (!csv) return;
    setBusy(true);
    setError(null);
    setReport(null);
    setDone(null);
    try {
      setReport(await validateMasters(entity, csv));
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!csv) return;
    setBusy(true);
    setError(null);
    try {
      const res = await commitMasters(entity, csv);
      setDone(res);
      setReport(null);
      onDone();
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const canConfirm = report && report.errorRows === 0 && report.valid > 0;

  return (
    <>
      <Button variant="secondary" leftIcon={<Upload size={16} />} onClick={() => { reset(); setOpen(true); }}>
        Importar
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Importar ${noun} (CSV)`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cerrar
            </Button>
            {canConfirm && (
              <Button variant="success" onClick={confirm} disabled={busy}>
                {busy ? 'Cargando…' : `Confirmar (${report?.valid} nuevos)`}
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Download size={15} />}
              onClick={() => (entity === 'workers' ? downloadWorkersTemplate() : downloadLotsTemplate())}
            >
              Plantilla
            </Button>
            <Button variant="outline" size="sm" leftIcon={<Download size={15} />} onClick={() => downloadFarmsReference()}>
              Referencia de fincas
            </Button>
          </div>

          <p className="text-sm text-muted">
            Sube el CSV. Se <strong>valida sin escribir</strong>; solo si no hay errores podrás
            confirmar. Los {noun} que ya existan se omiten (no se duplican).
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
            <Button onClick={validate} disabled={!csv || busy} leftIcon={<Upload size={16} />}>
              {busy ? 'Validando…' : 'Validar'}
            </Button>
          </div>

          {error && <Alert>{error}</Alert>}

          {done && (
            <Alert variant="success">
              Importación completada: {done.created} creados · {done.skipped} omitidos (ya existían).
            </Alert>
          )}

          {report && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-primary-light p-3 text-center">
                <div>
                  <div className="text-xs text-muted">Nuevos</div>
                  <div className="text-lg font-bold text-success">{report.valid}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Ya existen</div>
                  <div className="text-lg font-bold text-content">{report.skipped}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Con error</div>
                  <div className={`text-lg font-bold ${report.errorRows ? 'text-danger' : 'text-content'}`}>
                    {report.errorRows}
                  </div>
                </div>
              </div>

              {report.errorRows === 0 ? (
                <Alert variant="success">Sin errores. Puedes confirmar.</Alert>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-danger">Corrige los errores y vuelve a validar.</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      leftIcon={<Download size={15} />}
                      onClick={() => triggerDownload(buildErrorsCsv(report), `errores_${fileName || noun}.csv`)}
                    >
                      Descargar errores
                    </Button>
                  </div>
                  <div className="space-y-1">
                    {report.errorSummary.map((s) => (
                      <div key={s.code} className="rounded-lg border border-border p-2 text-sm">
                        <Badge color="red">{s.count}</Badge>{' '}
                        <span className="font-medium text-content">{s.code}</span>
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
        </div>
      </Modal>
    </>
  );
}
