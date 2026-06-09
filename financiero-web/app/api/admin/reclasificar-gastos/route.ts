import { NextResponse } from 'next/server';
import { categoriaParaGastos } from '@/lib/financial-core';
import { clasificarConceptoGastoSantander } from '@/lib/santander-email-parser';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { applyProfileFilter, getPrivateTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

type GastoRow = {
  id: string | number;
  concepto: string;
  monto: number | string;
  categoria: string;
  subcategoria?: string | null;
  origen?: string | null;
  fecha: string;
};

function esGastoReclasificable(gasto: GastoRow) {
  const concepto = String(gasto.concepto || '').toLowerCase();

  return (
    gasto.origen === 'Santander_Email' ||
    gasto.subcategoria === 'Santander' ||
    /\b(oxxo|7\s*eleven|seven\s+eleven|mercado\s*pago|mercadopago|paypal|starbucks|restaurante|taquer|tacos|viaje|hotel|uber|didi|seguro|segmonterrey\w*|gnp|axa|qualitas|qu[aá]litas|mapfre|metlife|nyl)\b/i.test(concepto)
  );
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseServiceClient();

    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar llave de Supabase.' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const apply = searchParams.get('apply') === 'true';
    const year = Number(searchParams.get('year') || 2026);
    const start = new Date(Date.UTC(year, 0, 1)).toISOString();
    const end = new Date(Date.UTC(year + 1, 0, 1)).toISOString();
    const tenant = getPrivateTenantContext();
    const gastosQuery = supabase
      .from('gastos')
      .select('id, concepto, monto, categoria, subcategoria, origen, fecha')
      .gte('fecha', start)
      .lt('fecha', end)
      .order('fecha', { ascending: false });
    const { data, error } = await applyProfileFilter(gastosQuery, tenant.profileId);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const candidatos = ((data || []) as GastoRow[])
      .filter(esGastoReclasificable)
      .map((gasto) => {
        const nueva = clasificarConceptoGastoSantander(gasto.concepto);
        const categoriaGasto = categoriaParaGastos(nueva.categoria);

        return {
          id: gasto.id,
          fecha: gasto.fecha,
          concepto: gasto.concepto,
          monto: gasto.monto,
          actual: {
            categoria: gasto.categoria,
            subcategoria: gasto.subcategoria || null,
          },
          nueva: {
            categoria: categoriaGasto,
            subcategoria: nueva.subcategoria,
            razon: nueva.razon,
          },
        };
      })
      .filter((item) => item.actual.categoria !== item.nueva.categoria || item.actual.subcategoria !== item.nueva.subcategoria);

    let updated = 0;
    const errors: Array<{ id: string | number; error: string }> = [];

    if (apply) {
      for (const item of candidatos) {
        const updateQuery = supabase
          .from('gastos')
          .update({
            categoria: item.nueva.categoria,
            subcategoria: item.nueva.subcategoria,
          })
          .eq('id', item.id);
        const { error: updateError } = await applyProfileFilter(updateQuery, tenant.profileId);

        if (updateError) {
          errors.push({ id: item.id, error: updateError.message });
        } else {
          updated += 1;
        }
      }
    }

    return NextResponse.json({
      success: true,
      apply,
      year,
      scanned: data?.length || 0,
      candidates: candidatos.length,
      updated,
      errors,
      profileScoped: Boolean(tenant.profileId),
      sample: candidatos.slice(0, 25),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
