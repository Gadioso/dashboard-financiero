import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { responderConversacionFinanciera } from '@/lib/conversation-agent';
import { categoriaParaGastos } from '@/lib/financial-core';
import { sincronizarPresupuestoMensual } from '@/lib/budget-sync';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://goralfhisudzilfortuk.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || '';
const telegramWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
const googleApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

type TelegramMessage = {
  chat?: {
    id?: number;
  };
  text?: string;
};

type TelegramUpdate = {
  message?: TelegramMessage;
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

export async function POST(request: Request) {
  try {
    if (telegramWebhookSecret) {
      const receivedSecret = request.headers.get('x-telegram-bot-api-secret-token');

      if (receivedSecret !== telegramWebhookSecret) {
        return NextResponse.json({ success: false, error: 'Webhook no autorizado.' }, { status: 401 });
      }
    }

    if (!supabaseKey) {
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

    const respuesta = await responderConversacionFinanciera({
      texto,
      apiKey: googleApiKey,
      supabase,
    });

    if (respuesta.action === 'reply') {
      await responderTelegram(chatId, respuesta.message);
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

      await responderTelegram(chatId, `Registrado. ${respuesta.message} Ya recalculé tus bolsas 33/33/33.`);

      return NextResponse.json({ success: true, data, message: `Registrado. ${respuesta.message} Ya recalculé tus bolsas 33/33/33.` });
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

    await responderTelegram(
      chatId,
      `Registrado. ${respuesta.message}`
    );

    return NextResponse.json({ success: true, data, message: `Registrado. ${respuesta.message}` });
  } catch (error: unknown) {
    console.error('Error en webhook de Telegram:', error);
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
