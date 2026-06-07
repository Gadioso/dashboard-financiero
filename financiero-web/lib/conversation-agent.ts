import type { SupabaseClient } from '@supabase/supabase-js';
import { clasificarMovimientoFinanciero } from '@/lib/ai-classifier';
import { sincronizarPresupuestoMensual } from '@/lib/budget-sync';
import { guardarPreferenciaClasificacion } from '@/lib/classification-preferences';
import { extraerJson, generateGeminiText } from '@/lib/gemini';
import {
  calcularGastadoPorBolsa,
  calcularIngresosMes,
  calcularPresupuestoTresTercios,
  calcularPromedioIngresosUltimos3Meses,
  calcularRestantesPorBolsa,
  formatearFecha,
  formatearMonto,
  nombreBolsa,
  type Gasto,
  type Ingreso,
} from '@/lib/financial-core';

type Intent =
  | { type: 'help' }
  | { type: 'category-total'; text: string }
  | { type: 'update-category'; idPrefix?: string; category: string }
  | { type: 'summary'; text: string }
  | { type: 'list'; text: string }
  | { type: 'delete-request'; text: string }
  | { type: 'delete-confirm'; idPrefix: string }
  | { type: 'movement'; text: string }
  | { type: 'conversation'; text: string };

type MovementResult = Awaited<ReturnType<typeof clasificarMovimientoFinanciero>>;
type TipoListado = 'ingresos' | 'gastos' | 'movimientos';
type MovimientoEliminable =
  | ({ kind: 'gasto' } & Gasto)
  | ({ kind: 'ingreso' } & Ingreso);

type MensajeMemoria = {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  metadata?: {
    lastExpenseId?: string;
  };
};

const intentTypes = ['help', 'category-total', 'update-category', 'summary', 'list', 'delete-request', 'delete-confirm', 'movement', 'conversation'] as const;

const ayuda =
  [
    'Soy tu asistente financiero. Puedes hablarme normal:',
    '- Registrar: "pagué 250 de gasolina", "150 tacos", "metí 1000 a cetes", "gané 60000 de sueldo".',
    '- Consultar: "cómo voy este mes", "cuánto me queda para placeres", "cuánto tengo que invertir".',
    '- Ver: "últimos gastos", "últimos ingresos", "últimos movimientos", "gastos de placeres de junio".',
    '- Eliminar: "borra Starbucks", "borra ingreso Aire" y luego "confirmar eliminar g73" o "confirmar eliminar i55".',
  ].join('\n');

const mesesPorNombre: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};

function parecePreguntaONotaSinRegistro(normalizado: string) {
  return /\b(?:de\s+d[oó]nde|d[oó]nde|por\s+qu[eé]|porque|sacas?|sale|sali[oó]|esos?|esas?|eso|explica|aclara|no\s+entiendo|sin\s+sentido)\b/.test(normalizado);
}

function limpiarFormatoTelegram(texto: string) {
  return texto
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/^\s*[*•]\s+/gm, '- ')
    .trim();
}

function detectarIntent(texto: string): Intent {
  const normalizado = texto.trim().toLowerCase();

  if (!normalizado || normalizado === '/start' || normalizado === 'start' || normalizado === 'hola' || normalizado === 'ayuda' || normalizado === '/help') {
    return { type: 'help' };
  }

  if (/\d/.test(normalizado) && esRegistroExplicito(normalizado)) {
    return { type: 'movement', text: texto };
  }

  const actualizarCategoriaMatch = normalizado.match(/\b(?:cambia|cambiar|corrige|corregir|clasifica|clasificar|pon|poner)\s+(?:el\s+)?(?:gasto\s+)?([a-z0-9-]{1,})\s+(?:a|como|en)\s+(vida|costo\s+de\s+vida|placeres?|placer|futuro|inversi[oó]n|inversion|ahorro|emergencia)\b/i);

  if (actualizarCategoriaMatch?.[1] && actualizarCategoriaMatch?.[2]) {
    return { type: 'update-category', idPrefix: actualizarCategoriaMatch[1], category: actualizarCategoriaMatch[2] };
  }

  const actualizarUltimoMatch = normalizado.match(/\b(?:cambia|cambiar|corrige|corregir|clasifica|clasificar|pon|poner)\s*(?:lo|la|ese|esa|eso|este|esta|el\s+gasto|el\s+movimiento)?\s*(?:a|como|en)\s+(vida|costo\s+de\s+vida|placeres?|placer|futuro|inversi[oó]n|inversion|ahorro|emergencia)\b/i);

  if (actualizarUltimoMatch?.[1]) {
    return { type: 'update-category', category: actualizarUltimoMatch[1] };
  }

  const confirmarEliminarMatch = normalizado.match(/\b(?:confirmar|confirma|confirmo|s[ií])\s+(?:eliminar|borrar)\s+(?:(?:gasto|ingreso|movimiento)\s+)?([a-z0-9-]{1,})\b/i);

  if (confirmarEliminarMatch?.[1]) {
    return { type: 'delete-confirm', idPrefix: confirmarEliminarMatch[1] };
  }

  if (/\b(?:elimina|eliminar|borra|borrar|quita|quitar)\b/.test(normalizado)) {
    return { type: 'delete-request', text: texto };
  }

  if (/\b(?:cu[aá]nto\s+)?(?:he\s+)?gast(?:e|é|ado|aste)?\b/.test(normalizado) && detectarFiltroCategoria(normalizado)) {
    return { type: 'category-total', text: texto };
  }

  if (/\b(?:[uú]ltimos?(?:\s+\d{1,2})?\s+(?:gastos?|ingresos?|movimientos?)|ver\s+(?:gastos?|ingresos?|movimientos?)|mu[eé]strame\s+(?:gastos?|ingresos?|movimientos?)|lista\s+(?:gastos?|ingresos?|movimientos?)|(?:gastos?|ingresos?|movimientos?)\s+de\s+(?:vida|placeres|futuro|inversi[oó]n|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre))\b/.test(normalizado)) {
    return { type: 'list', text: texto };
  }

  if (/\b(c[oó]mo voy|resumen|balance|estatus|estado|cu[aá]nto llevo|cu[aá]nto he gastado|cu[aá]nto gast[eé]|cu[aá]nto me queda|cu[aá]nto queda|presupuesto|bolsas?|invertir|inversi[oó]n|futuro|placeres|vida)\b/.test(normalizado)) {
    return { type: 'summary', text: texto };
  }

  if (parecePreguntaONotaSinRegistro(normalizado)) {
    return { type: 'conversation', text: texto };
  }

  if (/\d/.test(normalizado)) {
    return { type: 'movement', text: texto };
  }

  return { type: 'conversation', text: texto };
}

