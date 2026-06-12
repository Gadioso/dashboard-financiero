import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { responderConversacionFinanciera } from '@/lib/conversation-agent';
import { categoriaParaGastos, extraerFechaRelativaMovimiento } from '@/lib/financial-core';
import { sincronizarPresupuestoMensual } from '@/lib/budget-sync';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { applyProfileFilter, getTelegramTenantContext, withProfile } from '@/lib/tenant-context';

const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || '';
const telegramWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
const googleApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

type TelegramMessage = {
  chat?: {
    id?: number;
  };
  from?: {
    username?: string;
    first_name?: string;
    last_name?: string;
  };
  text?: string;
};

type TelegramUpdate = {
  message?: TelegramMessage;
};

type MensajeMemoria = {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  metadata?: {
    lastExpenseId?: string;
  };
};

function fechaMovimientoDesdeClasificacion(fechaMovimiento: string | undefined, texto: string) {
  const fechaClasificada = fechaMovimiento ? new Date(fechaMovimiento) : null;

  if (fechaClasificada && !Number.isNaN(fechaClasificada.getTime())) {
    return fechaClasificada;
  }

  return extraerFechaRelativaMovimiento(texto) || new Date();
}

function extractTelegramLinkCode(texto?: string | null) {
  const match = texto?.trim().match(/(?:^\/start\s+|^)(DF-[A-F0-9]{8})\b/i);

  return match?.[1]?.toUpperCase() || null;
}

function telegramDisplayName(message?: TelegramMessage) {
  const from = message?.from;

  if (!from) return null;

  return from.username || [from.first_name, from.last_name].filter(Boolean).join(' ').trim() || null;
}

async function claimTelegramLinkCode({
  supabase,
  chatId,
  code,
  username,
}: {
  supabase: SupabaseClient;
  chatId?: number;
  code: string;
  username?: string | null;
}) {
  if (!chatId) return { success: false, message: 'No pude detectar tu chat_id para vincular Telegram.' };

  const { data: linkCode, error: codeError } = await supabase
    .from('telegram_link_codes')
    .select('code, profile_id, status, expires_at')
    .eq('code', code)
    .maybeSingle();

  if (codeError) {
    throw new Error(`No pude revisar el código de Telegram: ${codeError.message}`);
  }

  if (!linkCode || linkCode.status !== 'pending') {
    return { success: false, message: 'Ese código de Telegram no existe o ya fue usado. Genera uno nuevo en Onboarding.' };
  }

  if (new Date(linkCode.expires_at).getTime() < Date.now()) {
    await supabase.from('telegram_link_codes').update({ status: 'expired' }).eq('code', code);

    return { success: false, message: 'Ese código de Telegram expiró. Genera uno nuevo en Onboarding.' };
  }

  const now = new Date().toISOString();
  const { error: upsertError } = await supabase
    .from('telegram_accounts')
    .upsert(
      {
        profile_id: linkCode.profile_id,
        chat_id: String(chatId),
        username: username || null,
        last_seen_at: now,
      },
      { onConflict: 'chat_id' }
    );

  if (upsertError) {
    throw new Error(`No pude vincular Telegram: ${upsertError.message}`);
  }

  await supabase
    .from('telegram_link_codes')
    .update({
      status: 'claimed',
      claimed_chat_id: String(chatId),
      claimed_at: now,
    })
    .eq('code', code);

  return { success: true, message: 'Listo. Telegram quedó conectado a tu dashboard financiero.' };
}

async function responderTelegram(chatId: number | undefined, texto: string) {
  if (!chatId || !telegramBotToken) return;

  await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: texto,
    }),
  });
}

async function leerMemoriaChat(supabase: SupabaseClient, chatId: number | undefined, profileId?: string | null): Promise<MensajeMemoria[]> {
  if (!chatId) return [];

  const query = supabase
    .from('telegram_memoria')
    .select('messages')
    .eq('chat_id', String(chatId));
  const { data, error } = await applyProfileFilter(query, profileId).maybeSingle();

  const row = data as { messages?: unknown } | null;

  if (error || !Array.isArray(row?.messages)) return [];

  return row.messages.slice(-12) as MensajeMemoria[];
}

async function guardarMemoriaChat({
  supabase,
  chatId,
  memoria,
  userText,
  assistantText,
  lastExpenseId,
  profileId,
}: {
  supabase: SupabaseClient;
  chatId: number | undefined;
  memoria: MensajeMemoria[];
  userText: string;
  assistantText: string;
  lastExpenseId?: string | number;
  profileId?: string | null;
}) {
  if (!chatId) return;

  const now = new Date().toISOString();
  const messages = [
    ...memoria,
    { role: 'user' as const, content: userText, createdAt: now },
    {
      role: 'assistant' as const,
      content: assistantText,
      createdAt: now,
      ...(lastExpenseId ? { metadata: { lastExpenseId: String(lastExpenseId) } } : {}),
    },
  ].slice(-16);

  await supabase
    .from('telegram_memoria')
    .upsert(
      {
        chat_id: String(chatId),
        ...(profileId ? { profile_id: profileId } : {}),
        messages,
        updated_at: now,
      },
      { onConflict: 'chat_id' }
    );
}

