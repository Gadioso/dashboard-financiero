import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sincronizarPresupuestoMensual } from '@/lib/budget-sync';
import { buscarPreferenciaClasificacion } from '@/lib/classification-preferences';
import { categoriaParaGastos, formatearFecha, formatearMonto, nombreBolsa } from '@/lib/financial-core';
import { obtenerSantanderIngestLogsPorPerfil, registrarSantanderIngestLog } from '@/lib/santander-ingest-log';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { parsearCorreoSantander, tieneSenalSantander } from '@/lib/santander-email-parser';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { applyProfileFilter, getEmailIngestTenantContext, getRequestTenantContext, withProfile } from '@/lib/tenant-context';

const emailIngestSecret = process.env.EMAIL_INGEST_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET || '';
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || '';
const telegramNotifyChatId = process.env.TELEGRAM_NOTIFY_CHAT_ID || '';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

function rangoDiaUTC(fecha: Date) {
  const inicio = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
  const fin = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate() + 1));

  return { inicio: inicio.toISOString(), fin: fin.toISOString() };
}

function idCorto(id: string | number) {
  return String(id).slice(0, 8);
}

function detectarMedioPagoSantander(raw: string) {
  if (/\b(tdc|tarjeta\s+de\s+tdc|tarjeta\s+de\s+cr[eé]dito)\b/i.test(raw)) {
    return 'Tarjeta de crédito Santander';
  }

  return null;
}

function getStringField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function guardarUltimoGastoNotificado({
  supabase,
  chatId,
  gastoId,
  message,
  profileId,
}: {
  supabase: SupabaseClient;
  chatId: string;
  gastoId: string | number;
  message: string;
  profileId?: string | null;
}) {
  const memoryQuery = supabase
    .from('telegram_memoria')
    .select('messages')
    .eq('chat_id', chatId);
  const { data } = await applyProfileFilter(memoryQuery, profileId).maybeSingle();

  const row = data as { messages?: unknown } | null;
  const memoria = Array.isArray(row?.messages) ? row.messages : [];
  const now = new Date().toISOString();
  const messages = [
    ...memoria,
    {
      role: 'assistant',
      content: message,
      createdAt: now,
      metadata: {
        lastExpenseId: String(gastoId),
      },
    },
  ].slice(-16);

  await supabase
    .from('telegram_memoria')
    .upsert(
      {
        chat_id: chatId,
        ...(profileId ? { profile_id: profileId } : {}),
        messages,
        updated_at: now,
      },
      { onConflict: 'chat_id' }
    );
}

