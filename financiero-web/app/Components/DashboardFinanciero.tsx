"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  fondosAcumulados?: FondoAcumulado[];
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
  priceConfigured?: {
    beta: boolean;
    premium: boolean;
  };
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

type PlanOption = {
  name: string;
  price: string;
  plan: 'free' | 'beta' | 'premium';
  description: string;
  features: string[];
};

type FondoAcumulado = {
  id?: string | number;
  cuenta?: string | null;
  nombre?: string | null;
  concepto?: string | null;
  saldo_actual?: number | string | null;
  monto_actual?: number | string | null;
  monto?: number | string | null;
  objetivo?: number | string | null;
  meta?: number | string | null;
  monto_objetivo?: number | string | null;
  meta_monto?: number | string | null;
  fecha_objetivo?: string | null;
  updated_at?: string | null;
};

type BankAccount = {
  id: string;
  connection_id?: string | null;
  name?: string | null;
  official_name?: string | null;
  type?: string | null;
  subtype?: string | null;
  currency?: string | null;
  current_balance?: number | string | null;
  available_balance?: number | string | null;
  updated_at?: string | null;
};

type BankConnection = {
  id: string;
  provider: string;
  institution_name?: string | null;
  status: string;
  last_sync_at?: string | null;
  consent_expires_at?: string | null;
  updated_at?: string | null;
};

type AccountStatus = {
  success: boolean;
  billing?: BillingStatus;
  bankConnections?: BankConnection[];
  bankAccounts?: BankAccount[];
  error?: string;
};

type DashboardAnalysis = {
  headline: string;
  diagnosis: string;
  actions: string[];
  risks: string[];
};

const mesActualKey = mesKeyDesdeFecha(new Date());

type DashboardView = 'resumen' | 'movimientos' | 'presupuestos' | 'metas' | 'analisis' | 'cuentas' | 'planes' | 'reportes';

function esAbonoTarjetaSospechoso(abono: AbonoTarjetaCredito) {
  const concepto = String(abono.concepto || '').toLowerCase();
  const monto = Number(abono.monto || 0);

  return monto >= 100000 ||
    /(?:l[ií]nea de cr[eé]dito|cr[eé]dito preaprobado|aprovecha|promoci[oó]n|oferta|beneficio|sin concepto|movimiento santander)/i.test(concepto);
}

function GearIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2.1 2.1 0 0 1-2.97 2.97l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.08 1.65V21a2.1 2.1 0 0 1-4.2 0v-.06a1.8 1.8 0 0 0-1.17-1.64 1.8 1.8 0 0 0-1.89.38l-.04.04a2.1 2.1 0 1 1-2.97-2.97l.04-.04A1.8 1.8 0 0 0 3.9 15a1.8 1.8 0 0 0-1.65-1.08H2.1a2.1 2.1 0 0 1 0-4.2h.06A1.8 1.8 0 0 0 3.8 8.55a1.8 1.8 0 0 0-.38-1.89l-.04-.04a2.1 2.1 0 1 1 2.97-2.97l.04.04a1.8 1.8 0 0 0 1.98.36A1.8 1.8 0 0 0 9.45 2.4V2.1a2.1 2.1 0 0 1 4.2 0v.06a1.8 1.8 0 0 0 1.08 1.65 1.8 1.8 0 0 0 1.98-.36l.04-.04a2.1 2.1 0 1 1 2.97 2.97l-.04.04a1.8 1.8 0 0 0-.36 1.98 1.8 1.8 0 0 0 1.65 1.08h.06a2.1 2.1 0 0 1 0 4.2h-.06A1.8 1.8 0 0 0 19.4 15Z" />
    </svg>
  );
}

function valorNumerico(...values: Array<number | string | null | undefined>) {
  for (const value of values) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }

  return 0;
}

function etiquetaCambio(actual: number, anterior: number, options?: { invert?: boolean; neutral?: string }) {
  if (!Number.isFinite(actual) || !Number.isFinite(anterior)) return options?.neutral || 'Sin base';
  if (anterior === 0) {
    if (actual === 0) return options?.neutral || 'Sin cambio';
    return 'Nuevo';
  }

  const rawChange = ((actual - anterior) / Math.abs(anterior)) * 100;
  const effectiveChange = options?.invert ? -rawChange : rawChange;
  const sign = effectiveChange > 0 ? '+' : '';

  return `${sign}${effectiveChange.toFixed(1)}%`;
}

function tendenciaTone(label: string) {
  if (label === 'Nuevo' || label === 'Sin base' || label === 'Sin cambio') return 'text-slate-500';
  return label.startsWith('-') ? 'text-rose-600' : 'text-emerald-600';
}

function fondoNombre(fondo: FondoAcumulado) {
  return fondo.cuenta || fondo.nombre || fondo.concepto || 'Meta financiera';
}

function fondoActual(fondo: FondoAcumulado) {
  return valorNumerico(fondo.saldo_actual, fondo.monto_actual, fondo.monto);
}

function fondoObjetivo(fondo: FondoAcumulado) {
  return valorNumerico(fondo.objetivo, fondo.meta, fondo.monto_objetivo, fondo.meta_monto);
}

function esCuentaDemo(account: BankAccount) {
  const label = `${account.name || ''} ${account.official_name || ''}`.toLowerCase();

  return /\b(plaid|checking|savings|money market|sandbox|flight)\b/i.test(label);
}