export async function POST(request: Request) {
  try {
    if (telegramWebhookSecret) {
      const receivedSecret = request.headers.get('x-telegram-bot-api-secret-token');

      if (receivedSecret !== telegramWebhookSecret) {
        return NextResponse.json({ success: false, error: 'Webhook no autorizado.' }, { status: 401 });
      }
    }

    const supabase = getSupabaseServiceClient();

    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY.' },
        { status: 500 }
      );
    }

    const update = (await request.json()) as TelegramUpdate;
    const chatId = update.message?.chat?.id;
    const texto = update.message?.text?.trim();
    const linkCode = extractTelegramLinkCode(texto);

    if (linkCode) {
      const result = await claimTelegramLinkCode({
        supabase,
        chatId,
        code: linkCode,
        username: telegramDisplayName(update.message),
      });

      await responderTelegram(chatId, result.message);
      return NextResponse.json({ success: result.success, action: 'claim-telegram', message: result.message }, { status: result.success ? 200 : 400 });
    }

    const tenant = await getTelegramTenantContext({ supabase, chatId });

    if (!tenant.profileId) {
      await responderTelegram(
        chatId,
        chatId
          ? `Necesito vincular este Telegram antes de registrar movimientos. Tu chat_id es: ${chatId}`
          : 'No pude detectar tu chat_id para vincular Telegram.'
      );

      return NextResponse.json({ success: true, ignored: true, action: 'link-telegram' });
    }

    if (!texto) {
      await responderTelegram(chatId, 'Estoy listo. Puedes decirme "pagué 250 de gasolina" o preguntarme "cómo voy este mes".');
      return NextResponse.json({ success: true, ignored: true });
    }

    if (/^\/?mi[_\s-]?id$/i.test(texto)) {
      const message = chatId
        ? `Tu chat_id de Telegram es: ${chatId}\nPásamelo para configurar TELEGRAM_NOTIFY_CHAT_ID y mandar ahí las alertas Santander.`
        : 'No pude detectar tu chat_id en este mensaje.';

      await responderTelegram(chatId, message);
      return NextResponse.json({ success: true, ignored: true, message });
    }

    const memoria = await leerMemoriaChat(supabase, chatId, tenant.profileId);
    const respuesta = await responderConversacionFinanciera({
      texto,
      apiKey: googleApiKey,
      supabase,
      memoria,
      profileId: tenant.profileId,
    });

    if (respuesta.action === 'reply') {
      await responderTelegram(chatId, respuesta.message);
      await guardarMemoriaChat({ supabase, chatId, memoria, userText: texto, assistantText: respuesta.message, profileId: tenant.profileId });
      return NextResponse.json({ success: true, ignored: true, message: respuesta.message });
    }

    const clasificacion = respuesta.movement;
    const fechaMovimiento = fechaMovimientoDesdeClasificacion(clasificacion.fechaMovimiento, texto);

    if (clasificacion.tipo === 'ingreso') {
      const ingresoPayload = withProfile({
        concepto: clasificacion.concepto,
        monto: clasificacion.monto,
        tipo: 'Extra',
        fecha: fechaMovimiento.toISOString(),
      }, tenant.profileId);

      const { data, error } = await supabase
        .from('ingresos')
        .insert([ingresoPayload])
        .select('id, concepto, monto, tipo, fecha')
        .single();

      if (error) {
        await responderTelegram(chatId, `No pude guardar el ingreso: ${error.message}`);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      await sincronizarPresupuestoMensual(supabase, fechaMovimiento, tenant.profileId);

      const message = `Registrado. ${respuesta.message} Ya recalculé tus bolsas 33/33/33.`;
      await responderTelegram(chatId, message);
      await guardarMemoriaChat({ supabase, chatId, memoria, userText: texto, assistantText: message, profileId: tenant.profileId });

      return NextResponse.json({ success: true, data, message });
    }

    const categoriaFinal = categoriaParaGastos(clasificacion.categoria);

    const payload = withProfile({
      concepto: clasificacion.concepto,
      monto: clasificacion.monto,
      categoria: categoriaFinal,
      subcategoria: clasificacion.subcategoria,
      origen: 'Telegram',
      fecha: fechaMovimiento.toISOString(),
    }, tenant.profileId);

    const { data, error } = await supabase.from('gastos').insert([payload]).select('id, concepto, monto, categoria, subcategoria, origen, fecha').single();

    if (error) {
      await responderTelegram(chatId, `No pude guardar el gasto: ${error.message}`);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const message = `Registrado. ${respuesta.message}`;
    await responderTelegram(chatId, message);
    await guardarMemoriaChat({ supabase, chatId, memoria, userText: texto, assistantText: message, lastExpenseId: data.id, profileId: tenant.profileId });

    return NextResponse.json({ success: true, data, message });
  } catch (error: unknown) {
    console.error('Error en webhook de Telegram:', error);
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
