import { extraerJson, generateGeminiText } from '@/lib/gemini';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type CategoriaFinanciera,
  type ClasificacionMovimiento,
  esComandoAyuda,
  extraerFechaMovimiento,
  parsearMovimientoEstructurado,
} from '@/lib/financial-core';

const categoriasValidas = ['Vida', 'Placeres', 'Futuro'];
const tiposValidos = ['gasto', 'ingreso'];
const herramientaProductivaRegex =
  /\b(openai|chatgpt|codex|twilio|fiverr|opus|google|google cloud|gcp|aws|azure|cloud|vercel|github|software|saas|notion|zoom|airtable|figma|canva|slack|discord|anthropic|claude|cursor|windsurf|replit|midjourney|runway|elevenlabs|perplexity|lovable|supabase|firebase|cloudflare|digitalocean|railway|render|heroku|zapier|make|linear|asana|trello|jira|microsoft|adobe|heygen|capcut|gemini)\b/;

function validarClasificacion(valor: unknown): ClasificacionMovimiento {
  const data = valor as Partial<ClasificacionMovimiento>;
  const categoria = data.categoria as CategoriaFinanciera;
  const tipo = data.tipo;
  const monto = Number(data.monto);

  if (!data.concepto || typeof data.concepto !== 'string') {
    throw new Error('La IA no devolvió un concepto válido.');
  }

  if (!Number.isFinite(monto) || monto <= 0) {
    throw new Error('La IA no devolvió un monto válido.');
  }

  if (!tipo || !tiposValidos.includes(tipo)) {
    throw new Error('La IA no devolvió un tipo válido.');
  }

  if (!categoria || !categoriasValidas.includes(categoria)) {
    throw new Error('La IA no devolvió una categoría válida.');
  }

  return {
    concepto: data.concepto.trim(),
    monto,
    tipo,
    categoria,
    subcategoria: typeof data.subcategoria === 'string' && data.subcategoria.trim() ? data.subcategoria.trim() : categoria,
    razon: typeof data.razon === 'string' ? data.razon.trim() : 'Clasificación generada por IA.',
    ...(typeof data.fechaMovimiento === 'string' && data.fechaMovimiento.trim() ? { fechaMovimiento: data.fechaMovimiento.trim() } : {}),
  };
}