function normalizarIntentIA(valor: unknown, textoOriginal: string): Intent | null {
  const data = valor as { type?: string; idPrefix?: string; category?: string };

  if (!data?.type || !intentTypes.includes(data.type as Intent['type'])) return null;

  if (data.type === 'delete-confirm') {
    return data.idPrefix ? { type: 'delete-confirm', idPrefix: data.idPrefix } : null;
  }

  if (data.type === 'update-category') {
    return data.category ? { type: 'update-category', idPrefix: data.idPrefix || undefined, category: data.category } : null;
  }

  return { type: data.type as Exclude<Intent['type'], 'help' | 'delete-confirm'>, text: textoOriginal } as Intent;
}

function esRegistroExplicito(normalizado: string) {
  return /\b(?:pagu[eé]|pag[ué]é|gast[eé]|gaste|compr[eé]|compre|met[ií]|meti|invert[ií]|inverti|aport[eé]|aporte|gan[eé]|gane|cobr[eé]|cobre|recib[ií]|recibi|me\s+pagaron|depositaron|reg[ií]strame|registrame|registra|registrar|agrega|agregar|a[nñ]ade|añade)\b/.test(normalizado);
}

function protegerIntentAmbiguo(intent: Intent, texto: string): Intent {
  const normalizado = texto.toLowerCase();

  if (/\d/.test(normalizado) && esRegistroExplicito(normalizado)) {
    return { type: 'movement', text: texto };
  }

  if (intent.type === 'movement' && !esRegistroExplicito(normalizado)) {
    return { type: 'conversation', text: texto };
  }

  return intent;
}

async function detectarIntentInteligente(texto: string, apiKey: string): Promise<Intent> {
  const fallback = protegerIntentAmbiguo(detectarIntent(texto), texto);

  if (!apiKey) return fallback;

  const normalizado = texto.trim().toLowerCase();

  if (!normalizado || normalizado === '/start' || normalizado === 'start') return fallback;

  if (['help', 'list', 'delete-request', 'delete-confirm', 'update-category', 'movement'].includes(fallback.type)) {
    return fallback;
  }

  const prompt = `
{
  "role": "telegram_financial_intent_router",
  "language_policy": {
    "instructions_language": "English",
    "output_format": "raw_json_only",
    "no_markdown": true
  },
  "objective": "Classify the user's Telegram message into exactly one intent before any database write happens.",
  "allowed_intents": {
    "help": "Greeting, help, start or onboarding.",
    "summary": "Balance, budget, monthly/range overview, how am I doing, how much remains, how much to invest, how much to reserve.",
    "category-total": "How much was spent in one specific bucket/category such as Placeres, Vida or Futuro.",
    "update-category": "User wants to correct/reclassify an existing expense to Vida, Placeres or Futuro.",
    "list": "Request to list latest expenses, incomes, movements or entries by category/month.",
    "delete-request": "User asks to delete/remove something, but has not confirmed with an ID.",
    "delete-confirm": "User confirms deletion with a short ID prefix, usually starting with g for gastos or i for ingresos.",
    "movement": "User explicitly wants to register a new income, expense or investment.",
    "conversation": "Explanations, opinions, follow-ups, why/from where questions, ambiguity, or reasoning."
  },
  "critical_rules": [
    "Questions like 'de dónde sale', 'por qué', 'qué significa', 'eso', 'esos 92k', 'sin sentido' are conversation even if they include numbers.",
    "Use movement when there is an amount and an explicit registration verb: pagar, gastar, comprar, ganar, cobrar, recibir, invertir, aportar, agregar, registrar, regístrame.",
    "'Regístrame $15k de ingresos de quincena de Aire' is movement, tipo ingreso.",
    "'15k ingresos quincena Aire' is movement, tipo ingreso.",
    "A number inside a question is not a movement.",
    "'y todo mayo', 'en todo este mes de mayo', 'pero en todo enero' are summary.",
    "'de enero a mayo', 'enero para acá', 'todo el año', 'desde enero' are summary.",
    "'cuánto gasté en placeres en enero' is category-total.",
    "'cambiar abc12345 a vida', 'corrige abc12345 como placeres', 'pon abc12345 en futuro' are update-category.",
    "'cambialo a vida', 'cámbialo a placer', 'ponlo en futuro' are update-category without idPrefix; they refer to the last expense in memory.",
    "Return only valid raw JSON matching output_schema."
  ],
  "user_message": ${JSON.stringify(texto)},
  "output_schema": {
    "type": "help | summary | category-total | list | delete-request | delete-confirm | movement | conversation",
    "idPrefix": "short movement id when type is delete-confirm, short expense id when type is update-category, otherwise empty string",
    "category": "Vida | Placeres | Futuro when type is update-category, otherwise empty string"
  }
}
`;

  try {
    const raw = await generateGeminiText(apiKey, prompt);
    const parsed = JSON.parse(extraerJson(raw));
    const intent = normalizarIntentIA(parsed, texto);

    return protegerIntentAmbiguo(intent || fallback, texto);
  } catch {
    return fallback;
  }
}

