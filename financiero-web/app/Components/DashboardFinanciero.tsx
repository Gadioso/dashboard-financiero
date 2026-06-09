"use client";

import React, { useCallback, useEffect, useState } from 'react';
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

    async function fetchSantanderStatus() {
      try {
        const response = await fetch('/api/email/santander');
        const data = await response.json();

        if (mounted) setSantanderStatus(data);
      } catch {
        if (mounted) setSantanderStatus({ error: 'No pude consultar estado Santander.' });
      }
    }

    void fetchSantanderStatus();

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

  const mayorMovimientoMensual = Math.max(
    ...resumenMensual.map((mes) => Math.max(mes.ingresos, mes.egresos, Math.abs(mes.resultado))),
    1
  );
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

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#123b4a_0,#07111f_34%,#020617_72%)] text-slate-100 font-sans p-4 md:p-8">
      {/* Header */}
      <div className="mx-auto max-w-[1500px]">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-white/10 pb-6 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Dashboard Financiero
          </h1>
          <p className="text-slate-400 mt-1">Control mensual, automatización Santander y regla 33/33/33.</p>
        </div>
        <div className="mt-4 flex items-center gap-2 md:mt-0">
          <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-300">
            {loading ? 'Actualizando datos...' : 'Regla 33/33/33 activa'}
          </div>
          <button
            type="button"
            onClick={cerrarSesion}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-white/20 hover:bg-white/10"
          >
            Salir
          </button>
        </div>
      </div>

      {/* Barra de Alta Rápida con IA */}
      <div className="bg-slate-950/70 border border-white/10 shadow-2xl shadow-slate-950/40 rounded-2xl p-5 mb-6 backdrop-blur">
        <h2 className="text-lg font-semibold mb-3 text-emerald-400">Registra un movimiento, Diego</h2>
        <form onSubmit={procesarGastoIA} className="flex flex-col md:flex-row gap-3">
          <input
            type="text"
            value={inputIA}
            onChange={(e) => setInputIA(e.target.value)}
            disabled={procesando}
            placeholder='Ej. "Gané 60000 de sueldo", "Me gasté 350 en cine" o "Metí 1000 a CETES"'
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={procesando}
            className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold text-sm px-6 py-3 rounded-xl transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {procesando ? 'Procesando...' : 'Registrar con IA'}
          </button>
        </form>
        {mensajeStatus && (
          <p className="text-xs mt-3 text-slate-400 animate-pulse">{mensajeStatus}</p>
        )}
      </div>

      <div className="bg-slate-950/60 border border-white/10 rounded-2xl p-5 mb-6 backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Estado Gmail / Santander</h2>
            <p className="text-sm text-slate-400 mt-1">Ingesta de correos Santander hacia Supabase.</p>
          </div>
          <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-4">
            <span className={`rounded-lg border px-3 py-2 ${
              santanderStatus?.configured?.emailIngestSecret ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
            }`}>
              Secret {santanderStatus?.configured?.emailIngestSecret ? 'listo' : 'pendiente'}
            </span>
            <span className={`rounded-lg border px-3 py-2 ${
              santanderStatus?.configured?.supabase ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
            }`}>
              Supabase {santanderStatus?.configured?.supabase ? 'conectado' : 'pendiente'}
            </span>
            <span className={`rounded-lg border px-3 py-2 ${
              santanderStatus?.supabaseSchema?.migrationRequired === false ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
            }`}>
              Migración {santanderStatus?.supabaseSchema?.migrationRequired === false ? 'aplicada' : 'pendiente'}
            </span>
            <span className={`rounded-lg border px-3 py-2 ${
              santanderStatus?.supabaseSchema?.acceptsAbonosTarjetaCredito ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
            }`}>
              Abonos TDC {santanderStatus?.supabaseSchema?.acceptsAbonosTarjetaCredito ? 'listos' : 'pendientes'}
            </span>
          </div>
        </div>
        {santanderStatus?.error && <p className="text-xs text-rose-300 mt-3">{santanderStatus.error}</p>}
        {santanderStatus?.ingestLogs?.available ? (
          <div className="mt-4 border-t border-white/10 pt-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-200">Última ingesta Santander</h3>
              <span className="text-xs text-slate-500">Últimos {santanderStatus.ingestLogs.logs.length} eventos</span>
            </div>
            {santanderStatus.ingestLogs.error && (
              <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                {santanderStatus.ingestLogs.error}
              </p>
            )}
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {santanderStatus.ingestLogs.logs.slice(0, 6).map((log) => {
                const ingestLatency = formatearDuracionMs(log.ingest_latency_ms);
                const telegramLatency = formatearDuracionMs(log.telegram_latency_ms);

                return (
                  <div key={log.id} className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-slate-400">{formatearFecha(log.created_at)}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        log.status === 'inserted'
                          ? 'bg-emerald-400/10 text-emerald-300'
                          : log.status === 'duplicate'
                            ? 'bg-cyan-400/10 text-cyan-300'
                            : log.status === 'error'
                              ? 'bg-rose-400/10 text-rose-300'
                              : 'bg-amber-400/10 text-amber-300'
                      }`}>
                        {log.status}
                      </span>
                    </div>
                    <p className="mt-2 truncate text-sm font-medium text-slate-100">{log.concepto || log.reason || 'Sin concepto'}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {log.monto ? `$${formatearMonto(log.monto)} · ` : ''}
                      {log.categoria ? `${nombreBolsa(log.categoria)}${log.subcategoria ? ` / ${log.subcategoria}` : ''}` : log.reason || 'Sin categoría'}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                      <span className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-slate-400">
                        Ingesta {ingestLatency || 'pendiente'}
                      </span>
                      <span className={`rounded-lg border px-2 py-1 ${
                        log.telegram_notified ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-white/10 bg-white/[0.03] text-slate-500'
                      }`}>
                        Telegram {telegramLatency || (log.telegram_notified ? 'ok' : 'sin aviso')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Log de ingesta pendiente. Ejecuta la migración `20260607_create_santander_ingest_logs.sql` para ver auditoría de correos procesados.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 mb-6 md:grid-cols-2 xl:grid-cols-6">
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-200/80">Ingresos</p>
          <p className="mt-2 text-2xl font-bold">${formatearMonto(resumen.ingresosMes)}</p>
          <p className="mt-1 text-xs text-emerald-100/60">{ingresosMensuales.length} registros del mes</p>
        </div>
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-rose-200/80">Egresos</p>
          <p className="mt-2 text-2xl font-bold">${formatearMonto(totalGastadoMes)}</p>
          <p className="mt-1 text-xs text-rose-100/60">{gastosMensuales.length} gastos del mes</p>
        </div>
        <div className={`rounded-2xl border p-4 ${flujoNetoMes < 0 ? 'border-rose-400/20 bg-rose-400/10' : 'border-cyan-400/20 bg-cyan-400/10'}`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">Flujo neto</p>
          <p className={`mt-2 text-2xl font-bold ${flujoNetoMes < 0 ? 'text-rose-200' : 'text-cyan-200'}`}>${formatearMonto(flujoNetoMes)}</p>
          <p className="mt-1 text-xs text-slate-400">Ingresos menos egresos</p>
        </div>
        <div className="rounded-2xl border border-indigo-400/20 bg-indigo-400/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-200/80">Futuro invertido</p>
          <p className="mt-2 text-2xl font-bold">{tasaFuturo.toFixed(1)}%</p>
          <p className="mt-1 text-xs text-indigo-100/60">${formatearMonto(resumen.gastado.Futuro)} este mes</p>
        </div>
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-200/80">Burn rate</p>
          <p className="mt-2 text-2xl font-bold">{burnRate.toFixed(1)}%</p>
          <p className="mt-1 text-xs text-amber-100/60">Mes avanzado {avanceMes.toFixed(1)}%</p>
        </div>
        <div className="rounded-2xl border border-violet-400/20 bg-violet-400/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-200/80">TDC Santander</p>
          <p className={`mt-2 text-2xl font-bold ${deudaTdcEstimadaMes > 0 ? 'text-violet-100' : 'text-emerald-200'}`}>
            ${formatearMonto(Math.max(deudaTdcEstimadaMes, 0))}
          </p>
          <p className="mt-1 text-xs text-violet-100/60">
            Cargos ${formatearMonto(cargosSantanderTdcMes)} · Abonos ${formatearMonto(totalAbonosTarjetaMes)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">Ingresos Totales del Mes</p>
              <h2 className="text-3xl font-bold mt-2">${formatearMonto(resumen.ingresosMes)} MXN</h2>
            </div>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-400">
              Mes activo
              <select
                value={mesActivo}
                onChange={(event) => setMesActivo(event.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-emerald-500"
              >
                {meses2026.map((mes) => (
                  <option key={mes.etiqueta} value={`2026-${String(mes.indice + 1).padStart(2, '0')}`}>
                    {mes.etiqueta} 2026
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-slate-500 mt-2">Las bolsas se recalculan automáticamente con la regla 33/33/33.</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">Tercio por Bolsa</p>
          <h2 className="text-2xl font-bold mt-2">${formatearMonto(resumen.presupuesto.Vida)}</h2>
          <p className="text-xs text-slate-500 mt-2">Vida, Placeres y Futuro reciben el mismo monto.</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">Distribución</p>
          <h2 className="text-2xl font-bold mt-2">33 / 33 / 33</h2>
          <p className="text-xs text-slate-500 mt-2">Crece junto con tus ingresos reales.</p>
        </div>
      </div>

      {mesSinIngresosConGastos && (
        <div className="mb-8 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-amber-100">
          <p className="font-semibold">Este mes tiene gastos registrados, pero todavía no tiene ingresos cargados.</p>
          <p className="mt-1 text-amber-100/80">
            Por eso el presupuesto real de las bolsas aparece en $0. Como referencia, tu presupuesto sugerido por promedio de 3 meses es de ${formatearMonto(presupuestoPromedio.Vida)} por bolsa.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">Promedio Ingresos 3 Meses</p>
          <h2 className="text-2xl font-bold mt-2">${formatearMonto(resumen.promedioIngresosUltimos3Meses)} MXN</h2>
          <p className="text-xs text-slate-500 mt-2">Promedio móvil del mes activo y los 2 meses anteriores.</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">Vida a Contemplar</p>
          <h2 className="text-2xl font-bold mt-2">${formatearMonto(presupuestoPromedio.Vida)} MXN</h2>
          <p className="text-xs text-slate-500 mt-2">Referencia conservadora para costos necesarios según tus últimos ingresos.</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">Futuro a Invertir</p>
          <h2 className="text-2xl font-bold mt-2">${formatearMonto(presupuestoPromedio.Futuro)} MXN</h2>
          <p className="text-xs text-slate-500 mt-2">Meta mensual sugerida para inversión/ahorro con promedio de 3 meses.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 mb-8 xl:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 shadow-xl shadow-slate-950/30">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-emerald-200">Ingresos del mes</h2>
              <p className="text-sm text-slate-400">Todo lo que entra durante el mes activo.</p>
            </div>
            <span className="rounded-lg bg-emerald-400/10 px-3 py-1 text-sm font-semibold text-emerald-200">
              ${formatearMonto(resumen.ingresosMes)}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-500">
                  <th className="pb-3 font-semibold">Fecha</th>
                  <th className="pb-3 font-semibold">Concepto</th>
                  <th className="pb-3 font-semibold">Tipo</th>
                  <th className="pb-3 text-right font-semibold">Monto</th>
                  <th className="pb-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {ingresosMensuales.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-5 text-center text-slate-500">No hay ingresos registrados en este mes.</td>
                  </tr>
                ) : (
                  ingresosMensuales.map((ingreso) => (
                    <tr key={ingreso.id} className="transition-colors hover:bg-emerald-400/5">
                      <td className="py-3 text-slate-400 whitespace-nowrap">{formatearFecha(ingreso.fecha)}</td>
                      <td className="py-3 font-medium text-slate-100">{ingreso.concepto || 'Ingreso'}</td>
                      <td className="py-3 text-slate-400">{ingreso.tipo || 'Ingreso'}</td>
                      <td className="py-3 text-right font-semibold text-emerald-300">+${formatearMonto(ingreso.monto)}</td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => eliminarIngreso(ingreso)}
                          disabled={deletingId === `ingreso-${ingreso.id}`}
                          className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingId === `ingreso-${ingreso.id}` ? 'Eliminando...' : 'Eliminar'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 shadow-xl shadow-slate-950/30">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-rose-100">Egresos del mes</h2>
              <p className="text-sm text-slate-400">Gastos separados por bolsa, origen y subcategoría.</p>
            </div>
            <span className="rounded-lg bg-rose-400/10 px-3 py-1 text-sm font-semibold text-rose-200">
              ${formatearMonto(totalGastadoMes)}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-500">
                  <th className="pb-3 font-semibold">Fecha</th>
                  <th className="pb-3 font-semibold">Concepto</th>
                  <th className="pb-3 font-semibold">Bolsa</th>
                  <th className="pb-3 font-semibold">Origen</th>
                  <th className="pb-3 text-right font-semibold">Monto</th>
                  <th className="pb-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {gastosMensuales.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-5 text-center text-slate-500">No hay egresos registrados en este mes.</td>
                  </tr>
                ) : (
                  gastosMensuales.map((gasto) => (
                    <tr key={gasto.id} className="transition-colors hover:bg-rose-400/5">
                      <td className="py-3 text-slate-400 whitespace-nowrap">{formatearFecha(gasto.fecha)}</td>
                      <td className="py-3">
                        <p className="font-medium text-slate-100">{gasto.concepto}</p>
                        <p className="text-xs text-slate-500">{gasto.subcategoria || 'Sin subcategoría'}</p>
                      </td>
                      <td className="py-3">
                        <span className={`rounded-md px-2 py-1 text-xs font-semibold ${
                          nombreBolsa(String(gasto.categoria)) === 'Placeres' ? 'bg-emerald-400/10 text-emerald-300' :
                          nombreBolsa(String(gasto.categoria)) === 'Vida' ? 'bg-cyan-400/10 text-cyan-300' : 'bg-indigo-400/10 text-indigo-300'
                        }`}>
                          {nombreBolsa(String(gasto.categoria))}
                        </span>
                      </td>
                      <td className="py-3 text-slate-400">{nombreOrigen(gasto.origen, gasto.subcategoria)}</td>
                      <td className="py-3 text-right font-semibold text-rose-100">-${formatearMonto(gasto.monto)}</td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => eliminarGasto(gasto)}
                          disabled={deletingId === gasto.id}
                          className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingId === gasto.id ? 'Eliminando...' : 'Eliminar'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="mb-8 rounded-2xl border border-violet-400/20 bg-slate-950/70 p-5 shadow-xl shadow-slate-950/30">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-violet-100">Abonos a tarjeta de crédito</h2>
            <p className="text-sm text-slate-400">Pagos para reducir deuda TDC. No cuentan como gasto nuevo ni consumen bolsas.</p>
          </div>
          <span className="rounded-lg bg-violet-400/10 px-3 py-1 text-sm font-semibold text-violet-200">
            ${formatearMonto(totalAbonosTarjetaMes)}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-500">
                <th className="pb-3 font-semibold">Fecha</th>
                <th className="pb-3 font-semibold">Concepto</th>
                <th className="pb-3 font-semibold">Tarjeta</th>
                <th className="pb-3 font-semibold">Origen</th>
                <th className="pb-3 text-right font-semibold">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {abonosTarjetaMensuales.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-5 text-center text-slate-500">
                    No hay abonos de tarjeta registrados en este mes.
                  </td>
                </tr>
              ) : (
                abonosTarjetaMensuales.map((abono) => (
                  <tr key={abono.id} className="transition-colors hover:bg-violet-400/5">
                    <td className="py-3 text-slate-400 whitespace-nowrap">{formatearFecha(abono.fecha)}</td>
                    <td className="py-3 font-medium text-slate-100">{abono.concepto}</td>
                    <td className="py-3 text-slate-400">{abono.tarjeta || 'Tarjeta de crédito Santander'}</td>
                    <td className="py-3 text-slate-400">{nombreOrigen(abono.origen)}</td>
                    <td className="py-3 text-right font-semibold text-violet-200">-${formatearMonto(abono.monto)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">
        <div className="flex flex-col gap-1 mb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-bold">Resultado Mensual 2026</h2>
            <p className="text-sm text-slate-400">Vista anual basada en ingresos y egresos cargados en Supabase.</p>
          </div>
          <span className="text-xs text-slate-500">Inspirado en tu plantilla de finanzas 2026</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[960px] w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-slate-900 pb-3 pr-4 text-left text-slate-400 font-semibold">Concepto</th>
                {resumenMensual.map((mes) => (
                  <th key={mes.mes} className="pb-3 px-3 text-right text-violet-300 font-bold">{mes.mes}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              <tr>
                <td className="sticky left-0 z-10 bg-slate-900 py-3 pr-4 font-semibold text-emerald-400">Ingresos</td>
                {resumenMensual.map((mes) => (
                  <td key={mes.mes} className="py-3 px-3 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <span>${formatearMonto(mes.ingresos)}</span>
                      <span className="h-1.5 rounded-full bg-emerald-500/70" style={{ width: `${Math.max((mes.ingresos / mayorMovimientoMensual) * 80, mes.ingresos ? 8 : 0)}px` }} />
                    </div>
                  </td>
                ))}
              </tr>
              <tr>
                <td className="sticky left-0 z-10 bg-slate-900 py-3 pr-4 font-semibold text-cyan-400">Egresos</td>
                {resumenMensual.map((mes) => (
                  <td key={mes.mes} className="py-3 px-3 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <span>${formatearMonto(mes.egresos)}</span>
                      <span className="h-1.5 rounded-full bg-cyan-500/70" style={{ width: `${Math.max((mes.egresos / mayorMovimientoMensual) * 80, mes.egresos ? 8 : 0)}px` }} />
                    </div>
                  </td>
                ))}
              </tr>
              <tr>
                <td className="sticky left-0 z-10 bg-slate-900 py-3 pr-4 font-semibold italic text-slate-300">Resultado por mes</td>
                {resumenMensual.map((mes) => (
                  <td key={mes.mes} className={`py-3 px-3 text-right font-medium ${mes.resultado < 0 ? 'text-rose-300' : 'text-slate-100'}`}>
                    ${formatearMonto(mes.resultado)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="sticky left-0 z-10 bg-slate-900 py-3 pr-4 font-semibold italic text-slate-300">Saldo acumulado</td>
                {resumenMensual.map((mes) => (
                  <td key={mes.mes} className={`py-3 px-3 text-right font-semibold ${mes.saldoAcumulado < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                    ${formatearMonto(mes.saldoAcumulado)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Grid de Botes Dinámicos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {/* Bolsa Vida */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">Bolsa Vida</p>
              <h3 className="text-2xl font-bold mt-1">${formatearEntero(resumen.gastado.Vida)} MXN</h3>
            </div>
            <span className="text-xs text-slate-500">Límite: ${formatearEntero(resumen.presupuesto.Vida)}</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
            <div className="bg-cyan-500 h-full transition-all duration-500" style={{ width: `${calcularPorcentaje(resumen.gastado.Vida, resumen.presupuesto.Vida)}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>{calcularPorcentaje(resumen.gastado.Vida, resumen.presupuesto.Vida).toFixed(1)}% consumido</span>
            <span>Te quedan ${formatearEntero(Math.max(restantes.Vida, 0))}</span>
          </div>
        </div>

        {/* Bolsa Placeres */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">Bolsa Placeres</p>
              <h3 className="text-2xl font-bold mt-1">${formatearEntero(resumen.gastado.Placeres)} MXN</h3>
            </div>
            <span className="text-xs text-slate-500">Límite: ${formatearEntero(resumen.presupuesto.Placeres)}</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
            <div className={`h-full transition-all duration-500 ${calcularPorcentaje(resumen.gastado.Placeres, resumen.presupuesto.Placeres) >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${calcularPorcentaje(resumen.gastado.Placeres, resumen.presupuesto.Placeres)}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>{calcularPorcentaje(resumen.gastado.Placeres, resumen.presupuesto.Placeres).toFixed(1)}% consumido</span>
            <span>Te quedan ${formatearEntero(Math.max(restantes.Placeres, 0))}</span>
          </div>
        </div>

        {/* Bolsa Futuro */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">Bolsa Futuro</p>
              <h3 className="text-2xl font-bold mt-1">${formatearEntero(resumen.gastado.Futuro)} MXN</h3>
            </div>
            <span className="text-xs text-slate-500">Meta: ${formatearEntero(resumen.presupuesto.Futuro)}</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
            <div className="bg-indigo-500 h-full transition-all duration-500" style={{ width: `${calcularPorcentaje(resumen.gastado.Futuro, resumen.presupuesto.Futuro)}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>{calcularPorcentaje(resumen.gastado.Futuro, resumen.presupuesto.Futuro).toFixed(1)}% invertido</span>
            <span>Pendiente ${formatearEntero(Math.max(restantes.Futuro, 0))}</span>
          </div>
        </div>
      </div>

      {/* Historial de Transacciones */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-bold">Últimos Movimientos Registrados</h2>
            <p className="text-sm text-slate-400">Ingresos y gastos del mes activo, con fecha y origen desde Supabase.</p>
          </div>
          <span className="text-xs text-slate-500">{ultimosMovimientos.length} movimientos</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-sm">
                <th className="pb-3 font-semibold">Concepto</th>
                <th className="pb-3 font-semibold">Fecha</th>
                <th className="pb-3 font-semibold">Tipo</th>
                <th className="pb-3 font-semibold">Categoría</th>
                <th className="pb-3 font-semibold">Subcategoría</th>
                <th className="pb-3 font-semibold">Monto</th>
                <th className="pb-3 font-semibold">Origen</th>
                <th className="pb-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 text-sm">
              {ultimosMovimientos.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-4 text-center text-slate-500">No hay movimientos registrados este mes.</td>
                </tr>
              ) : (
                ultimosMovimientos.map((movimiento) => (
                  <tr key={movimiento.id} className="hover:bg-slate-800/20 transition-colors">
                    <td className="py-3.5 font-medium text-slate-200">{movimiento.concepto}</td>
                    <td className="py-3.5 text-slate-400 whitespace-nowrap">{formatearFecha(movimiento.fecha)}</td>
                    <td className="py-3.5">
                      <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                        movimiento.tipo === 'ingreso' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-700/60 text-slate-300'
                      }`}>
                        {movimiento.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'}
                      </span>
                    </td>
                    <td className="py-3.5">
                      <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                        nombreBolsa(movimiento.categoria) === 'Ingreso' ? 'bg-emerald-500/10 text-emerald-300' :
                        nombreBolsa(movimiento.categoria) === 'Placeres' ? 'bg-emerald-500/10 text-emerald-400' :
                        nombreBolsa(movimiento.categoria) === 'Vida' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-indigo-500/10 text-indigo-400'
                      }`}>
                        {nombreBolsa(movimiento.categoria)}
                      </span>
                    </td>
                    <td className="py-3.5 text-slate-400">{movimiento.subcategoria || 'Sin subcategoría'}</td>
                    <td className={`py-3.5 font-semibold ${movimiento.tipo === 'ingreso' ? 'text-emerald-300' : 'text-slate-100'}`}>
                      {movimiento.tipo === 'ingreso' ? '+' : '-'}${formatearMonto(movimiento.monto)}
                    </td>
                    <td className="py-3.5 text-slate-400">{nombreOrigen(movimiento.origen, movimiento.subcategoria)}</td>
                    <td className="py-3.5 text-right">
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
                          className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/10 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingId === movimiento.id.replace('gasto-', '') ? 'Eliminando...' : 'Eliminar'}
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
                          className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/10 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingId === movimiento.id ? 'Eliminando...' : 'Eliminar'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  );
}
