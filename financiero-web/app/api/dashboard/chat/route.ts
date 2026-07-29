import { NextResponse } from 'next/server';
import { MovementInputError } from '@/lib/ai-classifier';
import { sincronizarPresupuestoMensual } from '@/lib/budget-sync';
import { esAbonoTarjetaCredito, extraerMontoAbonoTarjeta } from '@/lib/card-payment-intent';
import { responderConversacionFinanciera } from '@/lib/conversation-agent';
import { categoriaParaGastos, extraerFechaMovimiento, formatearMonto, resolverFechaMovimiento } from '@/lib/financial-core';
import { extraerJson, generateGeminiText, getConfiguredLlmKey } from '@/lib/gemini';
import { logAuditEvent, logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext, withProfile } from '@/lib/tenant-context';
import { notifyDetectedMovement } from '@/lib/movement-notifications';
import { analyzeFinancialAttachments, validateFinancialAttachments } from '@/lib/financial-attachment-analysis';
import { appendVirafiaExchange } from '@/lib/virafia-conversation';

export const dynamic = 'force-dynamic';

const aiApiKey = getConfiguredLlmKey();

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  metadata?: {
    lastExpenseId?: string;
  };
};

async function virafiaResponse({
  supabase,
  profileId,
  userText,
  payload,
}: {
  supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>;
  profileId: string;
  userText: string;
  payload: Record<string, unknown> & { message: string };
}) {
  await appendVirafiaExchange({
    supabase,
    profileId,
    userText,
    assistantText: payload.message,
    channel: 'in_app',
    assistantMetadata: payload.lastExpenseId ? { lastExpenseId: String(payload.lastExpenseId) } : {},
  }).catch((error) => console.error('[virafia-conversation] no pude persistir el intercambio web', error));
  return NextResponse.json(payload);
}

function fechaMovimientoDesdeClasificacion(fechaMovimiento: string | undefined, texto: string) {
  return resolverFechaMovimiento(texto, fechaMovimiento);
}

function cleanMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .slice(-12)
    .map((message) => ({
      role: message?.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: String(message?.content || '').slice(0, 1200),
      createdAt: String(message?.createdAt || new Date().toISOString()),
      metadata: message?.metadata && typeof message.metadata === 'object'
        ? { lastExpenseId: message.metadata.lastExpenseId ? String(message.metadata.lastExpenseId) : undefined }
        : undefined,
    }))
    .filter((message) => message.content.trim());
}

function screenContextText(value: unknown) {
  if (!value || typeof value !== 'object') return '';

  return JSON.stringify(value).slice(0, 2500);
}

async function parseChatRequest(request: Request) {
  const contentType = request.headers.get('content-type') || '';

  if (!contentType.includes('multipart/form-data')) {
    const body = await request.json().catch(() => ({}));
    return {
      text: String(body.text || '').trim(),
      messages: cleanMessages(body.messages),
      screenContext: screenContextText(body.screenContext),
      attachments: [] as File[],
    };
  }

  const formData = await request.formData();
  const rawMessages = String(formData.get('messages') || '[]');
  const rawScreenContext = String(formData.get('screenContext') || '');
  const attachments = formData
    .getAll('attachments')
    .filter((value): value is File => value instanceof File && value.size > 0);

  let messages: unknown = [];
  let screenContext: unknown = null;

  try { messages = JSON.parse(rawMessages); } catch { messages = []; }
  try { screenContext = rawScreenContext ? JSON.parse(rawScreenContext) : null; } catch { screenContext = null; }

  return {
    text: String(formData.get('text') || '').trim(),
    messages: cleanMessages(messages),
    screenContext: screenContextText(screenContext),
    attachments,
  };
}

type MultiExpenseDraft = {
  concepto: string;
  monto: number;
  categoria: 'Vida' | 'Placeres' | 'Futuro';
  subcategoria: string;
  fechaMovimiento?: string;
};

