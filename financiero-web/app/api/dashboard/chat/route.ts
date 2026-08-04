import { NextResponse } from 'next/server';
import { MovementInputError } from '@/lib/ai-classifier';
import { esAbonoTarjetaCredito, extraerMontoAbonoTarjeta } from '@/lib/card-payment-intent';
import { responderConversacionFinanciera } from '@/lib/conversation-agent';
import { extraerFechaMovimiento, formatearMonto, resolverFechaMovimiento } from '@/lib/financial-core';
import { extraerJson, generateGeminiText, getConfiguredLlmKey } from '@/lib/gemini';
import { logErrorEvent } from '@/lib/operational-events';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext } from '@/lib/tenant-context';
import { analyzeFinancialAttachments, extractFinancialAttachmentMovements, validateFinancialAttachments, type ExtractedFinancialMovement } from '@/lib/financial-attachment-analysis';
import { buildFinancialImportRow } from '@/lib/financial-import';
import { createFinancialMovementPreview } from '@/lib/financial-movement-preview';
import { appendVirafiaExchange } from '@/lib/virafia-conversation';
import { consumeAiCredit } from '@/lib/ai-credits';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

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
  const amountCount = (normalized.match(/\$?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?\s*(?:k|mil|pesos?|mxn)?\b/g) || []).length;

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
  "objective": "Extract every distinct expense from one Spanish user message. Support weekly/monthly batches with dozens of items. Return an empty array if the message is not asking to create multiple expenses.",
  "rules": [
    "Only extract expenses explicitly requested by the user.",
    "Amounts near dates are not amounts. Example: in 'google el 2 de julio de 500', amount is 500 and '2 de julio' is the date.",
    "If a date applies to all items, copy the same fechaMovimiento to every item.",
    "Resolve weekday-only dates (lunes, martes, miércoles, jueves, viernes, sábado, domingo) relative to current_date_mexico; if several weekdays are listed, assign each amount to its stated weekday.",
    "When a date omits the year, use the year from current_date_mexico. Never guess another year.",
    "Classify Uber, restaurants, food, travel and unknown discretionary expenses as Placeres.",
    "Classify productive software/tools such as Google, OpenAI, Vercel, Supabase, cloud, AI or SaaS as Emer/Inv/Herramientas Software (persisted internally as Futuro).",
    "Do not invent amounts or expenses.",
    "Return only raw JSON."
  ],
  "user_message": ${JSON.stringify(text)},
  "output_schema": {
    "expenses": [
      {
        "concepto": "clean merchant/concept",
        "monto": 904,
        "categoria": "Vida | Placeres | Emer/Inv (persisted internally as Futuro)",
        "subcategoria": "Spanish subcategory",
        "fechaMovimiento": "optional ISO date"
      }
    ]
  }
}
`;

  const raw = await generateGeminiText(apiKey, prompt, 'financial-import');
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
    .slice(0, 120);
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
    const rateLimit = checkRateLimit({ key: `dashboard-chat:${tenant.profileId}:${getClientIp(request)}`, limit: 30, windowMs: 60_000 });
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: 'Hiciste muchas solicitudes. Intenta nuevamente en un minuto.' }, { status: 429 });
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

    let attachmentAnalysis = '';

    const shouldUseScreenContext = screenContext && /\b(?:pantalla|vista|dashboard|tablero|aqui|aqu[ií]|esto|este|esta|ese|esa|cambia|corrige|edita|arregla|ayuda|explica)\b/i.test(text);
    const textoBase = text || 'Analiza los archivos adjuntos y explícame lo importante.';
    const texto = shouldUseScreenContext
      ? `${textoBase}\n\nContexto visible del dashboard: ${screenContext}`
      : textoBase;
    const memoria = parsed.messages;

    if (attachments.length) {
      await consumeAiCredit({ supabase, profileId: tenant.profileId });
      const extractedMovements = await extractFinancialAttachmentMovements({ files: attachments, userPrompt: texto }).catch(() => []);
      // Credit-card payments are intentionally excluded from the generic
      // expense/import writer. They must use the dedicated card-payment flow
      // so they never inflate spending.
      const rows = extractedMovements.filter((movement): movement is Omit<ExtractedFinancialMovement, 'movementType'> & { movementType: 'gasto' | 'ingreso' } => movement.movementType !== 'abono_tarjeta').map((movement, index) => buildFinancialImportRow({
        rowIndex: index + 1,
        movementType: movement.movementType as 'gasto' | 'ingreso',
        occurredAt: movement.occurredAt,
        description: movement.description,
        amount: movement.amount,
        category: movement.category,
        subcategory: movement.subcategory,
        currency: movement.currency,
        sourceData: { files: attachments.map((file) => file.name) },
      })).filter((row) => row.status === 'ready');
      if (rows.length) {
        const preview = await createFinancialMovementPreview({ supabase, profileId: tenant.profileId, channel: 'web', movements: rows.map((row) => ({ movementType: row.movementType, occurredAt: row.occurredAt!, description: row.description!, amount: row.amount!, category: row.category!, subcategory: row.subcategory || '', currency: row.currency })) });
        return virafiaResponse({ supabase, profileId: tenant.profileId, userText: textoBase, payload: { success: true, action: 'movement_preview', previewId: preview.id, data: preview.movements, message: `Encontré ${preview.movements.length} movimientos. Revísalos y confirma para registrarlos.` } });
      }
      // Non-movement document analysis is a separate AI action and is charged
      // only when extraction did not yield a reviewable movement preview.
      await consumeAiCredit({ supabase, profileId: tenant.profileId });
      attachmentAnalysis = await analyzeFinancialAttachments({ files: attachments, userPrompt: text });
    }

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
      const preview = await createFinancialMovementPreview({ supabase, profileId: tenant.profileId, channel: 'web', movements: [{ movementType: 'abono_tarjeta', occurredAt: fechaMovimiento.toISOString(), description: 'Abono tarjeta de crédito', amount: monto, category: 'Futuro', subcategory: 'Abono a tarjeta' }] });
      return virafiaResponse({ supabase, profileId: tenant.profileId, userText: text, payload: { success: true, action: 'movement_preview', previewId: preview.id, data: preview.movements, message: `Preparé el abono de $${formatearMonto(monto)}. Confírmalo para registrarlo; no cuenta como gasto nuevo.` } });
    }

    const multipleExpenses = await classifyMultipleExpenses(text, aiApiKey).catch(() => []);

    if (multipleExpenses.length > 1) {
      const extractedRows = multipleExpenses.map((expense, index) => buildFinancialImportRow({
        rowIndex: index + 1,
        movementType: 'gasto',
        occurredAt: resolverFechaMovimiento(text, expense.fechaMovimiento, new Date(), false).toISOString(),
        description: expense.concepto,
        amount: expense.monto,
        category: expense.categoria,
        subcategory: expense.subcategoria,
        currency: 'MXN',
        sourceData: { channel: 'in_app', input: 'text-or-voice' },
      }));
      const preview = await createFinancialMovementPreview({ supabase, profileId: tenant.profileId, channel: 'web', movements: extractedRows.map((row) => ({ movementType: row.movementType, occurredAt: row.occurredAt!, description: row.description!, amount: row.amount!, category: row.category!, subcategory: row.subcategory || '', currency: row.currency })) });
      return virafiaResponse({ supabase, profileId: tenant.profileId, userText: text, payload: { success: true, action: 'movement_preview', previewId: preview.id, data: preview.movements, message: `Preparé ${preview.movements.length} gastos para tu revisión. Confírmalos para registrarlos.` } });
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

    const preview = await createFinancialMovementPreview({ supabase, profileId: tenant.profileId, channel: 'web', movements: [{ movementType: clasificacion.tipo === 'ingreso' ? 'ingreso' : 'gasto', occurredAt: fechaMovimiento.toISOString(), description: clasificacion.concepto, amount: clasificacion.monto, category: clasificacion.categoria, subcategory: clasificacion.subcategoria }] });
    return virafiaResponse({ supabase, profileId: tenant.profileId, userText: text, payload: { success: true, action: 'movement_preview', previewId: preview.id, data: preview.movements, message: `${respuesta.message} Revísalo y confírmalo para registrarlo.` } });
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
