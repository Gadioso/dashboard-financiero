import type { SupabaseClient } from '@supabase/supabase-js';
import { calcularIngresosMes, calcularPresupuestoTresTercios } from '@/lib/financial-core';
import { applyProfileFilter, withProfile } from '@/lib/tenant-context';

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

export async function sincronizarPresupuestoMensual(supabase: SupabaseClient, fecha = new Date(), profileId?: string | null) {
  const { mesAnio, inicio, fin } = monthRange(monthKeyFromDate(fecha));
  const ingresosQuery = supabase
    .from('ingresos')
    .select('monto')
    .gte('fecha', inicio)
    .lt('fecha', fin);
  const { data: ingresos, error: ingresosError } = await applyProfileFilter(ingresosQuery, profileId);

  if (ingresosError) {
    throw new Error(`No pude calcular ingresos del mes: ${ingresosError.message}`);
  }

  const ingresosMes = calcularIngresosMes(ingresos || []);
  const presupuesto = calcularPresupuestoTresTercios(ingresosMes);
  const payload = withProfile({
    mes_anio: mesAnio,
    techo_vida: presupuesto.Vida,
    techo_placeres: presupuesto.Placeres,
    techo_futuro: presupuesto.Futuro,
    fase_ahorro: 'Regla 50/25/25 activa',
  }, profileId);
  const conflictTarget = profileId ? 'profile_id,mes_anio' : 'mes_anio';
  let resultado = await supabase
    .from('presupuestos_mensuales')
    .upsert(payload, { onConflict: conflictTarget })
    .select('*')
    .single();

  if (resultado.error && resultado.error.message.includes('fase_ahorro_check')) {
    const fallbackPayload = { ...payload, fase_ahorro: 'Fase 1: Escudo' };

    resultado = await supabase
      .from('presupuestos_mensuales')
      .upsert(fallbackPayload, { onConflict: conflictTarget })
      .select('*')
      .single();
  }

  if (resultado.error) {
    throw new Error(`No pude sincronizar presupuesto mensual: ${resultado.error.message}`);
  }

  return resultado.data;
}
