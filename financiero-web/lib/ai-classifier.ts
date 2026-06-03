import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  type CategoriaFinanciera,
  type ClasificacionMovimiento,
  esComandoAyuda,
  parsearMovimientoEstructurado,
} from '@/lib/financial-core';

const categoriasValidas = ['Vida', 'Placeres', 'Futuro'];
const tiposValidos = ['gasto', 'ingreso'];

function extraerJson(texto: string) {
  return texto
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

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
    .replace(/\$?\d+(?:[,.]\d{1,2})?/g, '')
    .replace(/\b(pagu[eé]|pague|gast[eé]|gaste|gan[eé]|gane|cobr[eé]|cobre|recib[ií]|recibi|pagaron|depositaron|met[ií]|meti|invert[ií]|inverti|aport[eé]|aporte|de|en|a|al|la|el|un|una|por)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clasificarPorReglas(texto: string): ClasificacionMovimiento | null {
  const normalizado = texto.toLowerCase();
  const montoMatch = normalizado.match(/\$?\s*(\d+(?:[,.]\d{1,2})?)/);
  const monto = montoMatch ? Number(montoMatch[1].replace(/,/g, '')) : 0;

  if (!Number.isFinite(monto) || monto <= 0) return null;

  const concepto = limpiarConcepto(texto) || 'Movimiento';

  if (/\b(gan[eé]|gane|me pagaron|pagaron|cobr[eé]|cobre|recib[ií]|recibi|depositaron|dep[oó]sito|deposito|sueldo|salario|n[oó]mina|nomina|bono|freelance|ingreso|ingresos|utilidad|comisi[oó]n|comision)\b/.test(normalizado)) {
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

  const ai = new GoogleGenerativeAI(apiKey);
  const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `
Eres el clasificador financiero personal de Diego para su regla 33/33/33.

Tu trabajo: leer una frase natural y extraer un movimiento financiero.

Categorías principales:
- Vida: gastos obligatorios o necesarios para vivir/operar: renta, servicios, luz, agua, súper básico, despensa, gasolina necesaria, transporte básico, deudas obligatorias, salud necesaria.
- Placeres: estilo de vida, ocio y consumo discrecional: restaurantes, tacos por gusto, cafés, Starbucks, cine, viajes, conciertos, ropa por gusto, delivery, salidas, bares, entretenimiento.
- Futuro: inversión, ahorro, fondo de emergencia, seguros, CETES, acciones, crypto, aportaciones patrimoniales, fondo de emergencia, ahorro para proyectos.

Subcategorías sugeridas:
- Vida: Renta, Servicios, Super, Transporte, Salud, Deudas, Otros Vida.
- Placeres: Restaurantes, Cafe, Entretenimiento, Viajes, Ropa, Delivery, Otros Placeres.
- Futuro: Inversion, Emergencia, Seguros, Ahorro, Proyectos, Otros Futuro.

Reglas:
- Si menciona sueldo, salario, nómina, bono, freelance, comisión, "gané", "me pagaron", "cobré", "recibí" o "ingreso", clasifica como tipo = "ingreso".
- Si menciona "cetes", "inversión", "invertí", "acciones", "ETF", "crypto", clasifica como Futuro / Inversion.
- Si menciona "emergencia", "fondo de emergencia", "escudo", clasifica como Futuro / Emergencia.
- Si menciona "seguro", clasifica como Futuro / Seguros.
- Si menciona OpenAI, ChatGPT, Codex, Fiverr, Opus, Claude, Cursor, GitHub, Vercel, Notion, Zoom, Figma, Canva u otras herramientas de trabajo/software, clasifica como Vida / Herramientas Trabajo.
- Si no hay monto claro, no inventes: usa 0.
- Si es ingreso, tipo = "ingreso"; si es gasto o aportación de dinero, tipo = "gasto".
- Responde solo JSON crudo, sin markdown.

Frase: "${texto}"

Formato exacto:
{
  "concepto": "concepto limpio",
  "monto": 125.50,
  "tipo": "gasto",
  "categoria": "Vida",
  "subcategoria": "Transporte",
  "razon": "breve explicación"
}
`;

  try {
    const response = await model.generateContent(prompt);
    const raw = response.response.text();
    return validarClasificacion(JSON.parse(extraerJson(raw)));
  } catch (error) {
    const fallback = clasificarPorReglas(texto);

    if (fallback) return fallback;

    throw error;
  }
}