function shouldTryMultipleExpenses(text: string) {
  const normalized = text.toLowerCase();
  const amountCount = (normalized.match(/\$?\s*\d+(?:[,.]\d{1,2})?\s*(?:k|pesos?|mxn)?\b/g) || []).length;

  return amountCount >= 2 && /\b(?:dos|tres|varios|gastos?|otro|otra|y)\b/.test(normalized) && /\b(?:agrega|agregar|registra|registrar|gasto|gastos|pagu[eé]|gast[eé])\b/.test(normalized);
}

async function classifyMultipleExpenses(text: string, apiKey: string): Promise<MultiExpenseDraft[]> {
  if (!apiKey || !shouldTryMultipleExpenses(text)) return [];

  const fechaActualMexico = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const prompt = `
{
  "role": "multi_expense_extractor",
  "current_date_mexico": ${JSON.stringify(fechaActualMexico)},
  "language_policy": {
    "instructions_language": "English",
    "output_format": "raw_json_only",
    "no_markdown": true
  },
  "objective": "Extract every distinct expense from one Spanish user message. Return an empty array if the message is not asking to create multiple expenses.",
  "rules": [
    "Only extract expenses explicitly requested by the user.",
    "Amounts near dates are not amounts. Example: in 'google el 2 de julio de 500', amount is 500 and '2 de julio' is the date.",
    "If a date applies to all items, copy the same fechaMovimiento to every item.",
    "When a date omits the year, use the year from current_date_mexico. Never guess another year.",
    "Classify Uber, restaurants, food, travel and unknown discretionary expenses as Placeres.",
    "Classify productive software/tools such as Google, OpenAI, Vercel, Supabase, cloud, AI or SaaS as Futuro/Herramientas Software.",
    "Do not invent amounts or expenses.",
    "Return only raw JSON."
  ],
  "user_message": ${JSON.stringify(text)},
  "output_schema": {
    "expenses": [
      {
        "concepto": "clean merchant/concept",
        "monto": 904,
        "categoria": "Vida | Placeres | Futuro",
        "subcategoria": "Spanish subcategory",
        "fechaMovimiento": "optional ISO date"
      }
    ]
  }
}
`;

  const raw = await generateGeminiText(apiKey, prompt);
  const parsed = JSON.parse(extraerJson(raw)) as { expenses?: Array<Partial<MultiExpenseDraft>> };

  return (parsed.expenses || [])
    .map((expense): MultiExpenseDraft => {
      const categoria: MultiExpenseDraft['categoria'] =
        expense.categoria === 'Vida' || expense.categoria === 'Futuro' ? expense.categoria : 'Placeres';

      return {
        concepto: String(expense.concepto || '').trim(),
        monto: Number(expense.monto),
        categoria,
        subcategoria: String(expense.subcategoria || '').trim() || 'Otros Placeres',
        ...(typeof expense.fechaMovimiento === 'string' && expense.fechaMovimiento.trim() ? { fechaMovimiento: expense.fechaMovimiento.trim() } : {}),
      };
    })
    .filter((expense) => expense.concepto && Number.isFinite(expense.monto) && expense.monto > 0)
    .slice(0, 8);
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseServiceClient();

    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500 });
    }

    const tenant = await getRequestTenantContext(request);

    if (!tenant.profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const parsed = await parseChatRequest(request);
    const { text, screenContext, attachments } = parsed;

    if (!text && attachments.length === 0) {
      return NextResponse.json({ success: false, error: 'Escribe un mensaje para el asistente.' }, { status: 400 });
    }

    const attachmentError = validateFinancialAttachments(attachments);
    if (attachmentError) {
      return NextResponse.json({ success: false, error: attachmentError }, { status: 400 });
    }

    const attachmentAnalysis = attachments.length
      ? await analyzeFinancialAttachments({ files: attachments, userPrompt: text })
      : '';

    const shouldUseScreenContext = screenContext && /\b(?:pantalla|vista|dashboard|tablero|aqui|aqu[ií]|esto|este|esta|ese|esa|cambia|corrige|edita|arregla|ayuda|explica)\b/i.test(text);
    const textoBase = text || 'Analiza los archivos adjuntos y explícame lo importante.';
    const texto = shouldUseScreenContext
      ? `${textoBase}\n\nContexto visible del dashboard: ${screenContext}`
      : textoBase;
    const memoria = parsed.messages;

    if (attachmentAnalysis) {
      const respuesta = await responderConversacionFinanciera({
        texto,
        apiKey: aiApiKey,
        supabase,
        memoria,
        profileId: tenant.profileId,
        readOnlyAttachmentContext: attachmentAnalysis,
      });

      return virafiaResponse({ supabase, profileId: tenant.profileId, userText: textoBase, payload: {
        success: true,
        action: 'attachment-analysis',
        message: respuesta.message,
        attachments: attachments.map((file) => ({ name: file.name, type: file.type, size: file.size })),
      } });
    }

    if (esAbonoTarjetaCredito(text)) {
      const monto = extraerMontoAbonoTarjeta(text);

      if (!Number.isFinite(monto) || monto <= 0) {
        return virafiaResponse({ supabase, profileId: tenant.profileId, userText: text, payload: {
          success: true,
          action: 'reply',
          message: 'Entendí que es abono a tarjeta, pero no detecté el monto. Ejemplo: "hice un abono de 10k a la de crédito".',
        } });
      }

      const fechaMovimiento = extraerFechaMovimiento(text) || new Date();
      const payload = withProfile({
        concepto: 'Abono tarjeta de crédito',
        monto,
        tarjeta: 'Tarjeta de crédito',
        origen: 'Web',
        fecha: fechaMovimiento.toISOString(),
      }, tenant.profileId);
      const { data, error } = await supabase
        .from('abonos_tarjeta_credito')
        .insert([payload])
        .select('id, concepto, monto, tarjeta, origen, fecha')
        .single();

      if (error) {
        throw new Error(`No pude guardar el abono de tarjeta: ${error.message}`);
      }

      await logAuditEvent({
        supabase,
        request,
        profileId: tenant.profileId,
        actorEmail: tenant.email,
        action: 'dashboard_chat.card_payment',
        resourceType: 'abonos_tarjeta_credito',
        resourceId: data.id,
        metadata: { amount: monto },
      });
      await notifyDetectedMovement(supabase, { profileId: tenant.profileId, type: 'abono', concept: data.concepto, amount: Number(data.monto), category: 'Abono a tarjeta · no es gasto', source: 'Web', resourceId: data.id }).catch(console.error);

      return virafiaResponse({ supabase, profileId: tenant.profileId, userText: text, payload: {
        success: true,
        action: 'card-payment',
        data,
        message: `Abono registrado. $${formatearMonto(monto)} a tarjeta de crédito. Esto reduce deuda y no cuenta como gasto nuevo.`,
      } });
    }

    const multipleExpenses = await classifyMultipleExpenses(text, aiApiKey).catch(() => []);

    if (multipleExpenses.length > 1) {
      const rows = multipleExpenses.map((expense) => {
        const date = resolverFechaMovimiento(text, expense.fechaMovimiento, new Date(), false);

        return withProfile({
          concepto: expense.concepto,
          monto: expense.monto,
          categoria: categoriaParaGastos(expense.categoria),
          subcategoria: expense.subcategoria,
          origen: 'Web',
          fecha: date.toISOString(),
        }, tenant.profileId);
      });
      const { data, error } = await supabase
        .from('gastos')
        .insert(rows)
        .select('id, concepto, monto, categoria, subcategoria, origen, fecha');

      if (error) {
        throw new Error(`No pude guardar los gastos: ${error.message}`);
      }

      await logAuditEvent({
        supabase,
        request,
        profileId: tenant.profileId,
        actorEmail: tenant.email,
        action: 'dashboard_chat.multi_expense_create',
        resourceType: 'gastos',
        metadata: { count: data.length, total: data.reduce((sum, row) => sum + Number(row.monto || 0), 0) },
      });
      await notifyDetectedMovement(supabase, { profileId: tenant.profileId, type: 'gasto', concept: `${data.length} gastos registrados`, amount: data.reduce((sum, row) => sum + Number(row.monto || 0), 0), category: 'Movimientos múltiples', source: 'Web' }).catch(console.error);

      const total = data.reduce((sum, row) => sum + Number(row.monto || 0), 0);
      const summary = data.map((row) => `${row.concepto}: $${formatearMonto(row.monto)}`).join(' · ');

      return virafiaResponse({ supabase, profileId: tenant.profileId, userText: text, payload: {
        success: true,
        action: 'movement',
        data,
        message: `Registré ${data.length} gastos por $${formatearMonto(total)}. ${summary}`,
      } });
    }

    const respuesta = await responderConversacionFinanciera({
      texto,
      apiKey: aiApiKey,
      supabase,
      memoria,
      profileId: tenant.profileId,
    });

    if (respuesta.action === 'reply') {
      return virafiaResponse({ supabase, profileId: tenant.profileId, userText: text, payload: { success: true, action: 'reply', message: respuesta.message } });
    }

    const clasificacion = respuesta.movement;
    const fechaMovimiento = fechaMovimientoDesdeClasificacion(clasificacion.fechaMovimiento, text);

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
        throw new Error(`No pude guardar el ingreso: ${error.message}`);
      }

      await sincronizarPresupuestoMensual(supabase, fechaMovimiento, tenant.profileId);
      await logAuditEvent({
        supabase,
        request,
        profileId: tenant.profileId,
        actorEmail: tenant.email,
        action: 'dashboard_chat.movement_create',
        resourceType: 'ingresos',
        resourceId: data.id,
        metadata: { amount: clasificacion.monto, tipo: clasificacion.tipo },
      });
      await notifyDetectedMovement(supabase, { profileId: tenant.profileId, type: 'ingreso', concept: data.concepto, amount: Number(data.monto), source: 'Web', resourceId: data.id }).catch(console.error);

      return virafiaResponse({ supabase, profileId: tenant.profileId, userText: text, payload: { success: true, action: 'movement', data, message: `Registrado. ${respuesta.message} Ya recalculé tus bolsas.` } });
    }

    const categoriaFinal = categoriaParaGastos(clasificacion.categoria);
    const gastoPayload = withProfile({
      concepto: clasificacion.concepto,
      monto: clasificacion.monto,
      categoria: categoriaFinal,
      subcategoria: clasificacion.subcategoria,
      origen: 'Web',
      fecha: fechaMovimiento.toISOString(),
    }, tenant.profileId);
    const { data, error } = await supabase
      .from('gastos')
      .insert([gastoPayload])
      .select('id, concepto, monto, categoria, subcategoria, origen, fecha')
      .single();

    if (error) {
      throw new Error(`No pude guardar el gasto: ${error.message}`);
    }

    await logAuditEvent({
      supabase,
      request,
      profileId: tenant.profileId,
      actorEmail: tenant.email,
      action: 'dashboard_chat.movement_create',
      resourceType: 'gastos',
      resourceId: data.id,
      metadata: { amount: clasificacion.monto, categoria: clasificacion.categoria, subcategoria: clasificacion.subcategoria },
    });
    await notifyDetectedMovement(supabase, { profileId: tenant.profileId, type: 'gasto', concept: data.concepto, amount: Number(data.monto), category: `${clasificacion.categoria}/${clasificacion.subcategoria}`, source: 'Web', resourceId: data.id }).catch(console.error);

    return virafiaResponse({ supabase, profileId: tenant.profileId, userText: text, payload: {
      success: true,
      action: 'movement',
      data,
      lastExpenseId: data.id,
      message: `Registrado. ${respuesta.message}`,
    } });
  } catch (error: unknown) {
    if (error instanceof MovementInputError) {
      return NextResponse.json({
        success: true,
        action: 'reply',
        message: error.message,
      });
    }

    const supabase = getSupabaseServiceClient();
    await logErrorEvent({
      supabase,
      request,
      action: 'dashboard_chat.message',
      error,
    });
    const message = error instanceof Error ? error.message : 'Error desconocido.';

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
