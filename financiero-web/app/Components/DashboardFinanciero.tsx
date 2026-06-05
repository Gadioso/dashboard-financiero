"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
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
  type Movimiento,
  type ResumenMensual,
  nombreBolsa,
  nombreOrigen,
  resumenInicial,
} from '@/lib/financial-core';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://goralfhisudzilfortuk.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

declare global {
  var dashboardSupabaseClient: SupabaseClient | undefined;
}

type PresupuestoMensualRow = {
  techo_vida?: number | string | null;
  techo_placeres?: number | string | null;
  techo_futuro?: number | string | null;
  fase_ahorro?: string | null;
};

type SantanderStatus = {
  configured?: {
    supabase: boolean;
    emailIngestSecret: boolean;
  };
  supabaseSchema?: {
    acceptsSantanderEmailOrigin: boolean;
    acceptsRegla333333Phase: boolean;
    migrationRequired: boolean;
  };
  error?: string;
};

const mesActualKey = mesKeyDesdeFecha(new Date());

const getSupabase = () => {
  if (!supabaseUrl || !supabaseAnonKey) return null;

  if (!globalThis.dashboardSupabaseClient) {
    globalThis.dashboardSupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        storageKey: 'dashboard-financiero-anon',
      },
    });
  }

  return globalThis.dashboardSupabaseClient;
};

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
  const [santanderStatus, setSantanderStatus] = useState<SantanderStatus | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      if (!supabaseAnonKey) {
        setMensajeStatus('Falta configurar NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local.');
        return;
      }

      const supabase = getSupabase();

      if (!supabase) {
        setMensajeStatus('Falta configurar Supabase para cargar el dashboard.');
        return;
      }

      const inicio2026 = new Date(Date.UTC(2026, 0, 1)).toISOString();
      const fin2026 = new Date(Date.UTC(2027, 0, 1)).toISOString();

      const [{ data: pres }, { data: ingresosAnuales }, { data: gastosAnuales }] = await Promise.all([
        supabase
        .from('presupuestos_mensuales')
        .select('techo_vida, techo_placeres, techo_futuro, fase_ahorro')
          .eq('mes_anio', `${mesActivo}-01`)
          .maybeSingle(),
        supabase
          .from('ingresos')
          .select('id, concepto, monto, tipo, fecha')
          .gte('fecha', inicio2026)
          .lt('fecha', fin2026),
        supabase
          .from('gastos')
          .select('*')
          .gte('fecha', inicio2026)
          .lt('fecha', fin2026),
      ]);

      const ingresosTodoElAño = (ingresosAnuales || []) as Ingreso[];
      const gastosTodoElAño = (gastosAnuales || []) as Gasto[];
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

      const presupuesto = pres as PresupuestoMensualRow | null;
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
    const supabase = getSupabase();

    if (!supabase) return;

    const intervalId = window.setInterval(() => {
      void fetchData();
    }, 5000);

    const channel = supabase
      .channel('dashboard-gastos-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gastos' },
        () => {
          void fetchData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ingresos' },
        () => {
          void fetchData();
        }
      )
      .subscribe();

    return () => {
      window.clearInterval(intervalId);
      void supabase.removeChannel(channel);
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
  const totalGastadoMes = resumen.gastado.Vida + resumen.gastado.Placeres + resumen.gastado.Futuro;
  const mesSinIngresosConGastos = resumen.ingresosMes === 0 && totalGastadoMes > 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-6 md:p-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-800 pb-6 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Dashboard Financiero
          </h1>
          <p className="text-slate-400 mt-1">Estrategia de los Tres Tercios</p>
        </div>
        <div className="mt-4 md:mt-0 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full text-sm font-medium self-start">
          {loading ? 'Actualizando datos...' : 'Regla 33/33/33 activa'}
        </div>
      </div>

      {/* Barra de Alta Rápida con IA */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">
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

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Estado Gmail / Santander</h2>
            <p className="text-sm text-slate-400 mt-1">Ingesta de correos Santander hacia Supabase.</p>
          </div>
          <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-3">
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
          </div>
        </div>
        {santanderStatus?.error && <p className="text-xs text-rose-300 mt-3">{santanderStatus.error}</p>}
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
                        <span className="text-xs text-slate-600">Sin acción</span>
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
  );
}
