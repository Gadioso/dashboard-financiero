"use client";

import { useMemo, useRef, useState } from 'react';
import { CheckCircle, DownloadSimple, FileArrowUp, FileCsv, FilePdf, FileXls, X } from '@phosphor-icons/react';
import { fetchWithSessionRefresh } from '@/lib/authenticated-fetch';

type PreviewRow = {
  id: string | number;
  row_index: number;
  movement_type: 'gasto' | 'ingreso';
  occurred_at: string | null;
  description: string | null;
  amount: number | string | null;
  category: 'Vida' | 'Placeres' | 'Futuro' | null;
  subcategory: string | null;
  currency: string | null;
  status: 'ready' | 'invalid' | 'duplicate';
  validation_errors: string[] | null;
  include: boolean;
};

type PreviewResponse = {
  success: boolean;
  error?: string;
  batch?: {
    id: string;
    file_name: string;
    source_type: 'xlsx' | 'csv' | 'pdf';
    detected_mapping?: { warnings?: string[] };
    summary?: { rows?: number; ready?: number; duplicates?: number; errors?: number; income?: number; expenses?: number; firstDate?: string; lastDate?: string };
  };
  rows?: Omit<PreviewRow, 'include'>[];
};

function money(value: number | string | null | undefined) {
  return Number(value || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });
}

function friendlyError(value: unknown, fallback: string) {
  const message = typeof value === 'string' ? value : '';
  return /supabase|service.role|schema cache|sql|migration|gemini|api.key|storage|bucket/i.test(message) ? fallback : message || fallback;
}

