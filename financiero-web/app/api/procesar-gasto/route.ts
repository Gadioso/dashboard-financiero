import { NextResponse } from 'next/server';
import { clasificarMovimientoFinanciero } from '@/lib/ai-classifier';
import { categoriaParaGastos } from '@/lib/financial-core';
import { sincronizarPresupuestoMensual } from '@/lib/budget-sync';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getPrivateTenantContext, withProfile } from '@/lib/tenant-context';

// 2. Inicializar el motor de Google Gemini
// Recuerda que debes tener tu variable GEMINI_API_KEY en tu archivo .env.local
const googleApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
export async function POST(request: Request) {
  try {
    const supabase = getSupabaseServiceClient();

    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500 });
    }

    const { texto } = await request.json();
    const tenant = getPrivateTenantContext();

    if (!texto) {
      return NextResponse.json({ success: false, error: 'No proporcionaste ningún texto.' }, { status: 400 });
    }

    const dataAI = await clasificarMovimientoFinanciero(texto, googleApiKey);

    // 4. Inserción directa en la base de datos de Supabase según el tipo mapeado
    let queryResult;

    if (dataAI.tipo === 'gasto') {
      // Ajustamos el nombre de la categoría para que haga match con tu base de datos
      const categoriaFinal = categoriaParaGastos(dataAI.categoria);

      queryResult = await supabase
        .from('gastos')
        .insert([withProfile({
          concepto: dataAI.concepto,
          monto: Number(dataAI.monto),
          categoria: categoriaFinal,
          subcategoria: dataAI.subcategoria,
          origen: 'Web',
          fecha: new Date().toISOString()
        }, tenant.profileId)])
        .select();
    } else {
      const fechaIngreso = new Date();
      queryResult = await supabase
        .from('ingresos')
        .insert([withProfile({
          concepto: dataAI.concepto,
          monto: Number(dataAI.monto),
          tipo: 'Extra',
          fecha: fechaIngreso.toISOString()
        }, tenant.profileId)])
        .select();

      if (!queryResult.error) {
        await sincronizarPresupuestoMensual(supabase, fechaIngreso, tenant.profileId);
      }
    }

    if (queryResult.error) {
      return NextResponse.json({ success: false, error: queryResult.error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: dataAI });

  } catch (error: unknown) {
    console.error('Error en la API de procesamiento:', error);
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
