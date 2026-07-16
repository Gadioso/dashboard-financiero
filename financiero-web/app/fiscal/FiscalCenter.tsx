'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import VirafiBrand from '@/app/Components/VirafiBrand';

type Overview = {
  fiscalFoundationReady: boolean;
  month: string;
  profile: { rfc: string; legal_name: string; tax_regime: string; fiscal_postal_code: string } | null;
  integrations: Array<{ id: string; integration_type: string; provider: string; status: string; last_sync_at?: string | null; last_error?: string | null }>;
  complianceOpinion: { opinion_status: string; checked_at: string; omitted_obligations?: string[] } | null;
  alerts: Array<{ id: string; severity: string; title: string; description: string; detected_at: string }>;
  cfdiSummary: { total: number; issued: number; received: number; cancelled: number };
  fiscalDocumentSummary: { total: number; declarations: number; certificates: number; opinions: number; withholdings: number };
  fiscalDocuments: Array<{ id: string; document_type: string; status: string; file_name?: string | null; period?: string | null; issued_at?: string | null }>;
  capabilities: { openFiscalConfigured: boolean; stampingConfigured: boolean; stampingMissing: string[] };
  projection: { collectedIncome: number; paidExpenses: number; estimatedIncomeTax: number; estimatedVat: number; estimatedTotal: number; disclaimer: string };
};

const satRegimes = [
  ['626', '626 · Régimen Simplificado de Confianza'],
  ['612', '612 · Personas físicas con actividades empresariales y profesionales'],
  ['621', '621 · Incorporación Fiscal'],
  ['625', '625 · Plataformas tecnológicas'],
  ['605', '605 · Sueldos y salarios'],
  ['606', '606 · Arrendamiento'],
  ['607', '607 · Enajenación o adquisición de bienes'],
  ['608', '608 · Demás ingresos'],
  ['610', '610 · Residentes en el extranjero'],
  ['611', '611 · Dividendos'],
  ['614', '614 · Intereses'],
  ['615', '615 · Premios'],
  ['616', '616 · Sin obligaciones fiscales'],
  ['601', '601 · General de Ley Personas Morales'],
  ['603', '603 · Personas Morales con Fines no Lucrativos'],
  ['620', '620 · Sociedades Cooperativas de Producción'],
  ['622', '622 · Actividades agrícolas, ganaderas, silvícolas y pesqueras'],
  ['623', '623 · Opcional para Grupos de Sociedades'],
  ['624', '624 · Coordinados'],
] as const;

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