export default function FinancialImportModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (message: string) => void | Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse['batch'] | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const closeAndReset = () => {
    setFile(null);
    setPreview(null);
    setRows([]);
    setError('');
    setPage(0);
    onClose();
  };

  const selectedRows = useMemo(() => rows.filter((row) => row.include), [rows]);
  const selectedIncome = selectedRows.filter((row) => row.movement_type === 'ingreso').reduce((total, row) => total + Number(row.amount || 0), 0);
  const selectedExpenses = selectedRows.filter((row) => row.movement_type === 'gasto').reduce((total, row) => total + Number(row.amount || 0), 0);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const visibleRows = rows.slice(page * pageSize, (page + 1) * pageSize);

  if (!open) return null;

  const updateRow = (id: PreviewRow['id'], patch: Partial<PreviewRow>) => {
    setRows((current) => current.map((row) => String(row.id) === String(id) ? { ...row, ...patch } : row));
  };

  const downloadTemplate = () => {
    const csv = [
      'Fecha,Concepto,Monto,Tipo,Categoria,Subcategoria,Moneda',
      '2026-01-15,Nómina enero,25000,Ingreso,Futuro,Ingreso,MXN',
      '2026-01-16,Supermercado,1450.50,Gasto,Vida,Despensa,MXN',
    ].join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    link.download = 'plantilla-importacion-virafi.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const analyzeFile = async () => {
    if (!file || loading) return;
    setLoading(true);
    setError('');
    try {
      const payload = new FormData();
      payload.append('file', file);
      const response = await fetchWithSessionRefresh('/api/imports/financial', { method: 'POST', body: payload });
      const data = await response.json().catch(() => ({})) as PreviewResponse;
      if (!response.ok || !data.success || !data.batch || !data.rows) {
        throw new Error(friendlyError(data.error, 'No pude analizar este archivo. Revisa el formato e intenta de nuevo.'));
      }
      setPreview(data.batch);
      setRows(data.rows.map((row) => ({ ...row, include: row.status === 'ready' })));
      setPage(0);
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : 'No pude analizar este archivo.');
    } finally {
      setLoading(false);
    }
  };

  const confirmImport = async () => {
    if (!preview || !selectedRows.length || confirming) return;
    setConfirming(true);
    setError('');
    try {
      const response = await fetchWithSessionRefresh(`/api/imports/financial/${encodeURIComponent(preview.id)}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: rows.map((row) => ({
            id: row.id,
            include: row.include,
            movementType: row.movement_type,
            occurredAt: row.occurred_at ? `${row.occurred_at.slice(0, 10)}T12:00:00.000Z` : '',
            description: row.description || '',
            amount: Number(row.amount || 0),
            category: row.category || 'Placeres',
            subcategory: row.subcategory || '',
            currency: (row.currency || 'MXN').toUpperCase(),
          })),
        }),
      });
      const data = await response.json().catch(() => ({})) as { success?: boolean; error?: string; imported?: number; duplicates?: number };
      if (!response.ok || !data.success) throw new Error(friendlyError(data.error, 'No pude confirmar la importación. Intenta nuevamente.'));
      await onImported(`${data.imported || 0} movimientos importados${data.duplicates ? `; ${data.duplicates} duplicados omitidos` : ''}.`);
      closeAndReset();
    } catch (confirmationError) {
      setError(confirmationError instanceof Error ? confirmationError.message : 'No pude confirmar la importación.');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label="Importar movimientos">
      <div className="mx-auto flex min-h-full max-w-7xl items-center justify-center">
        <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-blue-700">Importación inteligente</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">Sube tu historial financiero</h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">Virafi homologa Excel, CSV y estados de cuenta PDF. Primero revisas la previsualización; ningún movimiento se guarda sin tu confirmación.</p>
            </div>
            <button type="button" onClick={closeAndReset} disabled={loading || confirming} aria-label="Cerrar importación" className="grid size-10 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50"><X className="size-5" /></button>
          </div>

          {!preview ? (
            <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1.3fr_0.7fr]">
              <div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="grid min-h-72 w-full place-items-center rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/40 p-6 text-center hover:border-blue-400 hover:bg-blue-50"
                >
                  <span>
                    <span className="mx-auto grid size-14 place-items-center rounded-xl bg-blue-600 text-white"><FileArrowUp className="size-7" weight="duotone" /></span>
                    <span className="mt-4 block text-lg font-black text-slate-950">{file ? file.name : 'Selecciona tu archivo'}</span>
                    <span className="mt-2 block text-sm text-slate-500">.xlsx, .csv o .pdf · máximo 10 MB</span>
                    {file && <span className="mt-3 block text-xs font-bold text-blue-700">{(file.size / 1024 / 1024).toFixed(2)} MB</span>}
                  </span>
                </button>
                <input ref={fileInputRef} type="file" className="hidden" accept=".xlsx,.csv,.pdf,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setFile(event.target.files?.[0] || null); setError(''); }} />
                {error && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button type="button" onClick={closeAndReset} className="h-11 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">Cancelar</button>
                  <button type="button" onClick={analyzeFile} disabled={!file || loading} className="h-11 rounded-lg bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{loading ? 'Analizando y homologando…' : 'Analizar archivo'}</button>
                </div>
              </div>
              <aside className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <h3 className="font-black text-slate-950">Formato recomendado</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">La primera fila puede incluir estos encabezados. Virafi también reconoce variantes habituales de bancos.</p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-slate-700">
                  {['Fecha', 'Concepto', 'Monto', 'Tipo', 'Categoría', 'Subcategoría', 'Moneda'].map((column) => <span key={column} className="rounded-md border border-slate-200 bg-white px-2 py-1">{column}</span>)}
                </div>
                <ul className="mt-5 space-y-3 text-sm text-slate-600">
                  <li className="flex gap-2"><FileXls className="mt-0.5 size-5 shrink-0 text-emerald-600" /> Excel puede contener una o varias hojas.</li>
                  <li className="flex gap-2"><FileCsv className="mt-0.5 size-5 shrink-0 text-blue-600" /> CSV admite Monto o columnas separadas de Cargo y Abono.</li>
                  <li className="flex gap-2"><FilePdf className="mt-0.5 size-5 shrink-0 text-rose-600" /> PDF se interpreta con Gemini y siempre requiere revisión.</li>
                </ul>
                <button type="button" onClick={downloadTemplate} className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 text-sm font-bold text-blue-700 hover:bg-blue-50"><DownloadSimple className="size-4" /> Descargar plantilla CSV</button>
                <p className="mt-5 text-xs leading-5 text-slate-500">El original se almacena de forma privada para auditoría. No subas contraseñas, NIP ni códigos de acceso.</p>
              </aside>
            </div>
          ) : (
            <div>
              <div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:grid-cols-2 lg:grid-cols-5 sm:px-6">
                <div className="lg:col-span-2"><p className="text-xs font-bold uppercase text-slate-400">Archivo</p><p className="mt-1 truncate font-bold text-slate-900">{preview.file_name}</p></div>
                <div><p className="text-xs font-bold uppercase text-slate-400">Seleccionados</p><p className="mt-1 font-black text-blue-700">{selectedRows.length} de {rows.length}</p></div>
                <div><p className="text-xs font-bold uppercase text-slate-400">Ingresos</p><p className="mt-1 font-black text-emerald-700">{money(selectedIncome)}</p></div>
                <div><p className="text-xs font-bold uppercase text-slate-400">Gastos</p><p className="mt-1 font-black text-slate-950">{money(selectedExpenses)}</p></div>
              </div>
              {preview.detected_mapping?.warnings?.length ? <div className="mx-5 mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 sm:mx-6">{preview.detected_mapping.warnings.join(' ')}</div> : null}
              {error && <p className="mx-5 mt-4 rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-700 sm:mx-6">{error}</p>}
              <div className="max-h-[55vh] overflow-auto">
                <table className="w-full min-w-[1180px] text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-white shadow-sm">
                    <tr className="border-b border-slate-200 text-xs text-slate-500">
                      <th className="px-4 py-3"><span className="sr-only">Importar</span></th>
                      <th className="px-3 py-3">Fila</th><th className="px-3 py-3">Fecha</th><th className="px-3 py-3">Concepto</th><th className="px-3 py-3">Tipo</th><th className="px-3 py-3">Categoría</th><th className="px-3 py-3">Subcategoría</th><th className="px-3 py-3 text-right">Monto</th><th className="px-3 py-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleRows.map((row) => (
                      <tr key={row.id} className={row.include ? 'bg-white' : 'bg-slate-50 text-slate-500'}>
                        <td className="px-4 py-2"><input type="checkbox" checked={row.include} onChange={(event) => updateRow(row.id, { include: event.target.checked })} aria-label={`Importar fila ${row.row_index}`} className="size-4 accent-blue-600" /></td>
                        <td className="px-3 py-2 text-xs font-bold text-slate-400">{row.row_index}</td>
                        <td className="px-3 py-2"><input type="date" value={row.occurred_at?.slice(0, 10) || ''} onChange={(event) => updateRow(row.id, { occurred_at: event.target.value })} className="h-9 rounded-md border border-slate-200 px-2" /></td>
                        <td className="px-3 py-2"><input value={row.description || ''} onChange={(event) => updateRow(row.id, { description: event.target.value })} className="h-9 w-64 rounded-md border border-slate-200 px-2" /></td>
                        <td className="px-3 py-2"><select value={row.movement_type} onChange={(event) => updateRow(row.id, { movement_type: event.target.value as PreviewRow['movement_type'] })} className="h-9 rounded-md border border-slate-200 bg-white px-2"><option value="gasto">Gasto</option><option value="ingreso">Ingreso</option></select></td>
                        <td className="px-3 py-2"><select value={row.category || 'Placeres'} onChange={(event) => updateRow(row.id, { category: event.target.value as PreviewRow['category'] })} className="h-9 rounded-md border border-slate-200 bg-white px-2"><option>Vida</option><option>Placeres</option><option>Futuro</option></select></td>
                        <td className="px-3 py-2"><input value={row.subcategory || ''} onChange={(event) => updateRow(row.id, { subcategory: event.target.value })} className="h-9 w-44 rounded-md border border-slate-200 px-2" /></td>
                        <td className="px-3 py-2"><input type="number" min="0.01" step="0.01" value={row.amount ?? ''} onChange={(event) => updateRow(row.id, { amount: event.target.value })} className="h-9 w-32 rounded-md border border-slate-200 px-2 text-right font-semibold" /></td>
                        <td className="px-3 py-2"><span className={`rounded-md px-2 py-1 text-xs font-bold ${row.status === 'ready' ? 'bg-emerald-50 text-emerald-700' : row.status === 'duplicate' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>{row.status === 'ready' ? 'Listo' : row.status === 'duplicate' ? 'Duplicado' : 'Revisar'}</span>{row.validation_errors?.length ? <p className="mt-1 max-w-52 text-xs text-slate-500">{row.validation_errors.join(' ')}</p> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="flex items-center gap-2 text-sm text-slate-500"><button type="button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0} className="h-9 rounded-lg border border-slate-200 px-3 font-bold disabled:opacity-40">Anterior</button><span>Página {page + 1} de {totalPages}</span><button type="button" onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))} disabled={page >= totalPages - 1} className="h-9 rounded-lg border border-slate-200 px-3 font-bold disabled:opacity-40">Siguiente</button></div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <button type="button" onClick={() => { setPreview(null); setRows([]); setFile(null); setError(''); }} disabled={confirming} className="h-11 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Elegir otro archivo</button>
                  <button type="button" onClick={confirmImport} disabled={!selectedRows.length || confirming} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"><CheckCircle className="size-5" weight="fill" /> {confirming ? 'Guardando movimientos…' : `Confirmar ${selectedRows.length} movimientos`}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