function detectarFiltroCategoria(texto: string) {
  const normalizado = texto.toLowerCase();

  if (normalizado.includes('placer') || /\b(salidas?|restaurantes?|caf[eé]s?|ocio)\b/.test(normalizado)) return 'Placeres';
  if (/\b(vida|costo de vida|herramientas?|telcel|servicios?|super|s[uú]per)\b/.test(normalizado)) return 'Vida';
  if (/\b(futuro|inversi[oó]n|inversiones|invertido|gbm|cetes|emergencia|seguros?)\b/.test(normalizado)) return 'Seguros';

  return null;
}

function normalizarCategoriaCorreccion(texto: string) {
  const normalizado = texto.toLowerCase();

  if (normalizado.includes('placer')) {
    return { categoria: 'Placeres' as const, subcategoria: 'Otros Placeres' };
  }

  if (normalizado.includes('futuro') || normalizado.includes('inversi') || normalizado.includes('ahorro') || normalizado.includes('emergencia')) {
    return { categoria: 'Seguros' as const, subcategoria: normalizado.includes('emergencia') ? 'Emergencia' : 'Inversion' };
  }

  if (normalizado.includes('vida') || normalizado.includes('costo')) {
    return { categoria: 'Vida' as const, subcategoria: 'Costo de Vida' };
  }

  return null;
}

async function actualizarCategoriaGasto(supabase: SupabaseClient, idPrefix: string, categoriaTexto: string) {
  const categoria = normalizarCategoriaCorreccion(categoriaTexto);

  if (!categoria) {
    return 'No entendí la categoría. Usa: vida, placeres o futuro.';
  }

  const { data, error } = await supabase
    .from('gastos')
    .select('id, concepto, monto, categoria, subcategoria, origen, fecha')
    .order('fecha', { ascending: false })
    .limit(300);

  if (error) {
    throw new Error(`No pude buscar el gasto para corregir: ${error.message}`);
  }

  const matches = ((data || []) as Gasto[]).filter((gasto) => String(gasto.id).toLowerCase().startsWith(idPrefix.toLowerCase()));

  if (!matches.length) {
    return `No encontré ningún gasto con ID corto "${idPrefix}". Revisa el ID del mensaje de Santander o escribe "últimos gastos".`;
  }

  if (matches.length > 1) {
    return [
      `Ese ID corto coincide con ${matches.length} gastos. Usa más caracteres del ID:`,
      ...matches.slice(0, 5).map((gasto) => `- ${describirGasto(gasto)}`),
    ].join('\n');
  }

  const gasto = matches[0];
  const { data: actualizado, error: updateError } = await supabase
    .from('gastos')
    .update({
      categoria: categoria.categoria,
      subcategoria: categoria.subcategoria,
    })
    .eq('id', gasto.id)
    .select('id, concepto, monto, categoria, subcategoria, origen, fecha')
    .single();

  if (updateError) {
    throw new Error(`No pude corregir el gasto: ${updateError.message}`);
  }

  const categoriaPreferencia = categoria.categoria === 'Seguros' ? 'Futuro' : categoria.categoria;
  await guardarPreferenciaClasificacion({
    supabase,
    concepto: gasto.concepto,
    categoria: categoriaPreferencia,
    subcategoria: categoria.subcategoria,
  });

  return [
    'Listo, corregí la categoría.',
    `Antes: ${nombreBolsa(String(gasto.categoria))}${gasto.subcategoria ? ` / ${gasto.subcategoria}` : ''}.`,
    `Ahora: ${nombreBolsa(String(actualizado.categoria))}${actualizado.subcategoria ? ` / ${actualizado.subcategoria}` : ''}.`,
    describirGasto(actualizado as Gasto),
  ].join('\n');
}

function obtenerUltimoGastoId(memoria: MensajeMemoria[]) {
  const mensajeConMetadata = [...memoria].reverse().find((mensaje) => mensaje.metadata?.lastExpenseId);

  if (mensajeConMetadata?.metadata?.lastExpenseId) {
    return mensajeConMetadata.metadata.lastExpenseId;
  }

  const mensajeConId = [...memoria].reverse().find((mensaje) => /\bID:\s*([a-z0-9-]{4,})\b/i.test(mensaje.content));

  return mensajeConId?.content.match(/\bID:\s*([a-z0-9-]{4,})\b/i)?.[1];
}

async function totalGastosPorCategoria(supabase: SupabaseClient, texto: string) {
  const rango = rangoMesDesdeTexto(texto);
  const categoria = detectarFiltroCategoria(texto);

  if (!categoria) {
    return 'Dime qué bolsa quieres revisar: Vida, Placeres o Futuro.';
  }

  const { data, error } = await supabase
    .from('gastos')
    .select('id, concepto, monto, categoria, subcategoria, origen, fecha')
    .gte('fecha', rango.inicio)
    .lt('fecha', rango.fin)
    .eq('categoria', categoria);

  if (error) {
    throw new Error(`No pude consultar gastos de ${nombreBolsa(categoria)}: ${error.message}`);
  }

  const gastos = (data || []) as Gasto[];
  const total = gastos.reduce((sum, gasto) => sum + Number(gasto.monto || 0), 0);

  if (!gastos.length) {
    return `En ${rango.etiqueta} no encontré gastos de ${nombreBolsa(categoria)}.`;
  }

  const topGastos = gastos
    .sort((a, b) => Number(b.monto || 0) - Number(a.monto || 0))
    .slice(0, 5)
    .map((gasto) => `- ${formatearFecha(gasto.fecha)} · $${formatearMonto(gasto.monto)} · ${gasto.concepto}`);

  return [
    `En ${rango.etiqueta} gastaste $${formatearMonto(total)} en ${nombreBolsa(categoria)}.`,
    `Movimientos: ${gastos.length}.`,
    ...topGastos,
  ].join('\n');
}

