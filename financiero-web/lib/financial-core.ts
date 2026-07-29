export type CategoriaFinanciera = 'Vida' | 'Placeres' | 'Futuro';
export type CategoriaGasto = CategoriaFinanciera | 'Seguros';
export type TipoMovimiento = 'gasto' | 'ingreso' | 'abono_tarjeta';

export type Gasto = {
  id: string | number;
  concepto: string;
  categoria: CategoriaGasto | string;
  subcategoria?: string | null;
  monto: number | string;
  origen: string;
  fecha: string;
};

export type Ingreso = {
  id: string | number;
  concepto: string | null;
  monto: number | string;
  tipo?: string | null;
  origen?: string | null;
  fecha: string;
};

export type AbonoTarjetaCredito = {
  id: string | number;
  concepto: string;
  monto: number | string;
  tarjeta?: string | null;
  origen: string;
  fecha: string;
};

export type Movimiento = {
  id: string;
  tipo: TipoMovimiento;
  concepto: string;
  categoria: CategoriaGasto | 'Ingreso' | string;
  subcategoria?: string | null;
  monto: number | string;
  origen: string;
  fecha: string;
  currency?: string | null;
};

export type ClasificacionMovimiento = {
  concepto: string;
  monto: number;
  tipo: TipoMovimiento;
  categoria: CategoriaFinanciera;
  subcategoria: string;
  razon: string;
  fechaMovimiento?: string;
};

export type ResumenFinanciero = {
  ingresosMes: number;
  promedioIngresosUltimos3Meses: number;
  presupuesto: {
    Vida: number;
    Placeres: number;
    Futuro: number;
  };
  gastado: {
    Vida: number;
    Placeres: number;
    Futuro: number;
  };
  faseAhorro: string;
};

export type ResumenMensual = {
  mes: string;
  ingresos: number;
  egresos: number;
  resultado: number;
  saldoAcumulado: number;
};

export const resumenInicial: ResumenFinanciero = {
  ingresosMes: 0,
  promedioIngresosUltimos3Meses: 0,
  presupuesto: { Vida: 0, Placeres: 0, Futuro: 0 },
  gastado: { Vida: 0, Placeres: 0, Futuro: 0 },
  faseAhorro: 'Regla 33/33/33 activa',
};

export const meses2026 = [
  { etiqueta: 'ENERO', indice: 0 },
  { etiqueta: 'FEBRERO', indice: 1 },
  { etiqueta: 'MARZO', indice: 2 },
  { etiqueta: 'ABRIL', indice: 3 },
  { etiqueta: 'MAYO', indice: 4 },
  { etiqueta: 'JUNIO', indice: 5 },
  { etiqueta: 'JULIO', indice: 6 },
  { etiqueta: 'AGOSTO', indice: 7 },
  { etiqueta: 'SEPTIEMBRE', indice: 8 },
  { etiqueta: 'OCTUBRE', indice: 9 },
  { etiqueta: 'NOVIEMBRE', indice: 10 },
  { etiqueta: 'DICIEMBRE', indice: 11 },
];

export const aliasCategoria: Record<string, CategoriaFinanciera> = {
  ahorro: 'Futuro',
  fijo: 'Vida',
  futuro: 'Futuro',
  inv: 'Futuro',
  inversion: 'Futuro',
  inversiones: 'Futuro',
  p: 'Placeres',
  placer: 'Placeres',
  placeres: 'Placeres',
  salida: 'Placeres',
  v: 'Vida',
  vida: 'Vida',
};

export const categoriaParaGastos = (categoria: CategoriaFinanciera): CategoriaGasto =>
  categoria === 'Futuro' ? 'Seguros' : categoria;

function currentMexicoDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.year),
    monthIndex: Number(values.month) - 1,
    day: Number(values.day),
  };
}