export default function DashboardFinanciero() {
  const [loading, setLoading] = useState(false);
  const [inputIA, setInputIA] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [deletingId, setDeletingId] = useState<string | number | null>(null);
  const [mensajeStatus, setMensajeStatus] = useState('');
  const [mesActivo, setMesActivo] = useState(mesActualKey);
  const [vistaActiva, setVistaActiva] = useState<DashboardView>('resumen');
  const [resumen, setResumen] = useState(resumenInicial);
  const [resumenMensual, setResumenMensual] = useState<ResumenMensual[]>([]);
  const [gastosAnuales, setGastosAnuales] = useState<Gasto[]>([]);
  const [fondosAcumulados, setFondosAcumulados] = useState<FondoAcumulado[]>([]);
  const [ultimosMovimientos, setUltimosMovimientos] = useState<Movimiento[]>([]);
  const [ingresosMensuales, setIngresosMensuales] = useState<Ingreso[]>([]);
  const [gastosMensuales, setGastosMensuales] = useState<Gasto[]>([]);
  const [abonosTarjetaMensuales, setAbonosTarjetaMensuales] = useState<AbonoTarjetaCredito[]>([]);
  const [abonosSospechososOcultos, setAbonosSospechososOcultos] = useState(0);
  const [santanderStatus, setSantanderStatus] = useState<SantanderStatus | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [bankConnections, setBankConnections] = useState<BankConnection[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingAction, setBillingAction] = useState<'checkout' | 'portal' | null>(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [analysisScope, setAnalysisScope] = useState<'month' | 'year'>('month');
  const [analysis, setAnalysis] = useState<DashboardAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisKey, setAnalysisKey] = useState('');

  const cerrarSesion = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  const fetchWithSessionRefresh = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await fetch(input, init);

    if (response.status !== 401) return response;

    const refreshResponse = await fetch('/api/auth/refresh', { method: 'POST' });

    if (!refreshResponse.ok) return response;

    return fetch(input, init);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      const response = await fetchWithSessionRefresh(`/api/dashboard?mes=${encodeURIComponent(mesActivo)}`, {
        cache: 'no-store',
      });
      const dashboardData = (await response.json()) as DashboardApiResponse;

      if (!response.ok || !dashboardData.success) {
        setMensajeStatus(response.status === 401
          ? 'Tu sesión expiró. Vuelve a iniciar sesión para continuar.'
          : `Error cargando dashboard: ${dashboardData.error || 'respuesta inválida'}`
        );
        return;
      }

      const ingresosTodoElAño = dashboardData.ingresosAnuales || [];
      const gastosTodoElAño = dashboardData.gastosAnuales || [];
      const abonosTarjetaTodoElAño = dashboardData.abonosTarjetaAnuales || [];
      setGastosAnuales(gastosTodoElAño);
      setFondosAcumulados(dashboardData.fondosAcumulados || []);
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
      const abonosTarjetaDelMesRaw = abonosTarjetaTodoElAño.filter((abono) => {
        const fecha = new Date(abono.fecha).getTime();
        return fecha >= inicioMes && fecha < finMes;
      });
      const abonosTarjetaDelMes = abonosTarjetaDelMesRaw.filter((abono) => !esAbonoTarjetaSospechoso(abono));
      setAbonosSospechososOcultos(abonosTarjetaDelMesRaw.length - abonosTarjetaDelMes.length);

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
  }, [fetchWithSessionRefresh, mesActivo]);

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  useEffect(() => {
    let mounted = true;

    async function fetchAccountAndBankStatus() {
      try {
        const [bankResponse, accountResponse] = await Promise.all([
          fetchWithSessionRefresh('/api/email/santander'),
          fetchWithSessionRefresh('/api/account/status'),
        ]);
        const bankData = await bankResponse.json();
        const accountData = (await accountResponse.json()) as AccountStatus;

        if (mounted) {
          setSantanderStatus(bankData);
          if (accountData.billing) setBillingStatus(accountData.billing);
          setBankConnections(accountData.bankConnections || []);
          setBankAccounts(accountData.bankAccounts || []);
        }
      } catch {
        if (mounted) setSantanderStatus({ error: 'No pude consultar estado bancario.' });
      }
    }

    void fetchAccountAndBankStatus();

    return () => {
      mounted = false;
    };
  }, [fetchWithSessionRefresh]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void fetchData();
    }, 60000);

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

  const abrirCheckoutBilling = async (plan: 'beta' | 'premium' = 'premium') => {
    setBillingLoading(true);
    setBillingAction('checkout');
    setMensajeStatus(`Abriendo checkout ${plan === 'beta' ? 'Beta' : 'Premium'}...`);

    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
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
      setBillingAction(null);
    }
  };

  const abrirPortalBilling = async () => {
    setBillingLoading(true);
    setBillingAction('portal');
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
      setBillingAction(null);
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

  const limpiarAbonosSospechosos = async () => {
    setCleanupLoading(true);
    setMensajeStatus('Limpiando abonos sospechosos...');

    try {
      const response = await fetch('/api/account/cleanup-card-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: `${mesActivo}-14`, minAmount: 100000, apply: true }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setMensajeStatus(`No pude borrar en Supabase: ${data.error || 'sin autorización'}. Ya está oculto de la interfaz.`);
        return;
      }

      setMensajeStatus(`Abonos sospechosos eliminados: ${data.deleted || 0}.`);
      await fetchData();
    } catch {
      setMensajeStatus('No pude conectar con el limpiador. El abono sospechoso sigue oculto de la interfaz.');
    } finally {
      setCleanupLoading(false);
      setTimeout(() => setMensajeStatus(''), 6000);
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
  const billingPriceConfigured = billingStatus?.priceConfigured || { beta: false, premium: false };
  const isPlanPriceConfigured = (plan: PlanOption['plan']) => {
    if (plan === 'free') return true;
    return billingPriceConfigured[plan];
  };
  const premiumActive = Boolean(billingStatus?.active && billingStatus.plan === 'premium');
  const maxMonthlyBar = Math.max(...resumenMensual.map((mes) => Math.max(mes.ingresos, mes.egresos)), 1);
  const hasMonthlyData = resumenMensual.some((mes) => mes.ingresos > 0 || mes.egresos > 0);
  const selectedMonthName = meses2026.find((mes) => `2026-${String(mes.indice + 1).padStart(2, '0')}` === mesActivo)?.etiqueta || 'MES';
  const selectedMonthIndex = meses2026.findIndex((mes) => mes.etiqueta === selectedMonthName);
  const currentMonthSummary = resumenMensual[selectedMonthIndex] || null;
  const previousMonthSummary = selectedMonthIndex > 0 ? resumenMensual[selectedMonthIndex - 1] : null;
  const previousMonthKey = selectedMonthIndex > 0 ? `2026-${String(selectedMonthIndex).padStart(2, '0')}` : null;
  const previousMonthStart = previousMonthKey ? new Date(inicioMesISO(previousMonthKey)).getTime() : null;
  const previousMonthEnd = previousMonthKey ? new Date(finMesISO(previousMonthKey)).getTime() : null;
  const gastosMesAnterior = previousMonthStart && previousMonthEnd
    ? gastosAnuales.filter((gasto) => {
        const fecha = new Date(gasto.fecha).getTime();
        return fecha >= previousMonthStart && fecha < previousMonthEnd;
      })
    : [];
  const gastosPorBolsaMesAnterior = calcularGastadoPorBolsa(gastosMesAnterior);
  const gastoFuturoMesAnterior = gastosPorBolsaMesAnterior.Futuro;
  const burnRateMesAnterior = previousMonthSummary && resumen.presupuesto.Vida + resumen.presupuesto.Placeres > 0
    ? ((gastosPorBolsaMesAnterior.Vida + gastosPorBolsaMesAnterior.Placeres) / (resumen.presupuesto.Vida + resumen.presupuesto.Placeres)) * 100
    : 0;
  const tendencias = {
    ingresos: etiquetaCambio(resumen.ingresosMes, previousMonthSummary?.ingresos || 0),
    egresos: etiquetaCambio(totalGastadoMes, previousMonthSummary?.egresos || 0, { invert: true }),
    flujo: etiquetaCambio(flujoNetoMes, previousMonthSummary?.resultado || 0),
    futuro: etiquetaCambio(resumen.gastado.Futuro, gastoFuturoMesAnterior),
    burnRate: etiquetaCambio(burnRate, burnRateMesAnterior, { invert: true }),
  };
  const reporteMensualCards = [
    { label: 'Ingresos del mes', value: `$${formatearMonto(resumen.ingresosMes)}`, detail: `${ingresosMensuales.length} ingresos`, tone: 'text-emerald-700' },
    { label: 'Egresos del mes', value: `$${formatearMonto(totalGastadoMes)}`, detail: `${gastosMensuales.length} gastos`, tone: 'text-rose-600' },
    { label: 'Flujo neto', value: `$${formatearMonto(flujoNetoMes)}`, detail: previousMonthSummary ? `${tendencias.flujo} vs. mes anterior` : 'Primer mes con comparativa', tone: flujoNetoMes < 0 ? 'text-rose-600' : 'text-blue-700' },
    { label: 'Saldo acumulado', value: `$${formatearMonto(currentMonthSummary?.saldoAcumulado || 0)}`, detail: `Acumulado a ${selectedMonthName.toLowerCase()}`, tone: (currentMonthSummary?.saldoAcumulado || 0) < 0 ? 'text-rose-600' : 'text-slate-950' },
  ];
  const kpiCards = [
    {
      label: 'Ingresos',
      value: `$${formatearMonto(resumen.ingresosMes)}`,
      detail: `${ingresosMensuales.length} registros`,
      tone: 'emerald',
      trend: tendencias.ingresos,
    },
    {
      label: 'Egresos',
      value: `$${formatearMonto(totalGastadoMes)}`,
      detail: `${gastosMensuales.length} gastos`,
      tone: 'rose',
      trend: tendencias.egresos,
    },
    {
      label: 'Flujo neto',
      value: `$${formatearMonto(flujoNetoMes)}`,
      detail: 'Ingresos menos egresos',
      tone: flujoNetoMes < 0 ? 'rose' : 'blue',
      trend: flujoNetoMes < 0 ? 'Atención' : tendencias.flujo,
    },
    {
      label: 'Futuro',
      value: `$${formatearMonto(resumen.gastado.Futuro)}`,
      detail: `${tasaFuturo.toFixed(1)}% del ingreso`,
      tone: 'violet',
      trend: tendencias.futuro,
    },
    {
      label: 'Burn rate',
      value: `${burnRate.toFixed(1)}%`,
      detail: `Mes ${avanceMes.toFixed(1)}%`,
      tone: 'amber',
      trend: tendencias.burnRate,
    },
    {
      label: 'Tarjeta',
      value: `$${formatearMonto(Math.max(deudaTdcEstimadaMes, 0))}`,
      detail: `Uso ${cargosSantanderTdcMes > 0 ? Math.min((deudaTdcEstimadaMes / cargosSantanderTdcMes) * 100, 100).toFixed(0) : 0}%`,
      tone: 'cyan',
      trend: `Abonos $${formatearMonto(totalAbonosTarjetaMes)}`,
    },
  ];
  const budgetBuckets = useMemo(() => [
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
  ], [restantes.Futuro, restantes.Placeres, restantes.Vida, resumen.gastado.Futuro, resumen.gastado.Placeres, resumen.gastado.Vida, resumen.presupuesto.Futuro, resumen.presupuesto.Placeres, resumen.presupuesto.Vida]);
  const desktopNavItems: Array<{ label: string; view: DashboardView; mark: string }> = [
    { label: 'Resumen', view: 'resumen', mark: 'R' },
    { label: 'Movimientos', view: 'movimientos', mark: 'M' },
    { label: 'Presupuestos', view: 'presupuestos', mark: 'P' },
    { label: 'Metas', view: 'metas', mark: 'G' },
    { label: 'Análisis', view: 'analisis', mark: 'A' },
    { label: 'Cuentas', view: 'cuentas', mark: 'C' },
    { label: 'Planes', view: 'planes', mark: 'P' },
    { label: 'Reportes', view: 'reportes', mark: 'R' },
  ];
  const mobileNavItems = [
    { label: 'Inicio', view: 'resumen' as const, mark: 'I' },
    { label: 'Movs', view: 'movimientos' as const, mark: 'M' },
    { label: 'Metas', view: 'metas' as const, mark: 'G' },
    { label: 'Cuenta', view: 'cuentas' as const, mark: 'C' },
  ];
  const activeNav = desktopNavItems.find((item) => item.view === vistaActiva) || desktopNavItems[0];
  const currentAnalysisKey = `${analysisScope}:${mesActivo}:${resumen.ingresosMes}:${totalGastadoMes}:${flujoNetoMes}`;

  const generarAnalisis = useCallback(async (scope: 'month' | 'year') => {
    setAnalysisScope(scope);
    setAnalysisLoading(true);
    setMensajeStatus(scope === 'year' ? 'Generando análisis anual con IA...' : 'Generando análisis mensual con IA...');

    try {
      const response = await fetch('/api/dashboard/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope,
          monthLabel: selectedMonthName,
          summary: {
            ingresosMes: resumen.ingresosMes,
            totalGastadoMes,
            flujoNetoMes,
            tasaFuturo,
            burnRate,
            deudaTdcEstimadaMes,
          },
          monthly: scope === 'year'
            ? resumenMensual
            : currentMonthSummary,
          buckets: budgetBuckets.map((bucket) => ({
            label: bucket.label,
            used: bucket.used,
            limit: bucket.limit,
            remaining: bucket.remaining,
            percent: calcularPorcentaje(bucket.used, bucket.limit),
          })),
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setMensajeStatus(`No pude generar análisis: ${data.error || 'respuesta inválida'}`);
        return;
      }

      setAnalysis(data.analysis);
      setAnalysisKey(`${scope}:${mesActivo}:${resumen.ingresosMes}:${totalGastadoMes}:${flujoNetoMes}`);
      setMensajeStatus(data.generatedBy === 'gemini' ? 'Análisis IA actualizado.' : 'Análisis local actualizado.');
    } catch {
      setMensajeStatus('No pude conectar con el análisis IA.');
    } finally {
      setAnalysisLoading(false);
      setTimeout(() => setMensajeStatus(''), 4000);
    }
  }, [budgetBuckets, burnRate, currentMonthSummary, deudaTdcEstimadaMes, flujoNetoMes, mesActivo, resumen.ingresosMes, resumenMensual, selectedMonthName, tasaFuturo, totalGastadoMes]);

  useEffect(() => {
    if (vistaActiva !== 'analisis') return;
    if (analysisLoading || analysisKey === currentAnalysisKey) return;
    const timeoutId = window.setTimeout(() => {
      void generarAnalisis(analysisScope);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [analysisKey, analysisLoading, analysisScope, currentAnalysisKey, generarAnalisis, vistaActiva]);

  const metasFinancieras = fondosAcumulados.map((fondo, index) => {
    const actual = fondoActual(fondo);
    const objetivo = fondoObjetivo(fondo);
    const progreso = objetivo > 0 ? Math.min((actual / objetivo) * 100, 100) : actual > 0 ? 100 : 0;

    return {
      id: fondo.id || `${fondoNombre(fondo)}-${index}`,
      nombre: fondoNombre(fondo),
      actual,
      objetivo,
      progreso,
      fechaObjetivo: fondo.fecha_objetivo || fondo.updated_at || null,
    };
  });
  const totalMetasActual = metasFinancieras.reduce((total, meta) => total + meta.actual, 0);
  const totalMetasObjetivo = metasFinancieras.reduce((total, meta) => total + meta.objetivo, 0);
  const progresoMetasGlobal = totalMetasObjetivo > 0 ? Math.min((totalMetasActual / totalMetasObjetivo) * 100, 100) : 0;
  const cuentasDemo = bankAccounts.filter(esCuentaDemo);
  const cuentasReales = bankAccounts.filter((account) => !esCuentaDemo(account));
  const saldoCuentas = cuentasReales.reduce((total, account) => total + valorNumerico(account.current_balance), 0);
  const cuentasActivas = bankConnections.filter((connection) => connection.status === 'active').length;
  const planOptions: PlanOption[] = [
    {
      name: 'Gratis',
      price: '$0',
      plan: 'free',
      description: 'Para probar el asistente financiero 33/33/33.',
      features: ['Registro manual', '30 dias de historial', 'Sin banco directo', 'IA muy limitada'],
    },
    {
      name: 'Beta',
      price: '$15',
      plan: 'beta',
      description: 'Para usar el asistente financiero personal sin banco directo.',
      features: ['Telegram incluido', 'Correo bancario fallback', '12 meses de historial', 'Analisis mensual con IA'],
    },
    {
      name: 'Premium',
      price: '$39',
      plan: 'premium',
      description: 'Para seguimiento avanzado con mas analisis y soporte.',
      features: ['2 correos fallback', '12 meses de historial', 'Analisis mensual/anual con IA', 'Soporte prioritario'],
    },
  ];
  const goalTemplates = [
    { name: 'Fondo de emergencia', target: resumen.ingresosMes > 0 ? resumen.ingresosMes * 3 : 90000, detail: '3 meses de ingreso como primer colchón.' },
    { name: 'Inversión anual', target: resumen.ingresosMes > 0 ? resumen.ingresosMes * 1.5 : 45000, detail: 'Aportaciones a CETES, GBM o fondo patrimonial.' },
    { name: 'Viaje / proyecto', target: 30000, detail: 'Meta flexible para un objetivo personal concreto.' },
  ];

  const iaCard = (
    <form onSubmit={procesarGastoIA} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold text-slate-950">Registrar movimiento</p>
          <p className="text-sm text-slate-500">Describe el ingreso o gasto y lo clasifico con IA.</p>
        </div>
        <span className="rounded-lg bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">IA financiera</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          type="text"
          value={inputIA}
          onChange={(e) => setInputIA(e.target.value)}
          disabled={procesando}
          placeholder='Ej. "Gané 60000 de sueldo" o "Me gasté 350 en cine"'
          className="h-11 min-w-0 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={procesando}
          className="h-11 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {procesando ? 'Procesando' : 'Nuevo movimiento'}
        </button>
      </div>
    </form>
  );

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-950">
      {billingAction && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 text-center shadow-xl">
            <div className="mx-auto grid size-12 animate-spin place-items-center rounded-full border-4 border-blue-100 border-t-blue-600" />
            <p className="mt-4 text-base font-black text-slate-950">
              {billingAction === 'checkout' ? 'Cargando Stripe' : 'Abriendo facturación'}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Estoy creando una sesión segura. Si cancelas en Stripe, volverás al dashboard.
            </p>
          </div>
        </div>
      )}
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[220px_1fr]">
        <aside className="hidden border-r border-slate-200 bg-white lg:flex lg:flex-col">
          <div className="flex h-16 items-center gap-3 px-5">
            <div className="grid size-9 place-items-center rounded-lg bg-blue-600 text-lg font-black text-white">D</div>
            <div>
              <p className="text-sm font-bold leading-tight">Dashboard</p>
              <p className="text-sm font-bold leading-tight">Financiero</p>
            </div>
          </div>
          <nav className="space-y-1 px-3 py-5 text-sm font-medium text-slate-500" aria-label="Secciones del dashboard">
            {desktopNavItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => setVistaActiva(item.view)}
                aria-current={vistaActiva === item.view ? 'page' : undefined}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                  vistaActiva === item.view ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className={`grid size-7 place-items-center rounded-lg text-xs font-black ${
                  vistaActiva === item.view ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'
                }`}>
                  {item.mark}
                </span>
                {item.label}
              </button>
            ))}
          </nav>
          <div className="space-y-3 border-t border-slate-100 px-4 pb-4 pt-3">
            <Link href="/onboarding" aria-label="Configuración" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              <GearIcon />
              <span>Configuración</span>
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
              <div className="hidden min-w-0 flex-1 md:block">
                <p className="text-xs font-semibold uppercase text-slate-400">Vista actual</p>
                <p className="truncate text-base font-bold text-slate-950">{activeNav.label}</p>
              </div>
              <div className="hidden items-center gap-2 md:flex">
                <Link
                  href="/onboarding"
                  aria-label="Configuración"
                  className="grid size-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
                >
                  <GearIcon />
                </Link>
                {billingConfigured && (
                  <button
                    type="button"
                    onClick={() => {
                      if (premiumActive) {
                        void abrirPortalBilling();
                        return;
                      }

                      void abrirCheckoutBilling('premium');
                    }}
                    disabled={billingLoading || !billingPriceConfigured.premium}
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

            <section key={vistaActiva} className="dashboard-view-panel rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-bold text-blue-700">{activeNav.label}</p>
                  <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
                    {vistaActiva === 'resumen' ? 'Tu tablero financiero' :
                      vistaActiva === 'movimientos' ? 'Movimientos del mes' :
                      vistaActiva === 'presupuestos' ? 'Presupuestos y bolsas' :
                      vistaActiva === 'metas' ? 'Metas financieras' :
                      vistaActiva === 'analisis' ? 'Análisis de comportamiento' :
                      vistaActiva === 'cuentas' ? 'Cuentas conectadas' :
                      vistaActiva === 'planes' ? 'Plan y facturación' : 'Reportes'}
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    {loading ? 'Actualizando datos...' : `Vista de ${selectedMonthName.toLowerCase()} 2026.`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
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
                  <Link
                    href="/onboarding"
                    aria-label="Configuración"
                    className="grid size-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  >
                    <GearIcon />
                  </Link>
                </div>
              </div>
            </section>

            {(vistaActiva === 'resumen' || vistaActiva === 'movimientos') && iaCard}

            <section id="resumen" className={`${vistaActiva === 'resumen' ? 'dashboard-view-panel grid' : 'hidden'} scroll-mt-28 gap-4 xl:grid-cols-[1.4fr_1fr]`}>
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
                    <p className={`mt-2 text-sm font-semibold ${flujoNetoMes < 0 ? 'text-rose-600' : tendenciaTone(tendencias.flujo)}`}>
                      {flujoNetoMes < 0 ? 'Flujo negativo' : tendencias.flujo} vs. mes anterior
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

            <section className={`${vistaActiva === 'presupuestos' ? 'dashboard-view-panel grid' : 'hidden'} gap-4 xl:grid-cols-[1fr_360px]`}>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">Detalle de bolsas</h2>
                    <p className="text-sm text-slate-500">Presupuesto, consumo y margen disponible por categoría.</p>
                  </div>
                  <span className="text-sm font-bold text-blue-700">${formatearMonto(resumen.presupuesto.Vida + resumen.presupuesto.Placeres + resumen.presupuesto.Futuro)} asignados</span>
                </div>
                <div className="grid gap-3">
                  {budgetBuckets.map((bucket) => {
                    const pct = calcularPorcentaje(bucket.used, bucket.limit);
                    const overBudget = bucket.remaining < 0;
                    return (
                      <div key={bucket.label} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3">
                            <span className={`grid size-11 place-items-center rounded-lg text-sm font-black ${bucket.tint}`}>{bucket.label[0]}</span>
                            <div>
                              <p className="font-bold text-slate-950">{bucket.label}</p>
                              <p className="text-sm text-slate-500">{pct.toFixed(0)}% usado · {overBudget ? 'excedido' : 'disponible'} ${formatearMonto(Math.abs(bucket.remaining))}</p>
                            </div>
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="text-sm font-bold text-slate-950">${formatearMonto(bucket.used)}</p>
                            <p className="text-xs text-slate-500">de ${formatearMonto(bucket.limit)}</p>
                          </div>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                          <div className={`h-full rounded-full ${overBudget ? 'bg-rose-500' : bucket.color}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <h2 className="text-lg font-bold text-slate-950">Lectura rápida</h2>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="font-bold text-slate-900">Bolsa con más presión</p>
                    <p className="mt-1 text-slate-500">
                      {[...budgetBuckets].sort((a, b) => calcularPorcentaje(b.used, b.limit) - calcularPorcentaje(a.used, a.limit))[0]?.label || 'Sin datos'}.
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="font-bold text-slate-900">Ritmo del mes</p>
                    <p className="mt-1 text-slate-500">Vas en {burnRate.toFixed(1)}% de uso contra {avanceMes.toFixed(1)}% de avance calendario.</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="font-bold text-slate-900">Siguiente ajuste</p>
                    <p className="mt-1 text-slate-500">Prioriza reducir la bolsa que esté más cerca del 100% antes de registrar gastos opcionales.</p>
                  </div>
                </div>
              </div>
            </section>

            <section className={`${vistaActiva === 'metas' ? 'dashboard-view-panel grid' : 'hidden'} gap-4 xl:grid-cols-[360px_1fr]`}>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <p className="text-sm font-semibold text-slate-500">Progreso global</p>
                <p className="mt-2 text-4xl font-black tracking-tight text-slate-950">{progresoMetasGlobal.toFixed(0)}%</p>
                <p className="mt-1 text-sm text-slate-500">${formatearMonto(totalMetasActual)} de ${formatearMonto(totalMetasObjetivo)}</p>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-violet-600" style={{ width: `${progresoMetasGlobal}%` }} />
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">Metas guardadas</h2>
                    <p className="text-sm text-slate-500">Fondos acumulados cargados desde Supabase.</p>
                  </div>
                  <Link href="/onboarding" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Editar</Link>
                </div>
                <div className="space-y-3">
                  {metasFinancieras.length === 0 ? (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                        No llegaron metas guardadas desde `fondos_acumulados`. Si ya las capturaste, falta revisar que tengan `profile_id` o que estén en esta tabla.
                      </div>
                      <div className="grid gap-3 lg:grid-cols-3">
                        {goalTemplates.map((template) => (
                          <div key={template.name} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                            <p className="font-bold text-slate-950">{template.name}</p>
                            <p className="mt-2 text-2xl font-black text-slate-950">${formatearMonto(template.target)}</p>
                            <p className="mt-1 text-sm text-slate-500">{template.detail}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : metasFinancieras.map((meta) => (
                    <div key={meta.id} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-bold text-slate-950">{meta.nombre}</p>
                          <p className="text-sm text-slate-500">{meta.fechaObjetivo ? `Actualizada ${formatearFecha(meta.fechaObjetivo)}` : 'Sin fecha objetivo'}</p>
                        </div>
                        <p className="text-sm font-bold text-slate-900">${formatearMonto(meta.actual)} / ${formatearMonto(meta.objetivo)}</p>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                        <div className="h-full rounded-full bg-violet-600" style={{ width: `${meta.progreso}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className={`${['resumen', 'presupuestos', 'metas', 'planes'].includes(vistaActiva) ? 'dashboard-view-panel grid' : 'hidden'} gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-6`}>
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
                    <span className={`font-bold ${tendenciaTone(card.trend)}`}>{card.trend}</span>
                  </div>
                </div>
              ))}
            </section>

            <section id="analisis" className={`${vistaActiva === 'analisis' ? 'dashboard-view-panel grid' : 'hidden'} scroll-mt-28 gap-4 xl:grid-cols-[1.35fr_1fr]`}>
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

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">Análisis IA</h2>
                    <p className="mt-1 text-sm text-slate-500">Lectura accionable del mes o del año completo.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm font-bold">
                    <button
                      type="button"
                      onClick={() => generarAnalisis('month')}
                      disabled={analysisLoading}
                      className={`rounded-md px-3 py-2 ${analysisScope === 'month' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}
                    >
                      Mes
                    </button>
                    <button
                      type="button"
                      onClick={() => generarAnalisis('year')}
                      disabled={analysisLoading}
                      className={`rounded-md px-3 py-2 ${analysisScope === 'year' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}
                    >
                      Año
                    </button>
                  </div>
                </div>
                <div className="mt-5 min-h-80 rounded-lg bg-slate-50 p-4">
                  {analysisLoading ? (
                    <div className="flex h-72 items-center justify-center text-sm font-semibold text-slate-500">Generando análisis...</div>
                  ) : analysis ? (
                    <div className="space-y-5">
                      <div>
                        <p className="text-sm font-bold text-blue-700">{analysisScope === 'year' ? 'Análisis anual' : `Análisis de ${selectedMonthName.toLowerCase()}`}</p>
                        <h3 className="mt-1 text-xl font-black text-slate-950">{analysis.headline}</h3>
                        <p className="mt-3 text-sm leading-6 text-slate-600">{analysis.diagnosis}</p>
                      </div>
                      <div>
                        <p className="mb-2 text-sm font-bold text-slate-950">Acciones sugeridas</p>
                        <div className="space-y-2">
                          {analysis.actions.map((action, index) => (
                            <div key={action} className="flex gap-3 rounded-lg bg-white p-3 text-sm text-slate-700">
                              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-black text-blue-700">{index + 1}</span>
                              <span>{action}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {analysis.risks.length > 0 && (
                        <div>
                          <p className="mb-2 text-sm font-bold text-slate-950">Riesgos</p>
                          <div className="space-y-2">
                            {analysis.risks.map((risk) => (
                              <p key={risk} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{risk}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex h-72 flex-col items-center justify-center text-center">
                      <p className="text-sm font-bold text-slate-950">Listo para analizar</p>
                      <p className="mt-1 max-w-xs text-sm text-slate-500">Entra a esta vista o pulsa Mes/Año para generar una lectura con IA.</p>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => generarAnalisis(analysisScope)}
                  disabled={analysisLoading}
                  className="mt-4 h-10 w-full rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {analysisLoading ? 'Analizando...' : 'Actualizar análisis'}
                </button>
              </div>
            </section>

            <section className={`${vistaActiva === 'cuentas' ? 'dashboard-view-panel grid' : 'hidden'} gap-4 xl:grid-cols-[360px_1fr]`}>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <p className="text-sm font-semibold text-slate-500">Saldo visible</p>
                <p className="mt-2 text-4xl font-black tracking-tight text-slate-950">${formatearMonto(saldoCuentas)}</p>
                <p className="mt-1 text-sm text-slate-500">{cuentasReales.length} cuentas reales · {cuentasActivas} conexiones activas</p>
                <Link href="/onboarding" className="mt-5 inline-flex h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">Conectar cuenta</Link>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <h2 className="text-lg font-bold text-slate-950">Cuentas bancarias</h2>
                <div className="mt-4 space-y-3">
                  {cuentasDemo.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      Detecté {cuentasDemo.length} cuenta demo de Plaid sandbox. No la sumo al saldo porque no representa tu dinero real.
                    </div>
                  )}
                  {cuentasReales.length === 0 ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      No hay cuentas reales sincronizadas. Conecta una institución real o cambia Plaid de sandbox a development/production.
                    </div>
                  ) : cuentasReales.map((account) => (
                    <div key={account.id} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-bold text-slate-950">{account.name || account.official_name || 'Cuenta bancaria'}</p>
                          <p className="text-sm text-slate-500">{account.type || 'Cuenta'} · {account.subtype || 'sin subtipo'}</p>
                        </div>
                        <div className="text-left sm:text-right">
                          <p className="font-bold text-slate-950">${formatearMonto(valorNumerico(account.current_balance))}</p>
                          <p className="text-xs text-slate-500">{account.currency || 'MXN'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <h3 className="text-sm font-bold text-slate-950">Conexiones</h3>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {bankConnections.length === 0 ? (
                      <p className="text-sm text-slate-500">Sin conexiones de open banking registradas.</p>
                    ) : bankConnections.map((connection) => (
                      <div key={connection.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                        <p className="font-bold text-slate-900">{connection.institution_name || connection.provider}</p>
                        <p className="text-slate-500">{connection.status} · {connection.last_sync_at ? formatearFecha(connection.last_sync_at) : 'sin sincronía'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className={`${vistaActiva === 'planes' ? 'dashboard-view-panel block' : 'hidden'}`}>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">Planes del producto</h2>
                    <p className="text-sm text-slate-500">Propuesta inicial de límites y beneficios por plan.</p>
                  </div>
                  <span className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700">Plan actual: {planLabel}</span>
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                  {planOptions.map((option) => {
                    const isCurrent = option.name === planLabel;
                    const isPaidPlan = option.plan === 'beta' || option.plan === 'premium';
                    const paidPlanConfigured = isPlanPriceConfigured(option.plan);
                    return (
                      <div key={option.name} className={`rounded-lg border p-4 ${isCurrent ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200 bg-white'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-lg font-black text-slate-950">{option.name}</p>
                            <p className="mt-1 text-sm text-slate-500">{option.description}</p>
                          </div>
                          {isCurrent && <span className="rounded-full bg-blue-600 px-2 py-1 text-xs font-bold text-white">Actual</span>}
                        </div>
                        <p className="mt-5 text-3xl font-black text-slate-950">{option.price}<span className="text-sm font-semibold text-slate-500">/mes</span></p>
                        <div className="mt-5 space-y-2">
                          {option.features.map((feature) => (
                            <p key={feature} className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">{feature}</p>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (option.plan === billingStatus?.plan && billingStatus?.active) {
                              void abrirPortalBilling();
                              return;
                            }
                            if (option.plan === 'beta' || option.plan === 'premium') {
                              if (!paidPlanConfigured) {
                                setMensajeStatus(`Falta configurar Stripe para ${option.name}.`);
                                return;
                              }

                              void abrirCheckoutBilling(option.plan);
                              return;
                            }
                            setMensajeStatus('Gratis es el plan base sin suscripción activa.');
                          }}
                          disabled={billingLoading || (isPaidPlan && !paidPlanConfigured)}
                          className={`mt-5 h-10 w-full rounded-lg px-4 text-sm font-bold disabled:opacity-60 ${
                            isCurrent ? 'border border-blue-200 bg-white text-blue-700' : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                        >
                          {isCurrent ? 'Gestionar plan' : option.plan === 'free' ? 'Plan base' : 'Elegir plan'}
                        </button>
                        {isPaidPlan && !paidPlanConfigured && (
                          <p className="mt-2 text-xs font-semibold text-amber-700">Falta activar precio en Stripe.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className={`${vistaActiva === 'reportes' ? 'dashboard-view-panel grid' : 'hidden'} gap-4 xl:grid-cols-[1.4fr_360px]`}>
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-slate-950">Reporte de {selectedMonthName.toLowerCase()} 2026</h2>
                      <p className="text-sm text-slate-500">Lectura mensual con movimientos, bolsas y comparación.</p>
                    </div>
                    <Link href="/api/account/export" className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">Exportar datos</Link>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {reporteMensualCards.map((card) => (
                      <div key={card.label} className="rounded-lg bg-slate-50 p-3">
                        <p className="text-sm text-slate-500">{card.label}</p>
                        <p className={`mt-1 text-xl font-black ${card.tone}`}>{card.value}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{card.detail}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {budgetBuckets.map((bucket) => (
                      <div key={bucket.label} className="rounded-lg border border-slate-100 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-slate-900">{bucket.label}</p>
                          <p className="text-xs font-bold text-slate-500">{bucket.limit > 0 ? `${Math.min((bucket.used / bucket.limit) * 100, 999).toFixed(0)}%` : 'Sin limite'}</p>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-slate-100">
                          <div className={`h-2 rounded-full ${bucket.color}`} style={{ width: `${bucket.limit > 0 ? Math.min((bucket.used / bucket.limit) * 100, 100) : bucket.used > 0 ? 100 : 0}%` }} />
                        </div>
                        <p className="mt-2 text-xs text-slate-500">${formatearMonto(bucket.used)} usado · ${formatearMonto(bucket.remaining)} restante</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-slate-950">Movimientos del mes</h2>
                      <p className="text-sm text-slate-500">{ultimosMovimientos.length} movimientos registrados en {selectedMonthName.toLowerCase()}.</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-slate-100">
                    <table className="w-full min-w-[620px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                          <th className="px-4 py-3 font-semibold">Fecha</th>
                          <th className="px-4 py-3 font-semibold">Concepto</th>
                          <th className="px-4 py-3 font-semibold">Bolsa</th>
                          <th className="px-4 py-3 font-semibold">Origen</th>
                          <th className="px-4 py-3 text-right font-semibold">Monto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ultimosMovimientos.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No hay movimientos para este mes.</td>
                          </tr>
                        ) : (
                          ultimosMovimientos.map((movimiento) => (
                            <tr key={movimiento.id}>
                              <td className="px-4 py-3 text-slate-500">{formatearFecha(movimiento.fecha)}</td>
                              <td className="px-4 py-3 font-semibold text-slate-900">{movimiento.concepto}</td>
                              <td className="px-4 py-3 text-slate-600">{nombreBolsa(String(movimiento.categoria))}</td>
                              <td className="px-4 py-3 text-slate-500">{nombreOrigen(movimiento.origen)}</td>
                              <td className={`px-4 py-3 text-right font-bold ${movimiento.tipo === 'ingreso' ? 'text-emerald-700' : 'text-slate-900'}`}>
                                {movimiento.tipo === 'ingreso' ? '+' : '-'}${formatearMonto(movimiento.monto)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">Contexto anual 2026</h2>
                    <p className="text-sm text-slate-500">La fila azul muestra el mes activo.</p>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-100">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                        <th className="px-4 py-3 font-semibold">Mes</th>
                        <th className="px-4 py-3 text-right font-semibold">Ingresos</th>
                        <th className="px-4 py-3 text-right font-semibold">Egresos</th>
                        <th className="px-4 py-3 text-right font-semibold">Flujo</th>
                        <th className="px-4 py-3 text-right font-semibold">Saldo acum.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {resumenMensual.map((mes) => (
                        <tr key={mes.mes} className={mes.mes === selectedMonthName ? 'bg-blue-50/60' : ''}>
                          <td className="px-4 py-3 font-bold text-slate-900">{mes.mes}</td>
                          <td className="px-4 py-3 text-right text-slate-600">${formatearEntero(mes.ingresos)}</td>
                          <td className="px-4 py-3 text-right text-slate-600">${formatearEntero(mes.egresos)}</td>
                          <td className={`px-4 py-3 text-right font-bold ${mes.resultado < 0 ? 'text-rose-600' : 'text-blue-700'}`}>${formatearEntero(mes.resultado)}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900">${formatearEntero(mes.saldoAcumulado)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <h2 className="text-lg font-bold text-slate-950">Resumen del mes</h2>
                  <div className="mt-4 space-y-3">
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-sm text-slate-500">Ingresos</p>
                      <p className="text-xl font-black text-slate-950">${formatearMonto(resumen.ingresosMes)}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-sm text-slate-500">Egresos</p>
                      <p className="text-xl font-black text-slate-950">${formatearMonto(totalGastadoMes)}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-sm text-slate-500">Flujo mensual</p>
                      <p className={`text-xl font-black ${flujoNetoMes < 0 ? 'text-rose-600' : 'text-blue-700'}`}>${formatearMonto(flujoNetoMes)}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <h2 className="text-lg font-bold text-slate-950">Tarjeta del mes</h2>
                  <p className="mt-3 text-3xl font-bold text-slate-950">${formatearMonto(Math.max(deudaTdcEstimadaMes, 0))}</p>
                  <p className="mt-1 text-sm text-slate-500">Cargos ${formatearMonto(cargosSantanderTdcMes)} · Abonos ${formatearMonto(totalAbonosTarjetaMes)}</p>
                  <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                    El cálculo cambia con el mes seleccionado y solo usa movimientos TDC de ese periodo.
                  </div>
                  {abonosSospechososOcultos > 0 && (
                    <button
                      type="button"
                      onClick={limpiarAbonosSospechosos}
                      disabled={cleanupLoading}
                      className="mt-4 h-10 rounded-lg border border-amber-200 bg-amber-50 px-4 text-sm font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                    >
                      {cleanupLoading ? 'Limpiando...' : 'Borrar abonos sospechosos'}
                    </button>
                  )}
                </div>
              </div>
            </section>

            <section id="movimientos" className={`${vistaActiva === 'movimientos' ? 'dashboard-view-panel block' : 'hidden'} scroll-mt-28 rounded-lg border border-slate-200 bg-white shadow-sm`}>
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

            <section className={`${['movimientos', 'cuentas'].includes(vistaActiva) ? 'dashboard-view-panel grid' : 'hidden'} gap-4 xl:grid-cols-2`}>
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
            <button
              key={item.view}
              type="button"
              onClick={() => setVistaActiva(item.view)}
              aria-current={vistaActiva === item.view ? 'page' : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                vistaActiva === item.view ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50 hover:text-blue-700'
              }`}
            >
              <span className={`grid size-7 place-items-center rounded-lg text-[11px] ${
                vistaActiva === item.view ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
              }`}>{item.mark}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
      <style jsx global>{`
        @keyframes dashboard-view-in {
          from {
            opacity: 0;
            transform: translateY(14px) scale(0.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .dashboard-view-panel {
          animation: dashboard-view-in 260ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        @media (prefers-reduced-motion: reduce) {
          .dashboard-view-panel {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