function limpiarBusquedaEliminacion(texto: string) {
  return texto
    .toLowerCase()
    .replace(/\b(?:elimina|eliminar|borra|borrar|quita|quitar|gasto|gastos|egreso|egresos|ingreso|ingresos|entrada|entradas|movimiento|movimientos|de|del|la|el|un|una|por|favor)\b/g, ' ')
    .replace(/\$?\d+(?:[,.]\d{1,2})?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function idCorto(id: string | number) {
  return String(id).slice(0, 8);
}

function describirGasto(gasto: Gasto) {
  return `${idCorto(gasto.id)} · ${formatearFecha(gasto.fecha)} · $${formatearMonto(gasto.monto)} · ${gasto.concepto} · ${nombreBolsa(String(gasto.categoria))}${gasto.subcategoria ? ` / ${gasto.subcategoria}` : ''}`;
}

function ordenarPorFechaDesc<T extends { fecha: string }>(movimientos: T[]) {
  return [...movimientos].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
}

function agruparGastosPorBolsa(gastos: Gasto[]) {
  return ['Vida', 'Placeres', 'Futuro'].map((bolsa) => {
    const movimientos = gastos.filter((gasto) => nombreBolsa(String(gasto.categoria)) === bolsa);

    return {
      bolsa,
      total: movimientos.reduce((sum, gasto) => sum + Number(gasto.monto || 0), 0),
      movimientos: ordenarPorFechaDesc(movimientos).slice(0, 12).map((gasto) => ({
        fecha: formatearFecha(gasto.fecha),
        concepto: gasto.concepto,
        monto: Number(gasto.monto || 0),
        subcategoria: gasto.subcategoria || null,
        origen: gasto.origen,
      })),
    };
  });
}

function etiquetaMes(fecha: string | Date) {
  const date = new Date(fecha);
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
}

function etiquetaPeriodo({
  startYear,
  startMonthIndex,
  endYear,
  endMonthIndex,
}: {
  startYear: number;
  startMonthIndex: number;
  endYear: number;
  endMonthIndex: number;
}) {
  const inicio = `${String(startMonthIndex + 1).padStart(2, '0')}/${startYear}`;
  const fin = `${String(endMonthIndex + 1).padStart(2, '0')}/${endYear}`;

  return inicio === fin ? inicio : `${inicio} a ${fin}`;
}

function rangoMesDesdeTexto(texto: string) {
  const rangoRelativo = detectarRangoRelativo(texto);

  if (rangoRelativo) return rangoRelativo;

  const { year, monthIndex } = detectarMesConsulta(texto);

  return {
    inicio: new Date(Date.UTC(year, monthIndex, 1)).toISOString(),
    fin: new Date(Date.UTC(year, monthIndex + 1, 1)).toISOString(),
    etiqueta: `${String(monthIndex + 1).padStart(2, '0')}/${year}`,
  };
}

function fechaActualMexicoUTC() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
}

function detectarRangoRelativo(texto: string) {
  const normalizado = texto.toLowerCase();
  const hoy = fechaActualMexicoUTC();
  let offset: number | null = null;
  let etiqueta = '';

  if (/\b(ayer|anoche|de\s+ayer|solo\s+los\s+de\s+ayer)\b/.test(normalizado)) {
    offset = -1;
    etiqueta = 'ayer';
  } else if (/\b(hoy|de\s+hoy|solo\s+los\s+de\s+hoy)\b/.test(normalizado)) {
    offset = 0;
    etiqueta = 'hoy';
  }

  if (offset === null) return null;

  const inicio = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() + offset));
  const fin = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() + offset + 1));

  return {
    inicio: inicio.toISOString(),
    fin: fin.toISOString(),
    etiqueta,
  };
}

function detectarMesConsulta(texto: string) {
  const ahora = new Date();
  const normalizado = texto.toLowerCase();
  const mesEncontrado = Object.entries(mesesPorNombre).find(([nombre]) => normalizado.includes(nombre));
  const yearMatch = normalizado.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : ahora.getUTCFullYear();
  const monthIndex = mesEncontrado ? mesEncontrado[1] : ahora.getUTCMonth();

  return { year, monthIndex };
}