export function extraerFechaRelativaMovimiento(texto: string, ahora = new Date()) {
  const normalizado = texto.toLowerCase();
  let offset: number | null = null;

  if (/\b(?:ayer|anoche)\b/.test(normalizado)) offset = -1;
  if (/\b(?:hoy)\b/.test(normalizado)) offset = 0;
  if (/\b(?:antier|anteayer)\b/.test(normalizado)) offset = -2;

  if (offset === null) return null;

  const { year, monthIndex, day } = currentMexicoDateParts(ahora);

  return new Date(Date.UTC(year, monthIndex, day + offset, 12));
}

const mesesTexto: Record<string, number> = {
  enero: 0,
  ene: 0,
  febrero: 1,
  feb: 1,
  marzo: 2,
  mar: 2,
  abril: 3,
  abr: 3,
  mayo: 4,
  may: 4,
  junio: 5,
  jun: 5,
  julio: 6,
  jul: 6,
  agosto: 7,
  ago: 7,
  septiembre: 8,
  setiembre: 8,
  sep: 8,
  sept: 8,
  octubre: 9,
  oct: 9,
  noviembre: 10,
  nov: 10,
  diciembre: 11,
  dic: 11,
};

export function extraerFechaExplicitaMovimiento(texto: string, ahora = new Date()) {
  const normalizado = texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const match = normalizado.match(/\b(?:el\s+)?([0-3]?\d)\s*(?:de\s+)?(enero|ene|febrero|feb|marzo|mar|abril|abr|mayo|may|junio|jun|julio|jul|agosto|ago|septiembre|setiembre|sep|sept|octubre|oct|noviembre|nov|diciembre|dic)(?:\s*(?:de\s*)?(\d{4}))?\b/);

  if (!match) return null;

  const day = Number(match[1]);
  const monthIndex = mesesTexto[match[2]];
  const current = currentMexicoDateParts(ahora);
  const year = match[3] ? Number(match[3]) : current.year;

  if (!Number.isInteger(day) || day < 1 || day > 31 || monthIndex === undefined || !Number.isInteger(year)) {
    return null;
  }

  const date = new Date(Date.UTC(year, monthIndex, day, 12));

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== monthIndex || date.getUTCDate() !== day) {
    return null;
  }

  return date;
}

export function extraerFechaMovimiento(texto: string, ahora = new Date()) {
  return extraerFechaExplicitaMovimiento(texto, ahora) || extraerFechaRelativaMovimiento(texto, ahora);
}

export function resolverFechaMovimiento(
  texto: string,
  fechaSugerida?: string | null,
  ahora = new Date(),
  preferirFechaTexto = true,
) {
  const fechaDetectadaEnTexto = extraerFechaMovimiento(texto, ahora);

  if (preferirFechaTexto && fechaDetectadaEnTexto) {
    return fechaDetectadaEnTexto;
  }

  const fechaClasificada = fechaSugerida ? new Date(fechaSugerida) : null;

  if (!fechaClasificada || Number.isNaN(fechaClasificada.getTime())) {
    return fechaDetectadaEnTexto || ahora;
  }

  const usuarioIndicoAnio = /\b(?:19|20)\d{2}\b/.test(texto);

  if (!usuarioIndicoAnio) {
    fechaClasificada.setUTCFullYear(currentMexicoDateParts(ahora).year);
  }

  return fechaClasificada;
}

export const formatoFechaMX = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatoEnteroMX = new Intl.NumberFormat('es-MX', {
  maximumFractionDigits: 0,
});

export const formatoMontoMX = new Intl.NumberFormat('es-MX', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatearEntero = (valor: number | string) => formatoEnteroMX.format(Number(valor));
export const formatearMonto = (valor: number | string) => formatoMontoMX.format(Number(valor));
export const formatearFecha = (valor: string) => {
  const fecha = new Date(valor);
  const dia = String(fecha.getUTCDate()).padStart(2, '0');
  const mes = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][fecha.getUTCMonth()];
  const year = fecha.getUTCFullYear();

  return `${dia} ${mes} ${year}`;
};

