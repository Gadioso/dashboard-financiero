import type { SupabaseClient } from '@supabase/supabase-js';
import { calcularIngresosMes, calcularPresupuestoTresTercios } from '@/lib/financial-core';

function monthKeyFromDate(fecha: Date) {
  const year = fecha.getUTCFullYear();
  const month = String(fecha.getUTCMonth() + 1).padStart(2, '0');

  return `${year}-${month}`;
}

function monthRange(mesKey: string) {
  const [year, month] = mesKey.split('-').map(Number);

  return {
    mesAnio: `${mesKey}-01`,
    inicio: new Date(Date.UTC(year, month - 1, 1)).toISOString(),
    fin: new Date(Date.UTC(year, month, 1)).toISOString(),
  };
}

export async function sincronizarPresupuestoMensual(supabase: SupabaseClient, fecha = new Date()) {
  const { mesAnio, inicio, fin } = monthRange(monthKeyFromDate(fecha));
  const { data: ingresos, error: ingresosError } = await supabase
    .from('ingresos')
    .select('monto')
    .gte('fecha', inicio)
    .lt('fecha', fin);

  if (ingresosError) {
    throw new Error(`No pude calcular ingresos del mes: ${ingresosError.message}`);
  }

  const ingresosMes = calcularIngresosMes(ingresos || []);
  const presupuesto = calcularPresupuestoTresTercios(ingresosMes);
  const payload = {
    mes_anio: mesAnio,
    techo_vida: presupuesto.Vida,
    techo_placeres: presupuesto.Placeres,
    techo_futuro: presupuesto.Futuro,
    fase_ahorro: 'Regla 33/33/33 activa',
  };
  const { data: existente, error: existenteError } = await supabase
    .from('presupuestos_mensuales')
    .select('id')
    .eq('mes_anio', mesAnio)
    .maybeSingle();

  if (existenteError) {
    throw new Error(`No pude consultar presupuesto mensual: ${existenteError.message}`);
  }

  let resultado = existente
    ? await supabase.from('presupuestos_mensuales').update(payload).eq('id', existente.id).select('*').single()
    : await supabase.from('presupuestos_mensuales').insert([payload]).select('*').single();

  if (resultado.error && resultado.error.message.includes('fase_ahorro_check')) {
    const fallbackPayload = { ...payload, fase_ahorro: 'Fase 1: Escudo' };

    resultado = existente
      ? await supabase.from('presupuestos_mensuales').update(fallbackPayload).eq('id', existente.id).select('*').single()
      : await supabase.from('presupuestos_mensuales').insert([fallbackPayload]).select('*').single();
  }

  if (resultado.error) {
    throw new Error(`No pude sincronizar presupuesto mensual: ${resultado.error.message}`);
  }

  return resultado.data;
}