function detectarPeriodoConsulta(texto: string) {
  const rangoRelativo = detectarRangoRelativo(texto);

  if (rangoRelativo) {
    const inicio = new Date(rangoRelativo.inicio);

    return {
      inicio: rangoRelativo.inicio,
      fin: rangoRelativo.fin,
      etiqueta: rangoRelativo.etiqueta,
      year: inicio.getUTCFullYear(),
      monthIndex: inicio.getUTCMonth(),
      isRange: false,
    };
  }

  const ahora = new Date();
  const normalizado = texto.toLowerCase();
  const yearMatch = normalizado.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : ahora.getUTCFullYear();
  const mesesEncontrados = Object.entries(mesesPorNombre)
    .filter(([nombre]) => normalizado.includes(nombre))
    .map(([, indice]) => indice)
    .sort((a, b) => a - b);

  if (/\b(todo\s+el\s+a[nñ]o|en\s+el\s+a[nñ]o|anual|desde\s+enero|enero\s+para\s+ac[aá]|de\s+enero\s+para\s+ac[aá])\b/.test(normalizado)) {
    const endMonthIndex = mesesEncontrados.length ? Math.max(...mesesEncontrados) : ahora.getUTCMonth();

    return {
      inicio: new Date(Date.UTC(year, 0, 1)).toISOString(),
      fin: new Date(Date.UTC(year, endMonthIndex + 1, 1)).toISOString(),
      etiqueta: etiquetaPeriodo({ startYear: year, startMonthIndex: 0, endYear: year, endMonthIndex }),
      year,
      monthIndex: endMonthIndex,
      isRange: endMonthIndex !== 0,
    };
  }

  if (mesesEncontrados.length >= 2) {
    const startMonthIndex = Math.min(...mesesEncontrados);
    const endMonthIndex = Math.max(...mesesEncontrados);

    return {
      inicio: new Date(Date.UTC(year, startMonthIndex, 1)).toISOString(),
      fin: new Date(Date.UTC(year, endMonthIndex + 1, 1)).toISOString(),
      etiqueta: etiquetaPeriodo({ startYear: year, startMonthIndex, endYear: year, endMonthIndex }),
      year,
      monthIndex: endMonthIndex,
      isRange: startMonthIndex !== endMonthIndex,
    };
  }

  const { year: detectedYear, monthIndex } = detectarMesConsulta(texto);

  return {
    inicio: new Date(Date.UTC(detectedYear, monthIndex, 1)).toISOString(),
    fin: new Date(Date.UTC(detectedYear, monthIndex + 1, 1)).toISOString(),
    etiqueta: etiquetaPeriodo({ startYear: detectedYear, startMonthIndex: monthIndex, endYear: detectedYear, endMonthIndex: monthIndex }),
    year: detectedYear,
    monthIndex,
    isRange: false,
  };
}

function detectarTipoListado(texto: string): TipoListado {
  const normalizado = texto.toLowerCase();

  if (/\b(?:ingreso|ingresos|entrada|entradas|gan[eé]|cobr[eé]|depositaron|quincena|sueldo)\b/.test(normalizado)) return 'ingresos';
  if (/\b(?:gasto|gastos|egreso|egresos|gast[eé]|pag[ué]?[eé]?|compr[eé]|vida|placeres|futuro)\b/.test(normalizado)) return 'gastos';

  return 'movimientos';
}