export function calcularPresupuestoTresTercios(ingresosMes: number) {
  const tercio = ingresosMes > 0 ? ingresosMes / 3 : 0;

  return {
    Vida: tercio,
    Placeres: tercio,
    Futuro: tercio,
  };
}

export function mesKeyDesdeFecha(fecha: Date) {
  const year = fecha.getUTCFullYear();
  const month = String(fecha.getUTCMonth() + 1).padStart(2, '0');

  return `${year}-${month}`;
}

export function inicioMesISO(mesKey: string) {
  const [year, month] = mesKey.split('-').map(Number);

  return new Date(Date.UTC(year, month - 1, 1)).toISOString();
}

export function finMesISO(mesKey: string) {
  const [year, month] = mesKey.split('-').map(Number);

  return new Date(Date.UTC(year, month, 1)).toISOString();
}

export function calcularIngresosMes(ingresos: Pick<Ingreso, 'monto'>[]) {
  return ingresos.reduce((total, ingreso) => total + Number(ingreso.monto || 0), 0);
}

export function calcularPromedioIngresosUltimos3Meses({
  ingresos,
  mesActivo,
}: {
  ingresos: Pick<Ingreso, 'monto' | 'fecha'>[];
  mesActivo: string;
}) {
  const [year, month] = mesActivo.split('-').map(Number);
  const mesesObjetivo = Array.from({ length: 3 }, (_, offset) => {
    const fecha = new Date(Date.UTC(year, month - 1 - offset, 1));
    return mesKeyDesdeFecha(fecha);
  }).reverse();

  const totales = mesesObjetivo.map((mesKey) => {
    const inicio = new Date(inicioMesISO(mesKey)).getTime();
    const fin = new Date(finMesISO(mesKey)).getTime();

    return ingresos
      .filter((ingreso) => {
        const fecha = new Date(ingreso.fecha).getTime();
        return fecha >= inicio && fecha < fin;
      })
      .reduce((total, ingreso) => total + Number(ingreso.monto || 0), 0);
  });

  return totales.reduce((total, monto) => total + monto, 0) / 3;
}

export function calcularResumenMensual2026({
  ingresos,
  gastos,
}: {
  ingresos: Pick<Ingreso, 'monto' | 'fecha'>[];
  gastos: Pick<Gasto, 'monto' | 'fecha'>[];
}) {
  let saldoAcumulado = 0;

  return meses2026.map(({ etiqueta, indice }) => {
    const ingresosMes = ingresos
      .filter((ingreso) => new Date(ingreso.fecha).getUTCFullYear() === 2026 && new Date(ingreso.fecha).getUTCMonth() === indice)
      .reduce((total, ingreso) => total + Number(ingreso.monto || 0), 0);
    const egresosMes = gastos
      .filter((gasto) => new Date(gasto.fecha).getUTCFullYear() === 2026 && new Date(gasto.fecha).getUTCMonth() === indice)
      .reduce((total, gasto) => total + Number(gasto.monto || 0), 0);
    const resultado = ingresosMes - egresosMes;
    saldoAcumulado += resultado;

    return {
      mes: etiqueta,
      ingresos: ingresosMes,
      egresos: egresosMes,
      resultado,
      saldoAcumulado,
    };
  });
}

export function calcularGastadoPorBolsa(gastos: Pick<Gasto, 'categoria' | 'monto'>[]) {
  return gastos.reduce(
    (acumulado, gasto) => {
      if (gasto.categoria === 'Vida') acumulado.Vida += Number(gasto.monto);
      if (gasto.categoria === 'Placeres') acumulado.Placeres += Number(gasto.monto);
      if (gasto.categoria === 'Seguros' || gasto.categoria === 'Futuro') acumulado.Futuro += Number(gasto.monto);
      return acumulado;
    },
    { Vida: 0, Placeres: 0, Futuro: 0 }
  );
}

export function calcularRestantesPorBolsa({
  presupuesto,
  gastado,
}: Pick<ResumenFinanciero, 'presupuesto' | 'gastado'>) {
  return {
    Vida: presupuesto.Vida - gastado.Vida,
    Placeres: presupuesto.Placeres - gastado.Placeres,
    Futuro: presupuesto.Futuro - gastado.Futuro,
  };
}