export default function FiscalCenter() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncfyOpen, setSyncfyOpen] = useState(false);
  const [form, setForm] = useState({ rfc: '', legalName: '', taxRegime: '626', fiscalPostalCode: '' });
  const [invoice, setInvoice] = useState({ legalName: '', rfc: '', taxSystem: '601', zip: '', email: '', description: '', productKey: '84111506', price: '', use: 'G03', paymentForm: '03' });

  const load = useCallback(async () => {
    const response = await fetch(`/api/fiscal/overview?month=${encodeURIComponent(month)}`);
    const data = await response.json().catch(() => null);
    setOverview(response.ok ? data : null);
    setMessage(response.ok ? '' : data?.error || 'No pude abrir el centro fiscal.');
    if (response.ok && data?.profile) {
      setForm({ rfc: data.profile.rfc, legalName: data.profile.legal_name, taxRegime: data.profile.tax_regime, fiscalPostalCode: data.profile.fiscal_postal_code });
    }
    setLoading(false);
  }, [month]);

  // The request callback owns loading/error state for the selected month.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    function handleSyncfyMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; message?: string; saved?: number; providerDocumentsSaved?: number; warning?: string | null };
      if (data.type === 'fiscal-syncfy:closed') setSyncfyOpen(false);
      if (data.type === 'fiscal-syncfy:error') {
        setMessage(data.message || 'No pude completar la conexión fiscal con Syncfy.');
        setSyncfyOpen(false);
      }
      if (data.type === 'fiscal-syncfy:success') {
        setMessage(data.warning || `SAT conectado. Syncfy guardó ${data.saved || 0} CFDI y ${data.providerDocumentsSaved || 0} documentos fiscales.`);
        setSyncfyOpen(false);
        void load();
      }
    }
    window.addEventListener('message', handleSyncfyMessage);
    return () => window.removeEventListener('message', handleSyncfyMessage);
  }, [load]);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setMessage('Guardando expediente fiscal...');
    const response = await fetch('/api/fiscal/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const data = await response.json().catch(() => null);
    setMessage(response.ok ? 'Expediente fiscal guardado.' : data?.error || 'No pude guardar el expediente.');
    if (response.ok) await load();
  }

  async function createInvoice(confirmStamp = false) {
    if (confirmStamp && !window.confirm('¿Confirmas timbrar esta factura? Esta acción se enviará al PAC y al SAT.')) return;
    setMessage(confirmStamp ? 'Enviando factura al PAC...' : 'Guardando borrador de factura...');
    const response = await fetch('/api/fiscal/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer: { legal_name: invoice.legalName, tax_id: invoice.rfc, tax_system: invoice.taxSystem, zip: invoice.zip, email: invoice.email }, item: { description: invoice.description, product_key: invoice.productKey, price: Number(invoice.price), quantity: 1, vat_rate: 0.16 }, use: invoice.use, paymentForm: invoice.paymentForm, paymentMethod: 'PUE', confirmStamp }) });
    const data = await response.json().catch(() => null);
    setMessage(response.ok ? (data.stamped ? `Factura timbrada${data.invoice?.uuid ? ` · UUID ${data.invoice.uuid}` : ''}.` : 'Borrador fiscal guardado para revisión.') : data?.error || 'No pude procesar la factura.');
    if (response.ok) await load();
  }

  async function prepareDeclaration() {
    setMessage('Preparando papeles de trabajo...');
    const response = await fetch('/api/fiscal/declarations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ period: month }) });
    const data = await response.json().catch(() => null);
    setMessage(response.ok ? `Declaración de ${month} preparada para revisión. Total estimado: ${money.format(data.declaration.calculated_values.estimatedTotal || 0)}.` : data?.error || 'No pude preparar la declaración.');
  }

  async function importLatestFiscalData() {
    setMessage('Importando la información más reciente disponible en Syncfy...');
    const response = await fetch('/api/fiscal/syncfy/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initialConnection: false }),
    });
    const data = await response.json().catch(() => null);
    setMessage(response.ok
      ? `Importación terminada: ${data.saved || 0} CFDI, ${data.providerDocumentsSaved || 0} documentos y ${data.opinionsInterpreted || 0} opiniones 32-D interpretadas.`
      : data?.error || 'No pude importar la información fiscal.');
    if (response.ok) await load();
  }

  const opinion = overview?.complianceOpinion?.opinion_status;
  const syncfyFiscal = overview?.integrations.find((item) => item.integration_type === 'open_fiscal' && item.provider === 'syncfy');
  return (
    <main className="min-h-screen bg-[var(--brand-cream)] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-4"><VirafiBrand compact /><div><p className="text-xs font-black uppercase tracking-widest text-[var(--brand-fiscal)]">Virafi Fiscal</p><h1 className="text-xl">Centro fiscal inteligente</h1></div></div>
          <Link href="/" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700">Volver al dashboard</Link>
        </div>
      </header>
      <div className="mx-auto max-w-7xl space-y-5 px-5 py-6">
        {message && <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-900">{message}</div>}
        {!loading && overview && !overview.fiscalFoundationReady && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><b>Configuración pendiente:</b> aplica la migración <code>20260713_sat_core_foundation.sql</code>. No se almacenarán credenciales SAT hasta conectar una bóveda segura.</div>}
        <section className="grid gap-4 md:grid-cols-4">
          <Metric label="Opinión 32-D" value={opinion === 'positive' ? 'POSITIVA' : opinion === 'negative' ? 'NEGATIVA' : 'Sin sincronizar'} tone={opinion === 'positive' ? 'green' : opinion === 'negative' ? 'red' : 'slate'} />
          <Metric label="CFDI del mes" value={String(overview?.cfdiSummary.total || 0)} detail={`${overview?.cfdiSummary.issued || 0} emitidos · ${overview?.cfdiSummary.received || 0} recibidos`} />
          <Metric label="Impuestos estimados" value={money.format(overview?.projection.estimatedTotal || 0)} detail="ISR + IVA estimados" />
          <Metric label="Alertas activas" value={String(overview?.alerts.length || 0)} tone={overview?.alerts.length ? 'red' : 'green'} detail="32-D, EFOS y discrepancias" />
        </section>
        <div className="grid gap-5 lg:grid-cols-[1.05fr_1.4fr]">
          <form onSubmit={saveProfile} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black">Expediente fiscal</h2><p className="mt-1 text-sm text-slate-500">Datos que deben coincidir exactamente con tu Constancia de Situación Fiscal.</p>
            <div className="mt-5 grid gap-4">
              <Field label="RFC" value={form.rfc} onChange={(rfc) => setForm({ ...form, rfc })} placeholder="XAXX010101000" />
              <Field label="Nombre o razón social" value={form.legalName} onChange={(legalName) => setForm({ ...form, legalName })} />
              <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1 text-sm font-bold text-slate-700">Régimen fiscal SAT<select value={form.taxRegime} onChange={(event) => setForm({ ...form, taxRegime: event.target.value })} className="h-11 rounded-lg border border-slate-200 px-3">{satRegimes.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label><Field label="Código postal fiscal" value={form.fiscalPostalCode} onChange={(fiscalPostalCode) => setForm({ ...form, fiscalPostalCode })} placeholder="06600" /></div>
              <button className="h-11 rounded-lg bg-blue-600 px-4 font-bold text-white disabled:opacity-50" disabled={!overview?.fiscalFoundationReady}>Guardar expediente</button>
            </div>
          </form>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-end justify-between gap-3"><div><h2 className="text-lg font-black">Proyección mensual ISR / IVA</h2><p className="text-sm text-slate-500">Calculada con CFDI activos del periodo.</p></div><input type="month" value={month} onChange={(event) => { setLoading(true); setMonth(event.target.value); }} className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-bold" /></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2"><Projection label="Ingresos cobrados" value={overview?.projection.collectedIncome || 0} /><Projection label="Gastos pagados" value={overview?.projection.paidExpenses || 0} /><Projection label="ISR estimado" value={overview?.projection.estimatedIncomeTax || 0} /><Projection label="IVA estimado" value={overview?.projection.estimatedVat || 0} /></div>
            <div className="mt-4 rounded-xl bg-slate-950 p-4 text-white"><p className="text-xs font-bold uppercase text-slate-400">Provisión sugerida</p><p className="mt-1 text-3xl font-black">{money.format(overview?.projection.estimatedTotal || 0)}</p></div>
            <p className="mt-3 text-xs text-slate-500">{overview?.projection.disclaimer}</p>
          </section>
        </div>
        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black">Conexiones SAT y PAC</h2>
            <div className="mt-4 grid gap-3">
              <Connection title="Lectura y diagnóstico" detail={syncfyFiscal?.last_sync_at ? `Syncfy SAT All in One · última descarga ${new Date(syncfyFiscal.last_sync_at).toLocaleString('es-MX')}` : 'Syncfy SAT All in One · CIEC'} status={syncfyFiscal?.status || 'Pendiente'} />
              <Connection title="Timbrado y cancelación" detail="Syncfy Stamping · requiere CSD, no e.firma" status={overview?.integrations.find((item) => item.integration_type === 'pac')?.status || 'Pendiente'} />
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={() => setSyncfyOpen(true)} disabled={!overview?.profile} className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-40">{syncfyFiscal ? 'Actualizar acceso SAT' : 'Conectar SAT con Syncfy'}</button>
              {syncfyFiscal && <button type="button" onClick={() => void importLatestFiscalData()} className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-bold text-slate-700">Importar datos disponibles</button>}
            </div>
            {!overview?.capabilities.stampingConfigured && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><b>Stamping bloqueado de forma segura.</b> Falta: {overview?.capabilities.stampingMissing.join(', ') || 'configuración del proveedor'}.</div>}
            <p className="mt-4 text-xs leading-5 text-slate-500">Tu RFC y CIEC se capturan dentro del Widget seguro de Syncfy. Después de la carga inicial, los cambios llegan por webhook; el dashboard no sondea el SAT ni almacena tu contraseña.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-black">Auditoría preventiva</h2><div className="mt-4 space-y-3">{overview?.alerts.length ? overview.alerts.map((alert) => <div key={alert.id} className="rounded-xl border border-rose-200 bg-rose-50 p-3"><p className="font-bold text-rose-900">{alert.title}</p><p className="mt-1 text-sm text-rose-800">{alert.description}</p></div>) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Sin alertas disponibles. Conecta Open Fiscal para revisar 32-D, cancelaciones y EFOS.</p>}</div></div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-black">Expediente descargado por Syncfy</h2><p className="mt-1 text-sm text-slate-500">Documentos disponibles desde SAT All in One, sin almacenar tu CIEC en el dashboard.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{overview?.fiscalDocumentSummary.total || 0} documentos</span></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DocumentCount label="Declaraciones" value={overview?.fiscalDocumentSummary.declarations || 0} />
            <DocumentCount label="Constancias" value={overview?.fiscalDocumentSummary.certificates || 0} />
            <DocumentCount label="Opiniones 32-D" value={overview?.fiscalDocumentSummary.opinions || 0} />
            <DocumentCount label="Retenciones" value={overview?.fiscalDocumentSummary.withholdings || 0} />
          </div>
          <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {overview?.fiscalDocuments.length ? overview.fiscalDocuments.map((document) => <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 p-3"><div><p className="text-sm font-bold text-slate-800">{document.file_name || fiscalDocumentLabel(document.document_type)}</p><p className="text-xs text-slate-500">{fiscalDocumentLabel(document.document_type)}{document.period ? ` · ${document.period}` : ''}{document.status !== 'available' ? ` · ${document.status}` : ''}</p></div><a href={`/api/fiscal/documents/${encodeURIComponent(document.id)}/download`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black text-blue-700">Descargar</a></div>) : <p className="p-4 text-sm text-slate-500">Conecta la CIEC dentro del Widget seguro para descargar CFDI, declaraciones, constancia y opinión 32-D.</p>}
          </div>
        </section>
        <section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <form onSubmit={(event) => { event.preventDefault(); void createInvoice(); }} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black">Crear factura CFDI 4.0</h2><p className="mt-1 text-sm text-slate-500">Captura, revisa y después confirma el timbrado con el PAC.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Razón social del receptor" value={invoice.legalName} onChange={(legalName) => setInvoice({ ...invoice, legalName })} />
              <Field label="RFC receptor" value={invoice.rfc} onChange={(rfc) => setInvoice({ ...invoice, rfc })} />
              <Field label="Régimen SAT (clave)" value={invoice.taxSystem} onChange={(taxSystem) => setInvoice({ ...invoice, taxSystem })} placeholder="601" />
              <Field label="Código postal fiscal" value={invoice.zip} onChange={(zip) => setInvoice({ ...invoice, zip })} />
              <Field label="Correo del cliente" value={invoice.email} onChange={(email) => setInvoice({ ...invoice, email })} />
              <Field label="Uso CFDI" value={invoice.use} onChange={(use) => setInvoice({ ...invoice, use })} placeholder="G03" />
              <div className="sm:col-span-2"><Field label="Concepto" value={invoice.description} onChange={(description) => setInvoice({ ...invoice, description })} /></div>
              <Field label="Clave producto/servicio SAT" value={invoice.productKey} onChange={(productKey) => setInvoice({ ...invoice, productKey })} />
              <Field label="Importe con IVA" value={invoice.price} onChange={(price) => setInvoice({ ...invoice, price })} placeholder="0.00" />
            </div>
            <div className="mt-5 flex flex-wrap gap-3"><button type="submit" className="h-11 rounded-lg border border-slate-300 px-4 font-bold text-slate-700">Guardar borrador</button><button type="button" disabled={!overview?.capabilities.stampingConfigured} onClick={() => void createInvoice(true)} className="h-11 rounded-lg bg-blue-600 px-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Revisar y timbrar</button></div>
          </form>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-black">Declaración mensual</h2><p className="mt-1 text-sm leading-6 text-slate-500">Prepara ISR e IVA desde los CFDI del periodo. La presentación requiere revisión y confirmación; no se envía automáticamente.</p><div className="mt-5 rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">Periodo seleccionado</p><p className="mt-1 text-2xl font-black">{month}</p><p className="mt-2 text-sm text-slate-600">Provisión estimada: {money.format(overview?.projection.estimatedTotal || 0)}</p></div><button type="button" onClick={() => void prepareDeclaration()} disabled={!overview?.profile} className="mt-4 h-11 w-full rounded-lg bg-slate-950 px-4 font-bold text-white disabled:opacity-40">Preparar declaración</button><a href="https://www.sat.gob.mx/personas/declaraciones" target="_blank" rel="noreferrer" className="mt-3 block text-center text-sm font-bold text-blue-700">Abrir portal oficial del SAT</a></div>
        </section>
      </div>
      {syncfyOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-label="Conectar SAT con Syncfy">
          <div className="relative h-[min(760px,92vh)] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <button type="button" onClick={() => setSyncfyOpen(false)} className="absolute right-3 top-3 z-10 rounded-lg bg-white px-3 py-2 text-sm font-black text-slate-700 shadow">Cerrar</button>
            <iframe title="Conexión fiscal segura con Syncfy" src="/fiscal/syncfy/embed" className="h-full w-full border-0" />
          </div>
        </div>
      )}
    </main>
  );
}

function Metric({ label, value, detail, tone = 'slate' }: { label: string; value: string; detail?: string; tone?: 'slate' | 'green' | 'red' }) { const colors = tone === 'green' ? 'text-emerald-700' : tone === 'red' ? 'text-rose-700' : 'text-slate-950'; return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className={`mt-2 text-2xl font-black ${colors}`}>{value}</p>{detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}</div>; }
function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) { return <label className="grid gap-1 text-sm font-bold text-slate-700">{label}<input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-11 rounded-lg border border-slate-200 px-3 font-normal" /></label>; }
function Projection({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-slate-100 bg-slate-50 p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-xl font-black">{money.format(value)}</p></div>; }
function DocumentCount({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-sm font-bold text-slate-600">{label}</p><p className="mt-1 text-2xl font-black text-slate-950">{value}</p></div>; }
function Connection({ title, detail, status }: { title: string; detail: string; status: string }) { const active = status.toLowerCase() === 'active'; return <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"><div><p className="font-bold">{title}</p><p className="text-sm text-slate-500">{detail}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${active ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{active ? 'Conectado' : status}</span></div>; }

function fiscalDocumentLabel(type: string) {
  return ({ cfdi_xml: 'CFDI XML', withholding: 'Retención', monthly_declaration: 'Declaración mensual', annual_declaration: 'Declaración anual', compliance_opinion: 'Opinión 32-D', tax_status_certificate: 'Constancia de Situación Fiscal', other: 'Documento fiscal' } as Record<string, string>)[type] || 'Documento fiscal';
}
