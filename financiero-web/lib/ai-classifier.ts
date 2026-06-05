import { extraerJson, generateGeminiText } from '@/lib/gemini';
import {
  type CategoriaFinanciera,
  type ClasificacionMovimiento,
  esComandoAyuda,
  parsearMovimientoEstructurado,
} from '@/lib/financial-core';

const categoriasValidas = ['Vida', 'Placeres', 'Futuro'];
const tiposValidos = ['gasto', 'ingreso'];

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
  };
}

function limpiarConcepto(texto: string) {
  return texto
    .replace(/\$?\s*\d+(?:[,.]\d{1,2})?\s*k\b/gi, '')
    .replace(/\$?\d+(?:[,.]\d{1,2})?/g, '')
    .replace(/\b(reg[ií]strame|registrame|registra|registrar|ingresos?|quincena|efectivo|pagu[eé]|pague|gast[eé]|gaste|gan[eé]|gane|cobr[eé]|cobre|recib[ií]|recibi|pagaron|depositaron|met[ií]|meti|invert[ií]|inverti|aport[eé]|aporte|de|en|a|al|la|el|un|una|por)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extraerMonto(texto: string) {
  const normalizado = texto.toLowerCase();
  const milesMatch = normalizado.match(/\$?\s*(\d+(?:[,.]\d{1,2})?)\s*k\b/);

  if (milesMatch?.[1]) {
    return Number(milesMatch[1].replace(/,/g, '')) * 1000;
  }

  const montoMatch = normalizado.match(/\$?\s*(\d+(?:[,.]\d{1,2})?)/);

  return montoMatch ? Number(montoMatch[1].replace(/,/g, '')) : 0;
}

function clasificarPorReglas(texto: string): ClasificacionMovimiento | null {
  const normalizado = texto.toLowerCase();
  const monto = extraerMonto(texto);

  if (!Number.isFinite(monto) || monto <= 0) return null;

  const concepto = limpiarConcepto(texto) || 'Movimiento';

  if (/\b(reg[ií]strame|registrame|registra|registrar|gan[eé]|gane|me pagaron|pagaron|cobr[eé]|cobre|recib[ií]|recibi|depositaron|dep[oó]sito|deposito|sueldo|salario|n[oó]mina|nomina|quincena|bono|freelance|ingreso|ingresos|utilidad|comisi[oó]n|comision|efectivo)\b/.test(normalizado) && /\b(ingreso|ingresos|gan[eé]|gane|cobr[eé]|cobre|recib[ií]|recibi|pagaron|depositaron|sueldo|salario|n[oó]mina|nomina|quincena|bono|freelance|efectivo)\b/.test(normalizado)) {
    return {
      concepto,
      monto,
      tipo: 'ingreso',
      categoria: 'Futuro',
      subcategoria: 'Ingreso',
      razon: 'Clasificado por regla local como ingreso del mes.',
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
    };
  }

  if (/\b(openai|chatgpt|codex|fiverr|opus|google|aws|vercel|github|software|notion|zoom|airtable|figma|canva|slack|discord|anthropic|claude|cursor|windsurf|replit|midjourney|runway|elevenlabs)\b/.test(normalizado)) {
    return {
      concepto,
      monto,
      tipo: 'gasto',
      categoria: 'Vida',
      subcategoria: 'Herramientas Trabajo',
      razon: 'Clasificado por regla local como herramienta mensual de trabajo.',
    };
  }

  if (/\b(caf[eé]|starbucks|taco|tacos|restaurante|cine|uber eats|rappi|salida|bar|concierto|viaje)\b/.test(normalizado)) {
    return {
      concepto,
      monto,
      tipo: 'gasto',
      categoria: 'Placeres',
      subcategoria: /\b(caf[eé]|starbucks)\b/.test(normalizado) ? 'Cafe' : 'Restaurantes',
      razon: 'Clasificado por regla local de consumo discrecional.',
    };
  }

  if (/\boxxo\b/.test(normalizado)) {
    if (/\b(recarga|telcel|at[&y]t|movistar|servicio|luz|agua|internet|dep[oó]sito|deposito|farmacia|medicina|gasolina)\b/.test(normalizado)) {
      return {
        concepto,
        monto,
        tipo: 'gasto',
        categoria: 'Vida',
        subcategoria: 'Costo de Vida',
        razon: 'Clasificado por regla local: OXXO con señal de servicio, salud o gasto necesario.',
      };
    }

    return {
      concepto,
      monto,
      tipo: 'gasto',
      categoria: 'Placeres',
      subcategoria: 'Otros Placeres',
      razon: 'Clasificado por regla local: OXXO sin señal de necesidad se trata como consumo discrecional.',
    };
  }

  if (/\b(renta|luz|agua|super|s[uú]per|despensa|gasolina|transporte|metro|camion|camión|deuda|doctor|medicina)\b/.test(normalizado)) {
    return {
      concepto,
      monto,
      tipo: 'gasto',
      categoria: 'Vida',
      subcategoria: /\b(gasolina|transporte|metro|camion|camión)\b/.test(normalizado) ? 'Transporte' : 'Otros Vida',
      razon: 'Clasificado por regla local de costo de vida.',
    };
  }

  return null;
}

export async function clasificarMovimientoFinanciero(texto: string, apiKey: string): Promise<ClasificacionMovimiento> {
  if (esComandoAyuda(texto)) {
    throw new Error(
      'Listo para registrar movimientos. Puedes escribir: pagué 250 de gasolina, 150 tacos, metí 1000 a cetes, o 500 fondo emergencia.'
    );
  }

  const estructurado = parsearMovimientoEstructurado(texto);

  if (estructurado.ok) {
    return {
      concepto: estructurado.concepto,
      monto: estructurado.monto,
      tipo: estructurado.tipo,
      categoria: estructurado.categoria,
      subcategoria: estructurado.subcategoria,
      razon: estructurado.razon,
    };
  }

  const clasificacionLocal = clasificarPorReglas(texto);

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
  "objective": "Extract exactly one financial movement from the user's natural-language message for Diego's 33/33/33 financial system.",
  "categories": {
    "Vida": {
      "description": "Required living or operating expenses.",
      "examples": ["rent", "utilities", "basic groceries", "necessary gas", "basic transport", "health", "debt", "work tools", "software subscriptions"],
      "subcategories": ["Renta", "Servicios", "Super", "Transporte", "Salud", "Deudas", "Herramientas Trabajo", "Otros Vida"]
    },
    "Placeres": {
      "description": "Lifestyle, leisure, optional or discretionary consumption.",
      "examples": ["restaurants", "coffee", "Starbucks", "cinema", "travel", "concerts", "delivery", "bars", "entertainment"],
      "subcategories": ["Restaurantes", "Cafe", "Entretenimiento", "Viajes", "Ropa", "Delivery", "Otros Placeres"]
    },
    "Futuro": {
      "description": "Investing, saving, emergency fund, insurance, patrimonial allocations.",
      "examples": ["GBM", "CETES", "ETF", "stocks", "emergency fund", "insurance", "savings projects"],
      "subcategories": ["Inversion", "Emergencia", "Seguros", "Ahorro", "Proyectos", "Otros Futuro"]
    }
  },
  "classification_rules": [
    "If the message mentions salary, payroll, bonus, freelance, commission, 'gané', 'me pagaron', 'cobré', 'recibí' or income, set tipo='ingreso'.",
    "If it mentions CETES, GBM, inversión, invertí, stocks, ETF, crypto or patrimonial allocation, classify as Futuro/Inversion.",
    "If it mentions emergency fund, classify as Futuro/Emergencia.",
    "If it mentions insurance, classify as Futuro/Seguros.",
    "OpenAI, ChatGPT, Codex, Fiverr, Opus, Claude, Cursor, GitHub, Vercel, Notion, Zoom, Figma, Canva and similar work/software tools are Vida/Herramientas Trabajo.",
    "OXXO is Placeres/Otros Placeres by default for Diego, unless the text clearly says it was a bill payment, phone top-up, medicine, pharmacy, gas or another necessary service.",
    "If there is no clear amount, use 0. Do not invent an amount.",
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
    "razon": "brief Spanish reason"
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