export function nombreBolsa(categoria: string) {
  if (categoria === 'Seguros' || categoria === 'Futuro') return 'Futuro';
  if (categoria === 'Placeres') return 'Placeres';
  if (categoria === 'Vida') return 'Vida';
  if (categoria === 'Ingreso') return 'Ingreso';

  return categoria;
}

export function nombreOrigen(origen: string, subcategoria?: string | null) {
  void subcategoria;
  if (origen === 'Supabase') return 'Web';
  if (origen === 'Telegram') return 'Telegram';
  if (origen === 'Web') return 'Web';
  return origen || 'Web';
}

export function combinarMovimientos({
  ingresos,
  gastos,
  abonosTarjeta = [],
}: {
  ingresos: Ingreso[];
  gastos: Gasto[];
  abonosTarjeta?: AbonoTarjetaCredito[];
}) {
  const movimientosIngreso: Movimiento[] = ingresos.map((ingreso) => ({
    id: `ingreso-${ingreso.id}`,
    tipo: 'ingreso',
    concepto: ingreso.concepto || 'Ingreso',
    categoria: 'Ingreso',
    subcategoria: ingreso.tipo || 'Ingreso',
    monto: ingreso.monto,
    origen: nombreOrigen(ingreso.origen || 'Web'),
    fecha: ingreso.fecha,
  }));
  const movimientosGasto: Movimiento[] = gastos.map((gasto) => ({
    id: `gasto-${gasto.id}`,
    tipo: 'gasto',
    concepto: gasto.concepto,
    categoria: gasto.categoria,
    subcategoria: gasto.subcategoria,
    monto: gasto.monto,
    origen: nombreOrigen(gasto.origen, gasto.subcategoria),
    fecha: gasto.fecha,
  }));
  const movimientosAbono: Movimiento[] = abonosTarjeta.map((abono) => ({
    id: `abono-${abono.id}`,
    tipo: 'abono_tarjeta',
    concepto: abono.concepto || 'Abono a tarjeta',
    categoria: 'Abono a tarjeta',
    subcategoria: abono.tarjeta || 'Tarjeta de crédito',
    monto: abono.monto,
    origen: nombreOrigen(abono.origen),
    fecha: abono.fecha,
  }));
  return [...movimientosIngreso, ...movimientosGasto, ...movimientosAbono].sort(
    (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
  );
}

function limpiarMonto(valor: string) {
  return Number(valor.replace(/,/g, ''));
}

export function esComandoAyuda(texto: string) {
  const partes = texto.trim().split(/\s+/);
  const comando = partes[0]?.toLowerCase();

  return comando === '/start' || comando === 'start' || comando === 'hola' || comando === 'ayuda' || comando === '/help';
}

export function parsearMovimientoEstructurado(texto: string) {
  const partes = texto.trim().split(/\s+/);
  const monto = limpiarMonto(partes[0] || '');
  const posibleCategoria = partes[partes.length - 1]?.toLowerCase();
  const categoria = aliasCategoria[posibleCategoria];

  if (!Number.isFinite(monto) || monto <= 0) {
    return {
      ok: false as const,
      error: 'Formato inválido. Usa algo como: 150 taxi placeres',
    };
  }

  if (!categoria) {
    return {
      ok: false as const,
      error: 'No identifiqué la categoría. Usa vida, placeres o futuro. Ejemplo: 150 taxi placeres',
    };
  }

  const concepto = partes.slice(1, -1).join(' ').trim();

  if (!concepto) {
    return {
      ok: false as const,
      error: 'Falta el concepto. Ejemplo: 150 taxi placeres',
    };
  }

  return {
    ok: true as const,
    concepto,
    monto,
    categoria,
    tipo: 'gasto' as const,
    subcategoria: categoria,
    razon: 'Clasificado por categoría explícita en el mensaje.',
  };
}
