import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { responderConversacionFinanciera } from '@/lib/conversation-agent';
import { categoriaParaGastos } from '@/lib/financial-core';
import { sincronizarPresupuestoMensual } from '@/lib/budget-sync';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://goralfhisudzilfortuk.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || '';
const telegramWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
const googleApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;

  return createClient(supabaseUrl, supabaseKey);
}

type TelegramMessage = {
  chat?: {
    id?: number;
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
};

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

async function leerMemoriaChat(supabase: SupabaseClient, chatId: number | undefined): Promise<MensajeMemoria[]> {
  if (!chatId) return [];

  const { data, error } = await supabase
    .from('telegram_memoria')
    .select('messages')
    .eq('chat_id', String(chatId))
    .maybeSingle();

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
}: {
  supabase: SupabaseClient;
  chatId: number | undefined;
  memoria: MensajeMemoria[];
  userText: string;
  assistantText: string;
}) {
  if (!chatId) return;

  const now = new Date().toISOString();
  const messages = [
    ...memoria,
    { role: 'user' as const, content: userText, createdAt: now },
    { role: 'assistant' as const, content: assistantText, createdAt: now },
  ].slice(-16);

  await supabase
    .from('telegram_memoria')
    .upsert(
      {
        chat_id: String(chatId),
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

    const supabase = getSupabase();

    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY o NEXT_PUBLIC_SUPABASE_ANON_KEY.' },
        { status: 500 }
      );
    }

    const update = (await request.json()) as TelegramUpdate;
    const chatId = update.message?.chat?.id;
    const texto = update.message?.text?.trim();

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

    const memoria = await leerMemoriaChat(supabase, chatId);
    const respuesta = await responderConversacionFinanciera({
      texto,
      apiKey: googleApiKey,
      supabase,
      memoria,
    });

    if (respuesta.action === 'reply') {
      await responderTelegram(chatId, respuesta.message);
      await guardarMemoriaChat({ supabase, chatId, memoria, userText: texto, assistantText: respuesta.message });
      return NextResponse.json({ success: true, ignored: true, message: respuesta.message });
    }

    const clasificacion = respuesta.movement;

    if (clasificacion.tipo === 'ingreso') {
      const fechaIngreso = new Date();
      const ingresoPayload = {
        concepto: clasificacion.concepto,
        monto: clasificacion.monto,
        tipo: 'Extra',
        fecha: fechaIngreso.toISOString(),
      };

      const { data, error } = await supabase
        .from('ingresos')
        .insert([ingresoPayload])
        .select('id, concepto, monto, tipo, fecha')
        .single();

      if (error) {
        await responderTelegram(chatId, `No pude guardar el ingreso: ${error.message}`);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      await sincronizarPresupuestoMensual(supabase, fechaIngreso);

      const message = `Registrado. ${respuesta.message} Ya recalculé tus bolsas 33/33/33.`;
      await responderTelegram(chatId, message);
      await guardarMemoriaChat({ supabase, chatId, memoria, userText: texto, assistantText: message });

      return NextResponse.json({ success: true, data, message });
    }

    const categoriaFinal = categoriaParaGastos(clasificacion.categoria);

    const payload = {
      concepto: clasificacion.concepto,
      monto: clasificacion.monto,
      categoria: categoriaFinal,
      subcategoria: clasificacion.subcategoria,
      origen: 'Telegram',
      fecha: new Date().toISOString(),
    };

    const { data, error } = await supabase.from('gastos').insert([payload]).select('id, concepto, monto, categoria, subcategoria, origen, fecha').single();

    if (error) {
      await responderTelegram(chatId, `No pude guardar el gasto: ${error.message}`);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const message = `Registrado. ${respuesta.message}`;
    await responderTelegram(chatId, message);
    await guardarMemoriaChat({ supabase, chatId, memoria, userText: texto, assistantText: message });

    return NextResponse.json({ success: true, data, message });
  } catch (error: unknown) {
    console.error('Error en webhook de Telegram:', error);
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