function limpiarConcepto(texto: string) {
  const conceptoExplicito = extraerConceptoExplicito(texto);

  if (conceptoExplicito) {
    return conceptoExplicito;
  }

  return texto
    .replace(/\$?\s*\d+(?:[,.]\d{1,2})?\s*k\b/gi, '')
    .replace(/\$?\d+(?:[,.]\d{1,2})?/g, '')
    .replace(/\b(?:pesos?|mxn|m\.?n\.?)\b/gi, ' ')
    .replace(/\b(reg[ií]strame|registrame|registra|registrar|ingresos?|concepto|quincena|efectivo|tuve|tengo|pagu[eé]|pague|gast[eé]|gaste|gan[eé]|gane|cobr[eé]|cobre|recib[ií]|recibi|pagaron|depositaron|transfer[ií]|transferi|transferencia|spei|mand[eé]|mande|envi[eé]|envie|hice|met[ií]|meti|invert[ií]|inverti|aport[eé]|aporte|ayer|hoy|anoche|antier|anteayer|de|en|con|a|al|la|el|un|una|por|para)\b/gi, ' ')
    .replace(/\b(?:vida|placeres?|futuro)\b\s*$/gi, ' ')
    .replace(/[:"'“”‘’]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function limpiarConceptoExplicito(valor: string) {
  return valor
    .replace(/\$?\s*\d+(?:[,.]\d{1,2})?\s*k\b/gi, '')
    .replace(/\$?\d+(?:[,.]\d{1,2})?/g, '')
    .replace(/\b(?:pesos?|mxn|m\.?n\.?)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[:\-\s"'“”‘’]+|[:\-\s"'“”‘’]+$/g, '');
}

function extraerConceptoExplicito(texto: string) {
  const entreComillas = texto.match(/\bconcepto\s*[:=\-]?\s*["“”'‘’]([^"“”'‘’]+)["“”'‘’]/i);

  if (entreComillas?.[1]) {
    return limpiarConceptoExplicito(entreComillas[1]);
  }

  const despuesDeConcepto = texto.match(/\bconcepto\s*[:=\-]?\s+(.+?)(?:\s+(?:de|por|con)\s+\$?\s*\d|\s+\$?\s*\d|$)/i);

  if (despuesDeConcepto?.[1]) {
    return limpiarConceptoExplicito(despuesDeConcepto[1]);
  }

  return '';
}

function extraerMonto(texto: string) {
  const normalizado = texto.toLowerCase();
  const milesMatches = [...normalizado.matchAll(/\$?\s*(\d+(?:[,.]\d{1,2})?)\s*k\b/g)];
  const lastMilesMatch = milesMatches.at(-1);

  if (lastMilesMatch?.[1]) {
    return Number(lastMilesMatch[1].replace(/,/g, '')) * 1000;
  }

  const moneyMatches = [...normalizado.matchAll(/\$?\s*(\d+(?:[,.]\d{1,2})?)(?=\s*(?:pesos?|mxn|m\.?n\.?)\b|$|[,.!?])/g)];
  const contextualMatches = [...normalizado.matchAll(/\b(?:de|por|con|en)\s+\$?\s*(\d+(?:[,.]\d{1,2})?)\b/g)];
  const amountMatch = moneyMatches.at(-1) || contextualMatches.at(-1) || [...normalizado.matchAll(/\$?\s*(\d+(?:[,.]\d{1,2})?)/g)].at(-1);

  return amountMatch?.[1] ? Number(amountMatch[1].replace(/,/g, '')) : 0;
}

function clasificarPorReglas(texto: string): ClasificacionMovimiento | null {
  const normalizado = texto.toLowerCase();
  const monto = extraerMonto(texto);

  if (!Number.isFinite(monto) || monto <= 0) return null;

  const concepto = limpiarConcepto(texto) || 'Movimiento';
  const fechaDetectada = extraerFechaMovimiento(texto);
  const fechaMovimiento = fechaDetectada ? fechaDetectada.toISOString() : undefined;

  if (/\b(reg[ií]strame|registrame|registra|registrar|gan[eé]|gane|me pagaron|pagaron|cobr[eé]|cobre|recib[ií]|recibi|depositaron|dep[oó]sito|deposito|sueldo|salario|n[oó]mina|nomina|quincena|bono|freelance|ingreso|ingresos|utilidad|comisi[oó]n|comision)\b/.test(normalizado) && /\b(ingreso|ingresos|gan[eé]|gane|cobr[eé]|cobre|recib[ií]|recibi|pagaron|depositaron|sueldo|salario|n[oó]mina|nomina|quincena|bono|freelance)\b/.test(normalizado)) {
    return {
      concepto,
      monto,
      tipo: 'ingreso',
      categoria: 'Futuro',
      subcategoria: 'Ingreso',
      razon: 'Clasificado por regla local como ingreso del mes.',
      ...(fechaMovimiento ? { fechaMovimiento } : {}),
    };
  }

  if (/\b(cetes|inversi[oó]n|invert|acciones|etf|crypto|bitcoin|gbm|finsus)\b/.test(normalizado)) {
    return {
      concepto,
      monto,
      tipo: 'gasto',
      categoria: 'Futuro',
      subcategoria: 'Inversion',
      razon: 'Clasificado por regla local de inversión.',
      ...(fechaMovimiento ? { fechaMovimiento } : {}),
    };
  }

  if (/\b(emergencia|fondo de emergencia|escudo)\b/.test(normalizado)) {
    return {
      concepto,
      monto,
      tipo: 'gasto',
      categoria: 'Futuro',
      subcategoria: 'Emergencia',
      razon: 'Clasificado por regla local de fondo de emergencia.',
      ...(fechaMovimiento ? { fechaMovimiento } : {}),
    };
  }

  if (/\b(seguro|seguros|poliza|p[oó]liza)\b/.test(normalizado)) {
    return {
      concepto,
      monto,
      tipo: 'gasto',
      categoria: 'Futuro',
      subcategoria: 'Seguros',
      razon: 'Clasificado por regla local de seguros.',
      ...(fechaMovimiento ? { fechaMovimiento } : {}),
    };
  }

  if (/\b(gasolina|gasolinera|combustible|combusti|pemex|bp\b|shell|mobil|hidrosina|petro|centauro)\b/.test(normalizado)) {
    return {
      concepto,
      monto,
      tipo: 'gasto',
      categoria: 'Vida',
      subcategoria: 'Transporte',
      razon: 'Clasificado por regla local como gasto de transporte/combustible.',
      ...(fechaMovimiento ? { fechaMovimiento } : {}),
    };
  }

  if (herramientaProductivaRegex.test(normalizado)) {
    return {
      concepto,
      monto,
      tipo: 'gasto',
      categoria: 'Futuro',
      subcategoria: 'Herramientas Software',
      razon: 'Clasificado por regla local como herramienta/software productivo.',
      ...(fechaMovimiento ? { fechaMovimiento } : {}),
    };
  }

  if (/\b(caf[eé]|starbucks|taco|tacos|restaurante|cine|uber eats|rappi|salida|bar|concierto|viaje|hotel|mercado\s*pago|mercadopago|paypal|airbnb|booking|expedia|aerom[eé]xico|volaris|vivaaerobus|uber\b|didi\b|hike|senderismo|malinche)\b/.test(normalizado)) {
    return {
      concepto,
      monto,
      tipo: 'gasto',
      categoria: 'Placeres',
      subcategoria: /\b(caf[eé]|starbucks)\b/.test(normalizado)
        ? 'Cafe'
        : /\b(viaje|hotel|airbnb|booking|expedia|aerom[eé]xico|volaris|vivaaerobus|uber\b|didi\b|hike|senderismo|malinche)\b/.test(normalizado)
          ? 'Viajes'
          : 'Restaurantes',
      razon: 'Clasificado por regla local de consumo discrecional.',
      ...(fechaMovimiento ? { fechaMovimiento } : {}),
    };
  }

  return {
    concepto,
    monto,
    tipo: 'gasto',
    categoria: 'Placeres',
    subcategoria: 'Otros Placeres',
    razon: 'Clasificado por regla local: por criterio actual de Diego, todo gasto no productivo/inversión cae en Placeres.',
    ...(fechaMovimiento ? { fechaMovimiento } : {}),
  };
}

async function clasificarPorPreferenciaPersonal({
  texto,
  supabase,
  profileId,
}: {
  texto: string;
  supabase?: SupabaseClient | null;
  profileId?: string | null;
}): Promise<ClasificacionMovimiento | null> {
  if (!supabase || !profileId) return null;
  const monto = extraerMonto(texto);
  if (!Number.isFinite(monto) || monto <= 0) return null;

  const { data, error } = await supabase
    .from('classification_preferences')
    .select('matcher, categoria, subcategoria')
    .eq('profile_id', profileId)
    .order('updated_at', { ascending: false });

  if (error) return null;
  const normalizedText = normalizarComparacion(texto);
  const preference = (data || []).find((row) => {
    const matcher = normalizarComparacion(String(row.matcher || ''));
    return matcher.length >= 2 && normalizedText.includes(matcher);
  });
  if (!preference) return null;

  const fechaDetectada = extraerFechaMovimiento(texto);
  return {
    concepto: limpiarConcepto(texto) || String(preference.matcher),
    monto,
    tipo: 'gasto',
    categoria: preference.categoria as CategoriaFinanciera,
    subcategoria: String(preference.subcategoria || preference.categoria),
    razon: `Clasificado según tu preferencia guardada para ${preference.matcher}.`,
    ...(fechaDetectada ? { fechaMovimiento: fechaDetectada.toISOString() } : {}),
  };
}

function normalizarComparacion(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

async function obtenerCriteriosPersonales(supabase?: SupabaseClient | null, profileId?: string | null) {
  if (!supabase || !profileId) return null;
  const { data } = await supabase
    .from('financial_personalization_profiles')
    .select('occupation, industry, work_model, recurring_life_costs, work_essential_costs, valued_pleasures, recurring_investments, short_term_goals, medium_term_goals, long_term_goals')
    .eq('profile_id', profileId)
    .maybeSingle();
  return data || null;
}

export async function clasificarMovimientoFinanciero(
  texto: string,
  apiKey: string,
  context: { supabase?: SupabaseClient | null; profileId?: string | null } = {},
): Promise<ClasificacionMovimiento> {
  if (esComandoAyuda(texto)) {
    throw new Error(
      'Listo para registrar movimientos. Puedes escribir: pagué 250 de gasolina, 150 tacos, metí 1000 a cetes, o 500 fondo emergencia.'
    );
  }

  const criteriosPersonales = await obtenerCriteriosPersonales(context.supabase, context.profileId);

  const estructurado = parsearMovimientoEstructurado(texto);

  if (estructurado.ok && !criteriosPersonales) {
    if (estructurado.tipo === 'gasto' && herramientaProductivaRegex.test(estructurado.concepto.toLowerCase())) {
      const fechaDetectada = extraerFechaMovimiento(texto);

      return {
        concepto: estructurado.concepto,
        monto: estructurado.monto,
        tipo: 'gasto',
        categoria: 'Futuro',
        subcategoria: 'Herramientas Software',
        razon: 'Clasificado por regla local como herramienta/software productivo.',
        ...(fechaDetectada ? { fechaMovimiento: fechaDetectada.toISOString() } : {}),
      };
    }

    const fechaDetectada = extraerFechaMovimiento(texto);

    return {
      concepto: estructurado.concepto,
      monto: estructurado.monto,
      tipo: estructurado.tipo,
      categoria: estructurado.categoria,
      subcategoria: estructurado.subcategoria,
      razon: estructurado.razon,
      ...(fechaDetectada ? { fechaMovimiento: fechaDetectada.toISOString() } : {}),
    };
  }

  const personalPreference = await clasificarPorPreferenciaPersonal({ texto, ...context });
  if (personalPreference) return personalPreference;

  const clasificacionLocal = criteriosPersonales ? null : clasificarPorReglas(texto);

  if (clasificacionLocal) {
    return clasificacionLocal;
  }

  if (!apiKey) {
    throw new Error('Falta configurar GOOGLE_API_KEY o GEMINI_API_KEY para clasificar con IA.');
  }

  const prompt = `
{
  "role": "financial_transaction_classifier",
  "language_policy": {
    "instructions_language": "English",
    "output_language": "Spanish",
    "output_format": "raw_json_only",
    "no_markdown": true
  },
  "objective": "Extract and classify exactly one financial movement using the owner's personal financial criteria.",
  "owner_context": ${JSON.stringify(criteriosPersonales, null, 2)},
  "categories": {
    "Vida": {
      "description": "Necessary personal obligations listed in recurring_life_costs, or clearly essential living costs.",
      "examples": ["rent", "essential groceries", "school", "health", "essential transport"],
      "subcategories": ["Renta", "Servicios", "Super", "Transporte", "Salud", "Deudas", "Otros Vida"]
    },
    "Placeres": {
      "description": "Optional enjoyment, especially items matching valued_pleasures. Use as fallback for ambiguous discretionary purchases.",
      "examples": ["restaurants", "coffee", "Starbucks", "cinema", "travel", "concerts", "delivery", "bars", "entertainment", "supermarket", "gasoline", "phone", "utilities", "unknown stores"],
      "subcategories": ["Restaurantes", "Cafe", "Entretenimiento", "Viajes", "Ropa", "Delivery", "Otros Placeres"]
    },
    "Futuro": {
      "description": "Savings, protection, investment, goals, or expenses essential to the owner's work and income generation.",
      "examples": ["GBM", "CETES", "ETF", "stocks", "emergency fund", "insurance", "OpenAI", "Codex", "Twilio", "cloud/software tools"],
      "subcategories": ["Inversion", "Emergencia", "Seguros", "Ahorro", "Proyectos", "Herramientas Software", "Otros Futuro"]
    }
  },
  "classification_rules": [
    "Personal criteria override generic examples. Use recurring_life_costs for Vida, valued_pleasures for Placeres, and recurring_investments or work_essential_costs for Futuro.",
    "The same merchant can mean different things for different owners. Classify from owner_context and transaction concept, never from another user's preferences.",
    "If the message mentions salary, payroll, bonus, freelance, commission, 'gané', 'me pagaron', 'cobré', 'recibí' or income, set tipo='ingreso'.",
    "If it mentions CETES, GBM, inversión, invertí, stocks, ETF, crypto or patrimonial allocation, classify as Futuro/Inversion.",
    "If it mentions emergency fund, classify as Futuro/Emergencia.",
    "If it mentions insurance, classify as Futuro/Seguros.",
    "OpenAI, ChatGPT, Codex, Twilio, Fiverr, Opus, Claude, Cursor, GitHub, Vercel, Supabase, Cloudflare, Google Cloud, AWS, Notion, Zoom, Figma, Canva and similar work/software/cloud/AI tools are Futuro/Herramientas Software.",
    "Default an expense to Placeres/Otros Placeres only when owner_context does not identify it as essential living, productive work, savings, protection, or investment.",
    "If there is no clear amount, use 0. Do not invent an amount.",
    "If the user says hoy, ayer, anoche, antier, anteayer, or gives an explicit date such as 21 de junio, include fechaMovimiento as an ISO date for that date in America/Mexico_City.",
    "Do not include relative date words such as ayer or hoy in concepto.",
    "If tipo is income, categoria may be Futuro and subcategoria should be Ingreso.",
    "Return only valid raw JSON matching the output_schema."
  ],
  "user_message": ${JSON.stringify(texto)},
  "output_schema": {
    "concepto": "clean Spanish concept",
    "monto": 125.5,
    "tipo": "gasto | ingreso",
    "categoria": "Vida | Placeres | Futuro",
    "subcategoria": "Spanish subcategory",
    "razon": "brief Spanish reason",
    "fechaMovimiento": "optional ISO date string when the user gave a relative or explicit date"
  }
}
`;

  try {
    const raw = await generateGeminiText(apiKey, prompt);
    return validarClasificacion(JSON.parse(extraerJson(raw)));
  } catch (error) {
    const fallback = clasificarPorReglas(texto);

    if (fallback) return fallback;

    throw error;
  }
}