async function obtenerChatNotificacion(supabase: SupabaseClient, profileId?: string | null) {
  if (profileId) {
    const { data } = await supabase
      .from('telegram_accounts')
      .select('chat_id')
      .eq('profile_id', profileId)
      .order('last_seen_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const chatId = (data as { chat_id?: string } | null)?.chat_id;

    if (chatId) return chatId;
  }

  if (telegramNotifyChatId) return telegramNotifyChatId;

  const memoryQuery = supabase
    .from('telegram_memoria')
    .select('chat_id')
    .order('updated_at', { ascending: false })
    .limit(1);
  const { data, error } = await applyProfileFilter(memoryQuery, profileId).maybeSingle();

  if (error) return null;

  return (data as { chat_id?: string } | null)?.chat_id || null;
}

async function notificarGastoSantander({
  supabase,
  gasto,
  medioPago,
  profileId,
}: {
  supabase: SupabaseClient;
  gasto: {
    id: string | number;
    concepto: string;
    monto: number | string;
    categoria: string;
    subcategoria?: string | null;
    fecha: string;
  };
  medioPago?: string | null;
  profileId?: string | null;
}) {
  if (!telegramBotToken) return false;

  const chatId = await obtenerChatNotificacion(supabase, profileId);

  if (!chatId) return false;

  const id = idCorto(gasto.id);
  const categoria = `${nombreBolsa(gasto.categoria)}${gasto.subcategoria ? ` / ${gasto.subcategoria}` : ''}`;
  const message = [
    'Santander registrado.',
    `${formatearFecha(gasto.fecha)} · $${formatearMonto(gasto.monto)} · ${gasto.concepto}`,
    medioPago ? `Medio: ${medioPago}.` : null,
    `Lo clasifiqué como: ${categoria}.`,
    `ID: ${id}`,
    'Si está mal, responde:',
    '"cámbialo a vida"',
    '"cámbialo a placer"',
    '"cámbialo a futuro"',
  ].filter(Boolean).join('\n');

  const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram no pudo enviar la alerta Santander: ${response.status} ${errorText}`);
  }

  await guardarUltimoGastoNotificado({
    supabase,
    chatId,
    gastoId: gasto.id,
    message,
    profileId,
  });

  return true;
}

async function notificarAbonoTarjetaSantander({
  supabase,
  abono,
  profileId,
}: {
  supabase: SupabaseClient;
  abono: {
    id: string | number;
    concepto: string;
    monto: number | string;
    tarjeta?: string | null;
    fecha: string;
  };
  profileId?: string | null;
}) {
  if (!telegramBotToken) return false;

  const chatId = await obtenerChatNotificacion(supabase, profileId);

  if (!chatId) return false;

  const message = [
    'Abono Santander registrado.',
    `${formatearFecha(abono.fecha)} · $${formatearMonto(abono.monto)} · ${abono.concepto}`,
    abono.tarjeta ? `Tarjeta: ${abono.tarjeta}.` : 'Tarjeta: TDC Santander.',
    'Esto reduce tu deuda de tarjeta; no cuenta como gasto nuevo ni consume bolsa de Vida.',
    `ID: ${idCorto(abono.id)}`,
  ].join('\n');

  const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram no pudo enviar la alerta de abono Santander: ${response.status} ${errorText}`);
  }

  return true;
}

async function buscarIngresoDuplicado({
  concepto,
  monto,
  fecha,
  supabase,
  profileId,
}: {
  concepto: string;
  monto: number;
  fecha: Date;
  supabase: SupabaseClient;
  profileId?: string | null;
}) {
  const { inicio, fin } = rangoDiaUTC(fecha);
  const query = supabase
    .from('ingresos')
    .select('id, concepto, monto, tipo, fecha')
    .eq('concepto', concepto)
    .eq('monto', monto)
    .gte('fecha', inicio)
    .lt('fecha', fin);
  const { data, error } = await applyProfileFilter(query, profileId).maybeSingle();

  if (error) throw new Error(`No pude buscar ingreso duplicado: ${error.message}`);

  return data;
}

async function buscarGastoDuplicado({
  concepto,
  monto,
  fecha,
  supabase,
  profileId,
}: {
  concepto: string;
  monto: number;
  fecha: Date;
  supabase: SupabaseClient;
  profileId?: string | null;
}) {
  const { inicio, fin } = rangoDiaUTC(fecha);
  const query = supabase
    .from('gastos')
    .select('id, concepto, monto, categoria, subcategoria, origen, fecha')
    .eq('concepto', concepto)
    .eq('monto', monto)
    .gte('fecha', inicio)
    .lt('fecha', fin);
  const { data, error } = await applyProfileFilter(query, profileId).maybeSingle();

  if (error) throw new Error(`No pude buscar gasto duplicado: ${error.message}`);

  return data;
}