function normalizarTextoBusqueda(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function textoIncluyeBusqueda(movimiento: MovimientoEliminable, busqueda: string) {
  if (!busqueda) return true;

  const campos = [
    movimiento.concepto || '',
    movimiento.kind,
    movimiento.kind === 'gasto' ? movimiento.categoria : movimiento.tipo || '',
    movimiento.kind === 'gasto' ? movimiento.subcategoria || '' : movimiento.tipo || '',
  ].join(' ');

  return normalizarTextoBusqueda(campos).includes(normalizarTextoBusqueda(busqueda));
}

function idCortoMovimiento(movimiento: MovimientoEliminable) {
  const prefijo = movimiento.kind === 'gasto' ? 'g' : 'i';

  return `${prefijo}${idCorto(movimiento.id)}`;
}

function describirIngreso(ingreso: Ingreso) {
  return `${idCortoMovimiento({ ...ingreso, kind: 'ingreso' })} · ${formatearFecha(ingreso.fecha)} · Ingreso · $${formatearMonto(ingreso.monto)} · ${ingreso.concepto || 'Ingreso'}${ingreso.tipo ? ` · ${ingreso.tipo}` : ''}`;
}

function describirMovimientoEliminable(movimiento: MovimientoEliminable) {
  if (movimiento.kind === 'ingreso') return describirIngreso(movimiento);

  return `${idCortoMovimiento(movimiento)} · ${formatearFecha(movimiento.fecha)} · Gasto · $${formatearMonto(movimiento.monto)} · ${movimiento.concepto} · ${nombreBolsa(String(movimiento.categoria))}${movimiento.subcategoria ? ` / ${movimiento.subcategoria}` : ''}`;
}

async function consultarMovimientosPeriodo({
  supabase,
  texto,
  limit,
}: {
  supabase: SupabaseClient;
  texto: string;
  limit: number;
}) {
  const rango = rangoMesDesdeTexto(texto);
  const categoria = detectarFiltroCategoria(texto);
  let gastosQuery = supabase
    .from('gastos')
    .select('id, concepto, monto, categoria, subcategoria, origen, fecha')
    .gte('fecha', rango.inicio)
    .lt('fecha', rango.fin)
    .order('fecha', { ascending: false })
    .limit(limit);

  if (categoria) {
    gastosQuery = gastosQuery.eq('categoria', categoria);
  }

  const [gastosResult, ingresosResult] = await Promise.all([
    gastosQuery,
    supabase
      .from('ingresos')
      .select('id, concepto, monto, tipo, fecha')
      .gte('fecha', rango.inicio)
      .lt('fecha', rango.fin)
      .order('fecha', { ascending: false })
      .limit(limit),
  ]);

  if (gastosResult.error) throw new Error(`No pude consultar gastos: ${gastosResult.error.message}`);
  if (ingresosResult.error) throw new Error(`No pude consultar ingresos: ${ingresosResult.error.message}`);

  const gastos = ((gastosResult.data || []) as Gasto[]).map((gasto) => ({ ...gasto, kind: 'gasto' as const }));
  const ingresos = ((ingresosResult.data || []) as Ingreso[]).map((ingreso) => ({ ...ingreso, kind: 'ingreso' as const }));

  return { rango, categoria, gastos, ingresos, movimientos: ordenarPorFechaDesc<MovimientoEliminable>([...gastos, ...ingresos]) };
}

async function listarMovimientos(supabase: SupabaseClient, texto: string) {
  const limitMatch = texto.match(/\b(\d{1,2})\b/);
  const limit = Math.min(Math.max(limitMatch ? Number(limitMatch[1]) : 10, 1), 20);
  const tipoListado = detectarTipoListado(texto);
  const { rango, categoria, gastos, ingresos, movimientos } = await consultarMovimientosPeriodo({ supabase, texto, limit });
  const resultados = tipoListado === 'ingresos' ? ingresos : tipoListado === 'gastos' ? gastos : movimientos;

  if (!resultados.length) {
    const etiquetaTipo = tipoListado === 'movimientos' ? 'movimientos' : tipoListado;
    return `No encontré ${etiquetaTipo}${categoria ? ` de ${nombreBolsa(categoria)}` : ''} en ${rango.etiqueta}.`;
  }

  const total = resultados.reduce((sum, movimiento) => sum + Number(movimiento.monto || 0), 0);
  const titulo = tipoListado === 'ingresos'
    ? 'ingresos'
    : tipoListado === 'gastos'
      ? `gastos${categoria ? ` de ${nombreBolsa(categoria)}` : ''}`
      : 'movimientos';

  return [
    `Últimos ${resultados.length} ${titulo} en ${rango.etiqueta}:`,
    ...resultados.map((movimiento) => `- ${describirMovimientoEliminable(movimiento)}`),
    `Total mostrado: $${formatearMonto(total)}.`,
    'Para borrar uno: "confirmar eliminar g73" o "confirmar eliminar i55".',
  ].join('\n');
}

async function buscarMovimientosParaEliminar(supabase: SupabaseClient, texto: string) {
  const rango = rangoMesDesdeTexto(texto);
  const busqueda = limpiarBusquedaEliminacion(texto);
  const montoMatch = texto.match(/\$?\s*(\d+(?:[,.]\d{1,2})?)/);
  const monto = montoMatch ? Number(montoMatch[1].replace(/,/g, '')) : null;
  const tipoListado = detectarTipoListado(texto);
  const { movimientos, gastos, ingresos } = await consultarMovimientosPeriodo({ supabase, texto, limit: 30 });
  const base = tipoListado === 'ingresos' ? ingresos : tipoListado === 'gastos' ? gastos : movimientos;

  const resultados = base.filter((movimiento) => {
    const coincideMonto = monto ? Math.abs(Number(movimiento.monto) - monto) < 0.01 : true;

    return coincideMonto && textoIncluyeBusqueda(movimiento, busqueda);
  });

  if (!resultados.length) {
    const etiquetaTipo = tipoListado === 'movimientos' ? 'movimiento' : tipoListado === 'ingresos' ? 'ingreso' : 'gasto';
    return [
      `No encontré un ${etiquetaTipo} para borrar${busqueda ? ` con "${busqueda}"` : ''} en ${rango.etiqueta}.`,
      'Prueba con "últimos movimientos" para ver IDs cortos.',
    ].join('\n');
  }

  if (resultados.length === 1) {
    const movimiento = resultados[0];

    return [
      'Encontré este movimiento:',
      `- ${describirMovimientoEliminable(movimiento)}`,
      `Para borrarlo escribe: confirmar eliminar ${idCortoMovimiento(movimiento)}`,
    ].join('\n');
  }

  return [
    `Encontré ${resultados.length} posibles movimientos. No borraré nada hasta que confirmes uno:`,
    ...resultados.slice(0, 10).map((movimiento) => `- ${describirMovimientoEliminable(movimiento)}`),
    'Para borrar uno: "confirmar eliminar g73" o "confirmar eliminar i55".',
  ].join('\n');
}

async function confirmarEliminarMovimiento(supabase: SupabaseClient, idPrefix: string) {
  const normalizado = idPrefix.toLowerCase().trim();
  const tipoSolicitado = normalizado.startsWith('g') ? 'gasto' : normalizado.startsWith('i') ? 'ingreso' : null;
  const idBuscado = tipoSolicitado ? normalizado.slice(1) : normalizado;
  const [gastosResult, ingresosResult] = await Promise.all([
    tipoSolicitado === 'ingreso'
      ? Promise.resolve({ data: [], error: null })
      : supabase.from('gastos').select('id, concepto, monto, categoria, subcategoria, origen, fecha').order('fecha', { ascending: false }).limit(300),
    tipoSolicitado === 'gasto'
      ? Promise.resolve({ data: [], error: null })
      : supabase.from('ingresos').select('id, concepto, monto, tipo, fecha').order('fecha', { ascending: false }).limit(300),
  ]);

  if (gastosResult.error) throw new Error(`No pude buscar gastos a eliminar: ${gastosResult.error.message}`);
  if (ingresosResult.error) throw new Error(`No pude buscar ingresos a eliminar: ${ingresosResult.error.message}`);

  const matches: MovimientoEliminable[] = [
    ...(((gastosResult.data || []) as Gasto[]).map((gasto) => ({ ...gasto, kind: 'gasto' as const }))),
    ...(((ingresosResult.data || []) as Ingreso[]).map((ingreso) => ({ ...ingreso, kind: 'ingreso' as const }))),
  ].filter((movimiento) => String(movimiento.id).toLowerCase().startsWith(idBuscado));

  if (!matches.length) {
    return `No encontré ningún movimiento con ID corto "${idPrefix}". Escribe "últimos movimientos" para ver IDs recientes.`;
  }

  if (matches.length > 1) {
    return [
      `Ese ID corto coincide con ${matches.length} movimientos. Usa más caracteres del ID:`,
      ...matches.slice(0, 5).map((movimiento) => `- ${describirMovimientoEliminable(movimiento)}`),
    ].join('\n');
  }

  const movimiento = matches[0];
  const tabla = movimiento.kind === 'ingreso' ? 'ingresos' : 'gastos';
  const { error: deleteError } = await supabase.from(tabla).delete().eq('id', movimiento.id);

  if (deleteError) {
    throw new Error(`No pude eliminar el ${movimiento.kind}: ${deleteError.message}`);
  }

  if (movimiento.kind === 'ingreso') {
    await sincronizarPresupuestoMensual(supabase, new Date(movimiento.fecha));
  }

  return [
    `${movimiento.kind === 'ingreso' ? 'Ingreso' : 'Gasto'} eliminado.`,
    describirMovimientoEliminable(movimiento),
    movimiento.kind === 'ingreso'
      ? 'Recalculé el presupuesto mensual de las bolsas.'
      : 'Ya debería reflejarse en el dashboard y en tus bolsas.',
  ].join('\n');
}

async function obtenerContextoConversacional(supabase: SupabaseClient, texto: string) {
  const periodo = detectarPeriodoConsulta(texto);
  const { year, monthIndex } = periodo;
  const month = String(monthIndex + 1).padStart(2, '0');
  const mesKey = `${year}-${month}`;
  const inicioPromedio = new Date(Date.UTC(year, monthIndex - 2, 1)).toISOString();

  const [
    { data: ingresos, error: errorIngresos },
    { data: gastos, error: errorGastos },
    { data: ingresosPromedio, error: errorIngresosPromedio },
    { data: gastosRecientes, error: errorRecientes },
    { data: ultimoIngreso, error: errorUltimoIngreso },
  ] =
    await Promise.all([
      supabase.from('ingresos').select('id, concepto, monto, tipo, fecha').gte('fecha', periodo.inicio).lt('fecha', periodo.fin),
      supabase.from('gastos').select('id, concepto, monto, categoria, subcategoria, origen, fecha').gte('fecha', periodo.inicio).lt('fecha', periodo.fin),
      supabase.from('ingresos').select('monto, fecha').gte('fecha', inicioPromedio).lt('fecha', periodo.fin),
      supabase
        .from('gastos')
        .select('id, concepto, monto, categoria, subcategoria, origen, fecha')
        .gte('fecha', periodo.inicio)
        .lt('fecha', periodo.fin)
        .order('fecha', { ascending: false })
        .limit(8),
      supabase.from('ingresos').select('monto, fecha').lt('fecha', periodo.fin).order('fecha', { ascending: false }).limit(1).maybeSingle(),
    ]);

  if (errorIngresos) throw new Error(`No pude consultar ingresos: ${errorIngresos.message}`);
  if (errorGastos) throw new Error(`No pude consultar gastos: ${errorGastos.message}`);
  if (errorIngresosPromedio) throw new Error(`No pude consultar promedio de ingresos: ${errorIngresosPromedio.message}`);
  if (errorRecientes) throw new Error(`No pude consultar gastos recientes: ${errorRecientes.message}`);
  if (errorUltimoIngreso) throw new Error(`No pude consultar el último ingreso: ${errorUltimoIngreso.message}`);

  const ingresosMes = calcularIngresosMes((ingresos || []) as Ingreso[]);
  const promedioIngresos3Meses = calcularPromedioIngresosUltimos3Meses({
    ingresos: (ingresosPromedio || []) as Ingreso[],
    mesActivo: mesKey,
  });
  const presupuestoMes = calcularPresupuestoTresTercios(ingresosMes);
  const presupuestoPromedio = calcularPresupuestoTresTercios(promedioIngresos3Meses);
  const ingresosMesDetalle = ((ingresos || []) as Ingreso[]);
  const gastosMesDetalle = ((gastos || []) as Gasto[]);
  const gastado = calcularGastadoPorBolsa(gastosMesDetalle);
  const restante = calcularRestantesPorBolsa({ presupuesto: presupuestoMes, gastado });

  return {
    periodo: periodo.etiqueta,
    tipoPeriodo: periodo.isRange ? 'rango' : 'mes',
    ingresosMes,
    ingresosDetalle: ordenarPorFechaDesc(ingresosMesDetalle).map((ingreso) => ({
      fecha: formatearFecha(ingreso.fecha),
      concepto: ingreso.concepto || 'Ingreso',
      monto: Number(ingreso.monto || 0),
      tipo: ingreso.tipo || null,
    })),
    notaDatos: ingresosMes === 0
      ? {
          mesConsultadoSinIngresos: true,
          ultimoMesConIngresos: ultimoIngreso?.fecha ? etiquetaMes(ultimoIngreso.fecha) : null,
          instruccion: 'Aclara que el mes consultado no tiene ingresos cargados; si hay ultimoMesConIngresos, mencionarlo para que Diego sepa que la data historica si existe.',
        }
      : null,
    promedioIngresos3Meses,
    presupuestoMes,
    presupuestoSugeridoPorPromedio3Meses: presupuestoPromedio,
    gastado,
    restante,
    gastosPorBolsa: agruparGastosPorBolsa(gastosMesDetalle),
    gastosRecientes: ((gastosRecientes || []) as Gasto[]).map((gasto) => ({
      id: idCorto(gasto.id),
      fecha: formatearFecha(gasto.fecha),
      concepto: gasto.concepto,
      monto: Number(gasto.monto || 0),
      bolsa: nombreBolsa(String(gasto.categoria)),
      subcategoria: gasto.subcategoria || null,
      origen: gasto.origen,
    })),
  };
}

async function responderConversacionAbierta({
  texto,
  apiKey,
  supabase,
  memoria = [],
}: {
  texto: string;
  apiKey: string;
  supabase: SupabaseClient;
  memoria?: MensajeMemoria[];
}) {
  if (!apiKey) {
    return [
      'Puedo conversar mejor cuando esté configurada GOOGLE_API_KEY o GEMINI_API_KEY.',
      'Mientras tanto sí puedo operar con comandos: "cómo voy este mes", "últimos gastos", "gastos de placeres de junio" o "pagué 250 de gasolina".',
    ].join('\n');
  }

  const contexto = await obtenerContextoConversacional(supabase, texto);
  const prompt = `
{
  "role": "financial_conversation_agent",
  "identity": {
    "user": "Diego Gayoso",
    "system_name": "Dashboard Financiero 33/33/33",
    "assistant_purpose": "Help Diego understand, query, and operate his personal financial dashboard conversationally."
  },
  "language_policy": {
    "instructions_language": "English",
    "response_language": "Spanish Mexican",
    "no_markdown": true,
    "max_lines": 8,
    "style": "direct, intelligent, warm, concrete"
  },
  "behavior_contract": [
    "Use only the provided financial_context and recent_chat_memory. Do not invent data.",
    "Never say you cannot modify the database as a general rule. This Telegram bot can register movements when the router classifies the message as movement.",
    "Understand natural follow-ups such as 'y mayo?', 'pero completo', 'de dónde sale eso?', 'qué opinas?', 'está bien o mal?'.",
    "If the user asks where a number comes from, show the exact breakdown using ingresosDetalle, gastosPorBolsa or gastosRecientes.",
    "If the user asks for an opinion, give a diagnosis, the main risk, and the next best action. Do not repeat every dashboard number.",
    "If the user asks how much remains, compute from presupuestoMes and restante.",
    "If information is missing, say what is missing and suggest the most useful next command.",
    "Do not claim that you registered, deleted, or modified anything unless the provided context says the action already happened.",
    "Do not provide regulated financial advice or guaranteed returns."
  ],
  "business_rules": {
    "budget_rule": "Each income month is divided equally into Vida, Placeres and Futuro.",
    "Vida": "Required cost of living and operating/work tools such as Telcel, OpenAI, Codex, Fiverr, Opus.",
    "Placeres": "Leisure, restaurants, coffee, outings, trips, entertainment.",
    "Futuro": "Investments, GBM, CETES, emergency fund, insurance and patrimonial savings."
  },
  "financial_context": ${JSON.stringify(contexto, null, 2)},
  "recent_chat_memory": ${JSON.stringify(memoria.slice(-8), null, 2)},
  "user_message": ${JSON.stringify(texto)},
  "response_requirements": [
    "Respond in Spanish Mexican.",
    "Use concrete MXN numbers when available.",
    "Explain reasoning briefly when the user asks about a number.",
    "Use plain text with simple hyphen bullets only if useful.",
    "Keep the response concise but not robotic."
  ]
}
`;

  const message = limpiarFormatoTelegram(await generateGeminiText(apiKey, prompt));

  return message || 'Estoy aquí. Puedo revisar tus bolsas, gastos, ingresos o ayudarte a registrar un movimiento.';
}

function completarFollowUpMovimiento(texto: string, memoria: MensajeMemoria[]) {
  const normalizado = texto.trim().toLowerCase();

  if (!/\b(?:efectivo|cash|tarjeta|santander|transferencia|spei)\b/.test(normalizado) || /\d/.test(normalizado)) {
    return texto;
  }

  const ultimoUsuario = [...memoria]
    .reverse()
    .find((mensaje) => mensaje.role === 'user' && /\d/.test(mensaje.content) && esRegistroExplicito(mensaje.content.toLowerCase()));

  return ultimoUsuario ? `${ultimoUsuario.content} ${texto}` : texto;
}

export async function responderConversacionFinanciera({
  texto,
  apiKey,
  supabase,
  memoria = [],
}: {
  texto: string;
  apiKey: string;
  supabase: SupabaseClient;
  memoria?: MensajeMemoria[];
}): Promise<
  | { action: 'reply'; message: string }
  | { action: 'movement'; movement: MovementResult; message: string }
> {
  const textoConContexto = completarFollowUpMovimiento(texto, memoria);
  const intent = await detectarIntentInteligente(textoConContexto, apiKey);

  if (intent.type === 'help') {
    return { action: 'reply', message: ayuda };
  }

  if (intent.type === 'category-total') {
    return { action: 'reply', message: await totalGastosPorCategoria(supabase, intent.text) };
  }

  if (intent.type === 'update-category') {
    const idPrefix = intent.idPrefix || obtenerUltimoGastoId(memoria);

    if (!idPrefix) {
      return {
        action: 'reply',
        message: 'No tengo un último gasto claro para corregir. Mándame "últimos gastos" o usa "cambiar <id> a vida/placeres/futuro".',
      };
    }

    return { action: 'reply', message: await actualizarCategoriaGasto(supabase, idPrefix, intent.category) };
  }

  if (intent.type === 'summary') {
    return {
      action: 'reply',
      message: await responderConversacionAbierta({
        texto: intent.text,
        apiKey,
        supabase,
        memoria,
      }),
    };
  }

  if (intent.type === 'list') {
    return { action: 'reply', message: await listarMovimientos(supabase, intent.text) };
  }

  if (intent.type === 'delete-request') {
    return { action: 'reply', message: await buscarMovimientosParaEliminar(supabase, intent.text) };
  }

  if (intent.type === 'delete-confirm') {
    return { action: 'reply', message: await confirmarEliminarMovimiento(supabase, intent.idPrefix) };
  }

  if (intent.type === 'movement') {
    const movement = await clasificarMovimientoFinanciero(intent.text, apiKey);
    const tipo = movement.tipo === 'ingreso' ? 'ingreso' : `${movement.categoria} / ${movement.subcategoria}`;

    return {
      action: 'movement',
      movement,
      message: `Lo clasifiqué como ${tipo}: $${formatearMonto(movement.monto)} en ${movement.concepto}.`,
    };
  }

  return {
    action: 'reply',
    message: await responderConversacionAbierta({
      texto: intent.text,
      apiKey,
      supabase,
      memoria,
    }),
  };
}
