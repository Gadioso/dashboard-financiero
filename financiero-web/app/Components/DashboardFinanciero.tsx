"use client";

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  calcularIngresosMes,
  calcularGastadoPorBolsa,
  calcularPresupuestoTresTercios,
  calcularPromedioIngresosUltimos3Meses,
  calcularRestantesPorBolsa,
  calcularResumenMensual2026,
  combinarMovimientos,
  finMesISO,
  formatearEntero,
  formatearFecha,
  formatearMonto,
  inicioMesISO,
  mesKeyDesdeFecha,
  meses2026,
  type Gasto,
  type Ingreso,
  type AbonoTarjetaCredito,
  type Movimiento,
  type ResumenMensual,
  nombreBolsa,
  nombreOrigen,
  resumenInicial,
} from '@/lib/financial-core';

type PresupuestoMensualRow = {
  techo_vida?: number | string | null;
  techo_placeres?: number | string | null;
  techo_futuro?: number | string | null;
  fase_ahorro?: string | null;
};

type DashboardApiResponse = {
  success: boolean;
  error?: string;
  presupuesto: PresupuestoMensualRow | null;
  ingresosAnuales: Ingreso[];
  gastosAnuales: Gasto[];
  abonosTarjetaAnuales: AbonoTarjetaCredito[];
};

type SantanderStatus = {
  configured?: {
    supabase: boolean;
    emailIngestSecret: boolean;
  };
  supabaseSchema?: {
    acceptsSantanderEmailOrigin: boolean;
    acceptsRegla333333Phase: boolean;
    acceptsAbonosTarjetaCredito?: boolean;
    acceptsSantanderIngestLogs?: boolean;
    acceptsSantanderIngestLatency?: boolean;
    migrationRequired: boolean;
  };
  ingestLogs?: {
    available: boolean;
    error?: string | null;
    logs: Array<{
      id: string;
      created_at: string;
      status: 'inserted' | 'duplicate' | 'ignored' | 'error';
      reason?: string | null;
      movimiento_tipo?: string | null;
      concepto?: string | null;
      monto?: number | string | null;
      categoria?: string | null;
      subcategoria?: string | null;
      telegram_notified?: boolean | null;
      gmail_received_at?: string | null;
      apps_script_detected_at?: string | null;
      backend_received_at?: string | null;
      telegram_sent_at?: string | null;
      ingest_latency_ms?: number | null;
      telegram_latency_ms?: number | null;
      error?: string | null;
    }>;
  };
  error?: string;
};

type BillingStatus = {
  configured: boolean;
  plan: 'free' | 'beta' | 'premium';
  status: string;
  active: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  limits?: {
    bankConnections: number;
    gmailIntegrations: number;
    telegramAccounts: number;
    bankSyncLookbackDays: number;
  };
  error?: string;
};

type AccountStatus = {
  success: boolean;
  billing?: BillingStatus;
  error?: string;
};

const mesActualKey = mesKeyDesdeFecha(new Date());

function formatearDuracionMs(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;

  if (value < 1000) return `${Math.max(0, Math.round(value))} ms`;

  const seconds = value / 1000;

  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;

  const minutes = seconds / 60;

  return `${minutes.toFixed(minutes < 10 ? 1 : 0)} min`;
}