async function buscarAbonoTarjetaDuplicado({
  concepto,
  monto,
  fecha,
  supabase,
  profileId,
}: {
  concepto: string;
  monto: number;
  fecha: Date;
  supabase: SupabaseClient;
  profileId?: string | null;
}) {
  const { inicio, fin } = rangoDiaUTC(fecha);
  const query = supabase
    .from('abonos_tarjeta_credito')
    .select('id, concepto, monto, tarjeta, origen, fecha')
    .eq('concepto', concepto)
    .eq('monto', monto)
    .gte('fecha', inicio)
    .lt('fecha', fin);
  const { data, error } = await applyProfileFilter(query, profileId).maybeSingle();

  if (error) throw new Error(`No pude buscar abono de tarjeta duplicado: ${error.message}`);

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

async function aceptaAbonosTarjetaCredito(supabase: SupabaseClient) {
  const payload = {
    concepto: 'Healthcheck abono TDC',
    monto: 0.01,
    tarjeta: 'Santander TDC',
    origen: 'Healthcheck',
    fecha: new Date(Date.UTC(2099, 0, 1)).toISOString(),
  };
  const { data, error } = await supabase.from('abonos_tarjeta_credito').insert([payload]).select('id').single();

  if (data?.id) {
    await supabase.from('abonos_tarjeta_credito').delete().eq('id', data.id);
  }

  return !error;
}

async function bloqueaEscriturasPublicas(supabase: SupabaseClient) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      checked: false,
      blocked: null,
      reason: 'Falta NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY para verificar anon.',
    };
  }

  const anon = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const payload = {
    concepto: 'Healthcheck anon write',
    monto: 0.01,
    categoria: 'Vida',
    subcategoria: 'Security Probe',
    origen: 'Web',
    fecha: new Date(Date.UTC(2099, 0, 2)).toISOString(),
  };
  const { data, error } = await anon.from('gastos').insert([payload]).select('id').single();

  if (data?.id) {
    await supabase.from('gastos').delete().eq('id', data.id);
  }

  return {
    checked: true,
    blocked: Boolean(error),
    reason: error ? error.message : 'Anon pudo escribir en gastos; revisar RLS/policies/grants.',
  };
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseServiceClient();

    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar llave de Supabase.' }, { status: 500 });
    }
    const tenant = await getRequestTenantContext(request);

    const [origenSantanderEmail, faseRegla333333, abonosTarjetaCredito, publicWrites] = await Promise.all([
      aceptaOrigenSantanderEmail(supabase),
      aceptaFaseRegla333333(supabase),
      aceptaAbonosTarjetaCredito(supabase),
      bloqueaEscriturasPublicas(supabase),
    ]);
    const ingestLogs = await obtenerSantanderIngestLogsPorPerfil(supabase, tenant.profileId);

    return NextResponse.json({
      success: true,
      configured: {
        supabase: Boolean(supabase),
        emailIngestSecret: Boolean(emailIngestSecret),
      },
      supabaseSchema: {
        acceptsSantanderEmailOrigin: origenSantanderEmail,
        acceptsRegla333333Phase: faseRegla333333,
        acceptsAbonosTarjetaCredito: abonosTarjetaCredito,
        acceptsSantanderIngestLogs: ingestLogs.available,
        acceptsSantanderIngestLatency: ingestLogs.available && !ingestLogs.error,
        publicWritesBlocked: publicWrites.blocked,
        publicWritesChecked: publicWrites.checked,
        publicWritesReason: publicWrites.reason,
        migrationRequired: !origenSantanderEmail || !faseRegla333333 || !abonosTarjetaCredito || !ingestLogs.available || Boolean(ingestLogs.error),
        profileScoped: Boolean(tenant.profileId),
      },
      ingestLogs,
      endpoint: '/api/email/santander',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const backendReceivedAt = new Date().toISOString();

  try {
    const ip = getClientIp(request);
    const rateLimit = checkRateLimit({
      key: `email-santander:${ip}`,
      limit: 180,
      windowMs: 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: 'Límite de ingesta excedido.' }, { status: 429 });
    }

    if (!emailIngestSecret) {
      return NextResponse.json({ success: false, error: 'Falta configurar EMAIL_INGEST_SECRET.' }, { status: 500 });
    }

    const receivedSecret = request.headers.get('x-email-ingest-secret');

    if (receivedSecret !== emailIngestSecret) {
      return NextResponse.json({ success: false, error: 'Ingesta de correo no autorizada.' }, { status: 401 });
    }

    const supabase = getSupabaseServiceClient();

    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar llave de Supabase.' }, { status: 500 });
    }

    const body = await request.json();
    const ingestEmail = getStringField(body.ingestEmail) || getStringField(body.gmailAccount) || getStringField(body.email);
    const tenant = await getEmailIngestTenantContext({ supabase, email: ingestEmail });

    if (!tenant.profileId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Gmail no está vinculado a ningún perfil activo.',
          action: 'link-gmail',
        },
        { status: 409 }
      );
    }

    const logContext = {
      gmailReceivedAt: getStringField(body.gmailReceivedAt) || getStringField(body.fecha),
      appsScriptDetectedAt: getStringField(body.appsScriptDetectedAt),
      backendReceivedAt,
      profileId: tenant.profileId,
    };
    const raw = [
      body.from,
      body.subject,
      body.raw || body.text || body.snippet || '',
    ].filter(Boolean).join('\n\n');

    if (!tieneSenalSantander(raw)) {
      await registrarSantanderIngestLog({
        supabase,
        ...logContext,
        gmailMessageId: body.gmailMessageId,
        from: body.from,
        subject: body.subject,
        status: 'ignored',
        reason: 'Correo sin señal Santander.',
      });

      return NextResponse.json({ success: true, ignored: true, reason: 'Correo sin señal Santander.' });
    }

    const parsed = parsearCorreoSantander(raw);

    if (!parsed) {
      await registrarSantanderIngestLog({
        supabase,
        ...logContext,
        gmailMessageId: body.gmailMessageId,
        from: body.from,
        subject: body.subject,
        status: 'ignored',
        reason: 'No parece ser movimiento Santander.',
      });

      return NextResponse.json({ success: true, ignored: true, reason: 'No parece ser movimiento Santander.' });
    }

    const fecha = parsed.fechaMovimiento ? new Date(parsed.fechaMovimiento) : body.fecha ? new Date(body.fecha) : new Date();
    const medioPago = detectarMedioPagoSantander(raw);

    if (Number.isNaN(fecha.getTime())) {
      return NextResponse.json({ success: false, error: 'Fecha inválida.' }, { status: 400 });
    }

    if (parsed.tipo === 'abono_tarjeta') {
      const duplicado = await buscarAbonoTarjetaDuplicado({
        concepto: parsed.concepto,
        monto: parsed.monto,
        fecha,
        supabase,
        profileId: tenant.profileId,
      });

      if (duplicado) {
        const telegramNotified = await notificarAbonoTarjetaSantander({
          supabase,
          abono: duplicado,
          profileId: tenant.profileId,
        });
        const telegramSentAt = telegramNotified ? new Date().toISOString() : null;
        await registrarSantanderIngestLog({
          supabase,
          ...logContext,
          gmailMessageId: body.gmailMessageId,
          from: body.from,
          subject: body.subject,
          status: 'duplicate',
          reason: 'Abono de tarjeta duplicado por día, concepto y monto.',
          parsed,
          abonoTarjetaId: duplicado.id,
          telegramNotified,
          telegramSentAt,
        });

        return NextResponse.json({ success: true, duplicate: true, data: duplicado, parsed });
      }

      const { data, error } = await supabase
        .from('abonos_tarjeta_credito')
        .insert([
          withProfile({
            concepto: parsed.concepto,
            monto: parsed.monto,
            tarjeta: medioPago || 'Tarjeta de crédito Santander',
            origen: 'Santander_Email',
            fecha: fecha.toISOString(),
          }, tenant.profileId),
        ])
        .select('id, concepto, monto, tarjeta, origen, fecha')
        .single();

      if (error) {
        return NextResponse.json(
          {
            success: false,
            error: `No pude guardar el abono de tarjeta. Ejecuta la migración de abonos si la tabla no existe: ${error.message}`,
          },
          { status: 500 }
        );
      }

      const telegramNotified = await notificarAbonoTarjetaSantander({
        supabase,
        abono: data,
        profileId: tenant.profileId,
      });
      const telegramSentAt = telegramNotified ? new Date().toISOString() : null;
      await registrarSantanderIngestLog({
        supabase,
        ...logContext,
        gmailMessageId: body.gmailMessageId,
        from: body.from,
        subject: body.subject,
        status: 'inserted',
        reason: 'Abono de tarjeta Santander insertado.',
        parsed,
        abonoTarjetaId: data.id,
        telegramNotified,
        telegramSentAt,
      });

      return NextResponse.json({ success: true, data, parsed });
    }

    if (parsed.tipo === 'ingreso') {
      const duplicado = await buscarIngresoDuplicado({
        concepto: parsed.concepto,
        monto: parsed.monto,
        fecha,
        supabase,
        profileId: tenant.profileId,
      });

      if (duplicado) {
        await registrarSantanderIngestLog({
          supabase,
          ...logContext,
          gmailMessageId: body.gmailMessageId,
          from: body.from,
          subject: body.subject,
          status: 'duplicate',
          reason: 'Ingreso duplicado por día, concepto y monto.',
          parsed,
          ingresoId: duplicado.id,
        });

        return NextResponse.json({ success: true, duplicate: true, data: duplicado, parsed });
      }

      const { data, error } = await supabase
        .from('ingresos')
        .insert([
          withProfile({
            concepto: parsed.concepto,
            monto: parsed.monto,
            tipo: 'Extra',
            fecha: fecha.toISOString(),
          }, tenant.profileId),
        ])
        .select('id, concepto, monto, tipo, fecha')
        .single();

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      await sincronizarPresupuestoMensual(supabase, fecha, tenant.profileId);
      await registrarSantanderIngestLog({
        supabase,
        ...logContext,
        gmailMessageId: body.gmailMessageId,
        from: body.from,
        subject: body.subject,
        status: 'inserted',
        reason: 'Ingreso Santander insertado.',
        parsed,
        ingresoId: data.id,
      });

      return NextResponse.json({ success: true, data, parsed });
    }

    const preferencia = await buscarPreferenciaClasificacion(supabase, parsed.concepto, tenant.profileId);
    const categoriaClasificada = preferencia?.categoria || parsed.categoria;
    const subcategoriaClasificada = preferencia?.subcategoria || parsed.subcategoria;

    const duplicado = await buscarGastoDuplicado({
      concepto: parsed.concepto,
      monto: parsed.monto,
      fecha,
      supabase,
      profileId: tenant.profileId,
    });

    if (duplicado) {
      const telegramNotified = await notificarGastoSantander({
        supabase,
        gasto: duplicado,
        medioPago,
        profileId: tenant.profileId,
      });
      const telegramSentAt = telegramNotified ? new Date().toISOString() : null;
      await registrarSantanderIngestLog({
        supabase,
        ...logContext,
        gmailMessageId: body.gmailMessageId,
        from: body.from,
        subject: body.subject,
        status: 'duplicate',
        reason: 'Gasto duplicado por día, concepto y monto.',
        parsed,
        gastoId: duplicado.id,
        telegramNotified,
        telegramSentAt,
      });

      return NextResponse.json({ success: true, duplicate: true, data: duplicado, parsed });
    }

    let result = await supabase
      .from('gastos')
      .insert([
        withProfile({
          concepto: parsed.concepto,
          monto: parsed.monto,
          categoria: categoriaParaGastos(categoriaClasificada),
          subcategoria: subcategoriaClasificada,
          origen: 'Santander_Email',
          fecha: fecha.toISOString(),
        }, tenant.profileId),
      ])
      .select('id, concepto, monto, categoria, subcategoria, origen, fecha')
      .single();

    if (result.error && result.error.message.includes('gastos_origen_check')) {
      result = await supabase
        .from('gastos')
        .insert([
          withProfile({
            concepto: parsed.concepto,
            monto: parsed.monto,
            categoria: categoriaParaGastos(categoriaClasificada),
            subcategoria: subcategoriaClasificada,
            origen: 'Web',
            fecha: fecha.toISOString(),
          }, tenant.profileId),
        ])
        .select('id, concepto, monto, categoria, subcategoria, origen, fecha')
        .single();
    }

    if (result.error) {
      return NextResponse.json({ success: false, error: result.error.message }, { status: 500 });
    }

    const telegramNotified = await notificarGastoSantander({
      supabase,
      gasto: result.data,
      medioPago,
      profileId: tenant.profileId,
    });
    const telegramSentAt = telegramNotified ? new Date().toISOString() : null;
    await registrarSantanderIngestLog({
      supabase,
      ...logContext,
      gmailMessageId: body.gmailMessageId,
      from: body.from,
      subject: body.subject,
      status: 'inserted',
      reason: 'Gasto Santander insertado.',
      parsed,
      gastoId: result.data.id,
      telegramNotified,
      telegramSentAt,
    });

    return NextResponse.json({ success: true, data: result.data, parsed });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
