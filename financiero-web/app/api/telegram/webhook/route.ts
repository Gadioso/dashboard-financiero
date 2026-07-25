import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { transcribirAudioFinanciero } from '@/lib/audio-transcription';
import { esAbonoTarjetaCredito, extraerMontoAbonoTarjeta } from '@/lib/card-payment-intent';
import { responderConversacionFinanciera } from '@/lib/conversation-agent';
import { categoriaParaGastos, extraerFechaMovimiento, formatearMonto, resolverFechaMovimiento } from '@/lib/financial-core';
import { logErrorEvent } from '@/lib/operational-events';
import { sincronizarPresupuestoMensual } from '@/lib/budget-sync';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getAppMembershipStatus, revokeTelegramAccess } from '@/lib/telegram-access';
import { applyProfileFilter, getTelegramTenantContext, withProfile } from '@/lib/tenant-context';
import { appendVirafiaExchange } from '@/lib/virafia-conversation';

const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || '';
const telegramWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
const googleApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const openRouterApiKey = process.env.OPENROUTER_API_KEY || '';
const conversationApiKey = openRouterApiKey || googleApiKey;
const openAiApiKey = process.env.OPENAI_API_KEY || '';

type TelegramMessage = {
  message_id?: number;
  chat?: {
    id?: number;
    type?: 'private' | 'group' | 'supergroup' | 'channel';
  };
  from?: {
    is_bot?: boolean;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
  text?: string;
  voice?: {
    file_id: string;
    mime_type?: string;
    file_size?: number;
  };
  audio?: {
    file_id: string;
    mime_type?: string;
    file_size?: number;
  };
  reply_to_message?: TelegramMessage;
};

type TelegramUpdate = {
  update_id?: number;
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

const processedUpdates = new Map<number, number>();
const PROCESSED_UPDATE_TTL_MS = 10 * 60 * 1000;
const MAX_PROCESSED_UPDATES = 500;

function alreadyReceivedUpdate(updateId?: number) {
  if (typeof updateId !== 'number') return false;

  const now = Date.now();
  const previous = processedUpdates.get(updateId);

  for (const [id, timestamp] of processedUpdates) {
    if (now - timestamp > PROCESSED_UPDATE_TTL_MS) {
      processedUpdates.delete(id);
    }
  }

  if (processedUpdates.size > MAX_PROCESSED_UPDATES) {
    const oldestId = processedUpdates.keys().next().value as number | undefined;
    if (typeof oldestId === 'number') processedUpdates.delete(oldestId);
  }

  if (previous && now - previous < PROCESSED_UPDATE_TTL_MS) {
    return true;
  }

  processedUpdates.set(updateId, now);
  return false;
}

function fechaMovimientoDesdeClasificacion(fechaMovimiento: string | undefined, texto: string) {
  return resolverFechaMovimiento(texto, fechaMovimiento);
}

function extractTelegramLinkCode(texto?: string | null) {
  const match = texto?.trim().match(/\b(DF-[A-F0-9]{8})\b/i);

  return match?.[1]?.toUpperCase() || null;
}

function telegramDisplayName(message?: TelegramMessage) {
  const from = message?.from;

  if (!from) return null;

  return from.username || [from.first_name, from.last_name].filter(Boolean).join(' ').trim() || null;
}

function esComandoDesconexionTelegram(texto?: string | null) {
  if (!texto) return false;

  return /^\/?(desconectar|desvincular|revocar|disconnect|unlink)(?:\s+telegram)?$/i.test(texto.trim()) ||
    /\b(?:desconecta|desvincula|revoca)\s+(?:este\s+)?telegram\b/i.test(texto);
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
  if (!chatId) return { success: false, message: null };

  const now = new Date().toISOString();
  const existingResult = await supabase
    .from('telegram_link_codes')
    .select('code, profile_id, status, expires_at')
    .eq('code', code)
    .maybeSingle();

  if (existingResult.error) {
    throw new Error(`No pude revisar el código de Telegram: ${existingResult.error.message}`);
  }

  const existingCode = existingResult.data;
  if (!existingCode || existingCode.status !== 'pending') {
    return { success: false, message: null };
  }

  if (new Date(existingCode.expires_at).getTime() < Date.now()) {
    await supabase
      .from('telegram_link_codes')
      .update({ status: 'expired' })
      .eq('code', code)
      .eq('status', 'pending');

    return {
      success: false,
      message: '🔒 Esta llave expiró. Vuelve a Virafi, genera una nueva y reintenta.',
    };
  }

  const membership = await getAppMembershipStatus({
    supabase,
    profileId: existingCode.profile_id,
  });

  if (membership !== 'active') {
    return { success: false, message: null };
  }

  const { data: linkCode, error: codeError } = await supabase
    .from('telegram_link_codes')
    .update({
      status: 'claimed',
      claimed_chat_id: String(chatId),
      claimed_at: now,
    })
    .eq('code', code)
    .eq('status', 'pending')
    .gt('expires_at', now)
    .select('code, profile_id, expires_at')
    .maybeSingle();

  if (codeError) {
    throw new Error(`No pude reclamar el código de Telegram: ${codeError.message}`);
  }

  if (!linkCode) return { success: false, message: null };

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
    await supabase
      .from('telegram_link_codes')
      .update({ status: 'pending', claimed_chat_id: null, claimed_at: null })
      .eq('code', code)
      .eq('claimed_chat_id', String(chatId));
    throw new Error(`No pude vincular Telegram: ${upsertError.message}`);
  }

  return {
    success: true,
    message: [
      '🔐 Conexión segura completada.',
      'Este Telegram ya está vinculado a tu cuenta de Virafi.',
      'Puedes escribirme o mandarme una nota de voz, por ejemplo: “pagué 250 de gasolina”.',
    ].join('\n'),
  };
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

async function mostrarTelegramEscribiendo(chatId: number | undefined) {
  if (!chatId || !telegramBotToken) return;

  const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Telegram sendChatAction falló: ${response.status} ${detail}`);
  }
}

async function conTelegramEscribiendo<T>(chatId: number | undefined, trabajo: () => Promise<T>) {
  if (!chatId || !telegramBotToken) return trabajo();

  const renovar = () => {
    void mostrarTelegramEscribiendo(chatId).catch((error) => {
      console.warn('No pude renovar el indicador de escritura de Telegram:', error);
    });
  };

  renovar();
  const intervalId = setInterval(renovar, 4_000);

  try {
    return await trabajo();
  } finally {
    clearInterval(intervalId);
  }
}

function mensajeErrorTelegram(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || 'Error desconocido.');

  if (/429|quota|credits|prepayment|billing|Too Many Requests/i.test(message)) {
    return [
      'La IA externa se quedó sin cuota justo ahora.',
      'No pude terminar esa transcripción, pero el bot sigue activo para texto.',
      'Mándame el movimiento escrito, por ejemplo: "hice un abono de 10k a tarjeta".',
    ].join('\n');
  }

  if (/audio|transcrib/i.test(message)) {
    return 'No pude transcribir ese audio. Mándamelo por texto y lo registro.';
  }

  return 'Tuve un error procesando ese mensaje, pero ya sigo activo. Reenvíamelo por texto y lo proceso.';
}

function telegramAudioFromMessage(message?: TelegramMessage) {
  const media = message?.voice || message?.audio;

  if (!media?.file_id) return null;

  return {
    fileId: media.file_id,
    mimeType: media.mime_type || (message?.voice ? 'audio/ogg' : 'audio/mpeg'),
    fileSize: media.file_size || 0,
  };
}

function normalizarTextoTelegram(texto: string) {
  return texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function extraerIdGastoDeMensajeTelegram(texto?: string | null) {
  const match = texto?.match(/\bID:\s*([a-z0-9-]{1,})\b/i);

  return match?.[1] || null;
}

function extraerCategoriaCorreccionTelegram(texto?: string | null) {
  const normalizado = normalizarTextoTelegram(texto || '');

  if (!normalizado) return null;
  if (/\b(?:vida|costo\s+de\s+vida)\b/.test(normalizado)) return 'vida';
  if (/\b(?:placeres?|placer)\b/.test(normalizado)) return 'placeres';
  if (/\b(?:futuro|inversion|ahorro|emergencia)\b/.test(normalizado)) return 'futuro';

  return null;
}

function esCorreccionDeMensajeTelegram(texto?: string | null) {
  const normalizado = normalizarTextoTelegram(texto || '');

  return /\b(?:cambia|cambiame|cambiamelo|corrige|corrigeme|clasifica|clasificame|pon|ponme)\b/.test(normalizado) &&
    Boolean(extraerCategoriaCorreccionTelegram(texto));
}

function aplicarContextoDeRespuestaTelegram(texto: string, message?: TelegramMessage) {
  if (!esCorreccionDeMensajeTelegram(texto)) return texto;

  const id = extraerIdGastoDeMensajeTelegram(message?.reply_to_message?.text);
  const categoria = extraerCategoriaCorreccionTelegram(texto);

  if (!id || !categoria) return texto;

  return `cambiar ${id} a ${categoria}`;
}

async function telegramApi<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json() as { ok?: boolean; result?: T; description?: string };

  if (!response.ok || !data.ok || !data.result) {
    throw new Error(data.description || `Telegram ${method} falló.`);
  }

  return data.result;
}

async function transcribirAudioTelegram(message?: TelegramMessage) {
  const audio = telegramAudioFromMessage(message);

  if (!audio) return null;

  if (!telegramBotToken) {
    throw new Error('Falta configurar TELEGRAM_BOT_TOKEN para descargar audios.');
  }

  if (audio.fileSize > 15 * 1024 * 1024) {
    throw new Error('El audio es demasiado grande. Mándame una nota de voz más corta.');
  }

  const file = await telegramApi<{ file_path?: string }>('getFile', { file_id: audio.fileId });

  if (!file.file_path) {
    throw new Error('Telegram no devolvió la ruta del audio.');
  }

  const audioResponse = await fetch(`https://api.telegram.org/file/bot${telegramBotToken}/${file.file_path}`);

  if (!audioResponse.ok) {
    throw new Error('No pude descargar el audio de Telegram.');
  }

  const audioBuffer = await audioResponse.arrayBuffer();

  return transcribirAudioFinanciero({
    geminiApiKey: googleApiKey,
    openRouterApiKey,
    openAiApiKey,
    audio: audioBuffer,
    mimeType: audio.mimeType,
    fileName: file.file_path.split('/').pop() || undefined,
  });
}

async function desconectarTelegram({
  supabase,
  chatId,
  profileId,
}: {
  supabase: SupabaseClient;
  chatId?: number;
  profileId?: string | null;
}) {
  if (!chatId || !profileId) {
    return {
      success: false,
      message: 'No encontré una conexión activa para este Telegram.',
    };
  }

  const chatIdText = String(chatId);
  const { error: accountError } = await supabase
    .from('telegram_accounts')
    .delete()
    .eq('chat_id', chatIdText)
    .eq('profile_id', profileId);

  if (accountError) {
    throw new Error(`No pude desconectar Telegram: ${accountError.message}`);
  }

  await supabase
    .from('telegram_memoria')
    .delete()
    .eq('chat_id', chatIdText)
    .eq('profile_id', profileId);

  return {
    success: true,
    message: 'Listo. Este Telegram quedó desconectado de tu dashboard. Para volver a usarlo, genera un nuevo código en Configuración y mándamelo por aquí.',
  };
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

  if (profileId) {
    await appendVirafiaExchange({
      supabase,
      profileId,
      userText,
      assistantText,
      channel: 'telegram',
      assistantMetadata: lastExpenseId ? { lastExpenseId: String(lastExpenseId) } : {},
    }).catch((error) => console.error('[virafia-conversation] no pude persistir el intercambio de Telegram', error));
  }
}

export async function POST(request: Request) {
  let update: TelegramUpdate | null = null;
  let chatId: number | undefined;
  let authorizedToReply = false;

  try {
    if (!telegramWebhookSecret) {
      return NextResponse.json({ success: false, error: 'Webhook de Telegram no configurado.' }, { status: 503 });
    }

    const receivedSecret = request.headers.get('x-telegram-bot-api-secret-token');

    if (receivedSecret !== telegramWebhookSecret) {
      return NextResponse.json({ success: false, error: 'Webhook no autorizado.' }, { status: 401 });
    }

    const supabase = getSupabaseServiceClient();

    if (!supabase) {
      return NextResponse.json(
        { success: false, acknowledged: true, error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY.' },
        { status: 200 }
      );
    }

    update = (await request.json()) as TelegramUpdate;
    if (update.message?.chat?.type && update.message.chat.type !== 'private') {
      return NextResponse.json({ success: true, ignored: true, action: 'non-private-chat' });
    }
    if (update.message?.from?.is_bot) {
      return NextResponse.json({ success: true, ignored: true, action: 'bot-sender' });
    }
    if (alreadyReceivedUpdate(update.update_id)) {
      return NextResponse.json({ success: true, duplicate: true });
    }

    chatId = update.message?.chat?.id;
    const textoOriginal = update.message?.text?.trim();
    let texto = textoOriginal;
    const linkCode = extractTelegramLinkCode(texto);

    if (linkCode) {
      const result = await claimTelegramLinkCode({
        supabase,
        chatId,
        code: linkCode,
        username: telegramDisplayName(update.message),
      });

      authorizedToReply = Boolean(result.message);
      if (result.message) await responderTelegram(chatId, result.message);
      return NextResponse.json({ success: result.success, ignored: !result.message, action: 'claim-telegram' });
    }

    const tenant = await getTelegramTenantContext({ supabase, chatId });

    if (!tenant.profileId) {
      return NextResponse.json({ success: true, ignored: true, action: 'unauthorized-chat' });
    }

    const membership = await getAppMembershipStatus({ supabase, profileId: tenant.profileId });
    if (membership !== 'active') {
      if (membership === 'inactive') {
        await revokeTelegramAccess({ supabase, profileId: tenant.profileId, chatId });
      }
      return NextResponse.json({ success: true, ignored: true, action: 'inactive-app-user' });
    }
    authorizedToReply = true;

    if (/^\/?(?:start|estado|status)$/i.test(texto || '')) {
      const message = '🔐 VirafIA está conectada a tu cuenta activa de Virafi.';
      await responderTelegram(chatId, message);
      return NextResponse.json({ success: true, action: 'telegram-access-status' });
    }

    if (!texto) {
      const audioTelegram = telegramAudioFromMessage(update.message);

      if (audioTelegram) {
        await responderTelegram(chatId, 'Recibí tu audio. Lo estoy transcribiendo para registrar el movimiento...');
        let transcripcion: string | null = null;
        const telegramMessage = update.message;

        try {
          transcripcion = await conTelegramEscribiendo(chatId, () => transcribirAudioTelegram(telegramMessage));
        } catch (error) {
          console.error('Error transcribiendo audio de Telegram:', error);
          await logErrorEvent({
            supabase,
            request,
            profileId: tenant.profileId,
            action: 'telegram.voice_transcription',
            error,
            code: 'telegram_voice_transcription_failed',
            severity: 'warning',
            metadata: {
              chatId: chatId ? String(chatId) : null,
              fileSize: audioTelegram.fileSize,
              mimeType: audioTelegram.mimeType,
            },
          });
          await responderTelegram(chatId, mensajeErrorTelegram(error));
          return NextResponse.json({ success: true, acknowledged: true, action: 'voice-transcription-failed' });
        }

        if (!transcripcion) {
          await logErrorEvent({
            supabase,
            request,
            profileId: tenant.profileId,
            action: 'telegram.voice_transcription',
            error: new Error('La transcripción de audio llegó vacía.'),
            code: 'telegram_voice_transcription_empty',
            severity: 'warning',
            metadata: {
              chatId: chatId ? String(chatId) : null,
              fileSize: audioTelegram.fileSize,
              mimeType: audioTelegram.mimeType,
            },
          });
          await responderTelegram(chatId, 'No pude transcribir ese audio. Intenta con una nota de voz más corta o mándamelo por texto.');
          return NextResponse.json({ success: true, ignored: true, action: 'voice-transcription-empty' });
        }
        texto = transcripcion;
        await responderTelegram(chatId, `Entendí: "${texto}"`);
      } else {
        await responderTelegram(chatId, 'Estoy listo. Puedes decirme "pagué 250 de gasolina", mandarme una nota de voz o preguntarme "cómo voy este mes".');
        return NextResponse.json({ success: true, ignored: true });
      }
    }

    if (esComandoDesconexionTelegram(texto)) {
      const result = await desconectarTelegram({ supabase, chatId, profileId: tenant.profileId });
      await responderTelegram(chatId, result.message);
      return NextResponse.json({ success: result.success, action: 'disconnect-telegram', message: result.message });
    }

    if (/^\/?mi[_\s-]?id$/i.test(texto)) {
      const message = chatId
        ? `Tu chat_id de Telegram es: ${chatId}\nPásamelo para configurar TELEGRAM_NOTIFY_CHAT_ID y mandar ahí las alertas Santander.`
        : 'No pude detectar tu chat_id en este mensaje.';

      await responderTelegram(chatId, message);
      return NextResponse.json({ success: true, ignored: true, message });
    }

    texto = aplicarContextoDeRespuestaTelegram(texto, update.message);
    const memoria = await leerMemoriaChat(supabase, chatId, tenant.profileId);

    if (esAbonoTarjetaCredito(texto)) {
      const monto = extraerMontoAbonoTarjeta(texto);

      if (!Number.isFinite(monto) || monto <= 0) {
        const message = 'Entendí que es abono a tarjeta, pero no detecté el monto. Ejemplo: "hice un abono de 10k a la de crédito".';
        await responderTelegram(chatId, message);
        await guardarMemoriaChat({ supabase, chatId, memoria, userText: texto, assistantText: message, profileId: tenant.profileId });
        return NextResponse.json({ success: true, ignored: true, action: 'card-payment-missing-amount' });
      }

      const fechaMovimiento = extraerFechaMovimiento(texto) || new Date();
      const payload = withProfile({
        concepto: 'Abono tarjeta de crédito',
        monto,
        tarjeta: 'Tarjeta de crédito',
        origen: 'Telegram',
        fecha: fechaMovimiento.toISOString(),
      }, tenant.profileId);
      const { data, error } = await supabase
        .from('abonos_tarjeta_credito')
        .insert([payload])
        .select('id, concepto, monto, tarjeta, origen, fecha')
        .single();

      if (error) {
        await responderTelegram(chatId, `No pude guardar el abono de tarjeta: ${error.message}`);
        return NextResponse.json({ success: false, acknowledged: true, action: 'card-payment-error', error: error.message });
      }

      const message = `Abono registrado. $${formatearMonto(monto)} a tarjeta de crédito. Esto reduce deuda de tarjeta y no cuenta como gasto nuevo.`;
      await responderTelegram(chatId, message);
      await guardarMemoriaChat({ supabase, chatId, memoria, userText: texto, assistantText: message, profileId: tenant.profileId });

      return NextResponse.json({ success: true, action: 'card-payment', data, message });
    }

    const respuesta = await conTelegramEscribiendo(chatId, () => responderConversacionFinanciera({
      texto,
      apiKey: conversationApiKey,
      supabase,
      memoria,
      profileId: tenant.profileId,
    }));

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
        return NextResponse.json({ success: false, acknowledged: true, error: error.message });
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
      return NextResponse.json({ success: false, acknowledged: true, error: error.message });
    }

    const message = `Registrado. ${respuesta.message}`;
    await responderTelegram(chatId, message);
    await guardarMemoriaChat({ supabase, chatId, memoria, userText: texto, assistantText: message, lastExpenseId: data.id, profileId: tenant.profileId });

    return NextResponse.json({ success: true, data, message });
  } catch (error: unknown) {
    console.error('Error en webhook de Telegram:', error);
    if (authorizedToReply) await responderTelegram(chatId, mensajeErrorTelegram(error));
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, acknowledged: true, error: message }, { status: 200 });
  }
}
