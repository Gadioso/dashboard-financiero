import type { SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { clasificarMovimientoFinanciero } from '@/lib/ai-classifier';
import {
  calcularGastadoPorBolsa,
  calcularIngresosMes,
  calcularPresupuestoTresTercios,
  calcularPromedioIngresosUltimos3Meses,
  calcularRestantesPorBolsa,
  formatearEntero,
  formatearFecha,
  formatearMonto,
  nombreBolsa,
  type Gasto,
  type Ingreso,
} from '@/lib/financial-core';

type Intent =
  | { type: 'help' }
  | { type: 'summary'; text: string }
  | { type: 'list'; text: string }
  | { type: 'delete-request'; text: string }
  | { type: 'delete-confirm'; idPrefix: string }
  | { type: 'movement'; text: string }
  | { type: 'conversation'; text: string };

type MovementResult = Awaited<ReturnType<typeof clasificarMovimientoFinanciero>>;

const ayuda =
  [
    'Soy tu asistente financiero. Puedes hablarme normal:',
    '- Registrar: "pagué 250 de gasolina", "150 tacos", "metí 1000 a cetes", "gané 60000 de sueldo".',
    '- Consultar: "cómo voy este mes", "cuánto me queda para placeres", "cuánto tengo que invertir".',
    '- Ver: "últimos gastos", "gastos de placeres de junio", "gastos de vida enero 2026".',
    '- Eliminar: "borra Starbucks" y luego "confirmar eliminar abc12345".',
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

function detectarIntent(texto: string): Intent {
  const normalizado = texto.trim().toLowerCase();

  if (!normalizado || normalizado === '/start' || normalizado === 'start' || normalizado === 'hola' || normalizado === 'ayuda' || normalizado === '/help') {
    return { type: 'help' };
  }

  const confirmarEliminarMatch = normalizado.match(/\b(?:confirmar|confirma|confirmo|s[ií])\s+(?:eliminar|borrar)\s+(?:gasto\s+)?([a-z0-9-]{1,})\b/i);

  if (confirmarEliminarMatch?.[1]) {
    return { type: 'delete-confirm', idPrefix: confirmarEliminarMatch[1] };
  }

  if (/\b(?:elimina|eliminar|borra|borrar|quita|quitar)\b/.test(normalizado)) {
    return { type: 'delete-request', text: texto };
  }

  if (/\b(?:[uú]ltimos?(?:\s+\d{1,2})?\s+(?:gastos?|movimientos?)|ver\s+gastos?|mu[eé]strame\s+gastos?|lista\s+gastos?|gastos?\s+de\s+(?:vida|placeres|futuro|inversi[oó]n)|movimientos?\s+de)\b/.test(normalizado)) {
    return { type: 'list', text: texto };
  }

  if (/\b(c[oó]mo voy|resumen|balance|estatus|estado|cu[aá]nto llevo|cu[aá]nto he gastado|cu[aá]nto gast[eé]|cu[aá]nto me queda|cu[aá]nto queda|presupuesto|bolsas?|invertir|inversi[oó]n|futuro|placeres|vida)\b/.test(normalizado)) {
    return { type: 'summary', text: texto };
  }

  if (/\d/.test(normalizado)) {
    return { type: 'movement', text: texto };
  }

  return { type: 'conversation', text: texto };
}

function detectarFiltroCategoria(texto: string) {
  const normalizado = texto.toLowerCase();

  if (/\b(placer|placeres|salidas?|restaurantes?|caf[eé]s?|ocio)\b/.test(normalizado)) return 'Placeres';
  if (/\b(vida|costo de vida|herramientas?|telcel|servicios?|super|s[uú]per)\b/.test(normalizado)) return 'Vida';
  if (/\b(futuro|inversi[oó]n|inversiones|invertido|gbm|cetes|emergencia|seguros?)\b/.test(normalizado)) return 'Seguros';

  return null;
}

function limpiarBusquedaEliminacion(texto: string) {
  return texto
    .toLowerCase()
    .replace(/\b(?:elimina|eliminar|borra|borrar|quita|quitar|gasto|movimiento|de|del|la|el|un|una|por|favor)\b/g, ' ')
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

function etiquetaMes(fecha: string | Date) {
  const date = new Date(fecha);
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
}

function rangoMesDesdeTexto(texto: string) {
  const { year, monthIndex } = detectarMesConsulta(texto);

  return {
    inicio: new Date(Date.UTC(year, monthIndex, 1)).toISOString(),
    fin: new Date(Date.UTC(year, monthIndex + 1, 1)).toISOString(),
    etiqueta: `${String(monthIndex + 1).padStart(2, '0')}/${year}`,
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

async function obtenerResumen(supabase: SupabaseClient, texto: string) {
  const { year, monthIndex } = detectarMesConsulta(texto);
  const month = String(monthIndex + 1).padStart(2, '0');
  const fechaPresupuesto = `${year}-${month}-01`;
  const mesKey = `${year}-${month}`;
  const primerDiaMesISO = new Date(Date.UTC(year, monthIndex, 1)).toISOString();
  const primerDiaSiguienteMesISO = new Date(Date.UTC(year, monthIndex + 1, 1)).toISOString();
  const primerDiaVentanaPromedioISO = new Date(Date.UTC(year, monthIndex - 2, 1)).toISOString();

  const [
    { data: presupuesto },
    { data: ingresos, error: errorIngresos },
    { data: gastos, error: errorGastos },
    { data: ingresosPromedio, error: errorIngresosPromedio },
    { data: ultimoIngreso, error: errorUltimoIngreso },
  ] = await Promise.all([
    supabase
      .from('presupuestos_mensuales')
      .select('techo_vida, techo_placeres, techo_futuro, fase_ahorro')
      .eq('mes_anio', fechaPresupuesto)
      .maybeSingle(),
    supabase.from('ingresos').select('monto, fecha').gte('fecha', primerDiaMesISO).lt('fecha', primerDiaSiguienteMesISO),
    supabase.from('gastos').select('monto, categoria').gte('fecha', primerDiaMesISO).lt('fecha', primerDiaSiguienteMesISO),
    supabase.from('ingresos').select('monto, fecha').gte('fecha', primerDiaVentanaPromedioISO).lt('fecha', primerDiaSiguienteMesISO),
    supabase.from('ingresos').select('monto, fecha').lt('fecha', primerDiaSiguienteMesISO).order('fecha', { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (errorIngresos) {
    throw new Error(`No pude consultar ingresos: ${errorIngresos.message}`);
  }

  if (errorGastos) {
    throw new Error(`No pude consultar gastos: ${errorGastos.message}`);
  }

  if (errorIngresosPromedio) {
    throw new Error(`No pude consultar promedio de ingresos: ${errorIngresosPromedio.message}`);
  }

  if (errorUltimoIngreso) {
    throw new Error(`No pude consultar el último ingreso: ${errorUltimoIngreso.message}`);
  }

  const ingresosMes = calcularIngresosMes((ingresos || []) as Ingreso[]);
  const promedioIngresos3Meses = calcularPromedioIngresosUltimos3Meses({
    ingresos: (ingresosPromedio || []) as Ingreso[],
    mesActivo: mesKey,
  });
  const presupuestoPromedio = calcularPresupuestoTresTercios(promedioIngresos3Meses);
  const presupuestoFinal = presupuesto?.techo_vida
    ? {
        Vida: Number(presupuesto.techo_vida),
        Placeres: Number(presupuesto.techo_placeres || 0),
        Futuro: Number(presupuesto.techo_futuro || 0),
      }
    : calcularPresupuestoTresTercios(ingresosMes);
  const gastado = calcularGastadoPorBolsa(gastos || []);
  const restante = calcularRestantesPorBolsa({ presupuesto: presupuestoFinal, gastado });
  const restantePlaceres = Math.max(presupuestoFinal.Placeres - gastado.Placeres, 0);
  const porcentajePlaceres = presupuestoFinal.Placeres ? (gastado.Placeres / presupuestoFinal.Placeres) * 100 : 0;

  return [
    `Vas así en ${month}/${year}:`,
    ingresosMes === 0 ? `Todavía no hay ingresos registrados para este mes; el presupuesto queda en $0 hasta que registres ingreso.` : null,
    ingresosMes === 0 && ultimoIngreso?.fecha ? `Último mes con ingresos cargados: ${etiquetaMes(ultimoIngreso.fecha)}.` : null,
    `Ingresos: $${formatearEntero(ingresosMes)}. Cada bolsa recibe $${formatearEntero(presupuestoFinal.Vida)}.`,
    `Promedio ingresos últimos 3 meses: $${formatearEntero(promedioIngresos3Meses)}.`,
    `Con ese promedio: contempla Vida $${formatearEntero(presupuestoPromedio.Vida)} e invierte Futuro $${formatearEntero(presupuestoPromedio.Futuro)} al mes.`,
    `Vida: gastado $${formatearEntero(gastado.Vida)} / presupuesto $${formatearEntero(presupuestoFinal.Vida)}. Te quedan $${formatearEntero(Math.max(restante.Vida, 0))}.`,
    `Placeres: gastado $${formatearEntero(gastado.Placeres)} / presupuesto $${formatearEntero(presupuestoFinal.Placeres)} (${porcentajePlaceres.toFixed(1)}%). Te quedan $${formatearEntero(restantePlaceres)}.`,
    `Futuro: invertido $${formatearEntero(gastado.Futuro)} / meta $${formatearEntero(presupuestoFinal.Futuro)}. Pendiente por invertir: $${formatearEntero(Math.max(restante.Futuro, 0))}.`,
  ].filter(Boolean).join('\n');
}

async function listarGastos(supabase: SupabaseClient, texto: string) {
  const rango = rangoMesDesdeTexto(texto);
  const categoria = detectarFiltroCategoria(texto);
  const limitMatch = texto.match(/\b(\d{1,2})\b/);
  const limit = Math.min(Math.max(limitMatch ? Number(limitMatch[1]) : 10, 1), 20);
  let query = supabase
    .from('gastos')
    .select('id, concepto, monto, categoria, subcategoria, origen, fecha')
    .gte('fecha', rango.inicio)
    .lt('fecha', rango.fin)
    .order('fecha', { ascending: false })
    .limit(limit);

  if (categoria) {
    query = query.eq('categoria', categoria);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`No pude consultar gastos: ${error.message}`);
  }

  const gastos = (data || []) as Gasto[];

  if (!gastos.length) {
    return `No encontré gastos${categoria ? ` de ${nombreBolsa(categoria)}` : ''} en ${rango.etiqueta}.`;
  }

  const total = gastos.reduce((sum, gasto) => sum + Number(gasto.monto || 0), 0);

  return [
    `Últimos ${gastos.length} gastos${categoria ? ` de ${nombreBolsa(categoria)}` : ''} en ${rango.etiqueta}:`,
    ...gastos.map((gasto) => `- ${describirGasto(gasto)}`),
    `Total mostrado: $${formatearMonto(total)}.`,
    'Para borrar uno: "confirmar eliminar <id corto>".',
  ].join('\n');
}

async function buscarGastosParaEliminar(supabase: SupabaseClient, texto: string) {
  const rango = rangoMesDesdeTexto(texto);
  const busqueda = limpiarBusquedaEliminacion(texto);
  const montoMatch = texto.match(/\$?\s*(\d+(?:[,.]\d{1,2})?)/);
  const monto = montoMatch ? Number(montoMatch[1].replace(/,/g, '')) : null;

  let query = supabase
    .from('gastos')
    .select('id, concepto, monto, categoria, subcategoria, origen, fecha')
    .gte('fecha', rango.inicio)
    .lt('fecha', rango.fin)
    .order('fecha', { ascending: false })
    .limit(20);

  if (busqueda) {
    query = query.ilike('concepto', `%${busqueda}%`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`No pude buscar gastos para eliminar: ${error.message}`);
  }

  const gastos = ((data || []) as Gasto[]).filter((gasto) => (monto ? Math.abs(Number(gasto.monto) - monto) < 0.01 : true));

  if (!gastos.length) {
    return [
      `No encontré un gasto para borrar${busqueda ? ` con "${busqueda}"` : ''} en ${rango.etiqueta}.`,
      'Prueba con "últimos gastos" para ver IDs cortos.',
    ].join('\n');
  }

  if (gastos.length === 1) {
    return [
      'Encontré este gasto:',
      `- ${describirGasto(gastos[0])}`,
      `Para borrarlo escribe: confirmar eliminar ${idCorto(gastos[0].id)}`,
    ].join('\n');
  }

  return [
    `Encontré ${gastos.length} posibles gastos. No borraré nada hasta que confirmes uno:`,
    ...gastos.slice(0, 10).map((gasto) => `- ${describirGasto(gasto)}`),
    'Para borrar uno: "confirmar eliminar <id corto>".',
  ].join('\n');
}

async function confirmarEliminarGasto(supabase: SupabaseClient, idPrefix: string) {
  const { data, error } = await supabase
    .from('gastos')
    .select('id, concepto, monto, categoria, subcategoria, origen, fecha')
    .order('fecha', { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`No pude buscar el gasto a eliminar: ${error.message}`);
  }

  const matches = ((data || []) as Gasto[]).filter((gasto) => String(gasto.id).toLowerCase().startsWith(idPrefix.toLowerCase()));

  if (!matches.length) {
    return `No encontré ningún gasto con ID corto "${idPrefix}". Escribe "últimos gastos" para ver IDs recientes.`;
  }

  if (matches.length > 1) {
    return [
      `Ese ID corto coincide con ${matches.length} gastos. Usa más caracteres del ID:`,
      ...matches.slice(0, 5).map((gasto) => `- ${describirGasto(gasto)}`),
    ].join('\n');
  }

  const gasto = matches[0];
  const { error: deleteError } = await supabase.from('gastos').delete().eq('id', gasto.id);

  if (deleteError) {
    throw new Error(`No pude eliminar el gasto: ${deleteError.message}`);
  }

  return [
    'Gasto eliminado.',
    describirGasto(gasto),
    'Ya debería reflejarse en el dashboard y en tus bolsas.',
  ].join('\n');
}

async function obtenerContextoConversacional(supabase: SupabaseClient, texto: string) {
  const { year, monthIndex } = detectarMesConsulta(texto);
  const month = String(monthIndex + 1).padStart(2, '0');
  const mesKey = `${year}-${month}`;
  const inicioMes = new Date(Date.UTC(year, monthIndex, 1)).toISOString();
  const finMes = new Date(Date.UTC(year, monthIndex + 1, 1)).toISOString();
  const inicioPromedio = new Date(Date.UTC(year, monthIndex - 2, 1)).toISOString();

  const [
    { data: ingresos, error: errorIngresos },
    { data: gastos, error: errorGastos },
    { data: ingresosPromedio, error: errorIngresosPromedio },
    { data: gastosRecientes, error: errorRecientes },
    { data: ultimoIngreso, error: errorUltimoIngreso },
  ] =
    await Promise.all([
      supabase.from('ingresos').select('monto, fecha').gte('fecha', inicioMes).lt('fecha', finMes),
      supabase.from('gastos').select('monto, categoria').gte('fecha', inicioMes).lt('fecha', finMes),
      supabase.from('ingresos').select('monto, fecha').gte('fecha', inicioPromedio).lt('fecha', finMes),
      supabase
        .from('gastos')
        .select('id, concepto, monto, categoria, subcategoria, origen, fecha')
        .gte('fecha', inicioMes)
        .lt('fecha', finMes)
        .order('fecha', { ascending: false })
        .limit(8),
      supabase.from('ingresos').select('monto, fecha').lt('fecha', finMes).order('fecha', { ascending: false }).limit(1).maybeSingle(),
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
  const gastado = calcularGastadoPorBolsa(gastos || []);
  const restante = calcularRestantesPorBolsa({ presupuesto: presupuestoMes, gastado });

  return {
    periodo: `${month}/${year}`,
    ingresosMes,
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
}: {
  texto: string;
  apiKey: string;
  supabase: SupabaseClient;
}) {
  if (!apiKey) {
    return [
      'Puedo conversar mejor cuando esté configurada GOOGLE_API_KEY o GEMINI_API_KEY.',
      'Mientras tanto sí puedo operar con comandos: "cómo voy este mes", "últimos gastos", "gastos de placeres de junio" o "pagué 250 de gasolina".',
    ].join('\n');
  }

  const contexto = await obtenerContextoConversacional(supabase, texto);
  const ai = new GoogleGenerativeAI(apiKey);
  const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const prompt = `
Eres el agente financiero conversacional de Diego Gayoso.

Propósito:
- Ayudar a operar su dashboard de libertad financiera con la regla 33/33/33.
- Responder de forma conversacional, concreta y útil.
- Usar solo el contexto financiero provisto; no inventes datos.
- Si falta información, dilo y sugiere el siguiente comando útil.
- No prometas rendimientos ni des asesoría financiera regulada.
- Si el usuario quiere registrar, listar, borrar o confirmar borrado, explícale el comando exacto. No afirmes que ejecutaste una acción si no se ejecutó.

Reglas de clasificación:
- Vida: costo necesario y herramientas de trabajo como Telcel, OpenAI, Codex, Fiverr, Opus.
- Placeres: ocio, restaurantes, cafés, salidas, viajes, entretenimiento.
- Futuro: inversiones, GBM, CETES, emergencia, seguros y ahorro patrimonial.
- Cada ingreso mensual se divide en Vida, Placeres y Futuro en partes iguales.

Contexto financiero:
${JSON.stringify(contexto, null, 2)}

Usuario: "${texto}"

Responde en español mexicano, máximo 7 líneas, con números concretos cuando existan.
`;

  const response = await model.generateContent(prompt);
  const message = response.response.text().trim();

  return message || 'Estoy aquí. Puedo revisar tus bolsas, gastos, ingresos o ayudarte a registrar un movimiento.';
}

export async function responderConversacionFinanciera({
  texto,
  apiKey,
  supabase,
}: {
  texto: string;
  apiKey: string;
  supabase: SupabaseClient;
}): Promise<
  | { action: 'reply'; message: string }
  | { action: 'movement'; movement: MovementResult; message: string }
> {
  const intent = detectarIntent(texto);

  if (intent.type === 'help') {
    return { action: 'reply', message: ayuda };
  }

  if (intent.type === 'summary') {
    return { action: 'reply', message: await obtenerResumen(supabase, intent.text) };
  }

  if (intent.type === 'list') {
    return { action: 'reply', message: await listarGastos(supabase, intent.text) };
  }

  if (intent.type === 'delete-request') {
    return { action: 'reply', message: await buscarGastosParaEliminar(supabase, intent.text) };
  }

  if (intent.type === 'delete-confirm') {
    return { action: 'reply', message: await confirmarEliminarGasto(supabase, intent.idPrefix) };
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
    }),
  };
}
