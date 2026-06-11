import { createTool } from '@mastra/core/tools';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const getSupabaseClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
};

const transaccionSchema = z.object({
  concepto: z.string().describe('El motivo del gasto o ingreso (ej. Starbucks, Pago de cliente)'),
  monto: z.number().describe('El monto total en pesos'),
  tipo: z.enum(['ingreso', 'gasto']).describe('Especifica si es un ingreso o un gasto'),
  bolsa: z.enum(['Vida', 'Placeres', 'Futuro']).describe('La bolsa según la regla de los tres tercios a la que pertenece el movimiento'),
});

const registrarTransaccionOutputSchema = z.object({
  status: z.literal('success'),
  message: z.string(),
  data: z.array(z.record(z.string(), z.unknown())).nullable(),
});

const resumenMensualOutputSchema = z.object({
  status: z.literal('success'),
  mesActual: z.string(),
  faseAhorro: z.string(),
  limitesConfigurados: z.boolean(),
  presupuesto: z.object({
    Vida: z.number().nullable(),
    Placeres: z.number().nullable(),
    Futuro: z.number().nullable(),
  }),
  gastado: z.object({
    Vida: z.number(),
    Placeres: z.number(),
    Futuro: z.number(),
  }),
});

// 1. Tool de Registro
export const registrarTransaccionTool = createTool({
  id: 'registrarTransaccion',
  description: 'Registra un ingreso o gasto en la base de datos financiera de Diego, mapeándolo a la tabla correcta (ingresos o gastos).',
  inputSchema: transaccionSchema,
  outputSchema: registrarTransaccionOutputSchema,
  execute: async (inputData: z.infer<typeof transaccionSchema>) => {
    const { concepto, monto, tipo, bolsa } = inputData;
    const supabase = getSupabaseClient();
    let result;

    if (tipo === 'gasto') {
      const categoriaGasto = bolsa === 'Futuro' ? 'Seguros' : bolsa;
      result = await supabase
        .from('gastos')
        .insert([{ concepto, monto, categoria: categoriaGasto, origen: 'Web', fecha: new Date().toISOString() }])
        .select();
    } else {
      result = await supabase
        .from('ingresos')
        .insert([{ concepto, monto, tipo: 'Extra', fecha: new Date().toISOString() }])
        .select();
    }

    if (result.error) throw new Error(`Error al guardar en Supabase: ${result.error.message}`);
    return { status: 'success' as const, message: `Movimiento guardado exitosamente`, data: result.data };
  },
});

// 2. Tool de Resumen con cruce de Presupuestos Mensuales
export const obtenerResumenMensualTool = createTool({
  id: 'obtenerResumenMensual',
  description: 'Consulta el total acumulado de gastos del mes actual y compara contra los límites establecidos en presupuestos_mensuales.',
  inputSchema: z.object({}),
  outputSchema: resumenMensualOutputSchema,
  execute: async () => {
    const supabase = getSupabaseClient();
    const ahora = new Date();
    // Primer día del mes actual para buscar en la base de datos (ej: 2026-06-01)
    const año = ahora.getFullYear();
    const mes = String(ahora.getMonth() + 1).padStart(2, '0');
    const fechaPresupuesto = `${año}-${mes}-01`;
    const primerDiaMesISO = new Date(año, ahora.getMonth(), 1).toISOString();

    // 1. Obtener los techos presupuestales del mes actual
    const { data: presupuesto, error: errorPresupuesto } = await supabase
      .from('presupuestos_mensuales')
      .select('techo_vida, techo_placeres, techo_futuro, fase_ahorro')
      .eq('mes_anio', fechaPresupuesto)
      .maybeSingle();

    if (errorPresupuesto) throw new Error(`Error al consultar presupuestos: ${errorPresupuesto.message}`);

    // 2. Obtener los gastos acumulados del mes actual
    const { data: gastos, error: errorGastos } = await supabase
      .from('gastos')
      .select('monto, categoria')
      .gte('fecha', primerDiaMesISO);

    if (errorGastos) throw new Error(`Error al consultar gastos: ${errorGastos.message}`);

    // Calcular acumulados de gastos reales
    let acumuladoVida = 0;
    let acumuladoPlaceres = 0;
    let acumuladoFuturo = 0;

    gastos?.forEach(g => {
      if (g.categoria === 'Vida') acumuladoVida += Number(g.monto);
      if (g.categoria === 'Placeres') acumuladoPlaceres += Number(g.monto);
      if (g.categoria === 'Seguros' || g.categoria === 'Futuro') acumuladoFuturo += Number(g.monto);
    });

    return {
      status: 'success' as const,
      mesActual: ahora.toLocaleString('es-MX', { month: 'long', year: 'numeric' }),
      faseAhorro: presupuesto?.fase_ahorro || 'No configurada',
      limitesConfigurados: presupuesto ? true : false,
      presupuesto: {
        Vida: presupuesto?.techo_vida ? Number(presupuesto.techo_vida) : null,
        Placeres: presupuesto?.techo_placeres ? Number(presupuesto.techo_placeres) : null,
        Futuro: presupuesto?.techo_futuro ? Number(presupuesto.techo_futuro) : null,
      },
      gastado: {
        Vida: acumuladoVida,
        Placeres: acumuladoPlaceres,
        Futuro: acumuladoFuturo,
      }
    };
  },
});
