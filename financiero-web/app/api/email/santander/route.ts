import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sincronizarPresupuestoMensual } from '@/lib/budget-sync';
import { categoriaParaGastos } from '@/lib/financial-core';
import { parsearCorreoSantander, tieneSenalSantander } from '@/lib/santander-email-parser';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const emailIngestSecret = process.env.EMAIL_INGEST_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET || '';

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;

  return createClient(supabaseUrl, supabaseKey);
}

function rangoDiaUTC(fecha: Date) {
  const inicio = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
  const fin = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate() + 1));

  return { inicio: inicio.toISOString(), fin: fin.toISOString() };
}

async function buscarIngresoDuplicado({
  concepto,
  monto,
  fecha,
  supabase,
}: {
  concepto: string;
  monto: number;
  fecha: Date;
  supabase: SupabaseClient;
}) {
  const { inicio, fin } = rangoDiaUTC(fecha);
  const { data, error } = await supabase
    .from('ingresos')
    .select('id, concepto, monto, tipo, fecha')
    .eq('concepto', concepto)
    .eq('monto', monto)
    .gte('fecha', inicio)
    .lt('fecha', fin)
    .maybeSingle();

  if (error) throw new Error(`No pude buscar ingreso duplicado: ${error.message}`);

  return data;
}

async function buscarGastoDuplicado({
  concepto,
  monto,
  fecha,
  supabase,
}: {
  concepto: string;
  monto: number;
  fecha: Date;
  supabase: SupabaseClient;
}) {
  const { inicio, fin } = rangoDiaUTC(fecha);
  const { data, error } = await supabase
    .from('gastos')
    .select('id, concepto, monto, categoria, subcategoria, origen, fecha')
    .eq('concepto', concepto)
    .eq('monto', monto)
    .gte('fecha', inicio)
    .lt('fecha', fin)
    .maybeSingle();

  if (error) throw new Error(`No pude buscar gasto duplicado: ${error.message}`);

  return data;
}

async function aceptaOrigenSantanderEmail(supabase: SupabaseClient) {
  const payload = {
    concepto: 'Healthcheck Santander Email',
    monto: 0.01,
    categoria: 'Vida',
    subcategoria: 'Santander',
    origen: 'Santander_Email',
    fecha: new Date(Date.UTC(2099, 0, 1)).toISOString(),
  };
  const { data, error } = await supabase.from('gastos').insert([payload]).select('id').single();

  if (data?.id) {
    await supabase.from('gastos').delete().eq('id', data.id);
  }

  return !error;
}

async function aceptaFaseRegla333333(supabase: SupabaseClient) {
  const mesAnio = '2099-01-01';
  const payload = {
    mes_anio: mesAnio,
    techo_vida: 1,
    techo_placeres: 1,
    techo_futuro: 1,
    fase_ahorro: 'Regla 33/33/33 activa',
  };
  const { data: existente } = await supabase.from('presupuestos_mensuales').select('id').eq('mes_anio', mesAnio).maybeSingle();
  const result = existente
    ? await supabase.from('presupuestos_mensuales').update(payload).eq('id', existente.id).select('id').single()
    : await supabase.from('presupuestos_mensuales').insert([payload]).select('id').single();

  if (result.data?.id) {
    await supabase.from('presupuestos_mensuales').delete().eq('id', result.data.id);
  }

  return !result.error;
}

export async function GET() {
  try {
    const supabase = getSupabase();

    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar llave de Supabase.' }, { status: 500 });
    }

    const [origenSantanderEmail, faseRegla333333] = await Promise.all([
      aceptaOrigenSantanderEmail(supabase),
      aceptaFaseRegla333333(supabase),
    ]);

    return NextResponse.json({
      success: true,
      configured: {
        supabase: Boolean(supabaseUrl && supabaseKey),
        emailIngestSecret: Boolean(emailIngestSecret),
      },
      supabaseSchema: {
        acceptsSantanderEmailOrigin: origenSantanderEmail,
        acceptsRegla333333Phase: faseRegla333333,
        migrationRequired: !origenSantanderEmail || !faseRegla333333,
      },
      endpoint: '/api/email/santander',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!emailIngestSecret) {
      return NextResponse.json({ success: false, error: 'Falta configurar EMAIL_INGEST_SECRET.' }, { status: 500 });
    }

    const receivedSecret = request.headers.get('x-email-ingest-secret');

    if (receivedSecret !== emailIngestSecret) {
      return NextResponse.json({ success: false, error: 'Ingesta de correo no autorizada.' }, { status: 401 });
    }

    const supabase = getSupabase();

    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar llave de Supabase.' }, { status: 500 });
    }

    const body = await request.json();
    const raw = [
      body.from,
      body.subject,
      body.raw || body.text || body.snippet || '',
    ].filter(Boolean).join('\n\n');

    if (!tieneSenalSantander(raw)) {
      return NextResponse.json({ success: true, ignored: true, reason: 'Correo sin señal Santander.' });
    }

    const parsed = parsearCorreoSantander(raw);

    if (!parsed) {
      return NextResponse.json({ success: true, ignored: true, reason: 'No parece ser movimiento Santander.' });
    }

    const fecha = parsed.fechaMovimiento ? new Date(parsed.fechaMovimiento) : body.fecha ? new Date(body.fecha) : new Date();

    if (Number.isNaN(fecha.getTime())) {
      return NextResponse.json({ success: false, error: 'Fecha inválida.' }, { status: 400 });
    }

    if (parsed.tipo === 'ingreso') {
      const duplicado = await buscarIngresoDuplicado({
        concepto: parsed.concepto,
        monto: parsed.monto,
        fecha,
        supabase,
      });

      if (duplicado) {
        return NextResponse.json({ success: true, duplicate: true, data: duplicado, parsed });
      }

      const { data, error } = await supabase
        .from('ingresos')
        .insert([
          {
            concepto: parsed.concepto,
            monto: parsed.monto,
            tipo: 'Extra',
            fecha: fecha.toISOString(),
          },
        ])
        .select('id, concepto, monto, tipo, fecha')
        .single();

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      await sincronizarPresupuestoMensual(supabase, fecha);

      return NextResponse.json({ success: true, data, parsed });
    }

    const duplicado = await buscarGastoDuplicado({
      concepto: parsed.concepto,
      monto: parsed.monto,
      fecha,
      supabase,
    });

    if (duplicado) {
      return NextResponse.json({ success: true, duplicate: true, data: duplicado, parsed });
    }

    let result = await supabase
      .from('gastos')
      .insert([
        {
          concepto: parsed.concepto,
          monto: parsed.monto,
          categoria: categoriaParaGastos(parsed.categoria),
          subcategoria: parsed.subcategoria,
          origen: 'Santander_Email',
          fecha: fecha.toISOString(),
        },
      ])
      .select('id, concepto, monto, categoria, subcategoria, origen, fecha')
      .single();

    if (result.error && result.error.message.includes('gastos_origen_check')) {
      result = await supabase
        .from('gastos')
        .insert([
          {
            concepto: parsed.concepto,
            monto: parsed.monto,
            categoria: categoriaParaGastos(parsed.categoria),
            subcategoria: parsed.subcategoria,
            origen: 'Web',
            fecha: fecha.toISOString(),
          },
        ])
        .select('id, concepto, monto, categoria, subcategoria, origen, fecha')
        .single();
    }

    if (result.error) {
      return NextResponse.json({ success: false, error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: result.data, parsed });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