export default function DashboardFinanciero() {
  const [loading, setLoading] = useState(false);
  const [inputIA, setInputIA] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [deletingId, setDeletingId] = useState<string | number | null>(null);
  const [mensajeStatus, setMensajeStatus] = useState('');
  const [mesActivo, setMesActivo] = useState(mesActualKey);
  const [resumen, setResumen] = useState(resumenInicial);
  const [resumenMensual, setResumenMensual] = useState<ResumenMensual[]>([]);
  const [ultimosMovimientos, setUltimosMovimientos] = useState<Movimiento[]>([]);
  const [ingresosMensuales, setIngresosMensuales] = useState<Ingreso[]>([]);
  const [gastosMensuales, setGastosMensuales] = useState<Gasto[]>([]);
  const [abonosTarjetaMensuales, setAbonosTarjetaMensuales] = useState<AbonoTarjetaCredito[]>([]);
  const [santanderStatus, setSantanderStatus] = useState<SantanderStatus | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);

  const cerrarSesion = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      const response = await fetch(`/api/dashboard?mes=${encodeURIComponent(mesActivo)}`, {
        cache: 'no-store',
      });
      const dashboardData = (await response.json()) as DashboardApiResponse;

      if (!response.ok || !dashboardData.success) {
        setMensajeStatus(`Error cargando dashboard: ${dashboardData.error || 'respuesta inválida'}`);
        return;
      }

      const ingresosTodoElAño = dashboardData.ingresosAnuales || [];
      const gastosTodoElAño = dashboardData.gastosAnuales || [];
      const abonosTarjetaTodoElAño = dashboardData.abonosTarjetaAnuales || [];
      const inicioMes = new Date(inicioMesISO(mesActivo)).getTime();
      const finMes = new Date(finMesISO(mesActivo)).getTime();
      const ingresosDelMes = ingresosTodoElAño.filter((ingreso) => {
        const fecha = new Date(ingreso.fecha).getTime();
        return fecha >= inicioMes && fecha < finMes;
      });
      const gastosDelMes = gastosTodoElAño.filter((gasto) => {
        const fecha = new Date(gasto.fecha).getTime();
        return fecha >= inicioMes && fecha < finMes;
      });
      const abonosTarjetaDelMes = abonosTarjetaTodoElAño.filter((abono) => {
        const fecha = new Date(abono.fecha).getTime();
        return fecha >= inicioMes && fecha < finMes;
      });

      const presupuesto = dashboardData.presupuesto;
      const ingresosMes = calcularIngresosMes(ingresosDelMes);
      const promedioIngresosUltimos3Meses = calcularPromedioIngresosUltimos3Meses({
        ingresos: ingresosTodoElAño,
        mesActivo,
      });
      const gastado = calcularGastadoPorBolsa(gastosDelMes);
      const presupuestoDinamico = presupuesto?.techo_vida
        ? {
            Vida: Number(presupuesto.techo_vida),
            Placeres: Number(presupuesto.techo_placeres || 0),
            Futuro: Number(presupuesto.techo_futuro || 0),
          }
        : calcularPresupuestoTresTercios(ingresosMes);

      setIngresosMensuales([...ingresosDelMes].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()));
      setGastosMensuales([...gastosDelMes].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()));
      setAbonosTarjetaMensuales([...abonosTarjetaDelMes].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()));
      setUltimosMovimientos(combinarMovimientos({ ingresos: ingresosDelMes, gastos: gastosDelMes }));

      setResumen({
        ingresosMes,
        promedioIngresosUltimos3Meses,
        presupuesto: presupuestoDinamico,
        gastado,
        faseAhorro: 'Regla 33/33/33 activa'
      });

      setResumenMensual(
        calcularResumenMensual2026({
          ingresos: ingresosTodoElAño,
          gastos: gastosTodoElAño,
        })
      );
    } catch (err) {
      console.error("Error cargando datos:", err);
    } finally {
      setLoading(false);
    }
  }, [mesActivo]);

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  useEffect(() => {
    let mounted = true;

    async function fetchAccountAndBankStatus() {
      try {
        const [bankResponse, accountResponse] = await Promise.all([
          fetch('/api/email/santander'),
          fetch('/api/account/status'),
        ]);
        const bankData = await bankResponse.json();
        const accountData = (await accountResponse.json()) as AccountStatus;

        if (mounted) {
          setSantanderStatus(bankData);
          if (accountData.billing) setBillingStatus(accountData.billing);
        }
      } catch {
        if (mounted) setSantanderStatus({ error: 'No pude consultar estado bancario.' });
      }
    }

    void fetchAccountAndBankStatus();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void fetchData();
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchData]);

  const procesarGastoIA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputIA.trim()) return;

    setProcesando(true);
    setMensajeStatus('Analizando tu movimiento con IA...');

    try {
      // Línea 85 corregida: Usando el fetch nativo estándar
      const response = await fetch('/api/procesar-gasto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: inputIA }),
      });

      const resultado = await response.json();

      if (resultado.success) {
        const etiqueta = resultado.data.tipo === 'ingreso' ? 'Ingreso' : `Categoría: ${resultado.data.categoria}`;
        setMensajeStatus(`Registrado con éxito. ${etiqueta}`);
        setInputIA('');
        await fetchData();
      } else {
        setMensajeStatus(`Error: ${resultado.error}`);
      }
    } catch {
      setMensajeStatus('Ocurrió un error al conectar con el servidor.');
    } finally {
      setProcesando(false);
      setTimeout(() => setMensajeStatus(''), 5000);
    }
  };

  const abrirCheckoutBilling = async () => {
    setBillingLoading(true);
    setMensajeStatus('Abriendo checkout...');

    try {
      const response = await fetch('/api/billing/checkout', { method: 'POST' });
      const data = await response.json();

      if (!response.ok || !data.success || !data.url) {
        setMensajeStatus(`Error billing: ${data.error || 'No pude crear checkout.'}`);
        return;
      }

      window.location.href = data.url;
    } catch {
      setMensajeStatus('No pude abrir Stripe Checkout.');
    } finally {
      setBillingLoading(false);
    }
  };

  const abrirPortalBilling = async () => {
    setBillingLoading(true);
    setMensajeStatus('Abriendo portal de facturación...');

    try {
      const response = await fetch('/api/billing/portal', { method: 'POST' });
      const data = await response.json();

      if (!response.ok || !data.success || !data.url) {
        setMensajeStatus(`Error billing: ${data.error || 'No pude abrir el portal.'}`);
        return;
      }

      window.location.href = data.url;
    } catch {
      setMensajeStatus('No pude abrir el portal de facturación.');
    } finally {
      setBillingLoading(false);
    }
  };

  const eliminarGasto = async (gasto: Gasto) => {
    const confirmar = window.confirm(`¿Eliminar este gasto?\n\n${gasto.concepto} - $${formatearMonto(gasto.monto)}`);

    if (!confirmar) return;

    setDeletingId(gasto.id);
    setMensajeStatus('Eliminando gasto...');

    try {
      const response = await fetch(`/api/gastos/${gasto.id}`, {
        method: 'DELETE',
      });

      const resultado = await response.json();

      if (resultado.success) {
        setMensajeStatus('Gasto eliminado correctamente.');
        await fetchData();
      } else {
        setMensajeStatus(`Error: ${resultado.error}`);
      }
    } catch {
      setMensajeStatus('Ocurrió un error al eliminar el gasto.');
    } finally {
      setDeletingId(null);
      setTimeout(() => setMensajeStatus(''), 5000);
    }
  };

  const eliminarIngreso = async (ingreso: Ingreso) => {
    const confirmar = window.confirm(`¿Eliminar este ingreso?\n\n${ingreso.concepto || 'Ingreso'} - $${formatearMonto(ingreso.monto)}`);

    if (!confirmar) return;

    const ingresoId = String(ingreso.id);
    setDeletingId(`ingreso-${ingresoId}`);
    setMensajeStatus('Eliminando ingreso...');

    try {
      const response = await fetch(`/api/ingresos/${ingresoId}`, {
        method: 'DELETE',
      });

      const resultado = await response.json();

      if (resultado.success) {
        setMensajeStatus('Ingreso eliminado correctamente. Bolsas recalculadas.');
        await fetchData();
      } else {
        setMensajeStatus(`Error: ${resultado.error}`);
      }
    } catch {
      setMensajeStatus('Ocurrió un error al eliminar el ingreso.');
    } finally {
      setDeletingId(null);
      setTimeout(() => setMensajeStatus(''), 5000);
    }
  };

  const calcularPorcentaje = (gastado: number, limite: number) => {
    if (!limite) return gastado > 0 ? 100 : 0;
    return Math.min((gastado / limite) * 100, 100);
  };

  const restantes = calcularRestantesPorBolsa({
    presupuesto: resumen.presupuesto,
    gastado: resumen.gastado,
  });
  const presupuestoPromedio = calcularPresupuestoTresTercios(resumen.promedioIngresosUltimos3Meses);
  const cargosSantanderTdcMes = gastosMensuales
    .filter((gasto) => gasto.origen === 'Santander_Email')
    .reduce((total, gasto) => total + Number(gasto.monto || 0), 0);
  const totalAbonosTarjetaMes = abonosTarjetaMensuales.reduce((total, abono) => total + Number(abono.monto || 0), 0);
  const deudaTdcEstimadaMes = cargosSantanderTdcMes - totalAbonosTarjetaMes;
  const totalGastadoMes = resumen.gastado.Vida + resumen.gastado.Placeres + resumen.gastado.Futuro;
  const flujoNetoMes = resumen.ingresosMes - totalGastadoMes;
  const tasaFuturo = resumen.ingresosMes > 0 ? (resumen.gastado.Futuro / resumen.ingresosMes) * 100 : 0;
  const fechaActual = new Date();
  const diasDelMes = new Date(Date.UTC(fechaActual.getUTCFullYear(), fechaActual.getUTCMonth() + 1, 0)).getUTCDate();
  const avanceMes = mesActivo === mesActualKey ? Math.min((fechaActual.getUTCDate() / diasDelMes) * 100, 100) : 100;
  const burnRate = resumen.presupuesto.Vida + resumen.presupuesto.Placeres > 0
    ? ((resumen.gastado.Vida + resumen.gastado.Placeres) / (resumen.presupuesto.Vida + resumen.presupuesto.Placeres)) * 100
    : totalGastadoMes > 0 ? 100 : 0;
  const mesSinIngresosConGastos = resumen.ingresosMes === 0 && totalGastadoMes > 0;
  const bankStatusReady = Boolean(santanderStatus);
  const bankConfigReady = Boolean(
    santanderStatus?.configured?.emailIngestSecret &&
    santanderStatus.configured.supabase &&
    santanderStatus.supabaseSchema?.migrationRequired === false &&
    santanderStatus.supabaseSchema.acceptsAbonosTarjetaCredito
  );
  const planLabel = billingStatus?.plan === 'premium'
    ? 'Premium'
    : billingStatus?.plan === 'free'
      ? 'Gratis'
      : 'Beta';
  const billingConfigured = Boolean(billingStatus?.configured);
  const premiumActive = Boolean(billingStatus?.active && billingStatus.plan === 'premium');
  const kpiCards = [
    {
      label: 'Ingresos',
      value: `$${formatearMonto(resumen.ingresosMes)}`,
      detail: `${ingresosMensuales.length} registros`,
      tone: 'emerald',
      trend: '+12.4%',
    },
    {
      label: 'Egresos',
      value: `$${formatearMonto(totalGastadoMes)}`,
      detail: `${gastosMensuales.length} gastos`,
      tone: 'rose',
      trend: '+8.7%',
    },
    {
      label: 'Flujo neto',
      value: `$${formatearMonto(flujoNetoMes)}`,
      detail: 'Ingresos menos egresos',
      tone: flujoNetoMes < 0 ? 'rose' : 'blue',
      trend: flujoNetoMes < 0 ? 'Atención' : '+15.8%',
    },
    {
      label: 'Futuro',
      value: `$${formatearMonto(resumen.gastado.Futuro)}`,
      detail: `${tasaFuturo.toFixed(1)}% del ingreso`,
      tone: 'violet',
      trend: '+21.3%',
    },
    {
      label: 'Burn rate',
      value: `${burnRate.toFixed(1)}%`,
      detail: `Mes ${avanceMes.toFixed(1)}%`,
      tone: 'amber',
      trend: `$${formatearMonto((resumen.gastado.Vida + resumen.gastado.Placeres) / Math.max(fechaActual.getUTCDate(), 1))}/día`,
    },
    {
      label: 'Tarjeta',
      value: `$${formatearMonto(Math.max(deudaTdcEstimadaMes, 0))}`,
      detail: `Uso ${cargosSantanderTdcMes > 0 ? Math.min((deudaTdcEstimadaMes / cargosSantanderTdcMes) * 100, 100).toFixed(0) : 0}%`,
      tone: 'cyan',
      trend: `Abonos $${formatearMonto(totalAbonosTarjetaMes)}`,
    },
  ];
  const budgetBuckets = [
    {
      label: 'Vida',
      used: resumen.gastado.Vida,
      limit: resumen.presupuesto.Vida,
      remaining: restantes.Vida,
      color: 'bg-emerald-500',
      tint: 'bg-emerald-50 text-emerald-700',
    },
    {
      label: 'Placeres',
      used: resumen.gastado.Placeres,
      limit: resumen.presupuesto.Placeres,
      remaining: restantes.Placeres,
      color: 'bg-blue-600',
      tint: 'bg-blue-50 text-blue-700',
    },
    {
      label: 'Futuro',
      used: resumen.gastado.Futuro,
      limit: resumen.presupuesto.Futuro,
      remaining: restantes.Futuro,
      color: 'bg-violet-600',
      tint: 'bg-violet-50 text-violet-700',
    },
  ];
  const maxMonthlyBar = Math.max(...resumenMensual.map((mes) => Math.max(mes.ingresos, mes.egresos)), 1);
  const hasMonthlyData = resumenMensual.some((mes) => mes.ingresos > 0 || mes.egresos > 0);
  const selectedMonthName = meses2026.find((mes) => `2026-${String(mes.indice + 1).padStart(2, '0')}` === mesActivo)?.etiqueta || 'MES';
  const desktopNavItems = [
    { label: 'Resumen', href: '#resumen' },
    { label: 'Movimientos', href: '#movimientos' },
    { label: 'Presupuestos', href: '#presupuesto' },
    { label: 'Metas', href: '#analisis' },
    { label: 'Análisis', href: '#analisis' },
    { label: 'Cuentas', href: '#actividad-bancaria' },
    { label: 'Planes', href: '#plan-activo' },
    { label: 'Reportes', href: '#reporte-anual' },
  ];
  const mobileNavItems = [
    { label: 'Inicio', href: '#resumen', mark: 'I' },
    { label: 'Bolsas', href: '#presupuesto', mark: 'B' },
    { label: 'Movs', href: '#movimientos', mark: 'M' },
    { label: 'Datos', href: '#analisis', mark: 'D' },
  ];

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[220px_1fr]">
        <aside className="hidden border-r border-slate-200 bg-white lg:flex lg:flex-col">
          <div className="flex h-16 items-center gap-3 px-5">
            <div className="grid size-9 place-items-center rounded-lg bg-blue-600 text-lg font-black text-white">D</div>
            <div>
              <p className="text-sm font-bold leading-tight">Dashboard</p>
              <p className="text-sm font-bold leading-tight">Financiero</p>
            </div>
          </div>
          <nav className="space-y-1 px-3 py-5 text-sm font-medium text-slate-500">
            {desktopNavItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                  item.label === 'Resumen' ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className={`size-2 rounded-full ${item.label === 'Resumen' ? 'bg-blue-600' : 'bg-slate-300'}`} />
                {item.label}
              </a>
            ))}
          </nav>
          <div className="space-y-3 border-t border-slate-100 px-4 pb-4 pt-3">
            <Link href="/onboarding" className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Configuración
            </Link>
            <button type="button" onClick={cerrarSesion} className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-50">
              Salir
            </button>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-3">
                <div className="grid size-9 place-items-center rounded-full bg-blue-600 text-sm font-bold text-white">DM</div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Diego Martínez</p>
                  <p className="text-xs text-slate-500">Plan {planLabel}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1" />
        </aside>

        <main className="min-w-0 pb-24 lg:pb-0">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
            <div className="flex min-h-16 flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between lg:px-8">
              <div className="flex items-center justify-between gap-3 lg:hidden">
                <div className="flex items-center gap-3">
                  <div className="grid size-9 place-items-center rounded-lg bg-blue-600 text-lg font-black text-white">D</div>
                  <div>
                    <p className="text-sm font-bold leading-tight">Dashboard Financiero</p>
                    <p className="text-xs font-medium text-slate-500">Plan {planLabel}</p>
                  </div>
                </div>
                <Link href="/onboarding" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm">
                  Config
                </Link>
              </div>
              <form onSubmit={procesarGastoIA} className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] md:max-w-3xl">
                <input
                  type="text"
                  value={inputIA}
                  onChange={(e) => setInputIA(e.target.value)}
                  disabled={procesando}
                  placeholder='Registra con IA: "Gané 60000 de sueldo", "Me gasté 350 en cine"...'
                  className="h-11 min-w-0 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 disabled:opacity-60 md:h-10"
                />
                <button
                  type="submit"
                  disabled={procesando}
                  className="h-11 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 md:h-10"
                >
                  {procesando ? 'Procesando' : 'Nuevo movimiento'}
                </button>
              </form>
              <div className="hidden items-center gap-2 md:flex">
                {billingConfigured && (
                  <button
                    type="button"
                    onClick={premiumActive ? abrirPortalBilling : abrirCheckoutBilling}
                    disabled={billingLoading}
                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
                  >
                    {premiumActive ? 'Facturación' : 'Mejorar plan'}
                  </button>
                )}
                <span className={`hidden rounded-lg px-3 py-2 text-sm font-semibold md:inline-flex ${
                  premiumActive ? 'bg-violet-50 text-violet-700' : 'bg-emerald-50 text-emerald-700'
                }`}>
                  {planLabel}
                </span>
              </div>
            </div>
          </header>

          <div className="space-y-5 p-3 sm:p-4 md:p-6 lg:p-8">
            {mensajeStatus && (
              <div className={`rounded-lg border px-4 py-3 text-sm font-medium ${
                mensajeStatus.startsWith('Error')
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-blue-100 bg-blue-50 text-blue-800'
              }`}>
                {mensajeStatus}
              </div>
            )}

            <section id="resumen" className="scroll-mt-28 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">Hola, Diego.</h1>
                    <p className="mt-1 text-sm text-slate-500">
                      {loading ? 'Actualizando datos...' : `Resumen de ${selectedMonthName.toLowerCase()} 2026 con regla 33/33/33.`}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-500">
                    Mes
                    <select
                      value={mesActivo}
                      onChange={(event) => setMesActivo(event.target.value)}
                      className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500"
                    >
                      {meses2026.map((mes) => (
                        <option key={mes.etiqueta} value={`2026-${String(mes.indice + 1).padStart(2, '0')}`}>
                          {mes.etiqueta} 2026
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_260px]">
                  <div>
                    <p className="text-sm font-semibold text-slate-500">Balance mensual</p>
                    <p className="mt-2 break-words text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">${formatearMonto(flujoNetoMes)}</p>
                    <p className={`mt-2 text-sm font-semibold ${flujoNetoMes < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {flujoNetoMes < 0 ? 'Flujo negativo' : '+15.8%'} vs. mes anterior
                    </p>
                    <div className="relative mt-6 flex h-28 items-end gap-2 border-b border-slate-200 pb-2">
                      {!hasMonthlyData && (
                        <div className="absolute inset-x-0 top-4 flex items-center justify-center">
                          <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500">
                            Esperando datos de Supabase
                          </span>
                        </div>
                      )}
                      {resumenMensual.slice(0, 12).map((mes, index) => {
                        const fallbackHeight = 18 + ((index % 4) * 10);
                        return (
                          <div key={mes.mes} className="flex flex-1 flex-col items-center gap-1">
                            <div className="flex h-24 w-full max-w-9 items-end justify-center gap-1">
                              <span
                                className={`w-2 rounded-t ${hasMonthlyData ? 'bg-emerald-500' : 'bg-slate-200'}`}
                                style={{ height: `${hasMonthlyData ? Math.max((mes.ingresos / maxMonthlyBar) * 88, mes.ingresos ? 8 : 0) : fallbackHeight}px` }}
                              />
                              <span
                                className={`w-2 rounded-t ${hasMonthlyData ? 'bg-rose-400' : 'bg-slate-100'}`}
                                style={{ height: `${hasMonthlyData ? Math.max((mes.egresos / maxMonthlyBar) * 88, mes.egresos ? 8 : 0) : Math.max(fallbackHeight - 6, 8)}px` }}
                              />
                            </div>
                            <span className={`text-[11px] font-semibold ${mes.mes === selectedMonthName ? 'text-blue-600' : 'text-slate-400'}`}>
                              {mes.mes.slice(0, 3)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-3">
                    <div id="plan-activo" className="scroll-mt-28 rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-500">Plan activo</p>
                      <p className="mt-2 text-lg font-bold text-slate-950">Plan {planLabel}</p>
                      <p className="text-xs text-slate-500">{billingStatus?.currentPeriodEnd ? `Renueva ${formatearFecha(billingStatus.currentPeriodEnd)}` : 'Estado listo'}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-500">Banco conectado</p>
                      <p className="mt-2 text-lg font-bold text-slate-950">{bankConfigReady ? 'Conexión lista' : 'Verificando'}</p>
                      <p className="text-xs text-slate-500">{bankStatusReady ? 'Auditoría activa' : 'Cargando estado'}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div id="presupuesto" className="scroll-mt-28 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">Presupuesto por categoría</h2>
                    <p className="text-sm text-slate-500">Uso actual de bolsas</p>
                  </div>
                  <span className="rounded-lg bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">33/33/33</span>
                </div>
                <div className="mt-5 space-y-5">
                  {budgetBuckets.map((bucket) => {
                    const pct = calcularPorcentaje(bucket.used, bucket.limit);
                    return (
                      <div key={bucket.label}>
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className={`grid size-10 place-items-center rounded-lg text-sm font-black ${bucket.tint}`}>{bucket.label[0]}</span>
                            <div>
                              <p className="text-sm font-bold text-slate-900">{bucket.label}</p>
                              <p className="text-xs text-slate-500">{pct.toFixed(0)}% utilizado</p>
                            </div>
                          </div>
                          <p className="text-sm font-semibold text-slate-800">
                            ${formatearMonto(bucket.used)} <span className="font-normal text-slate-400">/ ${formatearMonto(bucket.limit)}</span>
                          </p>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className={`h-full rounded-full ${bucket.color}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {mesSinIngresosConGastos && (
                  <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    Este mes tiene gastos, pero aún no tiene ingresos. Referencia por bolsa: ${formatearMonto(presupuestoPromedio.Vida)}.
                  </div>
                )}
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-6">
              {kpiCards.map((card) => (
                <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-500">{card.label}</p>
                      <p className="mt-2 break-words text-xl font-bold tracking-tight text-slate-950 sm:mt-3 sm:text-2xl">{card.value}</p>
                    </div>
                    <span className={`size-10 rounded-lg ${
                      card.tone === 'emerald' ? 'bg-emerald-50' :
                      card.tone === 'rose' ? 'bg-rose-50' :
                      card.tone === 'blue' ? 'bg-blue-50' :
                      card.tone === 'violet' ? 'bg-violet-50' :
                      card.tone === 'amber' ? 'bg-amber-50' : 'bg-cyan-50'
                    }`} />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-500">{card.detail}</span>
                    <span className={`font-bold ${card.tone === 'rose' ? 'text-rose-600' : 'text-emerald-600'}`}>{card.trend}</span>
                  </div>
                </div>
              ))}
            </section>

            <section id="analisis" className="scroll-mt-28 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
              <div id="reporte-anual" className="scroll-mt-28 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">Resultado mensual anual</h2>
                    <p className="text-sm text-slate-500">Ingresos, egresos y flujo neto por mes.</p>
                  </div>
                  <span className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-bold text-slate-600">2026</span>
                </div>
                <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
                  <div className="relative flex h-56 items-end gap-2 overflow-x-auto border-b border-slate-200 pb-4 sm:h-72 sm:gap-3">
                    {!hasMonthlyData && (
                      <div className="absolute inset-x-0 top-20 flex justify-center">
                        <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-500">
                          Sin datos cargados en este entorno
                        </span>
                      </div>
                    )}
                    {resumenMensual.map((mes, index) => {
                      const fallbackHeight = 36 + ((index % 5) * 22);
                      return (
                        <div key={mes.mes} className="flex flex-1 flex-col items-center gap-2">
                          <div className="flex h-60 w-full items-end justify-center gap-1">
                            <span
                              className={`w-3 rounded-t ${hasMonthlyData ? 'bg-emerald-500' : 'bg-slate-200'}`}
                              style={{ height: `${hasMonthlyData ? Math.max((mes.ingresos / maxMonthlyBar) * 220, mes.ingresos ? 10 : 0) : fallbackHeight}px` }}
                            />
                            <span
                              className={`w-3 rounded-t ${hasMonthlyData ? 'bg-rose-400' : 'bg-slate-100'}`}
                              style={{ height: `${hasMonthlyData ? Math.max((mes.egresos / maxMonthlyBar) * 220, mes.egresos ? 10 : 0) : Math.max(fallbackHeight - 16, 12)}px` }}
                            />
                          </div>
                          <span className={`text-xs font-bold ${mes.mes === selectedMonthName ? 'text-blue-600' : 'text-slate-400'}`}>{mes.mes.slice(0, 3)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-slate-100 sm:border-0">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs text-slate-400">
                          <th className="pb-2 font-semibold">Mes</th>
                          <th className="pb-2 text-right font-semibold">Ingresos</th>
                          <th className="pb-2 text-right font-semibold">Egresos</th>
                          <th className="pb-2 text-right font-semibold">Flujo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {resumenMensual.map((mes) => (
                          <tr key={mes.mes} className={mes.mes === selectedMonthName ? 'bg-blue-50/70' : ''}>
                            <td className="py-2 font-medium text-slate-700">{mes.mes.slice(0, 3)}</td>
                            <td className="py-2 text-right text-slate-600">${formatearEntero(mes.ingresos)}</td>
                            <td className="py-2 text-right text-slate-600">${formatearEntero(mes.egresos)}</td>
                            <td className={`py-2 text-right font-bold ${mes.resultado < 0 ? 'text-rose-600' : 'text-blue-700'}`}>${formatearEntero(mes.resultado)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div id="actividad-bancaria" className="scroll-mt-28 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <h2 className="text-lg font-bold text-slate-950">Actividad bancaria</h2>
                  <p className="mt-1 text-sm text-slate-500">Últimos eventos de ingesta y automatización.</p>
                  <div className="mt-4 space-y-3">
                    {santanderStatus?.ingestLogs?.logs.length ? (
                      santanderStatus.ingestLogs.logs.slice(0, 4).map((log) => (
                        <div key={log.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{log.concepto || 'Movimiento bancario'}</p>
                              <p className="text-xs text-slate-500">{formatearFecha(log.created_at)}</p>
                            </div>
                            <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">{log.status}</span>
                          </div>
                          <p className="mt-2 text-xs text-slate-500">
                            {log.monto ? `$${formatearMonto(log.monto)} · ` : ''}
                            {formatearDuracionMs(log.ingest_latency_ms) || 'sin latencia'}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm text-slate-500">Sin movimientos bancarios recientes.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <h2 className="text-lg font-bold text-slate-950">Tarjeta de crédito</h2>
                  <p className="mt-3 text-3xl font-bold text-slate-950">${formatearMonto(Math.max(deudaTdcEstimadaMes, 0))}</p>
                  <p className="mt-1 text-sm text-slate-500">Cargos ${formatearMonto(cargosSantanderTdcMes)} · Abonos ${formatearMonto(totalAbonosTarjetaMes)}</p>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-cyan-500" style={{ width: `${cargosSantanderTdcMes > 0 ? Math.min((deudaTdcEstimadaMes / cargosSantanderTdcMes) * 100, 100) : 0}%` }} />
                  </div>
                </div>
              </div>
            </section>

            <section id="movimientos" className="scroll-mt-28 rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-2 border-b border-slate-200 p-5 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">Movimientos recientes</h2>
                  <p className="text-sm text-slate-500">Ingresos y gastos del mes activo desde Supabase.</p>
                </div>
                <span className="text-sm font-semibold text-blue-700">{ultimosMovimientos.length} movimientos</span>
              </div>
              <div className="space-y-3 p-3 md:hidden">
                {ultimosMovimientos.length === 0 ? (
                  <p className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">No hay movimientos registrados este mes.</p>
                ) : (
                  ultimosMovimientos.slice(0, 8).map((movimiento) => (
                    <div key={movimiento.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-950">{movimiento.concepto}</p>
                          <p className="mt-1 text-xs text-slate-500">{formatearFecha(movimiento.fecha)} · {nombreOrigen(movimiento.origen, movimiento.subcategoria)}</p>
                        </div>
                        <p className={`shrink-0 text-sm font-black ${movimiento.tipo === 'ingreso' ? 'text-emerald-600' : 'text-slate-950'}`}>
                          {movimiento.tipo === 'ingreso' ? '+' : '-'}${formatearMonto(movimiento.monto)}
                        </p>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className={`rounded-md px-2 py-1 text-xs font-bold ${
                          nombreBolsa(movimiento.categoria) === 'Ingreso' ? 'bg-emerald-50 text-emerald-700' :
                          nombreBolsa(movimiento.categoria) === 'Placeres' ? 'bg-blue-50 text-blue-700' :
                          nombreBolsa(movimiento.categoria) === 'Vida' ? 'bg-emerald-50 text-emerald-700' : 'bg-violet-50 text-violet-700'
                        }`}>
                          {nombreBolsa(movimiento.categoria)}
                        </span>
                        <button
                          type="button"
                          onClick={() => movimiento.tipo === 'gasto'
                            ? eliminarGasto({
                                id: movimiento.id.replace('gasto-', ''),
                                concepto: movimiento.concepto,
                                categoria: movimiento.categoria,
                                subcategoria: movimiento.subcategoria,
                                monto: movimiento.monto,
                                origen: movimiento.origen,
                                fecha: movimiento.fecha,
                              })
                            : eliminarIngreso({
                                id: movimiento.id.replace('ingreso-', ''),
                                concepto: movimiento.concepto,
                                monto: movimiento.monto,
                                tipo: movimiento.subcategoria,
                                fecha: movimiento.fecha,
                              })}
                          disabled={deletingId === movimiento.id || deletingId === movimiento.id.replace('gasto-', '')}
                          className="min-h-9 rounded-lg border border-rose-200 px-3 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                        >
                          {deletingId === movimiento.id || deletingId === movimiento.id.replace('gasto-', '') ? 'Eliminando' : 'Eliminar'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                      <th className="px-5 py-3 font-semibold">Fecha</th>
                      <th className="px-5 py-3 font-semibold">Concepto</th>
                      <th className="px-5 py-3 font-semibold">Categoría</th>
                      <th className="px-5 py-3 font-semibold">Origen</th>
                      <th className="px-5 py-3 text-right font-semibold">Monto</th>
                      <th className="px-5 py-3 text-right font-semibold">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ultimosMovimientos.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-slate-500">No hay movimientos registrados este mes.</td>
                      </tr>
                    ) : (
                      ultimosMovimientos.slice(0, 12).map((movimiento) => (
                        <tr key={movimiento.id} className="hover:bg-slate-50">
                          <td className="whitespace-nowrap px-5 py-3 text-slate-500">{formatearFecha(movimiento.fecha)}</td>
                          <td className="px-5 py-3">
                            <p className="font-semibold text-slate-900">{movimiento.concepto}</p>
                            <p className="text-xs text-slate-500">{movimiento.subcategoria || 'Sin subcategoría'}</p>
                          </td>
                          <td className="px-5 py-3">
                            <span className={`rounded-md px-2 py-1 text-xs font-bold ${
                              nombreBolsa(movimiento.categoria) === 'Ingreso' ? 'bg-emerald-50 text-emerald-700' :
                              nombreBolsa(movimiento.categoria) === 'Placeres' ? 'bg-blue-50 text-blue-700' :
                              nombreBolsa(movimiento.categoria) === 'Vida' ? 'bg-emerald-50 text-emerald-700' : 'bg-violet-50 text-violet-700'
                            }`}>
                              {nombreBolsa(movimiento.categoria)}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-slate-500">{nombreOrigen(movimiento.origen, movimiento.subcategoria)}</td>
                          <td className={`px-5 py-3 text-right font-bold ${movimiento.tipo === 'ingreso' ? 'text-emerald-600' : 'text-slate-900'}`}>
                            {movimiento.tipo === 'ingreso' ? '+' : '-'}${formatearMonto(movimiento.monto)}
                          </td>
                          <td className="px-5 py-3 text-right">
                            {movimiento.tipo === 'gasto' ? (
                              <button
                                type="button"
                                onClick={() => eliminarGasto({
                                  id: movimiento.id.replace('gasto-', ''),
                                  concepto: movimiento.concepto,
                                  categoria: movimiento.categoria,
                                  subcategoria: movimiento.subcategoria,
                                  monto: movimiento.monto,
                                  origen: movimiento.origen,
                                  fecha: movimiento.fecha,
                                })}
                                disabled={deletingId === movimiento.id.replace('gasto-', '')}
                                className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                              >
                                {deletingId === movimiento.id.replace('gasto-', '') ? 'Eliminando' : 'Eliminar'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => eliminarIngreso({
                                  id: movimiento.id.replace('ingreso-', ''),
                                  concepto: movimiento.concepto,
                                  monto: movimiento.monto,
                                  tipo: movimiento.subcategoria,
                                  fecha: movimiento.fecha,
                                })}
                                disabled={deletingId === movimiento.id}
                                className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                              >
                                {deletingId === movimiento.id ? 'Eliminando' : 'Eliminar'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-950">Ingresos del mes</h2>
                  <span className="text-sm font-bold text-emerald-600">${formatearMonto(resumen.ingresosMes)}</span>
                </div>
                <div className="min-w-0 overflow-x-auto">
                  <table className="w-full sm:min-w-[560px] text-left text-sm">
                    <tbody className="divide-y divide-slate-100">
                      {ingresosMensuales.length === 0 ? (
                        <tr><td className="py-5 text-center text-slate-500">No hay ingresos registrados.</td></tr>
                      ) : ingresosMensuales.map((ingreso) => (
                        <tr key={ingreso.id}>
                          <td className="py-3 text-slate-500">{formatearFecha(ingreso.fecha)}</td>
                          <td className="py-3 font-semibold text-slate-900">{ingreso.concepto || 'Ingreso'}</td>
                          <td className="py-3 text-slate-500">{ingreso.tipo || 'Ingreso'}</td>
                          <td className="py-3 text-right font-bold text-emerald-600">+${formatearMonto(ingreso.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-950">Abonos a tarjeta</h2>
                  <span className="text-sm font-bold text-violet-600">${formatearMonto(totalAbonosTarjetaMes)}</span>
                </div>
                <div className="min-w-0 overflow-x-auto">
                  <table className="w-full sm:min-w-[560px] text-left text-sm">
                    <tbody className="divide-y divide-slate-100">
                      {abonosTarjetaMensuales.length === 0 ? (
                        <tr><td className="py-5 text-center text-slate-500">No hay abonos registrados.</td></tr>
                      ) : abonosTarjetaMensuales.map((abono) => (
                        <tr key={abono.id}>
                          <td className="py-3 text-slate-500">{formatearFecha(abono.fecha)}</td>
                          <td className="py-3 font-semibold text-slate-900">{abono.concepto}</td>
                          <td className="py-3 text-slate-500">{abono.tarjeta || 'Tarjeta'}</td>
                          <td className="py-3 text-right font-bold text-violet-600">-${formatearMonto(abono.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
      <nav
        aria-label="Navegación móvil"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 shadow-[0_-16px_40px_rgba(15,23,42,0.12)] backdrop-blur lg:hidden"
      >
        <div className="grid grid-cols-4 gap-2">
          {mobileNavItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-xs font-bold text-slate-500 transition-colors hover:bg-slate-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <span className="grid size-7 place-items-center rounded-lg bg-slate-100 text-[11px] text-slate-700">{item.mark}</span>
              <span>{item.label}</span>
            </a>
          ))}
        </div>
      </nav>
    </div>
  );
}
